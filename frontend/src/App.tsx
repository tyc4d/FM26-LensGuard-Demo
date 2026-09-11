import { useEffect, useMemo, useRef, useState } from 'react';
import { CameraPanel, type CameraCapture } from './components/CameraPanel';
import { RuntimeInfo } from './components/RuntimeInfo';
import { DetailsDrawer } from './components/story/DetailsDrawer';
import { DemoExperience } from './components/experience/DemoExperience';
import { sampleScene } from './components/experience/SampleScene';
import { nextStage, presentRun, previousStage, type Stage } from './experience';
import { useDemoRuntime } from './useDemoRuntime';
import { useComparison } from './useComparison';
import type { CapturedFrame } from './types';
import './experience.css';
import './semantic.css';

const sceneNames: Record<string, string> = {
  'navigation-injection': 'Exit · Injected instructions', 'clean-navigation': 'Exit · Clean scene',
  'reservation-injection': 'Restaurant · Injected instructions', 'reservation-delegation': 'Restaurant · Clean scene',
  'explicit-delegation': 'Business card · Clean scene',
};

export default function App() {
  const [stage, setStage] = useState<Stage>('input');
  const [setup, setSetup] = useState(false);
  const [details, setDetails] = useState(false);
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<CameraCapture>(null);
  const setupDialog = useRef<HTMLDialogElement>(null);
  const waiting = useRef(false);
  const captureVersion = useRef(0);
  const demo = useDemoRuntime();
  const comparison = useComparison(demo.run, demo.active, demo.startRun);
  const protectedRun = comparison.withGuard;
  const real = demo.health?.runtime === 'prototype';
  const busy = demo.active || comparison.busy || capturing;
  const presentation = useMemo(() => presentRun(protectedRun), [protectedRun]);
  const sampleUrl = useMemo(() => demo.scenario ? sampleScene(demo.scenario) : null, [demo.scenario]);
  const imageUrl = real ? frameUrl : sampleUrl;
  const debugEnabled = new URLSearchParams(window.location.search).has('debug');

  useEffect(() => { document.title = 'LensGuard · Observe, Distinguish, Decide, Protect'; }, []);
  useEffect(() => {
    if (!frame) { setFrameUrl(null); return; }
    const url = URL.createObjectURL(frame.blob);
    setFrameUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [frame]);
  useEffect(() => {
    if (setup) setupDialog.current?.showModal();
    else setupDialog.current?.close();
  }, [setup]);
  useEffect(() => {
    if (!waiting.current || !['complete', 'failed'].includes(comparison.phase)) return;
    waiting.current = false;
    if (comparison.phase === 'complete') setStage(protectedRun?.status === 'failed' ? 'result' : 'separate');
  }, [comparison.phase, protectedRun]);
  useEffect(() => () => { captureVersion.current += 1; }, []);

  function invalidate() {
    waiting.current = false;
    setStage('input');
    setCaptureError(null);
    comparison.reset();
    demo.reset();
  }
  function replay() {
    if (busy || waiting.current) return;
    setStage('input');
    setCaptureError(null);
    if (protectedRun?.status === 'failed') { comparison.reset(); demo.reset(); }
  }
  async function next() {
    if (busy || waiting.current || setup || details) return;
    if (stage === 'result') { replay(); return; }
    if (stage !== 'input') { setStage(nextStage(stage)); return; }
    if (comparison.phase === 'complete' && protectedRun?.status === 'completed') { setStage('separate'); return; }
    if (!canAnalyze || !demo.scenario) return;
    setCaptureError(null);
    waiting.current = true;
    comparison.begin({ scenarioId: demo.scenarioId, query: demo.userRequest, compare: demo.scenario.attack,
      modelProfile: demo.modelProfile, ...(real && frame ? { frame } : {}) });
  }
  function closeSetup() {
    captureVersion.current += 1;
    setCapturing(false);
    setSetup(false);
  }
  async function acceptInput() {
    if (capturing) return;
    if (!real) { closeSetup(); return; }
    const version = ++captureVersion.current;
    setCapturing(true);
    setCaptureError(null);
    try {
      const snapshot = await captureRef.current?.capture();
      if (version !== captureVersion.current) return;
      if (!snapshot) throw new Error('Choose an image or start the camera.');
      invalidate();
      setFrame(snapshot);
      closeSetup();
    } catch (cause) {
      if (version === captureVersion.current) setCaptureError(cause instanceof Error ? cause.message : 'Unable to read the image.');
    } finally { if (version === captureVersion.current) setCapturing(false); }
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || setup || details) return;
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); void next(); }
      else if (event.key === 'ArrowLeft' && !busy) { event.preventDefault(); setStage(previousStage(stage)); }
      else if (event.key.toLowerCase() === 'r') { event.preventDefault(); replay(); }
      else if (event.key.toLowerCase() === 's' && !busy) { event.preventDefault(); setSetup(true); }
      else if (event.key.toLowerCase() === 'd') { event.preventDefault(); setDetails(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const canAnalyze = !!(demo.connected && demo.scenario && imageUrl && demo.userRequest.trim()
    && (!demo.models.length || demo.models.some(model => model.id === demo.modelProfile && model.available)));
  const error = captureError || (comparison.phase === 'failed' ? 'Unable to complete the analysis. Please try again.'
    : comparison.busy && demo.error ? 'Connection interrupted. Retrieving analysis results…' : null);
  return <div className="experience-page" lang="en">
    <header className="experience-header">
      <button className="experience-wordmark" aria-label="LensGuard · Choose scene" title="Choose scene (S)" onClick={() => setSetup(true)} disabled={busy}>LensGuard</button>
      <RuntimeInfo health={demo.health} connected={demo.connected} models={demo.models} selectedModel={demo.modelProfile}
        disabled={busy} onModelChange={id => { if (!busy) { invalidate(); demo.selectModel(id); } }} />
      {debugEnabled && <button className="developer-details" onClick={() => setDetails(true)}>Details</button>}
    </header>
    <main className="experience-main">
      <DemoExperience stage={stage} presentation={presentation} baseline={comparison.without} showComparison={comparison.input?.compare === true} imageUrl={imageUrl}
        imageAlt={real ? 'Image submitted for this analysis' : 'Sample image for the selected scene'}
        query={demo.displayedUserRequest} sourceLabel={real ? frame?.source === 'camera' ? 'Camera frame' : 'Uploaded image' : 'Sample scene'}
        busy={busy} comparing={comparison.phase === 'without'} error={error} onChooseInput={() => setSetup(true)} />
      <button className="experience-next" onClick={() => void next()} disabled={busy || (stage === 'input' && !canAnalyze)}
        aria-keyshortcuts={stage === 'result' ? 'r' : 'ArrowRight'}>
        {busy ? 'Analyzing' : stage === 'input' ? 'Start analysis' : stage === 'result' ? 'Replay' : 'Next'}
      </button>
      {!demo.connected && <p className="connection-status" role="status">{demo.health ? 'Connection lost. Reconnecting…' : 'Connecting…'}</p>}
    </main>
    <dialog ref={setupDialog} className="scene-dialog" aria-labelledby="scene-dialog-title" onCancel={event => { event.preventDefault(); closeSetup(); }}
      onClose={() => { if (setup) closeSetup(); }}>
      <header><h2 id="scene-dialog-title">Choose scene</h2><button onClick={closeSetup} aria-label="Close scene settings">×</button></header>
      <label htmlFor="scene-select">Scene</label>
      <select id="scene-select" value={demo.scenarioId} disabled={busy} onChange={event => { invalidate(); demo.selectScenario(event.target.value); }}>
        {demo.scenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{sceneNames[scenario.id] ?? scenario.name}</option>)}
      </select>
      {real ? <>
        <label htmlFor="scene-request">Your request</label>
        <textarea id="scene-request" rows={2} maxLength={4000} value={demo.userRequest} disabled={busy}
          onChange={event => { invalidate(); demo.editUserRequest(event.target.value); }} placeholder="What would you like the AI to do?" />
        {setup && <CameraPanel captureRef={captureRef} disabled={capturing} />}
      </> : <p className="scene-setup-note">Using preset examples. Live analysis supports the camera and uploaded images.</p>}
      {captureError && <p className="experience-error" role="alert">{captureError}</p>}
      <button className="scene-apply" disabled={capturing || (real && !demo.userRequest.trim())} onClick={() => void acceptInput()}>{capturing ? 'Capturing…' : real ? 'Use image' : 'Use scene'}</button>
    </dialog>
    <DetailsDrawer open={details} onClose={() => setDetails(false)} run={protectedRun ?? demo.run} baseline={comparison.without} health={demo.health}
      query={demo.displayedUserRequest} frameUrl={frameUrl} realMode={real} />
  </div>;
}
