import { expect, test } from '@playwright/test';
import {
  INITIAL_STORY_STATE, availableStoryPhases, normalizeRun, storyReducer,
} from '../src/story';
import type { StoryState } from '../src/story';
import type { ProvenanceValue, RunState } from '../src/types';

function value(text = '向右'): ProvenanceValue {
  return {
    id: 'model-value', value: text, source_type: 'model', source_id: 'inference-1',
    trust: 'untrusted', authority: ['none'], lineage: ['image_upload', 'inference-1'],
  };
}

function run(overrides: Partial<RunState> = {}): RunState {
  return {
    id: 'run-1', scenario_id: 'navigation-injection', runtime: 'prototype',
    guard_enabled: true, status: 'running', stage: 'queued', frame_id: null,
    regions: [], interpretation: [], action: null, decision: null,
    trace_nodes: [], trace_edges: [], outcome: null, events: [], error: null,
    ...overrides,
  };
}

function complete(overrides: Partial<RunState> = {}): RunState {
  return run({
    status: 'completed', stage: 'action.blocked', frame_id: 'frame-1',
    action: {
      id: 'action-1', tool: 'navigate', validation_status: 'valid', status: 'blocked',
      arguments: { destination: value('出口'), direction: value() },
    },
    decision: {
      result: 'block', rule_id: 'real-rule', affected_argument: 'navigate.direction',
      reason: '需要授權', source_authority: 'OBSERVATION_ONLY', required_authority: 'NAVIGATION_DIRECTION',
    },
    outcome: { status: 'blocked', simulation_only: true, attack_success: null, result: null, detail: '已阻擋' },
    trace_nodes: [{ id: 'model', label: '本機模型', type: '推論', source: 'model' }],
    trace_edges: [], raw_model_text: '{"direction":"向右"}',
    runtime_metadata: { provenance: { kind: 'transport_only', semantic_grounding: 'unavailable' } },
    ...overrides,
  });
}

function advanceAutomatically(state: StoryState): StoryState {
  return storyReducer(state, { type: 'NEXT', automatic: true, revision: state.revision });
}

test('empty adapter retains only the supplied query and frame', () => {
  const normalized = normalizeRun(null, { query: '出口在哪裡？', frameUrl: 'blob:preview' });
  expect(normalized.raw).toBeNull();
  expect(normalized.query).toBe('出口在哪裡？');
  expect(normalized.frameUrl).toBe('blob:preview');
  expect(normalized.detections).toEqual([]);
  expect(normalized.criticalValue).toBeNull();
  expect(normalized.policy).toBeNull();
  expect(normalized.outcome).toBeNull();
  expect(normalized.semanticGrounding).toBe(false);
});

test('adapter preserves model source, actual references, and no fabricated detections', () => {
  const actual = complete();
  const before = JSON.stringify(actual);
  const normalized = normalizeRun(actual, { query: '我的原始需求', frameUrl: null });
  expect(normalized.raw).toBe(actual);
  expect(normalized.action).toBe(actual.action);
  expect(normalized.policy).toBe(actual.decision);
  expect(normalized.outcome).toBe(actual.outcome);
  expect(normalized.traceNodes).toBe(actual.trace_nodes);
  expect(normalized.detections).toBe(actual.regions);
  expect(normalized.detections).toEqual([]);
  expect(normalized.argumentName).toBe('direction');
  expect(normalized.criticalArgument).toBe('navigate.direction');
  expect(normalized.criticalValue).toBe(actual.action!.arguments.direction);
  expect(normalized.criticalValue!.source_type).toBe('model');
  expect(normalized.criticalValue!.trust).toBe('untrusted');
  expect(normalized.semanticGrounding).toBe(false);
  expect(JSON.stringify(actual)).toBe(before);
});

test('primary argument is independent of object order and never creates a missing value', () => {
  const actual = complete({ decision: null });
  expect(normalizeRun(actual, { query: '', frameUrl: null }).argumentName).toBe('direction');
  actual.action!.arguments = {};
  const empty = normalizeRun(actual, { query: '', frameUrl: null });
  expect(empty.argumentName).toBeNull();
  expect(empty.criticalArgument).toBeNull();
  expect(empty.criticalValue).toBeNull();
});

