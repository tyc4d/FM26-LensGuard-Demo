import { useId } from 'react';
import type { RunState, TraceNode } from '../types';
import { displayLabel, traceLabel } from '../labels';

const NODE_WIDTH = 174;
const NODE_HEIGHT = 46;
const COLUMN_GAP = 33;

export function DecisionTrace({ run, realMode = false }: { run: RunState | null; realMode?: boolean }) {
  const markerId = useId().replace(/:/g, '');
  const nodes = run?.trace_nodes || [];
  const edges = run?.trace_edges || [];
  const mainNodes = nodes.filter((node) => node.source !== 'user');
  const userNodes = nodes.filter((node) => node.source === 'user');
  const positions = new Map<string, { x: number; y: number }>();
  const mainY = userNodes.length ? 64 : 8;
  mainNodes.forEach((node, index) => positions.set(node.id, { x: index * (NODE_WIDTH + COLUMN_GAP) + 8, y: mainY }));
  userNodes.forEach((node, index) => positions.set(node.id, { x: index * (NODE_WIDTH + COLUMN_GAP) + 8, y: 8 }));
  const width = Math.max(1, mainNodes.length) * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP + 16;
  const height = mainY + NODE_HEIGHT + 12;

  function nodeClass(node: TraceNode) {
    if (node.id === 'policy' || node.id === 'outcome') {
      if (run?.decision?.result === 'block' || run?.outcome?.status === 'blocked') return 'trace-node-block';
      if (run?.decision?.result === 'allow' || run?.outcome?.status === 'allowed') return 'trace-node-allow';
    }
    return node.source === 'user' ? 'trace-node-user' : '';
  }

  function nodeLabel(node: TraceNode) {
    return node.id === 'value' || node.id === 'region' ? node.label : traceLabel(node.label);
  }

  return (
    <details className="disclosure trace-section">
      <summary>查看來源紀錄</summary>
      <p className="trace-caption">{run?.semantic_regions?.length ? '來源 → 語意角色 → 證據與使用目的；外部行動另需使用者授權。' : realMode ? '影像 → 模型 → 提案・本次未提供語意區域。' : (userNodes.length ? '相機提供資料，使用者請求提供授權。' : '來源 → 值 → 參數 → 授權') + '・模擬來源紀錄'}</p>
      {nodes.length ? (
        <div className="trace-canvas" data-testid="decision-trace">
          <svg viewBox={`0 0 ${width} ${height}`} style={{ height: userNodes.length ? 122 : 66 }} role="img" aria-label={`來源紀錄：${nodes.map(nodeLabel).join('、')}`}>
            <defs><marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8" fill="none" stroke="currentColor" strokeWidth="1.3" /></marker></defs>
            {edges.map((edge) => {
              const from = positions.get(edge.from);
              const to = positions.get(edge.to);
              if (!from || !to) return null;
              const startX = from.x + NODE_WIDTH;
              const startY = from.y + NODE_HEIGHT / 2;
              const endX = to.x - 5;
              const endY = to.y + NODE_HEIGHT / 2;
              const d = startY === endY ? `M ${startX} ${startY} L ${endX} ${endY}` : `M ${startX} ${startY} L ${startX + COLUMN_GAP / 2} ${startY} L ${startX + COLUMN_GAP / 2} ${endY} L ${endX} ${endY}`;
              return <path key={`${edge.from}-${edge.to}`} d={d} fill="none" className="trace-edge" markerEnd={`url(#${markerId})`} />;
            })}
            {nodes.map((node) => {
              const position = positions.get(node.id)!;
              return <g key={node.id} transform={`translate(${position.x} ${position.y})`} className={`trace-node ${nodeClass(node)}`}>
                <title>{nodeLabel(node)}・{displayLabel(node.type)}{node.source ? `・${displayLabel(node.source)}` : ''}</title>
                <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="5" />
                <text x="12" y="21" className="trace-label">{nodeLabel(node)}</text>
                <text x="12" y="36" className="trace-type">{displayLabel(node.type)}</text>
              </g>;
            })}
          </svg>
        </div>
      ) : <p className="trace-empty">行動提案附上來源資訊後，將顯示來源紀錄。</p>}
    </details>
  );
}
