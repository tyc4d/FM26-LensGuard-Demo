import type { DetectedRegion, RunState, SemanticRegion } from './types';

export const STAGES = ['input', 'separate', 'decide', 'result'] as const;
export type Stage = typeof STAGES[number];
export const STAGE_NAMES = ['觀察', '分辨', '判斷', '保護'] as const;
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
  const directions: Record<string, string> = { right: '右邊', left: '左邊', straight: '直走', back: '後方' };
  return directions[value.trim().toLowerCase()] ?? value;
}

export interface ComparisonOutcome { text: string; detail?: string; value: string | null; kind: 'answer' | 'call' | 'other' }
/** Describe an actual completed Guard OFF run, never an inferred attack result. */
export function presentBaseline(run: RunState | null): ComparisonOutcome {
  const unavailable: ComparisonOutcome = { text: '本次無法取得結果', value: null, kind: 'other' };
  if (!run || run.guard_enabled || run.status !== 'completed' || run.action?.validation_status === 'invalid') return unavailable;
  if (run.outcome?.status === 'blocked') return { text: '行動已停止', value: null, kind: 'other' };
  if (!['executed', 'allowed'].includes(run.outcome?.status ?? '')) return unavailable;
  if (['call_phone', 'restaurant_reservation'].includes(run.action?.tool ?? '')) {
    const number = run.action?.arguments.number?.value;
    return number ? { text: number, detail: run.outcome?.simulation_only ? '模擬撥號' : '撥號結果', value: number, kind: 'call' } : unavailable;
  }
  const value = run.final_answer?.value || run.outcome?.result;
  return value ? { text: displayValue(value), value: displayValue(value), kind: 'answer' } : unavailable;
}

export function presentProtectedOutcome(presentation: Presentation): ComparisonOutcome {
  const { result } = presentation;
  if (result.value) {
    const calling = ['正在撥號', '已核准撥號'].includes(result.heading);
    const verb = result.heading === '安全聯絡電話' ? '改撥已阻擋，保留聯絡電話'
      : result.simulation ? '模擬撥號' : '已核准撥號';
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
    destination: phone ? blocked ? '聯絡電話' : '撥號' : '回答',
  };
  const simulation = phone && run?.outcome?.simulation_only === true;
  const result = (heading: string, caption: string, note = '', confirmed = false, value?: string): Presentation =>
    ({ ...base, result: { heading, caption, note, confirmed, value, simulation } });
  if (!run || run.status === 'running') return result('等待分析', '正在分析中。');
  if (run.status === 'failed') return result('再試一次', '這次分析未能完成。', '請重新分析，這次沒有可用結果。');
  if (allowed && run.final_answer?.value) {
    const answer = run.final_answer;
    const grounded = answer.evidence_ids.some(id => pieces.some(piece => piece.id === id && piece.disposition === 'use'));
    if (answer.quoted_instruction_ids?.length) return result(displayValue(answer.value), '已依照需求引用圖片文字。',
      '僅讀取文字，未依照文字執行指令。', grounded);
    if (run.decision?.rule_id === 'USER_TASK_CITED_VALUE') return result(displayValue(answer.value), '已依據場景作答。',
      '使用所引用的資訊完成你的需求。', grounded);
    return result(displayValue(answer.value), grounded ? '正確答案已保留。' : '已取得回答。',
      grounded ? "依據場景資訊作答，已排除場景中的指令影響。" : '', grounded);
  }
  if (allowed && phone && run.action?.arguments.number?.value) {
    const number = run.action.arguments.number.value;
    // Preserve the scene's readable formatting when it is the same approved value.
    const contact = pieces.find(piece => piece.label === 'CONTACT' && piece.disposition === 'use'
      && piece.value.replace(/[ ()-]/g, '') === number.replace(/[ ()-]/g, ''))?.value ?? number;
    return result(simulation ? '正在撥號' : '已核准撥號', '已由 LensGuard 保護。',
      simulation ? '僅模擬撥號，未撥出電話。' : '此聯絡電話已通過檢查。', true, contact);
  }
  if (blocked) {
    const boundaryReasons: Record<string, string> = {
      TASK_UNAVAILABLE: '需求待確認', TASK_UNSUPPORTED: '需求待確認', TASK_INVALID: '需求待確認',
      TARGET_AMBIGUOUS: '請指定對象', TARGET_UNRESOLVED: '對象待確認', EVIDENCE_MISSING: '資訊不足',
      SELECTION_INVALID: '請重新分析', CITATION_INVALID: '引用不符', VALUE_MISMATCH: '資訊不符',
      TASK_ACTION_MISMATCH: '已停止', INSTRUCTION_SELECTED: '已停止', USER_VALUE_INVALID: '號碼待確認',
    };
    const heading = boundaryReasons[run.decision!.rule_id];
    if (heading) return result(heading, run.decision!.reason, '未執行任何行動。');
    const contacts = pieces.filter(piece => piece.label === 'CONTACT' && piece.disposition === 'use');
    if (phone && contacts.length === 1) return result('安全聯絡電話', '已阻擋改撥，保留正確聯絡電話。',
      '已停止這次撥號，未撥出電話。', true, contacts[0].value);
    return result(phone ? '已停止撥號' : '已停止', '這項行動已被阻擋。', '未執行任何行動。');
  }
  if (allowed) return result('已核准', '這項行動已通過檢查。');
  return result('尚無確認結果', '本次分析尚無可確認的保護結果。');
}
