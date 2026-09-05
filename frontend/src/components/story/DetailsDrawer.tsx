import { useEffect, useId, useRef } from 'react';
import type { Health, RunState } from '../../types';
import { displayLabel, timingLabel } from '../../labels';
import { ProposalPanel } from '../ProposalPanel';
import { DecisionPanel } from '../DecisionPanel';
import { DecisionTrace } from '../DecisionTrace';
import { EventTimeline } from '../EventTimeline';
import { RawAction } from '../RawAction';
import { RunSummary } from '../RunSummary';
import './details-drawer.css';

export interface DetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  run: RunState | null;
  health: Health | null;
  query: string;
  frameUrl: string | null;
  realMode: boolean;
}

function rawData(value: unknown): string {
  if (value == null) return '尚無資料。';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function DetailsDrawer({ open, onClose, run, health, query, frameUrl, realMode }: DetailsDrawerProps) {
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
        <div><p className="details-drawer-eyebrow">LensGuard</p><h2 id={titleId}>技術追溯</h2></div>
        <button type="button" className="details-drawer-close" onClick={onClose} autoFocus aria-label="關閉細節"><span aria-hidden="true">×</span><span>關閉細節</span></button>
      </header>
      <div className="details-drawer-content">
        <p id={descriptionId} className="details-drawer-description">原始輸入、模型輸出與授權判斷。來源紀錄不代表已驗證語意對應。</p>
        <section className="details-drawer-request" aria-label="本次使用者請求">
          <h3>使用者請求</h3><p>{query || '尚未提供請求。'}</p>
        </section>
        <dl className="details-drawer-overview">
          <div><dt>分析狀態</dt><dd>{run ? displayLabel(run.status) : '等待分析'}</dd></div>
          <div><dt>執行模式</dt><dd>{realMode ? '本機模型' : '模擬資料'}</dd></div>
          <div><dt>影格識別碼</dt><dd>{run?.frame_id || '—'}</dd></div>
        </dl>

        <details className="disclosure technical-trace">
          <summary>查看技術細節</summary>
          <div className="details-drawer-section-content">
            <RunSummary run={run} userRequest={query} active={run?.status === 'running'} />
            {frameUrl && <figure className="details-drawer-frame"><img src={frameUrl} alt="本次分析擷取的原始影像" /><figcaption>本次分析的擷取畫面</figcaption></figure>}
            <dl className="details-drawer-facts">
              <div><dt>分析識別碼</dt><dd>{run?.id || '—'}</dd></div>
              <div><dt>{realMode ? '偵測區域' : '模擬區域'}</dt><dd>{run?.regions.length || 0}</dd></div>
              <div><dt>行動執行</dt><dd>{run?.outcome?.simulation_only === false ? '依執行結果紀錄' : '模擬'}</dd></div>
            </dl>
            {timings.length > 0 && <section className="details-drawer-latency"><h3>處理耗時</h3><dl>{timings.map(([key, value]) => <div key={key}><dt>{timingLabel(key)}</dt><dd>{value.toFixed(1)} 毫秒</dd></div>)}</dl></section>}
            {run?.raw_model_text != null && <section className="details-drawer-model-output"><h3>本機模型原始輸出</h3><pre>{run.raw_model_text}</pre></section>}
            <details className="details-drawer-nested"><summary>解析與對應診斷</summary><pre>{rawData(run?.runtime_metadata?.output)}</pre></details>
            {(upstreamError != null || healthError != null) && <details className="details-drawer-nested"><summary>原始服務錯誤</summary>
              {upstreamError != null && <section><h3>本次分析</h3><pre>{rawData(upstreamError)}</pre></section>}
              {healthError != null && <section><h3>服務狀態</h3><pre>{rawData(healthError)}</pre></section>}
            </details>}
            <div className="details-drawer-proposal"><ProposalPanel realMode={realMode} run={run} /></div>
            {run ? <DecisionPanel run={run} guardEnabled={run.guard_enabled} /> : <p className="details-drawer-empty">尚無本次分析的授權資料。</p>}
          </div>
        </details>
        <DecisionTrace realMode={realMode} run={run} />
        <details className="disclosure event-disclosure"><summary>查看事件時間軸 <span className="detail-count">{run?.events.length || 0} 個事件</span></summary><EventTimeline run={run} active={run?.status === 'running'} /></details>
        <RawAction run={run} />
        <details className="disclosure"><summary>完整執行資料</summary><p className="details-drawer-raw-note">包含原始模型、原生授權規則、來源資料與執行事件。</p><pre>{rawData(run)}</pre></details>
        <details className="disclosure"><summary>服務狀態原始資料</summary><pre>{rawData(health)}</pre></details>
      </div>
    </dialog>
  );
}
