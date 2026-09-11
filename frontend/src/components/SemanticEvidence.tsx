import type { SemanticRegion } from '../types';
import { directionLabel } from '../labels';

/** These are policy-returned regions, never a frontend classifier or fixture. */
export function SemanticEvidence({ regions }: { regions: SemanticRegion[] }) {
  if (!regions.length) return <p className="empty-copy">No semantic regions are available for this run.</p>;
  return <div className="semantic-evidence-list" aria-label="Scene information and embedded instructions">
    {regions.map(region => <article key={region.id} className="semantic-evidence" data-role={region.semantic_role} data-status={region.status}>
      <header><span>{region.semantic_role === 'observation' ? 'Observation' : region.semantic_role === 'entity' ? 'Entity data' : region.semantic_role === 'instruction' || region.semantic_role === 'instruction_derived' ? 'Embedded instruction' : 'Semantics unresolved'}</span>
        <strong>{region.status === 'RETAIN' ? '✓ Keep' : region.status === 'DENY_INSTRUCTION_INFLUENCE' ? '✕ No authority' : 'No supporting evidence'}</strong></header>
      <p>{region.content}</p>
      {region.grounded_claim && <small>{region.grounded_claim.predicate === 'exit_direction' ? 'Exit direction' : region.grounded_claim.predicate === 'restaurant_reservation_phone' ? 'Restaurant reservation phone' : region.grounded_claim.predicate === 'card_phone' ? 'Business card phone' : region.grounded_claim.predicate}: {region.grounded_claim.predicate === 'exit_direction' ? directionLabel(region.grounded_claim.value) : region.grounded_claim.value}</small>}
    </article>)}
  </div>;
}
