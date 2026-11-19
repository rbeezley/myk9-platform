/**
 * MYK9-2056: the Trial Secretary and Trial Chair as the premium prints them.
 *
 * Officials live in `show_officials` (role + person), the table the Personnel tab writes. Migration
 * 20260830240000 retired the show-scoped `user_roles` secretary and chairman rows this function
 * used to read, so every generated premium came out with no secretary and no chair.
 */

/** The `show_officials` select: the role and the person's printable contact. */
export const PREMIUM_OFFICIALS_SELECT =
  'role, created_at, premium_mailing_address, people:person_id(first_name, last_name, email, phone)';

export interface PremiumOfficialRow {
  role: string | null;
  created_at?: string | null;
  premium_mailing_address?: string | null;
  people: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}

export interface PremiumOfficial {
  name: string;
  email: string | null;
  phone: string | null;
  /** MYK9-2065: typed for the premium on the show's official; null until the club enters one. */
  mailingAddress: string | null;
}

/**
 * The first-named official in `role` with a printable name, or null. A show may name more than
 * one person in a role; the premium prints the one named first.
 */
export function pickPremiumOfficial(
  rows: ReadonlyArray<PremiumOfficialRow> | null | undefined,
  role: 'secretary' | 'chairman'
): PremiumOfficial | null {
  const candidates = (rows ?? [])
    .filter(row => row.role === role && row.people)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  for (const row of candidates) {
    const person = row.people!;
    const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
    if (!name) continue;
    return {
      name,
      email: person.email ?? null,
      phone: person.phone ?? null,
      mailingAddress: row.premium_mailing_address?.trim() || null,
    };
  }
  return null;
}