test('an actual invalid field is selected when no policy identifies a critical argument', () => {
  const actual = run({
    action: { id: 'reservation', tool: 'restaurant_reservation', status: 'proposed',
      validation_status: 'invalid', arguments: { number: value('02-2345-6789'), party_size: value('N/A') } },
    validation_issues: [{ argument: 'restaurant_reservation.party_size', kind: 'missing', message: '缺少用餐人數' }],
  });
  const normalized = normalizeRun(actual, { query: '', frameUrl: null });
  expect(normalized.argumentName).toBe('party_size');
  expect(normalized.criticalValue).toBe(actual.action!.arguments.party_size);
  expect(normalized.policy).toBeNull();
  actual.validation_issues![0].argument = 'restaurant_reservation.time';
  expect(normalizeRun(actual, { query: '', frameUrl: null }).argumentName).toBe('number');
});

test('semantic grounding requires an explicit verified report, not delegation or lineage', () => {
  const actual = complete({ runtime_metadata: { provenance: { delegated: true, kind: 'transport_only' } } });
  expect(normalizeRun(actual, { query: '', frameUrl: null }).semanticGrounding).toBe(false);
  actual.runtime_metadata = { provenance: { semantic_grounding: 'verified' } };
  expect(normalizeRun(actual, { query: '', frameUrl: null }).semanticGrounding).toBe(true);
});

test('perception can show real processing without pretending OCR or semantics exist', () => {
  const actual = run({ events: [{ id: '1', timestamp: '', type: 'inference.started', detail: '開始推論' }] });
  expect(availableStoryPhases(actual)).toEqual(['idle', 'capture', 'perception']);
  expect(normalizeRun(actual, { query: '', frameUrl: null }).detections).toEqual([]);
});

test('a malformed response reaches failure without fabricated semantic or authorization stages', () => {
  const actual = run({ status: 'failed', raw_model_text: 'unparsed model output', error: '無法解析' });
  expect(availableStoryPhases(actual)).toEqual(['idle', 'capture', 'perception', 'failed']);
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'UPDATE', run: actual });
  state = advanceAutomatically(advanceAutomatically(state));
  expect(state.phase).toBe('failed');
  expect(state.playing).toBe(false);
});

test('an invalid candidate retains real explanatory phases but no fake policy', () => {
  const actual = complete({ status: 'failed', decision: null, outcome: null, error: '方向無效' });
  actual.action!.validation_status = 'invalid';
  expect(availableStoryPhases(actual)).toEqual([
    'idle', 'capture', 'perception', 'semantic', 'provenance', 'proposal', 'failed',
  ]);
});

test('completed outcome is unavailable without an action and matching actual authorization', () => {
  expect(availableStoryPhases(complete({ decision: null }))).not.toContain('blocked');
  expect(availableStoryPhases(complete({ action: null }))).not.toContain('blocked');
  const inconsistent = complete();
  inconsistent.decision!.result = 'allow';
  expect(availableStoryPhases(inconsistent)).not.toContain('blocked');
  const invalid = complete();
  invalid.action!.validation_status = 'invalid';
  expect(availableStoryPhases(invalid)).not.toContain('blocked');
  expect(availableStoryPhases(complete({ status: 'running' }))).not.toContain('blocked');
});

test('guard-off execution has an actual bypass stage and no invented policy decision', () => {
  const actual = complete({ guard_enabled: false, decision: null,
    outcome: { status: 'executed', simulation_only: true, attack_success: null, result: null, detail: '模擬執行' } });
  expect(availableStoryPhases(actual).slice(-2)).toEqual(['authorization', 'executed']);
  expect(normalizeRun(actual, { query: '', frameUrl: null }).policy).toBeNull();
});

test('full cached data advances through six transitions and stops at its actual result', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'UPDATE', run: complete() });
  const phases = [state.phase];
  for (let index = 0; index < 6; index += 1) {
    state = advanceAutomatically(state);
    phases.push(state.phase);
  }
  expect(phases).toEqual(['capture', 'perception', 'semantic', 'provenance', 'proposal', 'authorization', 'blocked']);
  expect(state.playing).toBe(false);
  expect(advanceAutomatically(state)).toBe(state);
});

