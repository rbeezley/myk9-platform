// The judge and street address an exhibitor email names (MYK9-1999). Deno-free, no imports.
//
// Needed by both edge-function trees: the card receipt (apps/myk9show/supabase/functions/
// stripe-webhook) and the check or cash receipt and full confirmation (supabase/functions).
// Each tree deploys on its own, so each carries a copy; exhibitorEmailDetailsParity.test.ts
// keeps the two copies byte-identical.

/** One `judge_assignments` row with its person, as `select('class_id, status, person:people(...)')` returns it. */
export interface JudgeAssignmentNameRow {
  class_id: string | null;
  status: string | null;
  person: {
    first_name: string | null;
    last_name: string | null;
    deleted_at?: string | null;
  } | null;
}

/** The columns `judge_assignments` is read with for these emails. */
export const JUDGE_ASSIGNMENT_NAME_SELECT =
  'class_id, status, person:people(first_name, last_name, deleted_at)' as const;

/** Said when a class has no confirmed judge yet (matches UNSET_JUDGE_LABEL in the app). */
export const JUDGE_TO_BE_ANNOUNCED = 'Judge to be announced';

/**
 * The judge's name per class. A class has one judge: its confirmed class-level assignment
 * (the same rule as get_show_judges readers in the app). Invited, declined or cancelled
 * assignments, and a deleted person, name nobody.
 */
export function judgeNamesByClass(
  rows: readonly JudgeAssignmentNameRow[] | null | undefined
): Map<string, string> {
  const byClass = new Map<string, string>();
  for (const row of rows ?? []) {
    if (!row.class_id || row.status !== 'confirmed' || !row.person) continue;
    if (row.person.deleted_at) continue;
    const name = [row.person.first_name, row.person.last_name]
      .map(part => part?.trim())
      .filter(Boolean)
      .join(' ');
    if (name && !byClass.has(row.class_id)) byClass.set(row.class_id, name);
  }
  return byClass;
}

/** "Judge Dana Whitlock", or "Judge to be announced". */
export function judgeLine(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? `Judge ${trimmed}` : JUDGE_TO_BE_ANNOUNCED;
}

/** The show columns a street address is built from. */
export interface ShowAddressFields {
  /** The address the secretary typed in the show wizard, as one text field (MYK9-2486). */
  location?: string | null;
  venue_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

/** "1200 Fairgrounds Rd, Springfield, IL 62701", or null when the show has no address parts. */
export function formatStreetAddress(show: ShowAddressFields | null | undefined): string | null {
  if (!show) return null;
  const stateZip = [show.state, show.zip_code]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ');
  const parts = [show.address, show.city, stateZip].map(part => part?.trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * The venue name and street address, one per line, or null when neither is known.
 *
 * MYK9-2486: the show wizard saves the address in `location` and fills none of the separate
 * address columns, so `location` is the address whenever it is set (My Shows and the show page
 * read it too). The separate columns are the fallback: a show with only a city and state prints
 * those.
 */
export function formatVenueLines(show: ShowAddressFields | null | undefined): string | null {
  const venueName = show?.venue_name?.trim();
  const typed = (show?.location ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (typed.length > 0) {
    const named = venueName && typed.join(' ').toLowerCase().includes(venueName.toLowerCase());
    return [named ? null : venueName, ...typed].filter(Boolean).join('\n');
  }
  const lines = [venueName, formatStreetAddress(show)].filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

/**
 * What a receipt says about the armband: it is given when the entry is accepted (the
 * auto_assign_armband_on_accept trigger), and the full confirmation carries it.
 */
export const RECEIPT_ARMBAND_NOTE =
  'Your armband number is given when the show secretary accepts your entry. We will email it to you then, with your judge and directions, and it will appear next to each dog in My Shows.';

/** Where every exhibitor email sends her: My Shows, which always has the current details. */
export function myShowsUrl(siteUrl: string | null | undefined): string {
  return `${(siteUrl || 'https://myk9show.com').replace(/\/+$/, '')}/exhibitor/entries`;
}
