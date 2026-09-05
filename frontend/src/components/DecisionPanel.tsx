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
      <h3 className="eyebrow">{informational ? '回答證據' : '授權細節'}</h3>
      {authorizationFailed && <p role="status">未進行授權判定：{run.error}</p>}
      {issues.length > 0 && <ul aria-label="待修正的行動資料">{issues.map(issue => <li key={issue.argument}><strong>{fieldLabel(issue.argument)}</strong>：{issue.message}</li>)}</ul>}
      <dl className="decision-facts">
        <div><dt>來源</dt><dd>{displayLabel(value?.source_type)}</dd></div>
        {value?.semantic_role && <div><dt>語意角色</dt><dd>{displayLabel(value.semantic_role)}</dd></div>}
        {value?.grounded_claim && <div><dt>支持事實</dt><dd>{displayLabel(value.grounded_claim.predicate)}：{value.grounded_claim.value}</dd></div>}
        <div><dt>相關參數</dt><dd>{fieldLabel(affectedArgument)}</dd></div>
        <div><dt>值</dt><dd>{value?.value || '—'}</dd></div>
        <div><dt>{informational ? '證據地位' : '來源權限'}</dt><dd>{displayLabel(decision?.source_authority || (value ? value.authority.includes('delegated') ? 'DELEGATED' : value.authority.includes('evidence') ? 'EVIDENCE' : 'NONE' : '—'))}</dd></div>
        <div><dt>所需權限</dt><dd>{displayLabel(decision?.required_authority)}</dd></div>
        <div><dt>授權規則</dt><dd className={decision?.result === 'block' ? 'text-block' : decision?.result === 'allow' ? 'text-allow' : ''}>{decision ? decision.result === 'block' ? '拒絕' : '允許' : authorizationFailed ? '未進行判定' : !guardEnabled ? '已略過授權' : '—'}</dd></div>
      </dl>
      <p className="policy-reason">{decision?.reason || (outcome ? outcome.detail : authorizationFailed ? run.error || '授權未完成，未執行任何行動。' : !guardEnabled ? '授權判定已關閉，行動提案將在模擬中執行。' : '環境內容可提供任務資訊，但決定行動參數仍需要授權。')}</p>
      {run?.delegation && <dl className="delegation-facts" aria-label="使用者限定授權">
        <div><dt>授權來源</dt><dd>使用者請求</dd></div>
        <div><dt>{run.delegation.target ? '使用者指定對象' : '允許的實體角色'}</dt><dd>{run.delegation.target ?? displayLabel(run.delegation.predicate)}</dd></div>
        <div><dt>參數綁定</dt><dd>{fieldLabel(`${run.delegation.tool}.${run.delegation.argument}`)}</dd></div>
        <div><dt>範圍</dt><dd>{run.delegation.request_quote ?? displayLabel(run.delegation.scope)}</dd></div>
      </dl>}
      {!!run?.argument_decisions?.length && <div className="semantic-argument-decisions" aria-label="各候選值的授權結果">{run.argument_decisions.map(candidate => <div key={`${candidate.source_id}-${candidate.value}`}>
        <strong>{candidate.value} · {candidate.result === 'allow' ? '✓ 允許' : '✕ 阻擋'}</strong><p>{displayLabel(candidate.semantic_role)} · {candidate.reason}</p>
      </div>)}</div>}

    </div>
  );
}
