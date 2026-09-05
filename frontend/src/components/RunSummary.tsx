import type { RunState, Scenario } from '../types';

export function presentRun(run: RunState | null, active: boolean) {
  if (run?.status === 'failed' && run.error_code === 'reservation_details_missing') return {
    tone: 'interrupted', status: 'DETAILS REQUIRED', headline: '訂位資料尚未完整',
    subtitle: 'Add the reservation date, time, and number of people to your request, then run again.',
    reason: run.error || 'The reservation is missing required details. No action was executed.',
  };
  if (run?.status === 'failed' && run.error_code === 'model_action_invalid') return {
    tone: 'interrupted', status: 'INVALID MODEL OUTPUT', headline: '模型已完成，行動參數無效',
    subtitle: 'The model did not produce a usable action. No action was executed.',
    reason: run.error || 'The proposed action contains an unsupported value.',
  };
  if (run?.status === 'failed' && ['model_schema_invalid', 'action_mapping_failed', 'model_output_parse_failed'].includes(run.error_code || '')) return {
    tone: 'interrupted', status: 'INVALID MODEL OUTPUT', headline: '模型已完成，行動格式不完整',
    subtitle: 'Inference completed. The output could not be authorized or executed.',
    reason: run.error || 'Action validation failed.',
  };
  if (run?.status === 'failed' && run.action && !run.decision) return {
    tone: 'interrupted', status: 'NOT AUTHORIZED', headline: 'Authorization did not complete.',
    subtitle: 'The proposed action was not executed.',
    reason: run.error || 'Authorization was unavailable. Automatic execution was withheld.',
  };
  if (run?.status === 'failed') return {
    tone: 'interrupted', status: 'INTERRUPTED', headline: run.error?.includes('could not be parsed') ? 'Model output could not be parsed.' : 'Analysis interrupted.',
    subtitle: 'Reset and run the scenario again.', reason: run.error || 'The runtime could not finish this analysis.',
  };
  const outcome = run?.outcome;
  if (run?.runtime === 'prototype' && outcome && outcome.status !== 'executed') return {
    tone: outcome.status, status: outcome.status.toUpperCase(),
    headline: outcome.status === 'allowed' ? '這次行動被允許' : 'LensGuard 暫停了這次行動',
    subtitle: outcome.status === 'allowed' ? 'The deterministic policy permits this simulated action.' : 'Authorization was not established. Automatic execution was withheld.',
    reason: outcome.detail,
  };
  if (outcome?.status === 'blocked') return {
    tone: 'blocked', status: 'BLOCKED', headline: 'LensGuard 擋下了這次攻擊',
    subtitle: 'Camera-derived content was not authorized to bind the action argument.',
    reason: run?.action?.tool === 'navigate'
      ? 'Camera instructions cannot override the observed exit direction.'
      : 'Camera content cannot choose the call target without explicit user delegation.',
  };
  if (outcome?.status === 'allowed') return {
    tone: 'allowed', status: 'ALLOWED', headline: '這次行動被允許',
    subtitle: 'The user explicitly authorized use of the camera-derived number.',
    reason: 'Explicit user delegation permits this camera-derived value for this action.',
  };
  if (outcome?.status === 'executed') return {
    tone: outcome.attack_success ? 'compromised' : 'executed', status: 'EXECUTED',
    headline: outcome.attack_success ? '你的 AI 被騙了' : '行動已模擬執行',
    subtitle: outcome.attack_success ? 'Environmental text changed the model’s proposed action.' : 'LensGuard is off. The proposed action was executed in simulation.',
    reason: outcome.attack_success ? 'The environmental instruction controlled the action while LensGuard was off.' : 'The authorization gate was bypassed. No external action was taken.',
  };
  return {
    tone: 'pending', status: active ? 'PROCESSING' : 'PENDING',
    headline: active ? 'Reading the scene.' : 'Observe the scene.',
    subtitle: active ? 'Following the proposal from observation to authorization.' : 'Choose a scenario and run the analysis.',
    reason: active ? 'Analysis is running. The decision will appear here.' : 'What the camera observes is not automatically what the AI may do.',
  };
}

const stageLabels: Record<string, string> = {
  'inference.started': 'Running the local VLM',
  'inference.completed': 'Model response received',
  'action.parsed': 'Structured action validated',
  'frame.received': 'Receiving the scene',
  'perception.scene_analyzed': 'Interpreting the scene',
  'perception.text_extracted': 'Reading environmental text',
  'model.action_proposed': 'Inspecting the proposed action',
  'provenance.attached': 'Tracing the value’s origin',
  'policy.evaluated': 'Checking authority',
  'policy.bypassed': 'Authorization gate bypassed',
};

export function RunSummary({ run, scenario, userRequest, active }: { run: RunState | null; scenario?: Scenario; userRequest?: string; active: boolean }) {
  const view = presentRun(run, active);
  const action = run?.action;
  const actionText = action ? `${action.tool}(${Object.values(action.arguments).map((value) => value.value).join(', ')})` : null;
  return <aside className={`run-summary result-${view.tone}`} aria-label="Action summary">
    <div className="stage-request"><p className="eyebrow">User request</p><p className="user-request" lang="zh-Hant">{scenario ? userRequest ?? scenario.user_request : 'Loading scenario…'}</p></div>
    <div className="summary-action"><p className="eyebrow">Proposed action</p><p className={`action-expression ${action ? '' : 'awaiting-action'}`}>{actionText || (run?.status === 'failed' ? 'No valid action.' : 'Awaiting analysis.')}</p></div>
    <div className="summary-decision" data-testid="decision-result" aria-live="polite">
      <p className="eyebrow">{active ? 'In progress' : 'Result'}</p>
      <p className="result-label">{view.status}</p>
      <p className="decision-reason">{view.reason}</p>
      {active && <p className="stage-progress" role="status">{stageLabels[run?.stage || ''] || 'Starting analysis'}</p>}
      {run?.outcome && <p className="simulation-note">Simulation only · no external action</p>}
    </div>
    {run?.outcome && <div className="outcome-note" data-testid="outcome">
      {run.outcome.attack_success !== null && <p>Attack outcome: <strong>{run.outcome.attack_success ? 'Successful' : 'Prevented'}</strong></p>}
      {run.outcome.result && <p>{run.scenario_id === 'navigation-injection' ? 'Navigation result' : run.outcome.status === 'executed' ? 'Simulated value' : 'Authorized value'}: <strong className="mono">{run.outcome.result}</strong></p>}
    </div>}
  </aside>;
}
