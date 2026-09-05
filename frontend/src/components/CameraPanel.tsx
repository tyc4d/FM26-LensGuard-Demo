import { useCallback, useEffect, useRef, useState, useImperativeHandle } from 'react';
import type { Ref } from 'react';
import type { CapturedFrame } from '../types';
import './camera.css';

export interface CameraCapture { capture: () => Promise<CapturedFrame> }

export interface CameraPanelProps {
  captureRef?: Ref<CameraCapture>;
  disabled?: boolean;
  onImageChange?: (name: string | null) => void;
}

function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return '相機權限遭拒。請在瀏覽器中允許存取相機後再試一次。';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return '未偵測到相機裝置。';
      case 'NotReadableError':
      case 'TrackStartError':
        return '目前無法使用相機。請關閉其他正在使用相機的應用程式後再試一次。';
      case 'OverconstrainedError':
        return '無法使用所選相機。請選擇其他相機後再試一次。';
      case 'SecurityError':
        return '瀏覽器已封鎖相機存取。請使用 localhost 或 HTTPS 開啟展示頁面，並允許相機存取。';
      default:
        break;
    }
  }
  return '無法啟動相機。請確認瀏覽器權限及相機連線後再試一次。';
}

export function CameraPanel({ onImageChange, captureRef, disabled = false }: CameraPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef<string | null>(null);
  const imageOperationRef = useRef(0);
  const onImageChangeRef = useRef(onImageChange);
  const [uploadedImage, setUploadedImage] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detachEventsRef = useRef<(() => void) | null>(null);
  const operationRef = useRef(0);
  const mountedRef = useRef(true);
  const [live, setLive] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraChoice, setCameraChoice] = useState('environment');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useImperativeHandle(captureRef, () => ({ capture: async () => {
    const started = performance.now();
    let input: HTMLVideoElement | HTMLImageElement;
    let width: number;
    let height: number;
    if (uploadedImage) {
      const image = new Image();
      image.src = uploadedImage.url;
      try {
        await image.decode();
      } catch {
        throw new Error('無法讀取已上傳的圖片。請重新上傳後再試一次。');
      }
      input = image; width = image.naturalWidth; height = image.naturalHeight;
    } else {
      const video = videoRef.current;
      if (!live || !video || video.readyState < 2 || !video.videoWidth) {
        throw new Error('請先啟動相機或上傳圖片，再執行實際分析。');
      }
      input = video; width = video.videoWidth; height = video.videoHeight;
    }
    // Keep scene text legible while bounding upload and model image allocation.
    const scale = Math.min(1, 2560 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('瀏覽器無法擷取此畫面。');
    context.drawImage(input, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('畫面編碼失敗。')), 'image/jpeg', 0.9));
    return { blob, source: uploadedImage ? 'uploaded_image' : 'camera', captureMs: performance.now() - started };
  } }), [uploadedImage, live]);

  const supportsFacing = !!navigator.mediaDevices?.getSupportedConstraints?.().facingMode;


  useEffect(() => { onImageChangeRef.current = onImageChange; }, [onImageChange]);

  const clearImage = useCallback(() => {
    imageOperationRef.current += 1;
    setUploading(false);
    setImageError(null);
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
      setUploadedImage(null);
      onImageChangeRef.current?.(null);
    }
  }, []);

  const publishLive = useCallback((value: boolean) => {
    if (mountedRef.current) setLive(value);
  }, []);

  const releaseStream = useCallback(() => {
    detachEventsRef.current?.();
    detachEventsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const available = await navigator.mediaDevices?.enumerateDevices();
      if (mountedRef.current && available) {
        setDevices(available.filter((device) => device.kind === 'videoinput' && device.deviceId));
      }
    } catch {
      // Device enumeration is optional; the default camera remains usable.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const mediaDevices = navigator.mediaDevices;
    void refreshDevices();
    mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      imageOperationRef.current += 1;
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
      mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
      releaseStream();
    };
  }, [refreshDevices, releaseStream]);

  const stopCamera = useCallback(() => {
    operationRef.current += 1;
    releaseStream();
    setRequesting(false);
    publishLive(false);
  }, [publishLive, releaseStream]);

  const startCamera = useCallback(async (choice: string) => {
    if (disabledRef.current) return;
    imageOperationRef.current += 1;
    setUploading(false);
    setImageError(null);
    const operation = ++operationRef.current;
    releaseStream();
    publishLive(false);
    setError(null);

    if (!window.isSecureContext) {
      setError('使用相機需要透過 HTTPS 或 localhost 開啟頁面。');
      setRequesting(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('此瀏覽器不支援相機存取。請改用支援相機功能的瀏覽器。');
      setRequesting(false);
      return;
    }

    setRequesting(true);
    try {
      const video: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 800 },
      };
      if (choice.startsWith('device:')) {
        video.deviceId = { exact: choice.slice('device:'.length) };
      } else if (navigator.mediaDevices.getSupportedConstraints().facingMode) {
        video.facingMode = { ideal: choice };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (!mountedRef.current || operation !== operationRef.current || disabledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (mountedRef.current && operation === operationRef.current) setRequesting(false);
        return;
      }

      streamRef.current = stream;
      const onEnded = () => {
        if (streamRef.current !== stream || operation !== operationRef.current) return;
        operationRef.current += 1;
        releaseStream();
        publishLive(false);
        setRequesting(false);
        setError('相機已停止或中斷連線。請重新連接，再點選「啟動相機」。');
        void refreshDevices();
      };
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', onEnded));
      detachEventsRef.current = () => {
        stream.getVideoTracks().forEach((track) => track.removeEventListener('ended', onEnded));
      };

      const element = videoRef.current;
      if (!element) {
        releaseStream();
        setRequesting(false);
        return;
      }
      element.srcObject = stream;
      await element.play();
      if (!mountedRef.current || operation !== operationRef.current) return;
      if (disabledRef.current) {
        releaseStream();
        setRequesting(false);
        return;
      }
      if (stream.getVideoTracks().every((track) => track.readyState === 'ended')) {
        onEnded();
        return;
      }
      publishLive(true);
      clearImage();
      setRequesting(false);
      void refreshDevices();
    } catch (cause) {
      if (!mountedRef.current || operation !== operationRef.current) return;
      releaseStream();
      publishLive(false);
      setRequesting(false);
      if (!disabledRef.current) setError(cameraError(cause));
    }
  }, [clearImage, publishLive, refreshDevices, releaseStream]);

  async function uploadImage(file: File) {
    if (disabledRef.current) return;
    const operation = ++imageOperationRef.current;
    setImageError(null);
    setUploading(false);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('請選擇 JPEG、PNG 或 WebP 圖片。');
      return;
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setImageError('請選擇非空白且小於 10 MB 的圖片檔案。');
      return;
    }
    setUploading(true);
    const url = URL.createObjectURL(file);
    let retained = false;
    try {
      const preview = new Image();
      preview.src = url;
      await preview.decode();
      if (!mountedRef.current || operation !== imageOperationRef.current || disabledRef.current) return;
      if (preview.naturalWidth * preview.naturalHeight > 40_000_000) {
        throw new Error('圖片尺寸超過 4,000 萬像素。');
      }
      stopCamera();
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = url;
      retained = true;
      setUploadedImage({ url, name: file.name });
      setError(null);
      onImageChangeRef.current?.(file.name);
    } catch {
      if (mountedRef.current && operation === imageOperationRef.current && !disabledRef.current) {
        setImageError('無法開啟此圖片。請選擇有效的 JPEG、PNG 或 WebP 圖片，且尺寸須小於 4,000 萬像素。');
      }
    } finally {
      if (!retained) URL.revokeObjectURL(url);
      if (mountedRef.current && operation === imageOperationRef.current) setUploading(false);
    }
  }

  const idleCamera = !uploadedImage && !live && !requesting;
  const cameraButton = <button type="button" className={`camera-button ${idleCamera ? 'camera-start-button' : ''}`} disabled={disabled} onClick={() => {
    if (disabledRef.current) return;
    if (live || requesting) stopCamera();
    else void startCamera(cameraChoice);
  }}>{live || requesting ? '停止相機' : '啟動相機'}</button>;

  return (
    <section className="camera-panel" aria-label="相機與行動展示區">
      <div className="stage-layout">
        <div className="camera-column">
          <div className={`camera-viewport${live ? ' camera-viewport--live' : ''}`}>
            <video ref={videoRef} autoPlay playsInline muted aria-label="瀏覽器相機即時畫面" />
            {uploadedImage && <img className="uploaded-image" src={uploadedImage.url} alt={`已上傳的觀察圖片：${uploadedImage.name}`} />}
            {!live && !uploadedImage && <div className="camera-placeholder">
              <span>{requesting ? '正在等待相機' : '相機已關閉'}</span>
              <p>{requesting ? '請在瀏覽器中允許存取相機。' : '將鏡頭對準要觀察的環境。'}</p>
              {idleCamera && cameraButton}
            </div>}
          </div>
          <div className="camera-controls">
            {!idleCamera && cameraButton}
            <input ref={fileRef} className="image-file-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-label="上傳觀察圖片" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void uploadImage(file);
            }} />
            <button type="button" className="camera-button" disabled={disabled || uploading} onClick={() => fileRef.current?.click()}>{uploading ? '正在開啟圖片…' : uploadedImage ? '更換圖片' : '上傳圖片'}</button>
            {uploadedImage && <button type="button" className="camera-button" disabled={disabled} onClick={() => { if (!disabledRef.current) clearImage(); }}>移除圖片</button>}
            {(supportsFacing || devices.length > 1) && <select aria-label="選擇相機" value={cameraChoice} disabled={disabled} onChange={(event) => {
              if (disabledRef.current) return;
              const choice = event.target.value; setCameraChoice(choice);
              if (live || requesting) void startCamera(choice);
            }}>
              {supportsFacing ? <><option value="environment">後置相機（優先）</option><option value="user">前置相機（優先）</option></> : <option value="environment">預設相機</option>}
              {devices.map((device, index) => <option key={device.deviceId} value={`device:${device.deviceId}`}>{device.label || `相機 ${index + 1}`}</option>)}
            </select>}
          </div>
          {uploadedImage && <p className="image-filename" title={uploadedImage.name}>圖片 · {uploadedImage.name}</p>}
          {imageError && <p role="alert" className="camera-error">{imageError}</p>}
          {error && <p role="alert" className="camera-error">{error}</p>}
        </div>
      </div>
    </section>
  );
}
