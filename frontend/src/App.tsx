import { useEffect, useState, useRef } from 'react';
import { CameraPanel, type CameraCapture } from './components/CameraPanel';
import { ProposalPanel } from './components/ProposalPanel';
import { DecisionPanel } from './components/DecisionPanel';
import { DecisionTrace } from './components/DecisionTrace';
import { EventTimeline } from './components/EventTimeline';
import { RunSummary, presentRun } from './components/RunSummary';
import { RawAction } from './components/RawAction';
import { useDemoRuntime } from './useDemoRuntime';
import { displayLabel, scenarioLabel, timingLabel } from './labels';

type Page = 'demo' | 'evaluation' | 'architecture';

function pageFromHash(): Page {
  const page = window.location.hash.slice(1);
  return page === 'evaluation' || page === 'architecture' ? page : 'demo';
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
  const realMode = demo.health?.runtime === 'prototype';
  const [cameraLive, setCameraLive] = useState(false);
  const [imageName, setImageName] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(pageFromHash);
  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => { document.title = `LensGuard · ${page === 'demo' ? '即時展示' : page === 'evaluation' ? '評估' : '系統架構'}`; }, [page]);

  const view = presentRun(demo.run, demo.active);
  return <div className="app-shell" lang="zh-Hant">
    <header className="site-header">
      <div className="brand-block"><a className="wordmark" href="#demo">LensGuard<span className="brand-period">.</span></a><p>讓 AI 看懂世界，而不讓世界控制 AI。</p></div>
      <nav className="nav-links" aria-label="主要導覽">{([['demo', '即時展示'], ['evaluation', '評估'], ['architecture', '系統架構']] as const).map(([id, label]) => <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined}>{label}</a>)}</nav>
    </header>
    <main>
      <div hidden={page !== 'demo'}>
        <section className={`result-hero result-${view.tone}`} aria-live="polite" aria-atomic="true">
          <div className="hero-kicker"><span>從感知到行動的安全防護</span><span>互動研究展示</span></div>
          <h1 lang="zh-Hant">{view.headline}</h1>
          <p>{view.subtitle}</p>
        </section>
        {!demo.connected && <div className="connection-notice" role="status">後端連線中斷。請啟動 FastAPI 服務以進行分析；系統正在自動重新連線。</div>}
        {realMode && demo.health?.prototype?.error && <div className="connection-notice" role="status">{demo.health.prototype.error}</div>}
        {demo.error && <div className="connection-notice" role="alert">{demo.error}</div>}
        <section className="demo-controls" aria-label="展示操作">
          <div className="scenario-control"><label htmlFor="scenario">情境</label><select id="scenario" value={demo.scenarioId} onChange={(event) => demo.selectScenario(event.target.value)} disabled={demo.active || !demo.scenarios.length}>
            {!demo.scenarios.length && <option value="reservation-injection">正在載入情境…</option>}
            {demo.scenarios.map((scenario, index) => <option key={scenario.id} value={scenario.id}>{String.fromCharCode(65 + index)} · {scenarioLabel(scenario.id, scenario.name)}</option>)}
          </select></div>
          <div className="guard-control"><span id="guard-label">LensGuard</span><button type="button" className="guard-switch" role="switch" aria-checked={demo.guardEnabled} aria-labelledby="guard-label" onClick={demo.toggleGuard} disabled={demo.active}><span className="switch-track"><span /></span><strong>{demo.guardEnabled ? '開啟' : '關閉'}</strong></button></div>
          <div className="run-controls"><button className="button button-primary" onClick={() => void demo.startRun(() => { if (!captureRef.current) throw new Error('目前無法擷取相機影像。'); return captureRef.current.capture(); })} disabled={demo.active || !demo.connected || !demo.scenario || (realMode && !demo.userRequest.trim())}>{demo.active ? '分析中…' : '開始分析'}<span aria-hidden="true">→</span></button><button className="button button-secondary" onClick={demo.reset}>重設</button></div>
        </section>
        {realMode && <section className="request-editor" aria-label="編輯使用者請求">
          <div className="request-editor-heading"><label htmlFor="user-request-input">你的請求</label><button type="button" onClick={demo.restoreUserRequest} disabled={demo.active || !demo.scenario || !demo.userRequestEdited}>{demo.scenarioId === 'reservation-injection' ? '清除請求' : '使用情境預設'}</button></div>
          <textarea id="user-request-input" value={demo.userRequest} onChange={(event) => demo.editUserRequest(event.target.value)} disabled={demo.active || !demo.scenario} rows={2} maxLength={4000} aria-describedby="user-request-help" aria-invalid={!!demo.scenario && !demo.userRequest.trim()} placeholder="請告訴模型你希望它執行的任務。" />
          <p id="user-request-help">{!demo.userRequest.trim() && demo.scenario ? '請先輸入請求，再開始分析。' : ''}{demo.scenarioId === 'reservation-injection' ? '若要訂位，請填寫日期、時間與用餐人數；若只要撥打電話，請明確說明。' : '請描述你希望根據影像完成的任務。開始分析時才會送出請求。'}</p>
        </section>}
        <CameraPanel captureRef={captureRef} realMode={realMode} regions={demo.run?.regions || []} frameId={demo.run?.frame_id || null} onLiveChange={setCameraLive} onImageChange={(name) => { setImageName(name); demo.reset(); }}>
          <RunSummary run={demo.run} scenario={demo.scenario} userRequest={demo.displayedUserRequest} active={demo.active} />
        </CameraPanel>
        <div className="stage-note"><span>{realMode ? (demo.health?.prototype?.model_profile || '本機視覺語言模型') + '・' + displayLabel(demo.health?.prototype?.status || 'unavailable') : '相機或上傳影像；使用模擬推論。'}・所有行動皆為模擬</span><span>{realMode ? '尚無語意對應' : '第 3.6 階段模型整合尚待完成'}</span></div>
        <section className="technical-details" aria-label="可展開的研究細節">
          <DecisionTrace realMode={realMode} run={demo.run} />
          <details className="disclosure technical-trace">
            <summary>查看技術細節</summary>
            <div className="technical-statuses"><span data-testid="status-backend">後端 {demo.connected ? '已連線' : '未連線'}</span><span>模型 {realMode ? displayLabel(demo.health?.prototype?.status || 'unavailable') : demo.active ? '處理中' : demo.connected ? '已就緒' : '無法使用'}・{realMode ? '本機視覺語言模型' : '模擬資料'}</span></div>
            <dl className="camera-metadata"><div><dt>影格識別碼</dt><dd>{demo.run?.frame_id || '—'}</dd></div><div><dt>預覽來源</dt><dd>{imageName ? '上傳影像' : cameraLive ? '相機' : demo.run ? realMode ? '擷取影像' : '模擬範例' : '—'}</dd></div><div><dt>{realMode ? '偵測區域' : '模擬區域'}</dt><dd>{demo.run?.regions.length || 0}</dd></div></dl>
            {realMode && <>
              <p>來源資訊：僅記錄傳輸過程。語意對應：尚未提供。行動執行：模擬。</p>
              <dl className="camera-metadata">{Object.entries(demo.run?.timings || {}).map(([key, value]) => <div key={key}><dt>{timingLabel(key)}</dt><dd>{value.toFixed(1)} 毫秒</dd></div>)}</dl>
              {demo.run?.raw_model_text != null && <section><h3>本機模型原始輸出</h3><pre>{demo.run.raw_model_text}</pre><details><summary>解析與對應診斷</summary><pre>{JSON.stringify(demo.run.runtime_metadata?.output, null, 2)}</pre></details></section>}
              {(demo.run?.runtime_metadata?.upstream_error != null || demo.health?.prototype?.raw_error != null) && <details>
                <summary>原始服務錯誤</summary>
                {demo.run?.runtime_metadata?.upstream_error != null && <section><h3>本次分析</h3><pre>{typeof demo.run.runtime_metadata.upstream_error === 'string' ? demo.run.runtime_metadata.upstream_error : JSON.stringify(demo.run.runtime_metadata.upstream_error, null, 2)}</pre></section>}
                {demo.health?.prototype?.raw_error != null && <section><h3>服務狀態</h3><pre>{demo.health.prototype.raw_error}</pre></section>}
              </details>}
            </>}
            <div className="technical-grid"><ProposalPanel realMode={realMode} run={demo.run} /><DecisionPanel run={demo.run} guardEnabled={demo.guardEnabled} /></div>
          </details>
          <details className="disclosure event-disclosure"><summary>查看事件時間軸 <span className="detail-count">{demo.run?.events.length || 0} 個事件</span></summary><EventTimeline run={demo.run} active={demo.active} /></details>
          <RawAction run={demo.run} />
        </section>
      </div>
      {page === 'evaluation' && <section className="evaluation-page surface"><p className="eyebrow">評估</p><h1>第 3.6 階段</h1><p className="page-lead">第 3.6 階段的評估結果將整合於此。</p><span className="mock-tag">實驗進行中</span><p>本展示支援本機推論與明確的模擬模式，不提供模型準確率或實測防禦成效。</p></section>}
      {page === 'architecture' && <Architecture realMode={realMode} />}
    </main>
    <footer className="site-footer"><span>LensGuard／研究原型</span><span>觀察不等於授權。</span></footer>
  </div>;
}
