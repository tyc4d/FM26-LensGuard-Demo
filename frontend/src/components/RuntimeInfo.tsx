import type { Health } from '../types';

const modelNames: Record<string, string> = {
  'qwen3vl-8b': 'Qwen3-VL 8B',
  'gemma3-4b': 'Gemma 3 4B',
  'minicpm-v4.5': 'MiniCPM-V 4.5',
  'nemotron-nano-vl-8b': 'NVIDIA Nemotron Nano VL 8B',
  'cosmos-reason1-7b': 'NVIDIA Cosmos Reason1 7B',
};

export function RuntimeInfo({ health, connected }: { health: Health | null; connected: boolean }) {
  const runtime = health?.prototype;
  const live = connected && health?.runtime === 'prototype' && runtime && runtime.status !== 'unavailable';
  const gpu = live ? runtime.gpu_memory : null;
  const used = gpu?.used_mib;
  const total = gpu?.total_mib;
  const memory = typeof used === 'number' && Number.isFinite(used) && used >= 0
    && typeof total === 'number' && Number.isFinite(total) && total > 0 && used <= total
    ? `${(used / 1024).toFixed(2)} / ${(total / 1024).toFixed(2)} GiB` : '—';
  let model = !health ? '連線中' : !connected ? '連線中斷' : health.runtime === 'mock' ? 'Mock' : '模型離線';
  if (live) {
    model = modelNames[runtime.model_profile ?? ''] ?? runtime.model_id?.split('/').pop() ?? runtime.model_profile ?? '本機模型';
    if (runtime.status === 'loading') model += '（載入中）';
    else if (!runtime.model_loaded) model += '（未載入）';
  }
  return <small className="runtime-info" aria-label="推論模型與 GPU 記憶體"
    title={live ? `${runtime.model_id ?? model}${gpu?.name ? ` · ${gpu.name}` : ''}。GPU 整體已使用／總容量，每 4 秒更新。` : model}>
    <span className="runtime-model">{model}</span>
    <span className="runtime-memory">GPU VRAM {memory}</span>
  </small>;
}
