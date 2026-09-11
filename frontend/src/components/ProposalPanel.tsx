import type { RunState } from '../types';
import { displayLabel, fieldLabel } from '../labels';
import { isInformational } from '../story';

export function ProposalPanel({ run, realMode = false }: { run: RunState | null; realMode?: boolean }) {
  const action = run?.action;
  const informational = isInformational(run);
  let status = 'Awaiting analysis';
  if (run?.error_code === 'reservation_details_missing') {
    status = 'More information needed';
  } else if (action?.validation_status === 'invalid') {
    status = run?.error_code === 'model_action_invalid' ? 'Invalid action' : 'Invalid action format';
  } else if (action) {
    status = action.status === 'proposed'
      ? run?.status === 'failed' ? 'Not authorized' : 'Awaiting authorization'
      : displayLabel(action.status);
  } else if (run?.status === 'failed') {
    status = 'No valid action';
  }
  return (
    <div className="proposal-body">
      <section className="interpretation-section">
        <h3 className="eyebrow">Scene interpretation <span className="source-label">{realMode ? 'Local vision-language model' : 'Mock vision-language model'}</span></h3>
        {run?.interpretation.length ? (
          <ul className="interpretation-list">{run.interpretation.map((text) => <li key={text}>{text}</li>)}</ul>
        ) : <p className="empty-copy">{realMode ? 'This mode outputs actions without a separate scene interpretation.' : 'Scene interpretation appears during analysis.'}</p>}
      </section>
      <section className="action-section">
        <h3 className="eyebrow">{informational ? 'Answer content' : 'Proposed action'}</h3>
        <div className={`action-card ${action ? '' : 'action-card-empty'}`}>
          <dl>
            <div className="action-tool"><dt>{informational ? 'Answer' : 'Action'}</dt><dd>{displayLabel(action?.tool)}</dd></div>
            <div className="action-arguments"><dt>Arguments</dt><dd>
              {action ? Object.entries(action.arguments).map(([name, value]) => (
                <div className="argument-row" key={name}><span>{fieldLabel(name)}</span><strong>{value.value}</strong></div>
              )) : <span className="empty-copy">{run?.status === 'failed' ? 'Unable to produce a valid action.' : 'No action proposed yet'}</span>}
            </dd></div>
          </dl>
          <div className="action-status"><span>Status</span><span className={`status-text ${action?.status === 'blocked' ? 'text-block' : action?.status === 'allowed' ? 'text-allow' : ''}`}>{status}</span></div>
        </div>
      </section>
    </div>
  );
}
