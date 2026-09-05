import { expect, test } from '@playwright/test';
import { INITIAL_COMPARISON_STATE, comparisonReducer, comparisonRunOptions } from '../src/useComparison';
import type { ComparisonInput } from '../src/useComparison';
import type { RunState } from '../src/types';

function result(id: string, guard: boolean, overrides: Partial<RunState> = {}): RunState {
  return {
    id, scenario_id: 'navigation-injection', runtime: 'prototype', guard_enabled: guard,
    status: 'completed', stage: guard ? 'action.blocked' : 'action.executed', frame_id: 'frame-1',
    regions: [], interpretation: [], action: null, decision: null,
    trace_nodes: [], trace_edges: [], events: [], error: null,
    outcome: { status: guard ? 'blocked' : 'executed', simulation_only: true,
      attack_success: null, result: null, detail: '實際回應' },
    ...overrides,
  };
}

function input(): ComparisonInput {
  return { scenarioId: 'navigation-injection', query: '出口在哪裡？',
    frame: { blob: new Blob(['same captured pixels'], { type: 'image/png' }), source: 'camera', captureMs: 12 } };
}

function begin() {
  return comparisonReducer(INITIAL_COMPARISON_STATE, { type: 'begin', input: input(), ignoreId: 'previous-run' });
}

test('begin snapshots query and frame metadata so later caller edits cannot change either request', () => {
  const original = input();
  const capturedBlob = original.frame!.blob;
  const state = comparisonReducer(INITIAL_COMPARISON_STATE, { type: 'begin', input: original, ignoreId: null });
  original.query = '後來修改的需求';
  original.scenarioId = 'explicit-delegation';
  original.frame!.blob = new Blob(['different pixels']);
  original.frame!.source = 'uploaded_image';
  expect(state.input!.query).toBe('出口在哪裡？');
  expect(state.input!.scenarioId).toBe('navigation-injection');
  expect(state.input!.frame!.blob).toBe(capturedBlob);
  expect(state.input!.frame!.source).toBe('camera');
});

test('both API commands reuse identical captured bytes, query, scenario and capture metadata', async () => {
  let state = begin();
  const first = comparisonRunOptions(state.input!, false);
  state = comparisonReducer(state, { type: 'without', run: result('without-1', false) });
  const second = comparisonRunOptions(state.input!, true);
  expect(first.frame).toBe(second.frame);
  expect(first.frame!.blob).toBe(second.frame!.blob);
  expect(await first.frame!.blob.text()).toBe('same captured pixels');
  expect(first.userRequest).toBe(second.userRequest);
  expect(first.scenarioId).toBe(second.scenarioId);
  expect(first.frame!.captureMs).toBe(12);
  expect(first.guardEnabled).toBe(false);
  expect(second.guardEnabled).toBe(true);
});

test('collection retains actual result references and finishes after exactly two eligible records', () => {
  const without = result('without-1', false);
  const withGuard = result('with-1', true);
  const original = JSON.stringify([without, withGuard]);
  let state = comparisonReducer(begin(), { type: 'without', run: without });
  expect(state.phase).toBe('with');
  expect(state.without).toBe(without);
  state = comparisonReducer(state, { type: 'with', run: withGuard });
  expect(state.phase).toBe('complete');
  expect(state.withGuard).toBe(withGuard);
  expect(state.without!.outcome!.attack_success).toBeNull();
  expect(JSON.stringify([without, withGuard])).toBe(original);
  expect(comparisonReducer(state, { type: 'with', run: result('third-run', true) })).toBe(state);
});

test('running, stale, wrong-scenario and wrong-guard records cannot become the first result', () => {
  const state = begin();
  for (const candidate of [
    result('previous-run', false),
    result('running', false, { status: 'running', outcome: null }),
    result('other-scenario', false, { scenario_id: 'explicit-delegation' }),
    result('wrong-guard', true),
  ]) expect(comparisonReducer(state, { type: 'without', run: candidate })).toBe(state);
  expect(state.without).toBeNull();
});

