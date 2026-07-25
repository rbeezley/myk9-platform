/**
 * Pure ordering logic for the narrow-container Pedigree layout.
 *
 * Ancestors always render as Parents first, then Grandparents, each labeled
 * with an explicit relationship ("Sire", "Sire's Sire", ...) instead of a
 * bare position key. Kept dependency-free so it can be unit tested without
 * mounting any component.
 */
import type { PedigreePosition } from '@/types/pedigree-types';

export type PedigreeRelationshipGroupName = 'Parents' | 'Grandparents';

/** Explicit, plain-English relationship label for each pedigree slot. */
export const RELATIONSHIP_LABELS: Record<PedigreePosition, string> = {
  sire: 'Sire',
  dam: 'Dam',
  sire_grandsire: "Sire's Sire",
  sire_granddam: "Sire's Dam",
  dam_grandsire: "Dam's Sire",
  dam_granddam: "Dam's Dam",
};

export interface PedigreeRelationshipGroup {
  group: PedigreeRelationshipGroupName;
  positions: PedigreePosition[];
}

/**
 * Fixed Parents-then-Grandparents ordering. This is the mechanism a refactor
 * must not silently revert — narrow layouts must keep this exact order and
 * these exact labels rather than falling back to a clipped visual tree.
 */
export const PEDIGREE_RELATIONSHIP_GROUPS: readonly PedigreeRelationshipGroup[] = [
  { group: 'Parents', positions: ['sire', 'dam'] },
  {
    group: 'Grandparents',
    positions: ['sire_grandsire', 'sire_granddam', 'dam_grandsire', 'dam_granddam'],
  },
] as const;

/** Flattened, ordered list of {group, position, label} for rendering. */
export interface PedigreeRelationshipSlot {
  group: PedigreeRelationshipGroupName;
  position: PedigreePosition;
  label: string;
}

export function getOrderedPedigreeRelationshipSlots(): PedigreeRelationshipSlot[] {
  return PEDIGREE_RELATIONSHIP_GROUPS.flatMap(({ group, positions }) =>
    positions.map(position => ({ group, position, label: RELATIONSHIP_LABELS[position] }))
  );
}
