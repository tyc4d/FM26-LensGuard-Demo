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
        return 'Camera permission denied. Allow camera access in your browser and try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No camera detected.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Camera unavailable. Close other applications using the camera and try again.';
      case 'OverconstrainedError':
        return 'The selected camera is unavailable. Choose another camera and try again.';
      case 'SecurityError':
        return 'The browser blocked camera access. Open the demo on localhost or HTTPS and allow camera access.';
      default:
        break;
    }
  }
  return 'Unable to start the camera. Check browser permissions and the camera connection, then try again.';
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
        throw new Error('Unable to read the uploaded image. Upload it again and retry.');
      }
      input = image; width = image.naturalWidth; height = image.naturalHeight;
    } else {
      const video = videoRef.current;
      if (!live || !video || video.readyState < 2 || !video.videoWidth) {
        throw new Error('Start the camera or upload an image before running live analysis.');
      }
      input = video; width = video.videoWidth; height = video.videoHeight;
    }
    // Keep scene text legible while bounding upload and model image allocation.
    const scale = Math.min(1, 2560 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not capture this frame.');
    context.drawImage(input, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Frame encoding failed.')), 'image/jpeg', 0.9));
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
      setError('Open this page over HTTPS or localhost to use the camera.');
      setRequesting(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera access. Use a browser with camera support.');
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
        setError('The camera stopped or disconnected. Reconnect it and select Start camera.');
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
      setImageError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setImageError('Choose a nonempty image file smaller than 10 MB.');
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
        throw new Error('The image exceeds 40 million pixels.');
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
        setImageError('Unable to open this image. Choose a valid JPEG, PNG, or WebP image under 40 million pixels.');
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
  }}>{live || requesting ? 'Stop camera' : 'Start camera'}</button>;

  return (
    <section className="camera-panel" aria-label="Camera and action demo">
      <div className="stage-layout">
        <div className="camera-column">
          <div className={`camera-viewport${live ? ' camera-viewport--live' : ''}`}>
            <video ref={videoRef} autoPlay playsInline muted aria-label="Live browser camera feed" />
            {uploadedImage && <img className="uploaded-image" src={uploadedImage.url} alt={`Uploaded scene image: ${uploadedImage.name}`} />}
            {!live && !uploadedImage && <div className="camera-placeholder">
              <span>{requesting ? 'Waiting for the camera' : 'Camera off'}</span>
              <p>{requesting ? 'Allow camera access in your browser.' : 'Point the camera at the scene you want to observe.'}</p>
              {idleCamera && cameraButton}
            </div>}
          </div>
          <div className="camera-controls">
            {!idleCamera && cameraButton}
            <input ref={fileRef} className="image-file-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-label="Upload scene image" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void uploadImage(file);
            }} />
            <button type="button" className="camera-button" disabled={disabled || uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Opening image…' : uploadedImage ? 'Change image' : 'Upload image'}</button>
            {uploadedImage && <button type="button" className="camera-button" disabled={disabled} onClick={() => { if (!disabledRef.current) clearImage(); }}>Remove image</button>}
            {(supportsFacing || devices.length > 1) && <select aria-label="Choose camera" value={cameraChoice} disabled={disabled} onChange={(event) => {
              if (disabledRef.current) return;
              const choice = event.target.value; setCameraChoice(choice);
              if (live || requesting) void startCamera(choice);
            }}>
              {supportsFacing ? <><option value="environment">Rear camera (preferred)</option><option value="user">Front camera (preferred)</option></> : <option value="environment">Default camera</option>}
              {devices.map((device, index) => <option key={device.deviceId} value={`device:${device.deviceId}`}>{device.label || `Camera ${index + 1}`}</option>)}
            </select>}
          </div>
          {uploadedImage && <p className="image-filename" title={uploadedImage.name}>Image · {uploadedImage.name}</p>}
          {imageError && <p role="alert" className="camera-error">{imageError}</p>}
          {error && <p role="alert" className="camera-error">{error}</p>}
        </div>
      </div>
    </section>
  );
}
