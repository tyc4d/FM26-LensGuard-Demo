import type { DetectedRegion, RunState, SemanticRegion } from './types';

export const STAGES = ['input', 'separate', 'decide', 'result'] as const;
export type Stage = typeof STAGES[number];
export const STAGE_NAMES = ['Observe', 'Distinguish', 'Decide', 'Protect'] as const;
export function nextStage(stage: Stage): Stage { return STAGES[Math.min(3, STAGES.indexOf(stage) + 1)]; }
export function previousStage(stage: Stage): Stage { return STAGES[Math.max(0, STAGES.indexOf(stage) - 1)]; }

export interface Piece {
  id: string;
  content: string;
  value: string;
  label: 'OBSERVATION' | 'CONTACT' | 'INSTRUCTION' | 'QUOTED' | 'UNRESOLVED';
  disposition: 'use' | 'keep' | 'ignore' | 'unknown';
  bbox?: DetectedRegion['bbox'];
}
export interface Presentation {
  pieces: Piece[];
  hasSemantics: boolean;
  clean: boolean;
  destination: string;
  result: { heading: string; value?: string; caption: string; note: string; confirmed: boolean; simulation: boolean };
}

export function validBox(box: DetectedRegion['bbox'] | undefined): box is DetectedRegion['bbox'] {
  return !!box && [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x + box.width <= 1.001 && box.y + box.height <= 1.001;
}
function instructionValue(region: SemanticRegion): string {
  const behavior = region.requested_behavior;
  if (behavior && typeof behavior === 'object' && typeof behavior.value === 'string') return behavior.value;
  return region.content;
}
function displayValue(value: string): string {
  const directions: Record<string, string> = { right: 'Right', left: 'Left', straight: 'Straight ahead', back: 'Back' };
  return directions[value.trim().toLowerCase()] ?? value;
}

export interface ComparisonOutcome { text: string; detail?: string; value: string | null; kind: 'answer' | 'call' | 'other' }
/** Describe an actual completed Guard OFF run, never an inferred attack result. */
export function presentBaseline(run: RunState | null): ComparisonOutcome {
  const unavailable: ComparisonOutcome = { text: 'Result unavailable', value: null, kind: 'other' };
  if (!run || run.guard_enabled || run.status !== 'completed' || run.action?.validation_status === 'invalid') return unavailable;
  if (run.outcome?.status === 'blocked') return { text: 'Action stopped', value: null, kind: 'other' };
  if (!['executed', 'allowed'].includes(run.outcome?.status ?? '')) return unavailable;
  if (['call_phone', 'restaurant_reservation'].includes(run.action?.tool ?? '')) {
    const number = run.action?.arguments.number?.value;
    return number ? { text: number, detail: run.outcome?.simulation_only ? 'Simulated call' : 'Call result', value: number, kind: 'call' } : unavailable;
  }
  const value = run.final_answer?.value || run.outcome?.result;
  return value ? { text: displayValue(value), value: displayValue(value), kind: 'answer' } : unavailable;
}

export function presentProtectedOutcome(presentation: Presentation): ComparisonOutcome {
  const { result } = presentation;
  if (result.value) {
    const calling = ['Calling', 'Call approved'].includes(result.heading);
    const verb = result.heading === 'Safe contact number' ? 'Redirection blocked; contact retained'
      : result.simulation ? 'Simulated call' : 'Call approved';
    return { text: result.value, detail: verb, value: result.value, kind: calling ? 'call' : 'other' };
  }
  return { text: result.heading, value: result.confirmed ? result.heading : null, kind: result.confirmed ? 'answer' : 'other' };
}

/** Presentation only: classifications, selections, and outcomes come from this run.
 * Never promote camera text (or a fixture's ground truth) into an authorized action.
 */
export function presentRun(run: RunState | null): Presentation {
  const regions = run?.semantic_regions ?? [];
  const phone = ['call_phone', 'restaurant_reservation'].includes(run?.action?.tool ?? '')
    || run?.decision?.affected_argument === 'call_phone.number';
  const allowed = run?.guard_enabled === true && run.status === 'completed'
    && run.decision?.result === 'allow' && run.outcome?.status === 'allowed'
    && run.action?.validation_status !== 'invalid';
  const blocked = run?.guard_enabled === true && run.status === 'completed'
    && run.decision?.result === 'block' && run.outcome?.status === 'blocked';
  const selected = new Set(allowed ? run?.final_answer?.evidence_ids ?? [] : []);
  if (allowed) Object.values(run?.action?.arguments ?? {}).forEach(value => {
    selected.add(value.source_id);
    value.lineage.forEach(id => selected.add(id));
  });
  const pieces: Piece[] = regions.map(region => {
    const denied = region.status === 'DENY_INSTRUCTION_INFLUENCE'
      || (run?.denied_instruction_ids ?? []).includes(region.id);
    const isInstruction = ['instruction', 'instruction_derived'].includes(region.semantic_role);
    const quoted = allowed && run?.action?.use === 'INFORMATIONAL_OUTPUT'
      && run.final_answer?.quoted_instruction_ids?.includes(region.id) === true;
    const retained = ['observation', 'entity'].includes(region.semantic_role) && region.status === 'RETAIN'
      && region.authority === 'EVIDENCE' && region.grounding?.status === 'supported' && !!region.grounded_claim;
    const permittedContact = phone && (allowed || blocked) && (run?.argument_decisions ?? []).some(decision =>
      decision.source_id === region.id && decision.result === 'allow'
      && decision.affected_argument === `${run?.action?.tool}.number`
      && decision.value === region.grounded_claim?.value);
    const rejectedValue = denied ? run?.argument_decisions?.find(decision =>
      decision.source_id === region.id && decision.result === 'block')?.value : undefined;
    const detection = run?.regions.find(item => item.id === region.id);
    const semanticBox = (region as SemanticRegion & { bbox?: DetectedRegion['bbox'] }).bbox;
    const box = detection?.bbox ?? semanticBox;
    return {
      id: region.id, content: region.content,
      value: displayValue(retained ? region.grounded_claim!.value : rejectedValue ?? instructionValue(region)),
      label: quoted ? 'QUOTED' : isInstruction ? 'INSTRUCTION' : retained
        ? /phone|contact/.test(region.grounded_claim!.predicate) ? 'CONTACT' : 'OBSERVATION' : 'UNRESOLVED',
      disposition: quoted ? 'use' : denied ? 'ignore' : retained ? selected.has(region.id) || permittedContact ? 'use' : 'keep' : 'unknown',
      ...(validBox(box) ? { bbox: box } : {}),
    };
  });
  const base = {
    pieces, hasSemantics: regions.length > 0,
    clean: !!regions.length && !run?.denied_instruction_ids?.length && pieces.every(piece => ['use', 'keep'].includes(piece.disposition)),
    destination: phone ? blocked ? 'Contact number' : 'Call' : 'Answer',
  };
  const simulation = phone && run?.outcome?.simulation_only === true;
  const result = (heading: string, caption: string, note = '', confirmed = false, value?: string): Presentation =>
    ({ ...base, result: { heading, caption, note, confirmed, value, simulation } });
  if (!run || run.status === 'running') return result('Awaiting analysis', 'Analysis in progress.');
  if (run.status === 'failed') return result('Try again', 'This analysis did not finish.', 'Run the analysis again. No result is available for this attempt.');
  if (!run.action && !run.decision && run.components?.policy === 'not_required' && run.final_answer?.text) {
    return result('Information uncertain', run.final_answer.text, 'Provide a clearer image or add detail to your question.');
  }
  if (allowed && run.final_answer?.value) {
    const answer = run.final_answer;
    const grounded = answer.evidence_ids.some(id => pieces.some(piece => piece.id === id && piece.disposition === 'use'));
    if (answer.quoted_instruction_ids?.length) return result(displayValue(answer.value), 'Image text quoted as requested.',
      'The text was read without executing its instructions.', grounded);
    if (run.decision?.rule_id === 'USER_TASK_CITED_VALUE') return result(displayValue(answer.value), 'Answered using scene evidence.',
      'Your request was answered using the cited information.', grounded);
    return result(displayValue(answer.value), grounded ? 'The correct answer was retained.' : 'Answer received.',
      grounded ? "Answered using scene information, excluding the influence of embedded instructions." : '', grounded);
  }
  if (allowed && phone && run.action?.arguments.number?.value) {
    const number = run.action.arguments.number.value;
    // Preserve the scene's readable formatting when it is the same approved value.
    const contact = pieces.find(piece => piece.label === 'CONTACT' && piece.disposition === 'use'
      && piece.value.replace(/[ ()-]/g, '') === number.replace(/[ ()-]/g, ''))?.value ?? number;
    return result(simulation ? 'Calling' : 'Call approved', 'Protected by LensGuard.',
      simulation ? 'Simulated call only. No call was placed.' : 'This contact number passed the checks.', true, contact);
  }
  if (blocked) {
    const boundaryReasons: Record<string, string> = {
      TASK_UNAVAILABLE: 'Clarify your request', TASK_UNSUPPORTED: 'Clarify your request', TASK_INVALID: 'Clarify your request',
      TARGET_AMBIGUOUS: 'Specify a target', TARGET_UNRESOLVED: 'Target unresolved', EVIDENCE_MISSING: 'Insufficient information',
      SELECTION_INVALID: 'Run analysis again', CITATION_INVALID: 'Citation mismatch', VALUE_MISMATCH: 'Information mismatch',
      TASK_ACTION_MISMATCH: 'Stopped', INSTRUCTION_SELECTED: 'Stopped', USER_VALUE_INVALID: 'Verify the number',
    };
    const heading = boundaryReasons[run.decision!.rule_id];
    if (heading) return result(heading, run.decision!.reason, 'No action was taken.');
    const contacts = pieces.filter(piece => piece.label === 'CONTACT' && piece.disposition === 'use');
    if (phone && contacts.length === 1) return result('Safe contact number', 'Redirection blocked. The correct contact number was retained.',
      'The call was stopped. No call was placed.', true, contacts[0].value);
    return result(phone ? 'Call stopped' : 'Stopped', 'This action was blocked.', 'No action was taken.');
  }
  if (allowed) return result('Approved', 'This action passed the checks.');
  return result('No confirmed result', 'No protection result can be confirmed for this analysis.');
}
