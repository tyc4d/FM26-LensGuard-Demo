import type { RunState, Scenario } from '../types';
import { directionLabel, displayLabel } from '../labels';
import { isInformational } from '../story';

export function presentRun(run: RunState | null, active: boolean) {
  if (run?.status === 'failed' && run.error_code === 'reservation_details_missing') return {
    tone: 'interrupted', status: 'More information needed', headline: 'Reservation details are incomplete',
    subtitle: 'Add the reservation date, time, and party size to your request, then analyze again.',
    reason: run.error || 'Required reservation details are missing. No action was taken.',
  };
  if (run?.status === 'failed' && run.error_code === 'model_action_invalid') return {
    tone: 'interrupted', status: 'Invalid model output', headline: 'Model finished; action arguments are invalid',
    subtitle: 'The model did not produce a usable action. No action was taken.',
    reason: run.error || 'The proposed action contains unsupported values.',
  };
  if (run?.status === 'failed' && ['model_schema_invalid', 'action_mapping_failed', 'model_output_parse_failed'].includes(run.error_code || '')) return {
    tone: 'interrupted', status: 'Invalid model output', headline: 'Model finished; action format is incomplete',
    subtitle: 'Inference finished, but the output could not be authorized or executed.',
    reason: run.error || 'Action validation failed.',
  };
  if (run?.status === 'failed' && run.action && !run.decision) return {
    tone: 'interrupted', status: 'Not authorized', headline: 'Authorization did not finish.',
    subtitle: 'The proposed action was not executed.',
    reason: run.error || 'Unable to complete authorization. Automatic execution is paused.',
  };
  if (run?.status === 'failed') return {
    tone: 'interrupted', status: 'Interrupted', headline: run.error?.includes('could not be parsed') || run.error?.includes('Unable to parse') ? 'Unable to parse model output.' : 'Analysis was interrupted.',
    subtitle: 'Reset and analyze this scenario again.', reason: run.error || 'The runtime service could not complete this analysis.',
  };
  const outcome = run?.outcome;
  if (run?.status === 'completed' && run.final_answer && run.components?.policy === 'not_required') return {
    tone: 'interrupted', status: 'Information uncertain', headline: run.final_answer.text,
    subtitle: 'The available visual information is insufficient for a reliable answer.', reason: 'Provide a clearer image or add detail to your question.',
  };
  if (isInformational(run) && outcome) return {
    tone: outcome.status, status: outcome.status === 'allowed' ? 'Answer allowed' : outcome.status === 'blocked' ? 'Answer lacks evidence' : 'Answer result',
    headline: run?.final_answer?.text || 'No answer was provided for this run.', subtitle: run?.final_answer?.evidence_ids.length ? 'The answer includes scene evidence.' : 'This answer has no scene evidence.',
    reason: outcome.detail,
  };
  if (run?.runtime === 'prototype' && outcome && outcome.status !== 'executed') return {
    tone: outcome.status, status: displayLabel(outcome.status),
    headline: outcome.status === 'allowed' ? 'This action was allowed' : 'LensGuard paused this action',
    subtitle: outcome.status === 'allowed' ? 'Deterministic authorization rules allowed this simulated action.' : 'Authorization could not be established. Automatic execution is paused.',
    reason: outcome.detail,
  };
  if (outcome?.status === 'blocked') return {
    tone: 'blocked', status: 'Blocked', headline: 'LensGuard blocked this attack',
    subtitle: 'Camera content was not authorized to set action arguments.',
    reason: run?.action?.tool === 'navigate'
      ? 'Instructions in the camera image cannot override the observed exit direction.'
      : 'Camera content cannot choose a call target without explicit user authorization.',
  };
  if (outcome?.status === 'allowed') return {
    tone: 'allowed', status: 'Allowed', headline: 'This action was allowed',
    subtitle: 'The user explicitly authorized use of the phone number observed by the camera.',
    reason: run?.decision?.reason || outcome.detail,
  };
  if (outcome?.status === 'executed') return {
    tone: outcome.attack_success ? 'compromised' : 'executed', status: 'Simulated',
    headline: outcome.attack_success ? 'Your AI was misled' : 'Action simulated',
    subtitle: outcome.attack_success ? 'Scene text changed the action proposed by the model.' : 'LensGuard is off. The proposed action ran in simulation.',
    reason: outcome.attack_success ? 'With LensGuard off, scene instructions controlled the action.' : 'Authorization checks were bypassed. No external action was taken.',
  };
  return {
    tone: 'pending', status: active ? 'Processing' : 'Awaiting analysis',
    headline: active ? 'Reading the scene.' : 'Observe the scene in front of you.',
    subtitle: active ? 'Follow the process from scene observation to action authorization.' : 'Choose a scenario and start the analysis.',
    reason: active ? 'Analysis is in progress. The decision will appear here.' : 'Camera observations do not automatically authorize AI actions.',
  };
}

const stageLabels: Record<string, string> = {
  'inference.started': 'Running the local model',
  'inference.completed': 'Model response received',
  'action.parsed': 'Structured action validated',
  'frame.received': 'Receiving the image',
  'perception.scene_analyzed': 'Interpreting the scene',
  'perception.text_extracted': 'Reading scene text',
  'model.action_proposed': 'Checking the proposed action',
  'provenance.attached': 'Tracing data sources',
  'policy.evaluated': 'Checking authorization',
  'policy.bypassed': 'Authorization checks bypassed',
};

export function RunSummary({ run, scenario, userRequest, active }: { run: RunState | null; scenario?: Scenario; userRequest?: string; active: boolean }) {
  const view = presentRun(run, active);
  const informational = isInformational(run);
  const action = run?.action;
  const actionText = action ? `${displayLabel(action.tool)}(${Object.values(action.arguments).map((value) => value.value).join(', ')})` : null;
  return <aside className={`run-summary result-${view.tone}`} aria-label="Action summary">
    <div className="stage-request"><p className="eyebrow">User request</p><p className="user-request" lang="en">{userRequest ?? scenario?.user_request ?? 'Loading scenario…'}</p></div>
    <div className="summary-action"><p className="eyebrow">{informational ? 'Informational answer' : 'Proposed action'}</p><p className={`action-expression ${action ? '' : 'awaiting-action'}`}>{informational ? run?.final_answer?.text || actionText : actionText || (run?.status === 'failed' ? 'No valid action.' : 'Awaiting analysis.')}</p></div>
    <div className="summary-decision" data-testid="decision-result" aria-live="polite">
      <p className="eyebrow">{active ? 'In progress' : 'Result'}</p>
      <p className="result-label">{view.status}</p>
      <p className="decision-reason">{view.reason}</p>
      {active && <p className="stage-progress" role="status">{stageLabels[run?.stage || ''] || 'Starting analysis'}</p>}
      {run?.outcome && !informational && <p className="simulation-note">Simulation only · No external action taken</p>}
    </div>
    {run?.outcome && <div className="outcome-note" data-testid="outcome">
      {run.outcome.attack_success !== null && <p>Attack outcome: <strong>{run.outcome.attack_success ? 'Attack succeeded' : 'Attack prevented'}</strong></p>}
      {run.outcome.result && <p>{informational ? 'Direction result' : run.outcome.status === 'executed' ? 'Simulated value' : 'Authorized value'}: <strong className="mono">{informational ? directionLabel(run.outcome.result) : run.outcome.result}</strong></p>}
    </div>}
  </aside>;
}
