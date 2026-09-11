import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { CapturedFrame, RunState, ModelProfile } from './types';
import type { RunOptions } from './useDemoRuntime';

export interface ComparisonInput { scenarioId: string; query: string; compare: boolean; frame?: CapturedFrame; modelProfile?: ModelProfile }
export interface ComparisonState {
  phase: 'idle' | 'with' | 'without' | 'complete' | 'failed';
  input: ComparisonInput | null;
  withGuard: RunState | null;
  without: RunState | null;
  ignoreId: string | null;
}
export const INITIAL_COMPARISON: ComparisonState = {
  phase: 'idle', input: null, withGuard: null, without: null, ignoreId: null,
};
type Action = { type: 'reset' } | { type: 'begin'; input: ComparisonInput; ignoreId: string | null }
  | { type: 'received'; run: RunState } | { type: 'failed' };

function snapshot(input: ComparisonInput): ComparisonInput {
  // Both requests share immutable image bytes, with copied capture metadata.
  return { scenarioId: input.scenarioId, query: input.query, compare: input.compare,
    ...(input.modelProfile ? { modelProfile: input.modelProfile } : {}),
    ...(input.frame ? { frame: { ...input.frame } } : {}) };
}
export function comparisonReducer(state: ComparisonState, action: Action): ComparisonState {
  switch (action.type) {
    case 'reset': return INITIAL_COMPARISON;
    case 'begin':
      if (['with', 'without'].includes(state.phase)) return state;
      return { ...INITIAL_COMPARISON, phase: 'with', input: snapshot(action.input), ignoreId: action.ignoreId };
    case 'failed':
      // A baseline failure must not discard the successfully protected result.
      return state.phase === 'without' ? { ...state, phase: 'complete' }
        : state.phase === 'with' ? { ...state, phase: 'failed' } : state;
    case 'received': {
      const { run } = action;
      if (!['with', 'without'].includes(state.phase) || run.status === 'running' || run.id === state.ignoreId) return state;
      if (run.scenario_id !== state.input?.scenarioId || run.guard_enabled !== (state.phase === 'with')
        || (state.input?.modelProfile && run.model_profile !== state.input.modelProfile)) {
        return comparisonReducer(state, { type: 'failed' });
      }
      return state.phase === 'with'
        ? { ...state, withGuard: run, ignoreId: run.id, phase: run.status === 'failed' || !state.input?.compare ? 'complete' : 'without' }
        : { ...state, without: run, phase: 'complete' };
    }
  }
}

type StartRun = (capture?: () => Promise<CapturedFrame>, options?: RunOptions) => Promise<boolean>;
export function useComparison(run: RunState | null, active: boolean, startRun: StartRun) {
  const [state, dispatch] = useReducer(comparisonReducer, INITIAL_COMPARISON);
  const accepted = useRef<string | null>(null);
  const session = useRef(0);
  const locked = useRef(false);
  const submit = useCallback((input: ComparisonInput, guardEnabled: boolean) => {
    const token = session.current;
    const failed = () => { if (session.current === token) dispatch({ type: 'failed' }); };
    // Synchronous start clears the previous runtime state before the next effect.
    void startRun(undefined, { scenarioId: input.scenarioId, userRequest: input.query, frame: input.frame,
      modelProfile: input.modelProfile, guardEnabled })
      .then(started => { if (!started) failed(); }, failed);
  }, [startRun]);
  useEffect(() => { locked.current = ['with', 'without'].includes(state.phase); }, [state.phase]);
  useEffect(() => {
    if (active || !run || run.status === 'running' || run.id === accepted.current
      || run.id === state.ignoreId || !state.input || !['with', 'without'].includes(state.phase)) return;
    accepted.current = run.id;
    const next = comparisonReducer(state, { type: 'received', run });
    dispatch({ type: 'received', run });
    if (state.phase === 'with' && next.phase === 'without') submit(state.input, false);
  }, [active, run, state, submit]);
  useEffect(() => () => { session.current += 1; }, []);
  return {
    ...state,
    busy: state.phase === 'with' || state.phase === 'without',
    begin: (input: ComparisonInput) => {
      if (active || locked.current) return;
      locked.current = true;
      accepted.current = null;
      session.current += 1;
      const frozen = snapshot(input);
      dispatch({ type: 'begin', input: frozen, ignoreId: run?.id ?? null });
      submit(frozen, true);
    },
    reset: () => {
      session.current += 1;
      locked.current = false;
      accepted.current = null;
      dispatch({ type: 'reset' });
    },
  };
}
