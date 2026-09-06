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
  'navigation-injection': '出口 · 含干擾指令', 'clean-navigation': '出口 · 乾淨場景',
  'reservation-injection': '餐廳 · 含干擾指令', 'reservation-delegation': '餐廳 · 乾淨場景',
  'explicit-delegation': '名片 · 乾淨場景',
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

  useEffect(() => { document.title = 'LensGuard · 觀察、分辨、判斷、保護'; }, []);
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
    if (!demo.connected || !demo.scenario || !imageUrl || !demo.userRequest.trim()) return;
    setCaptureError(null);
    waiting.current = true;
    comparison.begin({ scenarioId: demo.scenarioId, query: demo.userRequest, compare: demo.scenario.attack, ...(real && frame ? { frame } : {}) });
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
      if (!snapshot) throw new Error('請選擇圖片或啟動相機。');
      invalidate();
      setFrame(snapshot);
      closeSetup();
    } catch (cause) {
      if (version === captureVersion.current) setCaptureError(cause instanceof Error ? cause.message : '無法讀取圖片。');
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

  const canAnalyze = !!(demo.connected && demo.scenario && imageUrl && demo.userRequest.trim());
  const error = captureError || (protectedRun?.status === 'failed' ? '分析未完成，請按「重播」後再試一次。'
    : comparison.phase === 'failed' ? '目前無法完成分析，請再試一次。'
    : comparison.busy && demo.error ? '連線暫時中斷，正在取得分析結果…' : null);
  return <div className="experience-page" lang="zh-Hant">
    <header className="experience-header">
      <button className="experience-wordmark" aria-label="LensGuard · 選擇場景" title="選擇場景（S）" onClick={() => setSetup(true)} disabled={busy}>LensGuard</button>
      <RuntimeInfo health={demo.health} connected={demo.connected} />
      {debugEnabled && <button className="developer-details" onClick={() => setDetails(true)}>細節</button>}
    </header>
    <main className="experience-main">
      <DemoExperience stage={stage} presentation={presentation} baseline={comparison.without} showComparison={comparison.input?.compare === true} imageUrl={imageUrl}
        imageAlt={real ? '本次送交分析的圖片' : '所選場景的範例圖片'}
        query={demo.displayedUserRequest} sourceLabel={real ? frame?.source === 'camera' ? '相機畫面' : '上傳圖片' : '範例場景'}
        busy={busy} comparing={comparison.phase === 'without'} error={error} onChooseInput={() => setSetup(true)} />
      <button className="experience-next" onClick={() => void next()} disabled={busy || (stage === 'input' && !canAnalyze)}
        aria-keyshortcuts={stage === 'result' ? 'r' : 'ArrowRight'}>
        {busy ? '分析中' : stage === 'input' ? '開始分析' : stage === 'result' ? '重播' : '下一步'}
      </button>
      {!demo.connected && <p className="connection-status" role="status">{demo.health ? '連線中斷，正在重新連線…' : '正在連線…'}</p>}
    </main>
    <dialog ref={setupDialog} className="scene-dialog" aria-labelledby="scene-dialog-title" onCancel={event => { event.preventDefault(); closeSetup(); }}
      onClose={() => { if (setup) closeSetup(); }}>
      <header><h2 id="scene-dialog-title">選擇場景</h2><button onClick={closeSetup} aria-label="關閉場景設定">×</button></header>
      <label htmlFor="scene-select">場景</label>
      <select id="scene-select" value={demo.scenarioId} disabled={busy} onChange={event => { invalidate(); demo.selectScenario(event.target.value); }}>
        {demo.scenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{sceneNames[scenario.id] ?? scenario.name}</option>)}
      </select>
      {real ? <>
        <label htmlFor="scene-request">你的需求</label>
        <textarea id="scene-request" rows={2} maxLength={4000} value={demo.userRequest} disabled={busy}
          onChange={event => { invalidate(); demo.editUserRequest(event.target.value); }} placeholder="你希望人工智慧完成什麼任務？" />
        {setup && <CameraPanel captureRef={captureRef} disabled={capturing} />}
      </> : <p className="scene-setup-note">目前使用預設範例；即時分析模式可使用相機或上傳圖片。</p>}
      {captureError && <p className="experience-error" role="alert">{captureError}</p>}
      <button className="scene-apply" disabled={capturing || (real && !demo.userRequest.trim())} onClick={() => void acceptInput()}>{capturing ? '正在擷取…' : real ? '使用圖片' : '使用場景'}</button>
    </dialog>
    <DetailsDrawer open={details} onClose={() => setDetails(false)} run={protectedRun ?? demo.run} baseline={comparison.without} health={demo.health}
      query={demo.displayedUserRequest} frameUrl={frameUrl} realMode={real} />
  </div>;
}
