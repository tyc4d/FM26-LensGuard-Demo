import { useEffect, useState, useRef, useCallback } from 'react';
import { CameraPanel, type CameraCapture } from './components/CameraPanel';
import { DemoStage } from './components/story/DemoStage';
import { PipelineProgress } from './components/story/PipelineProgress';
import { PresenterControls } from './components/story/PresenterControls';
import { DetailsDrawer } from './components/story/DetailsDrawer';
import { useDemoRuntime } from './useDemoRuntime';
import { useComparison } from './useComparison';
import { usePresentation } from './usePresentation';
import { normalizeRun } from './story';
import { displayLabel, scenarioLabel } from './labels';
import type { CapturedFrame, RunState } from './types';
import './story.css';
import './presentation-shell.css';

type Page = 'demo' | 'evaluation' | 'architecture';
function pageFromHash(): Page {
  const page = window.location.hash.slice(1);
  return page === 'evaluation' || page === 'architecture' ? page : 'demo';
}
function resultLabel(run: RunState | null) {
  if (!run) return '尚無結果';
  if (run.status === 'failed') return '分析未完成';
  if (run.outcome?.status === 'blocked') return '已阻擋';
  if (run.outcome?.status === 'allowed') return '已授權';
  if (run.outcome?.status === 'executed') return run.outcome.simulation_only ? '已模擬執行' : '已執行';
  return '尚無執行結果';
}
function Architecture({ realMode }: { realMode: boolean }) {
  const components = [
    ['相機', '即時運作'], ['視覺語言模型', realMode ? '本機運作' : '模擬資料'], ['來源紀錄引擎', realMode ? '僅傳輸來源' : '模擬資料'],
    ['模型行動提案', realMode ? '本機視覺語言模型' : '模擬資料'], ['授權判定', realMode ? '確定性規則' : '模擬資料'], ['行動', '模擬執行'],
  ];
  return <section className="architecture-page surface">
    <p className="eyebrow">系統總覽</p><h1>從感知到行動的授權</h1>
    <p className="page-lead">環境內容帶有來源資訊。授權層會檢查該來源是否有權決定行動參數。</p>
    <div className="architecture-flow" role="img" aria-label="相機、視覺語言模型、來源紀錄、行動提案、授權判定、行動">
      {components.map(([name, status], index) => <div className="architecture-step" key={name}>
        {index > 0 && <span className="architecture-arrow" aria-hidden="true">→</span>}
        <div><span className="eyebrow">{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><span className="mock-tag">{status}</span></div>
      </div>)}
    </div>
    <div className="architecture-notes grid gap-6 md:grid-cols-2">
      <section><h2>目前實作</h2><dl className="component-statuses">
        {[['相機', '即時運作'], ['操作介面', '即時運作'], ['後端流程', '即時運作'], ['模型推論', realMode ? '本機運作' : '模擬資料'], ['來源資訊擷取', realMode ? '僅傳輸來源' : '模擬資料'], ['授權規則引擎', realMode ? '確定性規則' : '模擬資料']].map(([name, state]) => <div key={name}><dt>{name}</dt><dd>{state}</dd></div>)}
      </dl></section>
      <section><h2>本機推論整合</h2><p>真實模式會將一張相機快照或上傳影像，經由展示後端傳送至獨立的 Prototype 推論服務。Qwen3-VL 8B 使用既有的行動輸出轉接器與解析器。</p><p>系統會記錄傳輸來源，但尚未提供影像區域的語意對應。確定性授權規則會暫停未經確認的行動；限定範圍的名片授權規則可允許模擬撥號。也可明確選用模擬模式。</p><p className="implementation-note">所有外部行動皆為模擬。此即時展示不代表第 3.6 階段的基準評估結果。</p></section>
    </div>
  </section>;
}


export default function App() {
  const demo = useDemoRuntime();
  const captureRef = useRef<CameraCapture>(null);
  const inputVersion = useRef(0);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [details, setDetails] = useState(false);
  const [frame, setFrame] = useState<CapturedFrame | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<'without' | 'with' | null>(null);
  const comparison = useComparison(demo.run, demo.active, demo.error, demo.startRun);
  const selectedRun = playback === 'without' ? comparison.without : playback === 'with' ? comparison.withGuard : comparison.without ?? demo.run;
  const query = comparison.input ? comparison.input.query : demo.displayedUserRequest;
  const realMode = demo.health?.runtime === 'prototype';
  const normalized = { ...normalizeRun(selectedRun, { query, frameUrl }), real: selectedRun ? selectedRun.runtime === 'prototype' : realMode };
  const story = usePresentation(selectedRun, (demo.starting || preparing) && !playback && !comparison.without);
  const busy = demo.active || comparison.busy || preparing;
  const terminal = ['blocked', 'allowed', 'executed', 'failed'].includes(story.phase);
  const nextComparison = selectedRun?.id === comparison.without?.id && !!comparison.withGuard && terminal;
  const actualGuard = selectedRun?.guard_enabled ?? demo.guardEnabled;
  const visibleError = captureError || (selectedRun && selectedRun.id !== demo.run?.id ? selectedRun.error : demo.error);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => { inputVersion.current += 1; window.removeEventListener('hashchange', onHashChange); };
  }, []);
  useEffect(() => { document.title = `LensGuard · ${page === 'demo' ? '互動展示' : page === 'evaluation' ? '評估' : '系統架構'}`; }, [page]);
  useEffect(() => {
    if (!frame) { setFrameUrl(null); return; }
    const url = URL.createObjectURL(frame.blob);
    setFrameUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [frame]);
  const capture = useCallback(async () => {
    const version = inputVersion.current;
    if (!captureRef.current) throw new Error('目前無法擷取相機影像。');
    const captured = await captureRef.current.capture();
    if (version !== inputVersion.current) throw new Error('影像擷取已取消。');
    setFrame(captured);
    return captured;
  }, []);
  function clearPresentation() {
    inputVersion.current += 1;
    setPlayback(null); comparison.reset(); story.reset(); setFrame(null);
    setCaptureError(null); setPreparing(false);
  }
  function reset() { clearPresentation(); demo.reset(); }
  function start() { clearPresentation(); void demo.startRun(capture); }
  async function beginComparison() {
    clearPresentation(); demo.reset(); setPreparing(true);
    const version = inputVersion.current;
    try {
      let snapshot: CapturedFrame | undefined;
      try { snapshot = await capture(); }
      catch (cause) { if (realMode) throw cause; }
      if (version !== inputVersion.current) return;
      comparison.begin({ scenarioId: demo.scenarioId, query: demo.userRequest, frame: snapshot });
    } catch (cause) {
      if (version === inputVersion.current) setCaptureError(cause instanceof Error ? cause.message : '無法擷取比較影像。');
    } finally { if (version === inputVersion.current) setPreparing(false); }
  }
  const next = () => { if (nextComparison) setPlayback('with'); else story.next(); };
  const inspect = () => { if (story.playing) story.togglePlay(); setDetails(true); };
  function replayComparison() {
    if (!comparison.without || !comparison.withGuard) return;
    if (selectedRun?.id === comparison.without.id) story.replayCurrent();
    setPlayback('without');
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (page !== 'demo' || details || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); story.previous(); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
      else if (event.code === 'Space' && !(target instanceof Element && target.closest('button,a'))) { event.preventDefault(); story.togglePlay(); }
      else if (event.key.toLowerCase() === 'r' && selectedRun && !busy) { event.preventDefault(); story.replayCurrent(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const canStart = !busy && demo.connected && !!demo.scenario && (!realMode || !!demo.userRequest.trim());
  return <div className="presentation-shell" lang="zh-Hant">
    <header className="presentation-header">
      <a className="wordmark" href="#demo">LensGuard<span className="brand-period">.</span></a>
      <nav className="nav-links" aria-label="主要導覽">{([['demo', '互動展示'], ['evaluation', '評估'], ['architecture', '系統架構']] as const).map(([id, label]) => <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined}>{label}</a>)}</nav>
      <div className="presentation-health"><span className={`health-dot ${demo.connected ? 'connected' : ''}`} aria-hidden="true" /><span data-testid="status-backend">後端 {demo.connected ? '已連線' : '未連線'}</span><span>{realMode ? `${demo.health?.prototype?.model_profile || '本機模型'} · ${displayLabel(demo.health?.prototype?.status || 'unavailable')}` : '模擬資料模式'}</span></div>
    </header>
    <main>
      <div hidden={page !== 'demo'}>
        <section className="presentation-toolbar" aria-label="展示操作">
          <div className="scenario-control"><label htmlFor="scenario">情境</label><select id="scenario" value={demo.scenarioId} onChange={(event) => { clearPresentation(); demo.selectScenario(event.target.value); }} disabled={busy || !demo.scenarios.length}>
            {!demo.scenarios.length && <option value="reservation-injection">正在載入情境…</option>}
            {demo.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenarioLabel(scenario.id, scenario.name)}</option>)}
          </select></div>
          <div className="scenario-modes" aria-label="情境類型">
            <button type="button" aria-pressed={demo.scenarioId === 'reservation-injection'} disabled={busy || !demo.scenarios.length} onClick={() => { clearPresentation(); demo.selectScenario('reservation-injection'); }}>注入情境</button>
            <button type="button" aria-pressed={demo.scenarioId === 'explicit-delegation'} disabled={busy || !demo.scenarios.some(s => s.id === 'explicit-delegation')} onClick={() => { clearPresentation(); demo.selectScenario('explicit-delegation'); }}>明確授權</button>
          </div>
          <div className="guard-control"><span id="guard-label">LensGuard</span><button type="button" className="guard-switch" role="switch" aria-checked={actualGuard} aria-labelledby="guard-label" disabled={busy} onClick={() => { clearPresentation(); demo.toggleGuard(!actualGuard); }}><span className="switch-track"><span /></span><strong>{actualGuard ? '開啟' : '關閉'}</strong></button></div>
          <button type="button" className="inspect-button" onClick={inspect}>檢視細節</button>
        </section>
        <PipelineProgress phase={story.phase} />
        {!demo.connected && <div className="presentation-notice" role="status">後端連線中斷，正在自動重新連線。</div>}
        {realMode && demo.health?.prototype?.error && <div className="presentation-notice" role="status">{demo.health.prototype.error}</div>}
        {visibleError && <div className="presentation-notice" role="alert">{visibleError}</div>}
        {comparison.phase === 'failed' && <div className="presentation-notice" role="status">比較未能完成：{demo.error || '未能取得另一份分析結果。請重設後重試。'}</div>}
        {(story.replay || playback) && <div className="presentation-notice replay-notice">重播已取得的分析結果 · {actualGuard ? '開啟' : '關閉'} LensGuard · 不會重新送出請求</div>}
        {comparison.busy && <div className="presentation-notice" role="status">固定同一張影像與請求，正在取得{comparison.phase === 'without' ? '關閉' : '開啟'}防護的分析結果…</div>}
        <DemoStage phase={story.phase} run={normalized} playing={story.playing} onImpactEnd={story.finishImpact}>
          <CameraPanel cinematic disabled={busy} captureRef={captureRef} realMode={realMode} regions={[]} frameId={null} onLiveChange={() => {}} onImageChange={reset} />
          <div className="story-setup">
            <p className="setup-eyebrow">由你決定 AI 的任務</p>
            {realMode ? <section className="request-editor" aria-label="編輯使用者請求">
              <div className="request-editor-heading"><label htmlFor="user-request-input">你的請求</label><button type="button" disabled={busy || !demo.scenario || !demo.userRequestEdited} onClick={() => { clearPresentation(); demo.restoreUserRequest(); }}>{demo.scenarioId === 'reservation-injection' ? '清除請求' : '使用情境預設'}</button></div>
              <textarea id="user-request-input" value={demo.userRequest} onChange={(event) => { clearPresentation(); demo.editUserRequest(event.target.value); }} disabled={busy || !demo.scenario} rows={3} maxLength={4000} aria-describedby="user-request-help" aria-invalid={!!demo.scenario && !demo.userRequest.trim()} placeholder="例如：請撥打眼前餐廳的電話。" />
              <p id="user-request-help">{!demo.userRequest.trim() ? '請先輸入請求，再開始分析。' : '模型將使用這段請求與目前的影像。'}{demo.scenarioId === 'reservation-injection' && ' 若要訂位，請填寫日期、時間與用餐人數。'}</p>
            </section> : <p className="user-request">「{demo.userRequest || '正在載入情境…'}」</p>}
            <button type="button" className="story-run-button" disabled={!canStart} onClick={start}>{busy ? '分析中…' : '開始分析'}<span aria-hidden="true">→</span></button>
            <button type="button" className="story-compare-button" disabled={!canStart} onClick={() => void beginComparison()}>建立防護比較 <span aria-hidden="true">↔</span></button>
            <p className="setup-footnote">{realMode ? '相機快照或上傳影像 → 本機視覺語言模型' : '使用後端模擬情境；預覽影像不參與模擬推論。'}<br />所有外部行動皆為模擬執行。</p>
          </div>
        </DemoStage>
        <div className="presentation-bottom">
          <PresenterControls playing={story.playing} canPlay={story.canNext} canPrevious={story.canPrevious} canNext={story.canNext || nextComparison} canReplay={!!selectedRun && !busy} onPrevious={story.previous} onNext={next} onTogglePlay={story.togglePlay} onReplay={story.replayCurrent} />
          <span className="keyboard-hint">← → 換幕 · 空白鍵 播放／暫停 · R 重播</span>
          <button type="button" className="reset-presentation" onClick={reset}>重設</button>
        </div>
        {nextComparison && <button type="button" className="comparison-next" onClick={next}>接著看同一份輸入開啟防護後的結果 →</button>}
        {comparison.phase === 'complete' && terminal && selectedRun?.id === comparison.withGuard?.id && <section className="comparison-result" aria-label="防護比較結果">
          <div><span>關閉 LensGuard</span><strong>{resultLabel(comparison.without)}</strong><p>{comparison.without?.error || comparison.without?.outcome?.detail}</p></div>
          <div><span>開啟 LensGuard</span><strong>{resultLabel(comparison.withGuard)}</strong><p>{comparison.withGuard?.error || comparison.withGuard?.outcome?.detail}</p></div>
          <button type="button" onClick={replayComparison}>重播比較 ↔</button>
          <small>同一張影像、同一段請求，分別進行兩次分析。重播保留原始結果；外部行動皆為模擬。</small>
        </section>}
      </div>
      {page === 'evaluation' && <section className="evaluation-page surface"><p className="eyebrow">評估</p><h1>第 3.6 階段</h1><p className="page-lead">第 3.6 階段的評估結果將整合於此。</p><span className="mock-tag">實驗進行中</span><p>本展示支援本機推論與明確的模擬模式，不提供模型準確率或實測防禦成效。</p></section>}
      {page === 'architecture' && <Architecture realMode={realMode} />}
    </main>
    <DetailsDrawer open={details} onClose={() => setDetails(false)} run={selectedRun} health={demo.health} query={query} frameUrl={frameUrl} realMode={normalized.real} />
  </div>;
}
