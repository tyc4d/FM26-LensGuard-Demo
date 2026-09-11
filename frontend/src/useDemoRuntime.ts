import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { RunState, Scenario, Health, CapturedFrame, ModelProfile } from './types';

export interface RunOptions {
  guardEnabled?: boolean;
  scenarioId?: string;
  userRequest?: string;
  frame?: CapturedFrame;
  modelProfile?: ModelProfile;
}

export function useDemoRuntime(initialScenario = 'navigation-injection') {
  const [health, setHealth] = useState<Health | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioId, setScenarioId] = useState(initialScenario);
  const [preferredModel, setPreferredModel] = useState<ModelProfile | undefined>();
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
  const models = health?.runtime === 'prototype' ? (health.prototype?.models ?? [])
    .filter(model => ['nemotron-nano-vl-8b', 'cosmos-reason1-7b'].includes(model.id)) : [];
  const modelProfile = models.some(model => model.id === preferredModel) ? preferredModel
    : models.find(model => model.id === health?.prototype?.default_model)?.id ?? models[0]?.id;
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
              applyState({ ...active, status: 'failed', error: 'This analysis is no longer available. Reset and run the scenario again.' });
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

  const startRun = useCallback(async (capture?: () => Promise<CapturedFrame>, options: RunOptions = {}): Promise<boolean> => {
    if (requestPending.current || currentRun.current?.status === 'running' || !connected) return false;
    reset();
    requestPending.current = true;
    const version = generation.current;
    setStarting(true);
    try {
      browserStarted.current = performance.now();
      uploadRoundtrip.current = 0;
      let frame: CapturedFrame | undefined = options.frame;
      const requestText = options.userRequest ?? userRequest;
      setSubmittedUserRequest(requestText);
      if (health?.runtime === 'prototype') {
        if (!requestText.trim()) throw new Error('Enter a request before starting the analysis.');
        if (requestText.length > 4000) throw new Error('Keep your request within 4,000 characters.');
        if (!frame && !capture) throw new Error('Unable to capture a camera frame.');
        frame = frame ?? await capture!();
      } else if (capture && !frame) {
        // A mock preview may be captured for presentation, but the API still
        // receives the original JSON fixture command and no image bytes.
        try { frame = await capture(); } catch { /* Mock scenarios need no camera. */ }
      }
      if (!mounted.current || version !== generation.current) return false;
      const uploadStarted = performance.now();
      const initial = await api.run(options.scenarioId ?? scenarioId, options.guardEnabled ?? guardEnabled,
        requestText, health?.runtime === 'prototype' ? frame : undefined, options.modelProfile ?? modelProfile);
      if (!mounted.current || version !== generation.current) return false;
      uploadRoundtrip.current = performance.now() - uploadStarted;
      applyState(initial);
      setConnected(true);
      if (initial.status !== 'running') return true;
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
          if (snapshot.id !== initial.id || !Array.isArray(snapshot.events)) throw new Error('Invalid run event format');
          applyState(snapshot);
          setConnected(true);
        } catch {
          source.close();
          setError('Unable to read the event stream. Fetching the latest status from the backend.');
        }
      });
      source.onerror = () => {
        if (version !== generation.current || currentRun.current?.status !== 'running') return;
        setConnected(false);
        setError('Run connection lost. Reconnecting; you can also reset this analysis.');
      };
      return true;
    } catch (cause) {
      if (!mounted.current || version !== generation.current) return false;
      setError(cause instanceof Error ? cause.message : 'Unable to connect to the backend. Check that the service is running and try again.');
      return false;
    } finally {
      if (mounted.current && version === generation.current) {
        requestPending.current = false;
        setStarting(false);
      }
    }
  }, [applyState, connected, guardEnabled, reset, scenarioId, health, userRequest, modelProfile]);

  const active = starting || run?.status === 'running';
  return {
    scenarios, scenario, scenarioId, userRequest, models, modelProfile,
    displayedUserRequest: submittedUserRequest ?? userRequest,
    userRequestEdited: userRequest !== defaultUserRequest,
    guardEnabled, connected, run, active, starting, error, health,
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
    selectModel: (id: ModelProfile) => {
      if (!active && models.some(model => model.id === id && model.available)) {
        reset(); setPreferredModel(id);
      }
    },
    toggleGuard: (enabled?: boolean) => { if (!active) { reset(); setGuardEnabled((value) => enabled ?? !value); } },
  };
}