test('the second result must be a distinct completed guarded response for the same scenario', () => {
  const state = comparisonReducer(begin(), { type: 'without', run: result('without-1', false) });
  for (const candidate of [
    result('without-1', true),
    result('running', true, { status: 'running', outcome: null }),
    result('other-scenario', true, { scenario_id: 'explicit-delegation' }),
    result('wrong-guard', false),
  ]) expect(comparisonReducer(state, { type: 'with', run: candidate })).toBe(state);
  expect(state.withGuard).toBeNull();
});

test('out-of-order and duplicate responses do not skip comparison phases', () => {
  let state = begin();
  expect(comparisonReducer(state, { type: 'with', run: result('with-1', true) })).toBe(state);
  state = comparisonReducer(state, { type: 'without', run: result('without-1', false) });
  expect(comparisonReducer(state, { type: 'without', run: result('other-without', false) })).toBe(state);
  expect(state.phase).toBe('with');
});

test('a failed first analysis stays failed and never gets an invented bypass outcome', () => {
  const failed = result('without-failed', false, { status: 'failed', stage: 'runtime.failed',
    error: '模型輸出無效', error_code: 'model_schema_invalid', outcome: null });
  let state = comparisonReducer(begin(), { type: 'without', run: failed });
  expect(state.without).toBe(failed);
  expect(state.without!.status).toBe('failed');
  expect(state.without!.outcome).toBeNull();
  expect(state.without!.decision).toBeNull();
  state = comparisonReducer(state, { type: 'with', run: result('with-1', true) });
  expect(state.phase).toBe('complete');
  expect(state.without!.outcome).toBeNull();
});

test('failed second analysis remains an actual failure without a fabricated authorization', () => {
  let state = comparisonReducer(begin(), { type: 'without', run: result('without-1', false) });
  const failed = result('with-failed', true, { status: 'failed', outcome: null, error: '服務無法使用' });
  state = comparisonReducer(state, { type: 'with', run: failed });
  expect(state.withGuard).toBe(failed);
  expect(state.withGuard!.decision).toBeNull();
  expect(state.withGuard!.outcome).toBeNull();
});

test('a request failure keeps the recorded first response but cannot fabricate the second', () => {
  const first = result('without-1', false);
  let state = comparisonReducer(begin(), { type: 'without', run: first });
  state = comparisonReducer(state, { type: 'failed', revision: state.revision });
  expect(state.phase).toBe('failed');
  expect(state.without).toBe(first);
  expect(state.withGuard).toBeNull();
});

test('reset removes both cached records and stale callbacks cannot fail the next session', () => {
  let state = begin();
  const oldRevision = state.revision;
  state = comparisonReducer(state, { type: 'without', run: result('without-1', false) });
  state = comparisonReducer(state, { type: 'reset' });
  expect(state.phase).toBe('idle');
  expect(state.input).toBeNull();
  expect(state.without).toBeNull();
  expect(state.withGuard).toBeNull();
  state = comparisonReducer(state, { type: 'begin', input: input(), ignoreId: 'without-1' });
  expect(comparisonReducer(state, { type: 'failed', revision: oldRevision })).toBe(state);
  expect(comparisonReducer(state, { type: 'without', run: result('without-1', false) })).toBe(state);
});

test('duplicate begin cannot replace frozen comparison input while either request is pending', () => {
  let state = begin();
  const different = { scenarioId: 'explicit-delegation', query: 'different' };
  expect(comparisonReducer(state, { type: 'begin', input: different, ignoreId: null })).toBe(state);
  state = comparisonReducer(state, { type: 'without', run: result('without-1', false) });
  expect(comparisonReducer(state, { type: 'begin', input: different, ignoreId: null })).toBe(state);
});

test('mock comparison sends no fabricated image while preserving the requested command', () => {
  const state = comparisonReducer(INITIAL_COMPARISON_STATE, {
    type: 'begin', input: { scenarioId: 'reservation-injection', query: '幫我打電話訂這間餐廳' }, ignoreId: null,
  });
  expect(comparisonRunOptions(state.input!, false)).toEqual({
    frame: undefined, scenarioId: 'reservation-injection', userRequest: '幫我打電話訂這間餐廳', guardEnabled: false,
  });
});
