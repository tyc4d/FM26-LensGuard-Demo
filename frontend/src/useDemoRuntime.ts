import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { RunState, Scenario, Health, CapturedFrame } from './types';

export function useDemoRuntime() {
  const [health, setHealth] = useState<Health | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioId, setScenarioId] = useState('reservation-injection');
  const [userRequestDrafts, setUserRequestDrafts] = useState<Record<string, string>>({});
  const [submittedUserRequest, setSubmittedUserRequest] = useState<string | null>(null);
  const [guardEnabled, setGuardEnabled] = useState(true);
  const [connected, setConnected] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<EventSource | null>(null);
  const currentRun = useRef<RunState | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const hasScenarios = useRef(false);
  const browserStarted = useRef(0);
  const uploadRoundtrip = useRef(0);
  const requestPending = useRef(false);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const defaultUserRequest = scenarioId === 'reservation-injection' ? '' : scenario?.user_request ?? '';
  const userRequest = health?.runtime === 'prototype'
    ? userRequestDrafts[scenarioId] ?? defaultUserRequest
    : scenario?.user_request ?? '';

  const applyState = useCallback((state: RunState) => {
    // A health recovery request can arrive after a more recent SSE snapshot.
    if (currentRun.current?.id === state.id && currentRun.current.events.length > state.events.length) return;
    if (state.runtime === 'prototype') state = { ...state, timings: {
      ...state.timings, browser_upload_roundtrip_ms: uploadRoundtrip.current,
      browser_total_ms: performance.now() - browserStarted.current,
    } };
    currentRun.current = state;
    setRun(state);
    if (state.status !== 'running') {
      stream.current?.close();
      stream.current = null;
      setError(state.error);
    }
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    stream.current?.close();
    stream.current = null;
    currentRun.current = null;
    requestPending.current = false;
    setRun(null);
    setSubmittedUserRequest(null);
    setStarting(false);
    setError(null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let checking = false;
    async function checkBackend() {
      if (checking) return;
      checking = true;
      try {
        const health = await api.health();
        if (!disposed) setHealth(health);
        if (disposed) return;
        setConnected(true);
        if (!hasScenarios.current) {
          const data = await api.scenarios();
          if (disposed) return;
          setScenarios(data);
          hasScenarios.current = true;
        }
        const active = currentRun.current;
        if (active?.status === 'running') {
          const version = generation.current;
          try {
            const state = await api.state(active.id);
            if (!disposed && version === generation.current) {
              applyState(state);
              if (state.status !== 'failed') setError(null);
            }
          } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404 && !disposed && version === generation.current) {
              applyState({ ...active, status: 'failed', error: 'This run is no longer available. Reset and run the scenario again.' });
            } else throw cause;
          }
        }
      } catch {
        if (!disposed) setConnected(false);
      } finally { checking = false; }
    }
    void checkBackend();
    const timer = window.setInterval(() => void checkBackend(), 4000);
    return () => {
      disposed = true;
      mounted.current = false;
      generation.current += 1;
      window.clearInterval(timer);
      stream.current?.close();
    };
  }, [applyState]);

  const startRun = useCallback(async (capture?: () => Promise<CapturedFrame>) => {
    if (requestPending.current || currentRun.current?.status === 'running' || !connected) return;
    reset();
    requestPending.current = true;
    const version = generation.current;
    setStarting(true);
    try {
      browserStarted.current = performance.now();
      uploadRoundtrip.current = 0;
      let frame: CapturedFrame | undefined;
      if (health?.runtime === 'prototype') {
        if (!userRequest.trim()) throw new Error('Enter a user request before running analysis.');
        if (userRequest.length > 4000) throw new Error('Keep the user request within 4000 characters.');
        if (!capture) throw new Error('Camera capture is unavailable.');
        setSubmittedUserRequest(userRequest);
        frame = await capture();
      }
      if (!mounted.current || version !== generation.current) return;
      const uploadStarted = performance.now();
      const initial = await api.run(scenarioId, guardEnabled, userRequest, frame);
      if (!mounted.current || version !== generation.current) return;
      uploadRoundtrip.current = performance.now() - uploadStarted;
      applyState(initial);
      setConnected(true);
      if (initial.status !== 'running') return;
      const source = api.stream(initial.id);
      stream.current = source;
      source.onopen = () => {
        if (version !== generation.current) return;
        setConnected(true);
        setError(null);
      };
      source.addEventListener('runtime', (message) => {
        if (version !== generation.current) return;
        try {
          const snapshot = JSON.parse((message as MessageEvent<string>).data) as RunState;
          if (snapshot.id !== initial.id || !Array.isArray(snapshot.events)) throw new Error('Invalid runtime event');
          applyState(snapshot);
          setConnected(true);
        } catch {
          source.close();
          setError('The runtime stream could not be read. Recovering the latest state from the backend.');
        }
      });
      source.onerror = () => {
        if (version !== generation.current || currentRun.current?.status !== 'running') return;
        setConnected(false);
        setError('Runtime connection interrupted. Reconnecting; you can also reset this run.');
      };
    } catch (cause) {
      if (!mounted.current || version !== generation.current) return;
      setError(cause instanceof Error ? cause.message : 'Cannot reach the backend. Start the FastAPI server and try again.');

    } finally {
      if (mounted.current && version === generation.current) {
        requestPending.current = false;
        setStarting(false);
      }
    }
  }, [applyState, connected, guardEnabled, reset, scenarioId, health, userRequest]);

  const active = starting || run?.status === 'running';
  return {
    scenarios, scenario, scenarioId, userRequest,
    displayedUserRequest: submittedUserRequest ?? userRequest,
    userRequestEdited: userRequest !== defaultUserRequest,
    guardEnabled, connected, run, active, error, health,
    startRun, reset,
    editUserRequest: (value: string) => {
      if (health?.runtime !== 'prototype' || !scenario || requestPending.current || currentRun.current?.status === 'running') return;
      reset();
      setUserRequestDrafts((drafts) => ({ ...drafts, [scenarioId]: value }));
    },
    restoreUserRequest: () => {
      if (health?.runtime !== 'prototype' || !scenario || requestPending.current || currentRun.current?.status === 'running') return;
      reset();
      setUserRequestDrafts((drafts) => {
        const remaining = { ...drafts };
        delete remaining[scenarioId];
        return remaining;
      });
    },
    selectScenario: (id: string) => { if (!active) { reset(); setScenarioId(id); } },
    toggleGuard: () => { if (!active) { reset(); setGuardEnabled((value) => !value); } },
  };
}
