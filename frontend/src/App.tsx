import { useEffect, useState, useRef } from 'react';
import { CameraPanel, type CameraCapture } from './components/CameraPanel';
import { ProposalPanel } from './components/ProposalPanel';
import { DecisionPanel } from './components/DecisionPanel';
import { DecisionTrace } from './components/DecisionTrace';
import { EventTimeline } from './components/EventTimeline';
import { RunSummary, presentRun } from './components/RunSummary';
import { RawAction } from './components/RawAction';
import { useDemoRuntime } from './useDemoRuntime';

type Page = 'demo' | 'evaluation' | 'architecture';

function pageFromHash(): Page {
  const page = window.location.hash.slice(1);
  return page === 'evaluation' || page === 'architecture' ? page : 'demo';
}

function Architecture({ realMode }: { realMode: boolean }) {
  const components = [
    ['Camera', 'LIVE'], ['VLM', realMode ? 'LOCAL' : 'MOCK'], ['Provenance Engine', realMode ? 'TRANSPORT ONLY' : 'MOCK'],
    ['Agent Proposal', realMode ? 'LOCAL VLM' : 'MOCK'], ['Authorization Gate', realMode ? 'DETERMINISTIC' : 'MOCK'], ['Action', 'SIMULATED'],
  ];
  return <section className="architecture-page surface">
    <p className="eyebrow">System overview</p><h1>Sensor-to-action authorization</h1>
    <p className="page-lead">Readable environmental content carries provenance. The authorization gate checks whether that source may bind the proposed action argument.</p>
    <div className="architecture-flow" role="img" aria-label="Camera to VLM to Provenance Engine to Agent Proposal to Authorization Gate to Action">
      {components.map(([name, status], index) => <div className="architecture-step" key={name}>
        {index > 0 && <span className="architecture-arrow" aria-hidden="true">→</span>}
        <div><span className="eyebrow">{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><span className="mock-tag">{status}</span></div>
      </div>)}
    </div>
    <div className="architecture-notes grid gap-6 md:grid-cols-2">
      <section><h2>Current implementation</h2><dl className="component-statuses">
        {[['Camera', 'LIVE'], ['UI', 'LIVE'], ['Backend orchestration', 'LIVE'], ['VLM inference', realMode ? 'LOCAL' : 'MOCK'], ['Provenance extraction', realMode ? 'TRANSPORT ONLY' : 'MOCK'], ['Policy engine', realMode ? 'DETERMINISTIC' : 'MOCK']].map(([name, state]) => <div key={name}><dt>{name}</dt><dd>{state}</dd></div>)}
      </dl></section>
      <section><h2>Local runtime integration</h2><p>Real mode sends one camera snapshot or uploaded image through Demo FastAPI to the independent Prototype runtime. Gemma 3 4B uses the existing action-only adapter and parser.</p><p>Transport lineage is recorded. Semantic region grounding is not available. The deterministic gate withholds unconfirmed actions; a scoped business-card delegation rule permits a simulated call. Mock mode remains explicitly selectable.</p><p className="implementation-note">All external actions are simulated. This live demo is not a Phase 3.6 benchmark result.</p></section>
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
  useEffect(() => { document.title = `LensGuard · ${page === 'demo' ? 'Live Demo' : page === 'evaluation' ? 'Evaluation' : 'Architecture'}`; }, [page]);

  const view = presentRun(demo.run, demo.active);
  return <div className="app-shell">
    <header className="site-header">
      <div className="brand-block"><a className="wordmark" href="#demo">LensGuard<span className="brand-period">.</span></a><p>Let AI read the world without letting the world control the AI.</p></div>
      <nav className="nav-links" aria-label="Main navigation">{([['demo', 'Live Demo'], ['evaluation', 'Evaluation'], ['architecture', 'Architecture']] as const).map(([id, label]) => <a key={id} href={`#${id}`} aria-current={page === id ? 'page' : undefined}>{label}</a>)}</nav>
    </header>
    <main>
      <div hidden={page !== 'demo'}>
        <section className={`result-hero result-${view.tone}`} aria-live="polite" aria-atomic="true">
          <div className="hero-kicker"><span>Sensor-to-action security</span><span>Interactive research demo</span></div>
          <h1 lang={demo.run?.outcome ? 'zh-Hant' : 'en'}>{view.headline}</h1>
          <p>{view.subtitle}</p>
        </section>
        {!demo.connected && <div className="connection-notice" role="status">Backend disconnected. Start the FastAPI server to run analysis. Reconnecting automatically.</div>}
        {realMode && demo.health?.prototype?.error && <div className="connection-notice" role="status">{demo.health.prototype.error}</div>}
        {demo.error && <div className="connection-notice" role="alert">{demo.error}</div>}
        <section className="demo-controls" aria-label="Demo controls">
          <div className="scenario-control"><label htmlFor="scenario">Scenario</label><select id="scenario" value={demo.scenarioId} onChange={(event) => demo.selectScenario(event.target.value)} disabled={demo.active || !demo.scenarios.length}>
            {!demo.scenarios.length && <option value="reservation-injection">Loading scenarios…</option>}
            {demo.scenarios.map((scenario, index) => <option key={scenario.id} value={scenario.id}>{String.fromCharCode(65 + index)} · {scenario.name}</option>)}
          </select></div>
          <div className="guard-control"><span id="guard-label">LensGuard</span><button type="button" className="guard-switch" role="switch" aria-checked={demo.guardEnabled} aria-labelledby="guard-label" onClick={demo.toggleGuard} disabled={demo.active}><span className="switch-track"><span /></span><strong>{demo.guardEnabled ? 'ON' : 'OFF'}</strong></button></div>
          <div className="run-controls"><button className="button button-primary" onClick={() => void demo.startRun(() => { if (!captureRef.current) throw new Error('Camera capture is unavailable.'); return captureRef.current.capture(); })} disabled={demo.active || !demo.connected || !demo.scenario}>{demo.active ? 'Analyzing…' : 'Run Analysis'}<span aria-hidden="true">→</span></button><button className="button button-secondary" onClick={demo.reset}>Reset</button></div>
        </section>
        <CameraPanel captureRef={captureRef} realMode={realMode} regions={demo.run?.regions || []} frameId={demo.run?.frame_id || null} onLiveChange={setCameraLive} onImageChange={(name) => { setImageName(name); demo.reset(); }}>
          <RunSummary run={demo.run} scenario={demo.scenario} active={demo.active} />
        </CameraPanel>
        <div className="stage-note"><span>{realMode ? 'LOCAL VLM · ' + (demo.health?.prototype?.status || 'UNAVAILABLE').toUpperCase() : 'Camera or uploaded image. Mock inference.'} · Simulated actions.</span><span>{realMode ? 'Semantic grounding unavailable' : 'Phase 3.6 model integration pending'}</span></div>
        <section className="technical-details" aria-label="Expandable research details">
          <DecisionTrace realMode={realMode} run={demo.run} />
          <details className="disclosure technical-trace">
            <summary>Show technical trace</summary>
            <div className="technical-statuses"><span data-testid="status-backend">Backend {demo.connected ? 'CONNECTED' : 'DISCONNECTED'}</span><span>Model {realMode ? (demo.health?.prototype?.status || 'UNAVAILABLE').toUpperCase() : demo.active ? 'PROCESSING' : demo.connected ? 'READY' : 'UNAVAILABLE'} · {realMode ? 'LOCAL VLM' : 'MOCK'}</span></div>
            <dl className="camera-metadata"><div><dt>Frame ID</dt><dd>{demo.run?.frame_id || '—'}</dd></div><div><dt>Preview source</dt><dd>{imageName ? 'uploaded image' : cameraLive ? 'camera' : demo.run ? realMode ? 'captured image' : 'mock fixture' : '—'}</dd></div><div><dt>{realMode ? 'Detected regions' : 'Mock regions'}</dt><dd>{demo.run?.regions.length || 0}</dd></div></dl>
            {realMode && <><p>Provenance: transport lineage only. Semantic grounding: unavailable. Execution: simulated.</p><dl className="camera-metadata">{Object.entries(demo.run?.timings || {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value.toFixed(1)} ms</dd></div>)}</dl>{demo.run?.raw_model_text != null && <section><h3>Raw local model output</h3><pre>{demo.run.raw_model_text}</pre><details><summary>Parser and mapping diagnostics</summary><pre>{JSON.stringify(demo.run.runtime_metadata?.output, null, 2)}</pre></details></section>}</>}
            <div className="technical-grid"><ProposalPanel realMode={realMode} run={demo.run} /><DecisionPanel run={demo.run} guardEnabled={demo.guardEnabled} /></div>
          </details>
          <details className="disclosure event-disclosure"><summary>Show event timeline <span className="detail-count">{demo.run?.events.length || 0} events</span></summary><EventTimeline run={demo.run} active={demo.active} /></details>
          <RawAction run={demo.run} />
        </section>
      </div>
      {page === 'evaluation' && <section className="evaluation-page surface"><p className="eyebrow">Evaluation</p><h1>Phase 3.6</h1><p className="page-lead">Phase 3.6 evaluation results will be integrated here.</p><span className="mock-tag">EXPERIMENTS IN PROGRESS</span><p>The demo supports local inference and explicit mock mode. It does not report model accuracy or measured defense performance.</p></section>}
      {page === 'architecture' && <Architecture realMode={realMode} />}
    </main>
    <footer className="site-footer"><span>LensGuard / Research prototype</span><span>Observation is not authorization.</span></footer>
  </div>;
}
