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
      throw new ApiError(typeof body?.detail === 'string' ? body.detail : `請求失敗（${response.status}）。`, response.status);
    }
    return await response.json() as T;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new Error('後端回應逾時，請稍後再試。');
    }
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('後端請求已中止，請再試一次。');
    }
    if (cause instanceof TypeError) {
      throw new Error('無法連線至後端。請確認網路連線與後端服務後再試一次。');
    }
    if (cause instanceof SyntaxError) {
      throw new Error('後端回應格式無效，請稍後再試。');
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
