import type { RunState } from '../types';

export function RawAction({ run }: { run: RunState | null }) {
  const action = run?.action;
  const raw = action && {
    tool: action.tool,
    arguments: Object.fromEntries(Object.entries(action.arguments).map(([key, value]) => [key, value.value])),
  };
  return <details className="disclosure raw-action">
    <summary>查看原始結構化行動</summary>
    <pre>{raw ? JSON.stringify(raw, null, 2) : '尚無結構化行動。'}</pre>
  </details>;
}