test('manual next pauses; late data cannot jump the selected phase or restart playback', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'UPDATE', run: run({ frame_id: 'frame-1' }) });
  state = storyReducer(state, { type: 'NEXT' });
  expect(state.phase).toBe('perception');
  expect(state.playing).toBe(false);
  const revision = state.revision;
  state = storyReducer(state, { type: 'UPDATE', run: complete() });
  expect(state.phase).toBe('perception');
  expect(state.playing).toBe(false);
  expect(state.revision).toBe(revision);
  expect(state.maxAvailable).toBe('blocked');
});

test('playback waits for data rather than advancing into unavailable stages', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'START' });
  state = advanceAutomatically(state);
  expect(state.phase).toBe('capture');
  expect(state.playing).toBe(true);
  state = storyReducer(state, { type: 'UPDATE', run: complete() });
  expect(state.phase).toBe('capture');
  expect(advanceAutomatically(state).phase).toBe('perception');
});

test('previous pauses and a cancelled timer revision cannot move the manual phase', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'UPDATE', run: complete() });
  state = advanceAutomatically(state);
  const timerRevision = state.revision;
  state = storyReducer(state, { type: 'PREVIOUS' });
  state = storyReducer(state, { type: 'TOGGLE_PLAY' });
  expect(storyReducer(state, { type: 'NEXT', automatic: true, revision: timerRevision })).toBe(state);
  expect(state.phase).toBe('capture');
});

test('a new run resets the presentation instead of mixing prior result stages', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'UPDATE', run: complete() });
  for (let index = 0; index < 6; index += 1) state = advanceAutomatically(state);
  state = storyReducer(state, { type: 'UPDATE', run: run({ id: 'run-2' }) });
  expect(state.runId).toBe('run-2');
  expect(state.phase).toBe('capture');
  expect(state.playing).toBe(true);
  expect(state.available).toEqual(['idle', 'capture']);
});

test('manual playback preference survives the first response and replay', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'START', autoplay: false });
  state = storyReducer(state, { type: 'UPDATE', run: complete() });
  expect(state.playing).toBe(false);
  state = storyReducer(state, { type: 'REPLAY', autoplay: false });
  expect(state.phase).toBe('capture');
  expect(state.playing).toBe(false);
  expect(state.replay).toBe(true);
});

test('manual controls during capture are preserved when the first server response arrives', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'START' });
  state = storyReducer(state, { type: 'PREVIOUS' });
  expect(state.phase).toBe('idle');
  state = storyReducer(state, { type: 'UPDATE', run: complete(), autoplay: true });
  expect(state.phase).toBe('idle');
  expect(state.playing).toBe(false);
});

test('replay retains the cached run and late snapshots preserve replay/manual state', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'UPDATE', run: complete() });
  const available = state.available;
  state = storyReducer(state, { type: 'REPLAY' });
  expect(state.runId).toBe('run-1');
  expect(state.replay).toBe(true);
  expect(state.available).toBe(available);
  state = storyReducer(state, { type: 'NEXT' });
  state = storyReducer(state, { type: 'UPDATE', run: complete() });
  expect(state.replay).toBe(true);
  expect(state.playing).toBe(false);
  expect(state.phase).toBe('perception');
});

test('replay cannot autoplay past a settled record that has no result data', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'UPDATE', run: run({ status: 'completed' }) });
  state = storyReducer(state, { type: 'REPLAY' });
  expect(state.phase).toBe('capture');
  expect(state.playing).toBe(false);
  expect(state.available).toEqual(['idle', 'capture']);
});

test('reset removes cached availability and ignores an old playback timer', () => {
  let state = storyReducer(INITIAL_STORY_STATE, { type: 'UPDATE', run: complete() });
  const revision = state.revision;
  state = storyReducer(state, { type: 'RESET' });
  expect(state.phase).toBe('idle');
  expect(state.runId).toBeNull();
  expect(state.available).toEqual(['idle']);
  expect(storyReducer(state, { type: 'NEXT', automatic: true, revision })).toBe(state);
});
