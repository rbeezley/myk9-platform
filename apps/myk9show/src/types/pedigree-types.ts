/**
 * Pedigree types for the 3-generation ancestor tree.
 * Positions map to the six slots in a standard pedigree chart.
 */

export const PEDIGREE_POSITIONS = [
  'sire',
  'dam',
  'sire_grandsire',
  'sire_granddam',
  'dam_grandsire',
  'dam_granddam',
] as const;

export type PedigreePosition = (typeof PEDIGREE_POSITIONS)[number];

/** Human-readable display names for each position */
export const POSITION_DISPLAY_NAMES: Record<PedigreePosition, string> = {
  sire: 'Sire',
  dam: 'Dam',
  sire_grandsire: 'Grandsire (Sire)',
  sire_granddam: 'Granddam (Sire)',
  dam_grandsire: 'Grandsire (Dam)',
  dam_granddam: 'Granddam (Dam)',
};

/** Short display names for tree cards */
export const POSITION_SHORT_NAMES: Record<PedigreePosition, string> = {
  sire: 'Sire',
  dam: 'Dam',
  sire_grandsire: 'Grandsire',
  sire_granddam: 'Granddam',
  dam_grandsire: 'Grandsire',
  dam_granddam: 'Granddam',
};

export function isPedigreePosition(value: string): value is PedigreePosition {
  return (PEDIGREE_POSITIONS as readonly string[]).includes(value);
}

/** Multi-org registration numbers, e.g. {"AKC": "SS123", "UKC": "456"} */
export type RegistrationNumbers = Record<string, string>;

/** App-layer pedigree ancestor (mapped from DB) */
export interface PedigreeAncestor {
  id: string;
  dog_id: string;
  owner_id: string;
  position: PedigreePosition;
  linked_dog_id: string | null;
  registered_name: string;
  call_name: string | null;
  titles: string | null;
  breed: string | null;
  color: string | null;
  sex: 'male' | 'female' | null;
  date_of_birth: string | null;
  photo_url: string | null;
  registration_numbers: RegistrationNumbers;
  health_info: string | null;
  created_at: string;
  updated_at: string;
}

/** Data needed to create a new ancestor (id + timestamps auto-generated) */
export type CreatePedigreeAncestorData = Omit<PedigreeAncestor, 'id' | 'created_at' | 'updated_at'>;

/** Data for updating an ancestor (all fields optional except id context) */
export type UpdatePedigreeAncestorData = Partial<
  Omit<PedigreeAncestor, 'id' | 'dog_id' | 'owner_id' | 'created_at' | 'updated_at'>
>;

/** Format registration numbers for display */
export function formatRegistrationNumbers(regs: RegistrationNumbers): string {
  const entries = Object.entries(regs);
  if (entries.length === 0) return '';
  if (entries.length === 1) return `${entries[0][0]}: ${entries[0][1]}`;
  return entries.map(([org, num]) => `${org}: ${num}`).join(', ');
}
