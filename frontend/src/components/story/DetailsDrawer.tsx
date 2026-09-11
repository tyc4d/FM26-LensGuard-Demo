import { useEffect, useId, useRef } from 'react';
import type { Health, RunState } from '../../types';
import { displayLabel, timingLabel } from '../../labels';
import { ProposalPanel } from '../ProposalPanel';
import { DecisionPanel } from '../DecisionPanel';
import { DecisionTrace } from '../DecisionTrace';
import { EventTimeline } from '../EventTimeline';
import { RawAction } from '../RawAction';
import { RunSummary } from '../RunSummary';
import { SemanticEvidence } from '../SemanticEvidence';
import { isInformational } from '../../story';
import './details-drawer.css';

export interface DetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  run: RunState | null;
  baseline?: RunState | null;
  health: Health | null;
  query: string;
  frameUrl: string | null;
  realMode: boolean;
}

function rawData(value: unknown): string {
  if (value == null) return 'No data yet.';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function DetailsDrawer({ open, onClose, run, baseline, health, query, frameUrl, realMode }: DetailsDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const upstreamError = run?.runtime_metadata?.upstream_error;
  const healthError = health?.prototype?.raw_error;
  const timings = Object.entries(run?.timings || {});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className="details-drawer" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={() => { if (open) onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <header className="details-drawer-header">
        <div><p className="details-drawer-eyebrow">LensGuard</p><h2 id={titleId}>Technical trace</h2></div>
        <button type="button" className="details-drawer-close" onClick={onClose} autoFocus aria-label="Close details"><span aria-hidden="true">×</span><span>Close details</span></button>
      </header>
      <div className="details-drawer-content">
        <p id={descriptionId} className="details-drawer-description">Original input, semantic roles, supporting evidence, and user authorization. Scene text matching still depends on extraction and classification results.</p>
        <section className="details-drawer-request" aria-label="Current user request">
          <h3>User request</h3><p>{query || 'No request provided yet.'}</p>
        </section>
        <dl className="details-drawer-overview">
          <div><dt>Analysis status</dt><dd>{run ? displayLabel(run.status) : 'Awaiting analysis'}</dd></div>
          <div><dt>Runtime mode</dt><dd>{realMode ? 'Local model' : 'Mock data'}</dd></div>
          <div><dt>Frame ID</dt><dd>{run?.frame_id || '—'}</dd></div>
        </dl>

        <details className="disclosure technical-trace">
          <summary>View technical details</summary>
          <div className="details-drawer-section-content">
            <RunSummary run={run} userRequest={query} active={run?.status === 'running'} />
            {frameUrl && <figure className="details-drawer-frame"><img src={frameUrl} alt="Original image captured for this analysis" /><figcaption>Captured frame for this analysis</figcaption></figure>}
            <dl className="details-drawer-facts">
              <div><dt>Run ID</dt><dd>{run?.id || '—'}</dd></div>
              <div><dt>{realMode ? 'Detected regions' : 'Mock regions'}</dt><dd>{run?.regions.length || 0}</dd></div>
              <div><dt>Purpose</dt><dd>{isInformational(run) ? 'Informational answer' : run?.outcome?.simulation_only === false ? 'As recorded in the outcome' : 'Simulated external action'}</dd></div>
            </dl>
            {timings.length > 0 && <section className="details-drawer-latency"><h3>Processing time</h3><dl>{timings.map(([key, value]) => <div key={key}><dt>{timingLabel(key)}</dt><dd>{value.toFixed(1)} ms</dd></div>)}</dl></section>}
            {run?.raw_model_text != null && <section className="details-drawer-model-output"><h3>Raw local model output</h3><pre>{run.raw_model_text}</pre></section>}
            <details className="details-drawer-nested"><summary>Parsing and mapping diagnostics</summary><pre>{rawData(run?.runtime_metadata?.output)}</pre></details>
            {(upstreamError != null || healthError != null) && <details className="details-drawer-nested"><summary>Raw service errors</summary>
              {upstreamError != null && <section><h3>Current analysis</h3><pre>{rawData(upstreamError)}</pre></section>}
              {healthError != null && <section><h3>Service status</h3><pre>{rawData(healthError)}</pre></section>}
            </details>}
            <div className="details-drawer-proposal"><ProposalPanel realMode={realMode} run={run} /></div>
            {!!run?.semantic_regions?.length && <SemanticEvidence regions={run.semantic_regions} />}
            {run ? <DecisionPanel run={run} guardEnabled={run.guard_enabled} /> : <p className="details-drawer-empty">No authorization data for this analysis yet.</p>}
          </div>
        </details>
        <DecisionTrace realMode={realMode} run={run} />
        <details className="disclosure event-disclosure"><summary>View event timeline <span className="detail-count">{run?.events.length || 0} events</span></summary><EventTimeline run={run} active={run?.status === 'running'} /></details>
        <RawAction run={run} />
        <details className="disclosure"><summary>Full run data</summary><p className="details-drawer-raw-note">Includes raw model output, native authorization rules, provenance data, and run events.</p><pre>{rawData(run)}</pre></details>
        {baseline && <details className="disclosure"><summary>Run data without LensGuard</summary><pre>{rawData(baseline)}</pre></details>}
        <details className="disclosure"><summary>Raw service status</summary><pre>{rawData(health)}</pre></details>
      </div>
    </dialog>
  );
}
