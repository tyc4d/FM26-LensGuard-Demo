import type { RunState } from '../types';

export function ProposalPanel({ run, realMode = false }: { run: RunState | null; realMode?: boolean }) {
  const action = run?.action;
  let status = 'AWAITING ANALYSIS';
  if (run?.error_code === 'reservation_details_missing') {
    status = 'DETAILS REQUIRED';
  } else if (action?.validation_status === 'invalid') {
    status = run?.error_code === 'model_action_invalid' ? 'INVALID ACTION' : 'INVALID ACTION SCHEMA';
  } else if (action) {
    status = action.status === 'proposed'
      ? run?.status === 'failed' ? 'NOT AUTHORIZED' : 'PENDING AUTHORIZATION'
      : action.status.toUpperCase();
  } else if (run?.status === 'failed') {
    status = 'NO VALID ACTION';
  }
  return (
    <div className="proposal-body">
      <section className="interpretation-section">
        <h3 className="eyebrow">Scene Interpretation <span className="source-label">{realMode ? 'LOCAL VLM' : 'MOCK VLM'}</span></h3>
        {run?.interpretation.length ? (
          <ul className="interpretation-list">{run.interpretation.map((text) => <li key={text}>{text}</li>)}</ul>
        ) : <p className="empty-copy">{realMode ? 'Action-only inference: no separate scene interpretation is generated.' : 'Scene interpretation appears during analysis.'}</p>}
      </section>
      <section className="action-section">
        <h3 className="eyebrow">Proposed Action</h3>
        <div className={`action-card ${action ? '' : 'action-card-empty'}`}>
          <dl>
            <div className="action-tool"><dt>tool</dt><dd>{action?.tool || '—'}</dd></div>
            <div className="action-arguments"><dt>arguments</dt><dd>
              {action ? Object.entries(action.arguments).map(([name, value]) => (
                <div className="argument-row" key={name}><span>{name}</span><strong>{value.value}</strong></div>
              )) : <span className="empty-copy">{run?.status === 'failed' ? 'No valid action could be produced.' : 'No action proposed yet'}</span>}
            </dd></div>
          </dl>
          <div className="action-status"><span>status</span><span className={`status-text ${action?.status === 'blocked' ? 'text-block' : action?.status === 'allowed' ? 'text-allow' : ''}`}>{status}</span></div>
        </div>
      </section>
    </div>
  );
}
