import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { CapturedFrame, RunState } from './types';
import type { RunOptions } from './useDemoRuntime';

export interface ComparisonInput { scenarioId: string; query: string; frame?: CapturedFrame }
export interface ComparisonState {
  phase: 'idle' | 'without' | 'with' | 'complete' | 'failed';
  input: ComparisonInput | null;
  without: RunState | null;
  withGuard: RunState | null;
  ignoreId: string | null;
  revision: number;
}
export type ComparisonAction = { type: 'reset' } | { type: 'begin'; input: ComparisonInput; ignoreId: string | null }
  | { type: 'without'; run: RunState } | { type: 'with'; run: RunState }
  | { type: 'failed'; revision?: number };
export const INITIAL_COMPARISON_STATE: ComparisonState = {
  phase: 'idle', input: null, without: null, withGuard: null, ignoreId: null, revision: 0,
};

function snapshotInput(input: ComparisonInput): ComparisonInput {
  // The Blob is immutable; copy the caller's mutable metadata and query wrapper.
  return { scenarioId: input.scenarioId, query: input.query,
    ...(input.frame ? { frame: { ...input.frame } } : {}) };
}

export function comparisonRunOptions(input: ComparisonInput, guardEnabled: boolean): RunOptions {
  return { frame: input.frame, userRequest: input.query, scenarioId: input.scenarioId, guardEnabled };
}

function acceptsRun(state: ComparisonState, run: RunState, guardEnabled: boolean) {
  return !!state.input && run.status !== 'running' && run.guard_enabled === guardEnabled
    && run.scenario_id === state.input.scenarioId && run.id !== state.ignoreId;
}

export function comparisonReducer(state: ComparisonState, action: ComparisonAction): ComparisonState {
  switch (action.type) {
    case 'reset': return { ...INITIAL_COMPARISON_STATE, revision: state.revision + 1 };
    case 'begin':
      if (state.phase === 'without' || state.phase === 'with') return state;
      return { ...INITIAL_COMPARISON_STATE, phase: 'without', input: snapshotInput(action.input),
        ignoreId: action.ignoreId, revision: state.revision + 1 };
    case 'without': return state.phase === 'without' && acceptsRun(state, action.run, false)
      ? { ...state, phase: 'with', without: action.run, ignoreId: action.run.id } : state;
    case 'with': return state.phase === 'with' && acceptsRun(state, action.run, true)
      ? { ...state, phase: 'complete', withGuard: action.run } : state;
    case 'failed':
      if ((state.phase !== 'without' && state.phase !== 'with')
          || action.revision !== undefined && action.revision !== state.revision) return state;
      return { ...state, phase: 'failed' };
  }
}

type StartRun = (capture?: () => Promise<CapturedFrame>, options?: RunOptions) => Promise<void | boolean>;
export function useComparison(run: RunState | null, active: boolean, error: string | null, startRun: StartRun) {
  const [state, dispatch] = useReducer(comparisonReducer, INITIAL_COMPARISON_STATE);
  const accepted = useRef<string | null>(null);
  const session = useRef(0);
  const busy = useRef(false);

  const submit = useCallback((input: ComparisonInput, guardEnabled: boolean) => {
    const token = session.current;
    const failed = () => {
      if (session.current === token) dispatch({ type: 'failed' });
    };
    try {
      // Start synchronously so the runtime clears its previous error before the
      // comparison's first effect can mistake that stale error for this request.
      void startRun(undefined, comparisonRunOptions(input, guardEnabled))
        .then((started) => { if (started === false) failed(); }, failed);
    } catch { failed(); }
  }, [startRun]);

  useEffect(() => {
    busy.current = state.phase === 'without' || state.phase === 'with';
  }, [state.phase]);

  useEffect(() => {
    if (active || !['without', 'with'].includes(state.phase)) return;
    if (!run) { if (error) dispatch({ type: 'failed', revision: state.revision }); return; }
    if (run.id === accepted.current || !state.input) return;
    if (state.phase === 'without' && acceptsRun(state, run, false)) {
      accepted.current = run.id;
      dispatch({ type: 'without', run });
      submit(state.input, true);
    } else if (state.phase === 'with' && acceptsRun(state, run, true)) {
      accepted.current = run.id;
      dispatch({ type: 'with', run });
    }
  }, [active, error, run, state, submit]);

  useEffect(() => () => { session.current += 1; }, []);

  return {
    ...state,
    busy: state.phase === 'without' || state.phase === 'with',
    begin: (input: ComparisonInput) => {
      if (active || busy.current) return;
      busy.current = true;
      accepted.current = null;
      const snapshot = snapshotInput(input);
      session.current += 1;
      dispatch({ type: 'begin', input: snapshot, ignoreId: run?.id ?? null });
      submit(snapshot, false);
    },
    reset: () => {
      session.current += 1;
      busy.current = false;
      accepted.current = null;
      dispatch({ type: 'reset' });
    },
  };
}
