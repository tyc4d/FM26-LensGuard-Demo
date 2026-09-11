import type { Health, ModelOption, ModelProfile } from '../types';

const modelNames: Record<string, string> = {
  'qwen3vl-8b': 'Qwen3-VL 8B',
  'gemma3-4b': 'Gemma 3 4B',
  'minicpm-v4.5': 'MiniCPM-V 4.5',
  'nemotron-nano-vl-8b': 'NVIDIA Nemotron Nano VL 8B',
  'cosmos-reason1-7b': 'NVIDIA Cosmos Reason1 7B',
};

export function RuntimeInfo({ health, connected, models = [], selectedModel, onModelChange, disabled = false }: {
  health: Health | null; connected: boolean; models?: ModelOption[]; selectedModel?: ModelProfile;
  onModelChange?: (id: ModelProfile) => void; disabled?: boolean;
}) {
  const runtime = health?.prototype;
  const live = connected && health?.runtime === 'prototype' && runtime && runtime.status !== 'unavailable';
  const gpu = live ? runtime.gpu_memory : null;
  const used = gpu?.used_mib;
  const total = gpu?.total_mib;
  const memory = typeof used === 'number' && Number.isFinite(used) && used >= 0
    && typeof total === 'number' && Number.isFinite(total) && total > 0 && used <= total
    ? `${(used / 1024).toFixed(2)} / ${(total / 1024).toFixed(2)} GiB` : '—';
  let model = !health ? 'Connecting' : !connected ? 'Disconnected' : health.runtime === 'mock' ? 'Mock' : 'Model offline';
  if (live) {
    model = modelNames[runtime.model_profile ?? ''] ?? runtime.model_id?.split('/').pop() ?? runtime.model_profile ?? 'Local model';
    if (runtime.status === 'loading') model += ' (loading)';
    else if (!runtime.model_loaded) model += ' (not loaded)';
  }
  return <small className="runtime-info" aria-label="Inference model and GPU memory"
    title={live ? `${runtime.model_id ?? model}${gpu?.name ? ` · ${gpu.name}` : ''}. Total GPU memory used / capacity, updated every 4 seconds.` : model}>
    {models.length > 0 && onModelChange ? <select className="runtime-model-select" aria-label="Inference model"
      title="Choose the model for your next analysis. Switching models may take a moment."
      value={selectedModel} disabled={disabled || !connected}
      onChange={event => onModelChange(event.target.value as ModelProfile)}>
      {models.map(option => <option key={option.id} value={option.id} disabled={!option.available}>
        {option.name}{!option.available ? ' (unavailable)' : option.id === runtime?.model_profile
          && ['switching', 'loading'].includes(runtime.status) ? ' (loading)' : ''}
      </option>)}
    </select> : <span className="runtime-model">{model}</span>}
    <span className="runtime-memory">GPU VRAM {memory}</span>
  </small>;
}
