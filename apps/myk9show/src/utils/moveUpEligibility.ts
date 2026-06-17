/**
 * Move-up eligibility — the single source of truth for "is class B a valid
 * move-up target from class A?"
 *
 * AKC Scent Work move-ups promote a dog to a HIGHER level within the SAME
 * element (Container / Interior / Exterior / Buried / Handler Discrimination).
 * Moving across elements, or to a lower/equal level, is not a move-up.
 *
 * ASSUMPTION: same element + strictly higher level. If a registry ever permits
 * cross-element moves, relax the element check here — every surface (Entries
 * Management, Show Map, Show Desk) and the write-path mutation share this rule,
 * so changing it once keeps them consistent.
 */
import { levelProgressionRank } from '@/features/premium/pdf/bodies/classOrder';

export interface MoveUpClassIdentity {
  element?: string | null | undefined;
  level?: string | null | undefined;
}

/**
 * True when `candidate` is a valid move-up destination from `current`:
 * same element, strictly higher level. Returns false when either class lacks
 * a resolvable element/level (the conservative choice — never validate a move
 * we can't reason about).
 */
export function isEligibleMoveUpTarget(
  current: MoveUpClassIdentity,
  candidate: MoveUpClassIdentity
): boolean {
  if (!current.element || !current.level) return false;
  if (!candidate.element || !candidate.level) return false;
  if (candidate.element !== current.element) return false;
  return levelProgressionRank(candidate.level) > levelProgressionRank(current.level);
}
