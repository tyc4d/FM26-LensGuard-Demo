import type { Health, RunState, Scenario, CapturedFrame } from './types';

const configuredBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
// An old HTTP override must not cause mixed content after HTTPS is enabled.
// The same-origin proxy remains the safe default for LAN clients.
const resolvedBase = new URL(configuredBase, window.location.href);
export const API_BASE = window.location.protocol === 'https:' && resolvedBase.protocol === 'http:'
  ? '/api' : configuredBase;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(init?.method === 'POST' ? 30000 : 6000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status}).`, response.status);
    }
    return await response.json() as T;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new Error('The backend response timed out. Please try again later.');
    }
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('The backend request was cancelled. Please try again.');
    }
    if (cause instanceof TypeError) {
      throw new Error('Unable to connect to the backend. Check your network and the backend service, then try again.');
    }
    if (cause instanceof SyntaxError) {
      throw new Error('Invalid backend response. Please try again later.');
    }
    throw cause;
  }
}

export const api = {
  health: () => request<Health>('/health'),
  scenarios: () => request<Scenario[]>('/scenarios'),
  run: (scenarioId: string, guardEnabled: boolean, userRequest?: string, frame?: CapturedFrame) => {
    if (frame) {
      const body = new FormData();
      body.append('image', frame.blob, 'frame.jpg');
      body.append('scenario_id', scenarioId);
      body.append('guard_enabled', String(guardEnabled));
      body.append('user_request', userRequest || '');
      body.append('source', frame.source);
      body.append('capture_ms', String(frame.captureMs));
      return request<RunState>('/run', { method: 'POST', body });
    }
    return request<RunState>('/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId, guard_enabled: guardEnabled }),
    });
  },
  state: (runId: string) => request<RunState>(`/run/${encodeURIComponent(runId)}`),
  stream: (runId: string) => new EventSource(`${API_BASE}/run/${encodeURIComponent(runId)}/events`),
};
