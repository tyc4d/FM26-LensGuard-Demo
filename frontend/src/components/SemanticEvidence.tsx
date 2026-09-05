import type { SemanticRegion } from '../types';
import { directionLabel } from '../labels';

/** These are policy-returned regions, never a frontend classifier or fixture. */
export function SemanticEvidence({ regions }: { regions: SemanticRegion[] }) {
  if (!regions.length) return <p className="empty-copy">本次未提供可檢視的語意區域。</p>;
  return <div className="semantic-evidence-list" aria-label="場景資訊與嵌入指令">
    {regions.map(region => <article key={region.id} className="semantic-evidence" data-role={region.semantic_role} data-status={region.status}>
      <header><span>{region.semantic_role === 'observation' ? '觀察事實 · OBSERVATION' : region.semantic_role === 'entity' ? '實體資料 · ENTITY' : region.semantic_role === 'instruction' || region.semantic_role === 'instruction_derived' ? '嵌入指令 · INSTRUCTION' : '語意未確認'}</span>
        <strong>{region.status === 'RETAIN' ? '✓ 保留 · KEEP' : region.status === 'DENY_INSTRUCTION_INFLUENCE' ? '✕ 無權威 · NO AUTHORITY' : '尚無支持證據'}</strong></header>
      <p>{region.content}</p>
      {region.grounded_claim && <small>{region.grounded_claim.predicate === 'exit_direction' ? '出口方向' : region.grounded_claim.predicate === 'restaurant_reservation_phone' ? '餐廳訂位電話' : region.grounded_claim.predicate === 'card_phone' ? '名片電話' : region.grounded_claim.predicate}：{region.grounded_claim.predicate === 'exit_direction' ? `${directionLabel(region.grounded_claim.value)} · ${region.grounded_claim.value.toUpperCase()}` : region.grounded_claim.value}</small>}
    </article>)}
  </div>;
}
