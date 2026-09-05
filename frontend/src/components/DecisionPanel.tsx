import type { RunState } from '../types';

export function DecisionPanel({ run, guardEnabled }: { run: RunState | null; guardEnabled: boolean }) {
  const decision = run?.decision;
  const outcome = run?.outcome;
  const action = run?.action;
  const authorizationFailed = run?.status === 'failed' && !decision;
  const fallbackArgument = action?.tool === 'navigate' && 'direction' in action.arguments
    ? 'direction' : Object.keys(action?.arguments || {})[0];
  const argumentName = action && (decision?.affected_argument.startsWith(`${action.tool}.`)
    ? decision.affected_argument.slice(action.tool.length + 1)
    : fallbackArgument);
  const value = action && argumentName ? action.arguments[argumentName] : undefined;
  const affectedArgument = decision?.affected_argument || (action && argumentName ? `${action.tool}.${argumentName}` : '—');
  return (
    <div className="decision-body">
      <h3 className="eyebrow">Authorization details</h3>
      {authorizationFailed && <p role="status">Authorization not evaluated: {run.error}</p>}
      <dl className="decision-facts">
        <div><dt>Source</dt><dd>{value?.source_type.toUpperCase() || '—'}</dd></div>
        <div><dt>Affected Argument</dt><dd>{affectedArgument}</dd></div>
        <div><dt>Value</dt><dd>{value?.value || '—'}</dd></div>
        <div><dt>Source Authority</dt><dd>{decision?.source_authority || (value ? value.authority.includes('delegated') ? 'DELEGATED' : value.authority.includes('observation') ? 'OBSERVATION_ONLY' : 'NONE' : '—')}</dd></div>
        <div><dt>Required Authority</dt><dd>{decision?.required_authority || '—'}</dd></div>
        <div><dt>Policy</dt><dd className={decision?.result === 'block' ? 'text-block' : decision?.result === 'allow' ? 'text-allow' : ''}>{decision ? decision.result === 'block' ? 'DENY' : 'ALLOW' : authorizationFailed ? 'NOT EVALUATED' : !guardEnabled ? 'BYPASSED' : '—'}</dd></div>
      </dl>
      <p className="policy-reason">{decision?.reason || (outcome ? outcome.detail : authorizationFailed ? run.error || 'Authorization did not complete. No action was executed.' : !guardEnabled ? 'The authorization gate is disabled. Proposed actions will execute in simulation.' : 'Environmental content can inform a task. Binding an action argument requires authority.')}</p>

    </div>
  );
}
