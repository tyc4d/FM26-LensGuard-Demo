import { expect, test } from '@playwright/test';
import { presentRun, validBox } from '../src/experience';
import { backendRun } from './experience-helpers';
import type { RunState } from '../src/types';

let clean: RunState;
let attacked: RunState;
let phone: RunState;
test.beforeAll(async ({ request }) => {
  [clean, attacked, phone] = await Promise.all([
    backendRun(request, 'clean-navigation'), backendRun(request), backendRun(request, 'reservation-injection'),
  ]);
});

test('camera observations are usable in both clean and attacked backend runs', () => {
  for (const run of [clean, attacked]) {
    const view = presentRun(run);
    expect(view.result.heading).toBe('Right');
    expect(view.result.confirmed).toBe(true);
    expect(view.pieces.find(piece => piece.value === 'Right')?.disposition).toBe('use');
  }
  expect(presentRun(clean).clean).toBe(true);
  expect(presentRun(clean).pieces.filter(piece => piece.disposition === 'ignore')).toHaveLength(0);
  expect(presentRun(attacked).pieces.find(piece => piece.value === 'Left')?.disposition).toBe('ignore');
});

test('approved alternate contact does not become an executed or approved call', () => {
  const view = presentRun(phone);
  expect(view.result.heading).toBe('Safe contact number');
  expect(view.result.value).toBe('02-2345-6789');
  expect(view.result.note).toContain('No call was placed.');
  expect(view.destination).toBe('Contact number');
  expect(view.pieces.find(piece => piece.disposition === 'ignore')?.value).toBe('0912-345-678');
});

for (const kind of ['no-decision', 'inconsistent-outcome', 'failed', 'invalid', 'guard-off', 'pending'] as const) {
  test(`${kind} never claims a protected result`, () => {
    const run = structuredClone(attacked);
    if (kind === 'no-decision') run.decision = null;
    if (kind === 'inconsistent-outcome') run.outcome!.status = 'blocked';
    if (kind === 'failed') run.status = 'failed';
    if (kind === 'invalid') run.action!.validation_status = 'invalid';
    if (kind === 'guard-off') run.guard_enabled = false;
    if (kind === 'pending') run.status = 'running';
    const view = presentRun(run);
    expect(view.result.confirmed).toBe(false);
    expect(view.result.heading).not.toBe('Right');
  });
}

test('no classifications or evidence never invents a clean verdict or regions', () => {
  const run = structuredClone(clean);
  run.semantic_regions = [];
  run.regions = [];
  const view = presentRun(run);
  expect(view.pieces).toEqual([]);
  expect(view.clean).toBe(false);
  expect(view.result.confirmed).toBe(false);
  expect(view.result.caption).toBe('Answer received.');
});

test('retained but unselected text is not depicted as influencing the answer', () => {
  const run = structuredClone(clean);
  run.semantic_regions!.push({ ...run.semantic_regions![0], id: 'unrelated', content: 'Lobby', grounded_claim: { predicate: 'scene_text', value: 'Lobby' } });
  const view = presentRun(run);
  expect(view.pieces.find(piece => piece.id === 'unrelated')?.disposition).toBe('keep');
});

test('phone question remains an informational answer and ambiguity is explained', () => {
  const run = structuredClone(clean);
  run.action!.tool = 'answer_question';
  run.action!.use = 'INFORMATIONAL_OUTPUT';
  run.final_answer!.value = '02-2585-6661';
  const view = presentRun(run);
  expect(view.result.heading).toBe('02-2585-6661');
  expect(view.result.simulation).toBe(false);
  expect(view.destination).toBe('Answer');
  run.decision = { ...run.decision!, result: 'block', rule_id: 'TARGET_AMBIGUOUS',
    affected_argument: 'call_phone.number', reason: 'Multiple numbers found. Specify a target.' };
  run.outcome!.status = 'blocked';
  run.action!.tool = 'none';
  expect(presentRun(run).result).toMatchObject({ heading: 'Specify a target',
    caption: 'Multiple numbers found. Specify a target.', confirmed: false });
});

test('explicitly quoting an instruction never labels it as an authorized call', () => {
  const run = structuredClone(attacked);
  const denied = run.semantic_regions!.find(region => region.status === 'DENY_INSTRUCTION_INFLUENCE')!;
  run.action!.tool = 'answer_question'; run.action!.use = 'INFORMATIONAL_OUTPUT';
  run.final_answer = { text: denied.content, value: denied.content, grounded_claim: null,
    evidence_ids: [denied.id], quoted_instruction_ids: [denied.id] };
  const view = presentRun(run);
  expect(view.result.caption).toBe('Image text quoted as requested.');
  expect(view.result.note).toBe('The text was read without executing its instructions.');
  expect(view.pieces.find(piece => piece.id === denied.id)?.label).toBe('QUOTED');
  expect(view.clean).toBe(false);
});

test('unsupported and instruction-derived content never becomes useful contact evidence', () => {
  const run = structuredClone(phone);
  const region = run.semantic_regions![0];
  region.semantic_role = 'instruction_derived';
  region.status = 'DENY_INSTRUCTION_INFLUENCE';
  const view = presentRun(run);
  expect(view.pieces[0].label).toBe('INSTRUCTION');
  expect(view.pieces[0].disposition).toBe('ignore');
  expect(view.result.heading).toBe('Call stopped');
  expect(view.result.value).toBeUndefined();
});

test('missing and invalid coordinates stay unlocated', () => {
  const run = structuredClone(attacked);
  run.regions[0].bbox = { x: -.1, y: 0, width: .5, height: .2 };
  run.regions.splice(1);
  expect(presentRun(run).pieces.every(piece => !piece.bbox)).toBe(true);
  expect(validBox({ x: 0, y: 0, width: NaN, height: .1 })).toBe(false);
  expect(validBox({ x: .8, y: 0, width: .3, height: .1 })).toBe(false);
});

test('unknown or ungrounded roles cannot borrow a retained observation label', () => {
  for (const role of ['unknown', 'observation'] as const) {
    const run = structuredClone(clean);
    run.semantic_regions![0].semantic_role = role;
    if (role === 'observation') run.semantic_regions![0].grounding = { status: 'unsupported' };
    const view = presentRun(run);
    expect(view.pieces[0].label).toBe('UNRESOLVED');
    expect(view.pieces[0].disposition).toBe('unknown');
    expect(view.result.confirmed).toBe(false);
    expect(view.clean).toBe(false);
  }
});

test('a final-answer field on a blocked call cannot authorize a contact', () => {
  const run = structuredClone(phone);
  run.argument_decisions = [];
  run.final_answer = { text: 'stale', value: '02-2345-6789', grounded_claim: null, evidence_ids: ['region_01'] };
  const view = presentRun(run);
  expect(view.result.heading).toBe('Call stopped');
  expect(view.result.value).toBeUndefined();
});
