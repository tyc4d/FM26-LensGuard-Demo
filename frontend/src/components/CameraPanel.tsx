import { useCallback, useEffect, useRef, useState, useImperativeHandle } from 'react';
import type { ReactNode, Ref } from 'react';
import type { DetectedRegion, CapturedFrame } from '../types';
import './camera.css';

export interface CameraCapture { capture: () => Promise<CapturedFrame> }

export interface CameraPanelProps {
  captureRef?: Ref<CameraCapture>;
  realMode?: boolean;
  regions: DetectedRegion[];
  frameId: string | null;
  onLiveChange: (live: boolean) => void;
  onImageChange?: (name: string | null) => void;
  children?: ReactNode;
}

function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Camera permission was denied. Enable camera access in the browser and try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No camera device was detected.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'The camera is unavailable. Close other apps using it, then try again.';
      case 'OverconstrainedError':
        return 'The selected camera is unavailable. Choose another camera, then try again.';
      case 'SecurityError':
        return 'The browser blocked camera access. Open this demo on localhost or HTTPS and allow camera access.';
      default:
        break;
    }
  }
  return 'The camera could not start. Check your browser permissions and connected camera, then try again.';
}

export function CameraPanel({ regions, frameId, onLiveChange, onImageChange, children, captureRef, realMode = false }: CameraPanelProps) {
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
  const onLiveChangeRef = useRef(onLiveChange);
  const [live, setLive] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraChoice, setCameraChoice] = useState('environment');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useImperativeHandle(captureRef, () => ({ capture: async () => {
    const started = performance.now();
    let input: HTMLVideoElement | HTMLImageElement;
    let width: number;
    let height: number;
    if (uploadedImage) {
      const image = new Image();
      image.src = uploadedImage.url;
      await image.decode();
      input = image; width = image.naturalWidth; height = image.naturalHeight;
    } else {
      const video = videoRef.current;
      if (!live || !video || video.readyState < 2 || !video.videoWidth) {
        throw new Error('Start the camera or upload an image before running real analysis.');
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

  useEffect(() => {
    onLiveChangeRef.current = onLiveChange;
  }, [onLiveChange]);

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
    onLiveChangeRef.current(value);
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
      onLiveChangeRef.current(false);
    };
  }, [refreshDevices, releaseStream]);

  const stopCamera = useCallback(() => {
    operationRef.current += 1;
    releaseStream();
    setRequesting(false);
    publishLive(false);
  }, [publishLive, releaseStream]);

  const startCamera = useCallback(async (choice: string) => {
    imageOperationRef.current += 1;
    setUploading(false);
    setImageError(null);
    const operation = ++operationRef.current;
    releaseStream();
    publishLive(false);
    setError(null);

    if (!window.isSecureContext) {
      setError('Camera access requires HTTPS or localhost.');
      setRequesting(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera access. Use a browser with getUserMedia support.');
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
      if (!mountedRef.current || operation !== operationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const onEnded = () => {
        if (streamRef.current !== stream || operation !== operationRef.current) return;
        operationRef.current += 1;
        releaseStream();
        publishLive(false);
        setRequesting(false);
        setError('The camera stopped or was disconnected. Reconnect it, then select Start Camera.');
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
      setError(cameraError(cause));
    }
  }, [clearImage, publishLive, refreshDevices, releaseStream]);

  async function uploadImage(file: File) {
    const operation = ++imageOperationRef.current;
    setImageError(null);
    setUploading(false);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setImageError('Choose a non-empty image smaller than 10 MB.');
      return;
    }
    setUploading(true);
    const url = URL.createObjectURL(file);
    let retained = false;
    try {
      const preview = new Image();
      preview.src = url;
      await preview.decode();
      if (!mountedRef.current || operation !== imageOperationRef.current) return;
      if (preview.naturalWidth * preview.naturalHeight > 40_000_000) {
        throw new Error('Image dimensions exceed 40 megapixels.');
      }
      stopCamera();
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = url;
      retained = true;
      setUploadedImage({ url, name: file.name });
      setError(null);
      onImageChangeRef.current?.(file.name);
    } catch {
      if (mountedRef.current && operation === imageOperationRef.current) {
        setImageError('This image could not be opened. Choose a valid JPEG, PNG, or WebP under 40 megapixels.');
      }
    } finally {
      if (!retained) URL.revokeObjectURL(url);
      if (mountedRef.current && operation === imageOperationRef.current) setUploading(false);
    }
  }

  const idleCamera = !uploadedImage && !live && !requesting && regions.length === 0;
  const cameraButton = <button type="button" className={`camera-button ${idleCamera ? 'camera-start-button' : ''}`} onClick={() => live || requesting ? stopCamera() : void startCamera(cameraChoice)}>{live || requesting ? 'Stop Camera' : 'Start Camera'}</button>;

  return (
    <section className="camera-panel" aria-label="Camera and action stage" data-frame-id={frameId}>
      <div className="stage-layout">
        <div className="camera-column">
          <div className="stage-camera-header"><span>Observation</span><span data-testid="status-camera">CAMERA {live ? 'LIVE' : 'OFF'}</span></div>
          <div className={`camera-viewport${live ? ' camera-viewport--live' : ''}`}>
            <video ref={videoRef} autoPlay playsInline muted aria-label="Live browser camera feed" />
            {uploadedImage && <img className="uploaded-image" src={uploadedImage.url} alt={`Uploaded observation: ${uploadedImage.name}`} />}
            {!live && !uploadedImage && <div className={`camera-placeholder${regions.length ? ' camera-placeholder--fixture' : ''}`}>
              <span>{requesting ? 'Waiting for camera' : regions.length ? 'Camera is off · mock scene' : 'Camera is off'}</span>
              {!regions.length && <p>{requesting ? 'Allow camera access in your browser.' : 'Bring your environment into view.'}</p>}
              {idleCamera && cameraButton}
            </div>}
            <div className="camera-overlays" aria-label="Mock detected regions">
              {regions.map((region) => <div key={region.id} className={`camera-region${region.kind === 'instruction_like' ? ' camera-region--instruction' : ''}`}
                style={{ left: `${region.bbox.x * 100}%`, top: `${region.bbox.y * 100}%`, width: `${region.bbox.width * 100}%`, height: `${region.bbox.height * 100}%` }}
                title={`${region.id} · ${region.kind} · CAMERA: ${region.text}`}>
                <span className="camera-region-label">{region.id} · {region.kind === 'instruction_like' ? 'INSTRUCTION' : 'SCENE TEXT'}</span>
                <span className="camera-region-text">{region.text}</span>
              </div>)}
            </div>
          </div>
          <div className="camera-controls">
            {!idleCamera && cameraButton}
            <input ref={fileRef} className="image-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload observation image" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void uploadImage(file);
            }} />
            <button type="button" className="camera-button" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Opening image…' : uploadedImage ? 'Replace Image' : 'Upload Image'}</button>
            {uploadedImage && <button type="button" className="camera-button" onClick={clearImage}>Remove Image</button>}
            {(supportsFacing || devices.length > 1) && <select aria-label="Select camera" value={cameraChoice} onChange={(event) => {
              const choice = event.target.value; setCameraChoice(choice);
              if (live || requesting) void startCamera(choice);
            }}>
              {supportsFacing ? <><option value="environment">Back camera (preferred)</option><option value="user">Front camera (preferred)</option></> : <option value="environment">Default camera</option>}
              {devices.map((device, index) => <option key={device.deviceId} value={`device:${device.deviceId}`}>{device.label || `Camera ${index + 1}`}</option>)}
            </select>}
          </div>
          {uploadedImage && <p className="image-filename" title={uploadedImage.name}>IMAGE · {uploadedImage.name}</p>}
          {imageError && <p role="alert" className="camera-error">{imageError}</p>}
          {error && <p role="alert" className="camera-error">{error}</p>}
        </div>
        {children}
      </div>
      <p className="camera-disclosure">{realMode ? 'One image is sent to the local VLM only when Run Analysis is clicked · execution is simulated' : uploadedImage ? 'Uploaded image stays in this browser · analysis uses the selected mock scenario' : 'Mock regions · camera frames stay in this browser'}</p>
    </section>
  );
}
