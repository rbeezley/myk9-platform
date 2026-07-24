import { describe, it, expect } from 'vitest';
import {
  PEDIGREE_RELATIONSHIP_GROUPS,
  RELATIONSHIP_LABELS,
  getOrderedPedigreeRelationshipSlots,
} from './pedigreeRelationshipGroups';

describe('pedigree relationship group ordering', () => {
  it('pins Parents before Grandparents', () => {
    expect(PEDIGREE_RELATIONSHIP_GROUPS.map(g => g.group)).toEqual(['Parents', 'Grandparents']);
  });

  it('pins the exact Parents positions in Sire, Dam order', () => {
    expect(PEDIGREE_RELATIONSHIP_GROUPS[0]?.positions).toEqual(['sire', 'dam']);
  });

  it('pins the exact Grandparents positions in sire-side-then-dam-side order', () => {
    expect(PEDIGREE_RELATIONSHIP_GROUPS[1]?.positions).toEqual([
      'sire_grandsire',
      'sire_granddam',
      'dam_grandsire',
      'dam_granddam',
    ]);
  });

  it('pins explicit relationship labels for every position', () => {
    expect(RELATIONSHIP_LABELS).toEqual({
      sire: 'Sire',
      dam: 'Dam',
      sire_grandsire: "Sire's Sire",
      sire_granddam: "Sire's Dam",
      dam_grandsire: "Dam's Sire",
      dam_granddam: "Dam's Dam",
    });
  });

  it('flattens to the full ordered Parents-then-Grandparents slot list with labels', () => {
    expect(getOrderedPedigreeRelationshipSlots()).toEqual([
      { group: 'Parents', position: 'sire', label: 'Sire' },
      { group: 'Parents', position: 'dam', label: 'Dam' },
      { group: 'Grandparents', position: 'sire_grandsire', label: "Sire's Sire" },
      { group: 'Grandparents', position: 'sire_granddam', label: "Sire's Dam" },
      { group: 'Grandparents', position: 'dam_grandsire', label: "Dam's Sire" },
      { group: 'Grandparents', position: 'dam_granddam', label: "Dam's Dam" },
    ]);
  });
});
