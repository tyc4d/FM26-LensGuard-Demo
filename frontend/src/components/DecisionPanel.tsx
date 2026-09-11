import type { RunState } from '../types';
import { displayLabel, fieldLabel } from '../labels';
import { isInformational } from '../story';

export function DecisionPanel({ run, guardEnabled }: { run: RunState | null; guardEnabled: boolean }) {
  const decision = run?.decision;
  const outcome = run?.outcome;
  const action = run?.action;
  const informational = isInformational(run);
  const issues = run?.validation_issues || [];
  const authorizationFailed = run?.status === 'failed' && !decision;
  const fallbackArgument = action?.tool === 'navigate' && 'direction' in action.arguments
    ? 'direction' : Object.keys(action?.arguments || {})[0];
  const problemArgument = issues[0]?.argument || decision?.affected_argument;
  const argumentName = action && (problemArgument?.startsWith(`${action.tool}.`)
    ? problemArgument.slice(action.tool.length + 1)
    : fallbackArgument);
  const value = action && argumentName ? action.arguments[argumentName] : undefined;
  const affectedArgument = problemArgument || (action && argumentName ? `${action.tool}.${argumentName}` : '—');
  return (
    <div className="decision-body">
      <h3 className="eyebrow">{informational ? 'Answer evidence' : 'Authorization details'}</h3>
      {authorizationFailed && <p role="status">Authorization was not evaluated: {run.error}</p>}
      {issues.length > 0 && <ul aria-label="Action details to correct">{issues.map(issue => <li key={issue.argument}><strong>{fieldLabel(issue.argument)}</strong>: {issue.message}</li>)}</ul>}
      <dl className="decision-facts">
        <div><dt>Source</dt><dd>{displayLabel(value?.source_type)}</dd></div>
        {value?.semantic_role && <div><dt>Semantic role</dt><dd>{displayLabel(value.semantic_role)}</dd></div>}
        {value?.grounded_claim && <div><dt>Supporting fact</dt><dd>{displayLabel(value.grounded_claim.predicate)}: {value.grounded_claim.value}</dd></div>}
        <div><dt>Affected argument</dt><dd>{fieldLabel(affectedArgument)}</dd></div>
        <div><dt>Value</dt><dd>{value?.value || '—'}</dd></div>
        <div><dt>{informational ? 'Evidence status' : 'Source authority'}</dt><dd>{displayLabel(decision?.source_authority || (value ? value.authority.includes('delegated') ? 'DELEGATED' : value.authority.includes('evidence') ? 'EVIDENCE' : 'NONE' : '—'))}</dd></div>
        <div><dt>Required authority</dt><dd>{displayLabel(decision?.required_authority)}</dd></div>
        <div><dt>Authorization rule</dt><dd className={decision?.result === 'block' ? 'text-block' : decision?.result === 'allow' ? 'text-allow' : ''}>{decision ? decision.result === 'block' ? 'Deny' : 'Allow' : authorizationFailed ? 'Not evaluated' : !guardEnabled ? 'Authorization bypassed' : '—'}</dd></div>
      </dl>
      <p className="policy-reason">{decision?.reason || (outcome ? outcome.detail : authorizationFailed ? run.error || 'Authorization did not finish. No action was taken.' : !guardEnabled ? 'Authorization checks are disabled. The proposed action will run in simulation.' : 'Scene content can provide task information. Selecting action arguments still requires authorization.')}</p>
      {run?.delegation && <dl className="delegation-facts" aria-label="Scoped user authorization">
        <div><dt>Authorization source</dt><dd>User request</dd></div>
        <div><dt>{run.delegation.target ? 'User-specified target' : 'Allowed entity role'}</dt><dd>{run.delegation.target ?? displayLabel(run.delegation.predicate)}</dd></div>
        <div><dt>Argument binding</dt><dd>{fieldLabel(`${run.delegation.tool}.${run.delegation.argument}`)}</dd></div>
        <div><dt>Scope</dt><dd>{run.delegation.request_quote ?? displayLabel(run.delegation.scope)}</dd></div>
      </dl>}
      {!!run?.argument_decisions?.length && <div className="semantic-argument-decisions" aria-label="Authorization results for candidate values">{run.argument_decisions.map(candidate => <div key={`${candidate.source_id}-${candidate.value}`}>
        <strong>{candidate.value} · {candidate.result === 'allow' ? '✓ Allow' : '✕ Block'}</strong><p>{displayLabel(candidate.semantic_role)} · {candidate.reason}</p>
      </div>)}</div>}

    </div>
  );
}
