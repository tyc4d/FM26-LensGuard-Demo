import type { RunState } from '../types';

export function RawAction({ run }: { run: RunState | null }) {
  const action = run?.action;
  const raw = action && {
    tool: action.tool,
    arguments: Object.fromEntries(Object.entries(action.arguments).map(([key, value]) => [key, value.value])),
  };
  return <details className="disclosure raw-action">
    <summary>Show raw structured action</summary>
    <pre>{raw ? JSON.stringify(raw, null, 2) : 'No structured action available.'}</pre>
  </details>;
}
