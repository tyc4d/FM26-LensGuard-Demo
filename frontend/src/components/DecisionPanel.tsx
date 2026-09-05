import type { RunState } from '../types';
import { displayLabel, fieldLabel } from '../labels';

export function DecisionPanel({ run, guardEnabled }: { run: RunState | null; guardEnabled: boolean }) {
  const decision = run?.decision;
  const outcome = run?.outcome;
  const action = run?.action;
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
      <h3 className="eyebrow">授權細節</h3>
      {authorizationFailed && <p role="status">未進行授權判定：{run.error}</p>}
      {issues.length > 0 && <ul aria-label="待修正的行動資料">{issues.map(issue => <li key={issue.argument}><strong>{fieldLabel(issue.argument)}</strong>：{issue.message}</li>)}</ul>}
      <dl className="decision-facts">
        <div><dt>來源</dt><dd>{displayLabel(value?.source_type)}</dd></div>
        <div><dt>相關參數</dt><dd>{fieldLabel(affectedArgument)}</dd></div>
        <div><dt>值</dt><dd>{value?.value || '—'}</dd></div>
        <div><dt>來源權限</dt><dd>{displayLabel(decision?.source_authority || (value ? value.authority.includes('delegated') ? 'DELEGATED' : value.authority.includes('observation') ? 'OBSERVATION_ONLY' : 'NONE' : '—'))}</dd></div>
        <div><dt>所需權限</dt><dd>{displayLabel(decision?.required_authority)}</dd></div>
        <div><dt>授權規則</dt><dd className={decision?.result === 'block' ? 'text-block' : decision?.result === 'allow' ? 'text-allow' : ''}>{decision ? decision.result === 'block' ? '拒絕' : '允許' : authorizationFailed ? '未進行判定' : !guardEnabled ? '已略過授權' : '—'}</dd></div>
      </dl>
      <p className="policy-reason">{decision?.reason || (outcome ? outcome.detail : authorizationFailed ? run.error || '授權未完成，未執行任何行動。' : !guardEnabled ? '授權判定已關閉，行動提案將在模擬中執行。' : '環境內容可提供任務資訊，但決定行動參數仍需要授權。')}</p>

    </div>
  );
}
