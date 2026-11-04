export const LUNCH_ROLES = [
  { id: 'judge', label: 'Judge' },
  { id: 'steward', label: 'Steward' },
  { id: 'secretary', label: 'Secretary' },
  { id: 'volunteer', label: 'Volunteer' },
  { id: 'club_member', label: 'Club member' },
  { id: 'exhibitor', label: 'Exhibitor' },
  { id: 'other', label: 'Other' },
] as const;

export type LunchRole = (typeof LUNCH_ROLES)[number]['id'];

export function lunchRoleLabel(role: LunchRole): string {
  return LUNCH_ROLES.find(item => item.id === role)?.label ?? 'Other';
}

export const LUNCH_TEXT_MAX = 500;
export const LUNCH_NAME_MAX = 200;

/** A `trial_lunch_orders` row as the app reads it. */
export interface LunchOrderRow {
  id: string;
  trial_id: string;
  person_id: string | null;
  name: string;
  role: LunchRole;
  lunch_order: string | null;
  dietary_note: string | null;
}

/** Someone already assigned to the day, before any lunch order is typed. */
export interface LunchCandidate {
  personId: string | null;
  name: string;
  role: LunchRole;
}

export interface LunchListItem {
  /** Stable across saves so the row keeps its typed text and focus. */
  key: string;
  savedId: string | null;
  personId: string | null;
  name: string;
  role: LunchRole;
  lunchOrder: string;
  dietaryNote: string;
  /** True when the person is on the day's assignments (judges, officials, volunteers). */
  assigned: boolean;
}

// A person can hold two jobs in a day (a judge who also stewards); keep the first listed here.
const ROLE_PRIORITY: Record<LunchRole, number> = {
  judge: 0,
  secretary: 1,
  steward: 2,
  volunteer: 3,
  club_member: 4,
  exhibitor: 5,
  other: 6,
};

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function dedupeCandidates(candidates: readonly LunchCandidate[]): LunchCandidate[] {
  const byKey = new Map<string, LunchCandidate>();
  for (const candidate of candidates) {
    const name = candidate.name.trim();
    if (!name) continue;
    const key = candidate.personId ? `p:${candidate.personId}` : `n:${nameKey(name)}`;
    const existing = byKey.get(key);
    if (!existing || ROLE_PRIORITY[candidate.role] < ROLE_PRIORITY[existing.role]) {
      byKey.set(key, { ...candidate, name });
    }
  }
  return [...byKey.values()];
}

/**
 * The day's Lunch orders list: everyone assigned that day, then anyone added by hand.
 * Assigned people appear with empty fields and are NOT rows in the database until something is
 * typed, so viewing the list never writes. A saved row wins over its candidate so typed text shows.
 */
export function buildLunchOrderList(
  saved: readonly LunchOrderRow[],
  candidates: readonly LunchCandidate[]
): LunchListItem[] {
  const savedByPerson = new Map<string, LunchOrderRow>();
  const savedByName = new Map<string, LunchOrderRow>();
  for (const row of saved) {
    if (row.person_id) savedByPerson.set(row.person_id, row);
    else if (!savedByName.has(nameKey(row.name))) savedByName.set(nameKey(row.name), row);
  }

  const used = new Set<string>();
  const items: LunchListItem[] = [];

  for (const candidate of dedupeCandidates(candidates)) {
    const row = candidate.personId
      ? savedByPerson.get(candidate.personId)
      : savedByName.get(nameKey(candidate.name));
    if (row) used.add(row.id);
    items.push({
      key: candidate.personId ? `p:${candidate.personId}` : `n:${nameKey(candidate.name)}`,
      savedId: row?.id ?? null,
      personId: candidate.personId,
      name: row?.name ?? candidate.name,
      role: row?.role ?? candidate.role,
      lunchOrder: row?.lunch_order ?? '',
      dietaryNote: row?.dietary_note ?? '',
      assigned: true,
    });
  }

  for (const row of saved) {
    if (used.has(row.id)) continue;
    items.push({
      key: `s:${row.id}`,
      savedId: row.id,
      personId: row.person_id,
      name: row.name,
      role: row.role,
      lunchOrder: row.lunch_order ?? '',
      dietaryNote: row.dietary_note ?? '',
      assigned: false,
    });
  }

  return items.sort(
    (a, b) =>
      ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role] ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

/** Blank text is stored as NULL so an untouched field never reads as an order. */
export function cleanLunchText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, LUNCH_TEXT_MAX);
}
