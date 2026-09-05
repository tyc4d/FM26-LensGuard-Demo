import { useCallback, useEffect, useReducer, useRef } from 'react';
import { INITIAL_STORY_STATE, storyReducer } from './story';
import type { RunState } from './types';

export const PRESENTATION_STEP_MS = 2000;

function prefersManualPlayback() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Presentation never submits a request; replay only advances cached data. */
export function usePresentation(run: RunState | null, starting: boolean) {
  const [state, dispatch] = useReducer(storyReducer, INITIAL_STORY_STATE);
  const wasStarting = useRef(false);

  useEffect(() => {
    if (starting && !wasStarting.current) {
      dispatch({ type: 'START', autoplay: !prefersManualPlayback() });
    }
    wasStarting.current = starting;
    if (run) dispatch({ type: 'UPDATE', run, autoplay: !prefersManualPlayback() });
    else if (!starting) dispatch({ type: 'RESET' });
  }, [run, starting]);

  const index = state.available.indexOf(state.phase);
  const canNext = index >= 0 && index < state.available.length - 1;
  const canPrevious = index > 0;

  useEffect(() => {
    if (!state.playing || !canNext) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'NEXT', automatic: true, revision: state.revision, animateImpact: !prefersManualPlayback() });
    }, PRESENTATION_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.playing, state.runId, state.revision, canNext]);

  useEffect(() => {
    if (!state.impactPlaying) return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const finishWhenReduced = () => {
      if (preference?.matches) dispatch({ type: 'FINISH_IMPACT', revision: state.revision });
    };
    finishWhenReduced();
    preference?.addEventListener('change', finishWhenReduced);
    return () => preference?.removeEventListener('change', finishWhenReduced);
  }, [state.impactPlaying, state.revision]);

  const next = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const previous = useCallback(() => dispatch({ type: 'PREVIOUS' }), []);
  const togglePlay = useCallback(() => dispatch({ type: 'TOGGLE_PLAY' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const finishImpact = useCallback(() => dispatch({ type: 'FINISH_IMPACT', revision: state.revision }), [state.revision]);
  const replayCurrent = useCallback(() => {
    dispatch({ type: 'REPLAY', autoplay: !prefersManualPlayback() });
  }, []);

  return {
    state, phase: state.phase, playing: state.playing || !!state.impactPlaying, replay: state.replay,
    next, previous, togglePlay, reset, restart: replayCurrent, replayCurrent,
    canNext, canPrevious, finishImpact,
  };
}
