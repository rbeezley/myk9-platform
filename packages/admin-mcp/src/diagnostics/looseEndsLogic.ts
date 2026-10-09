/**
 * Pure helpers for `diagnose_show_loose_ends` (MYK9-1059): no database access,
 * so every rule here is unit-testable on plain fixtures.
 */

/**
 * HEURISTIC WINDOW (a guess, never recorded fact).
 *
 * Rows created before migration 20261009174300 carry no `created_from_show_id`,
 * so "was this dog added through the show's add-entry flow?" cannot be answered
 * from the row. The only evidence left is timing: the add-entry flow creates a
 * dog or person moments before (or instead of) the entry it was for, so rows
 * created while the show's entries were being keyed are candidates.
 *
 * A "session" is a run of the show's live entries whose consecutive
 * `created_at` gaps are each at most {@link SESSION_GAP_MS}. Its window is the
 * first to last entry of the run, widened by {@link WINDOW_PAD_MS} on each
 * side so a dog created and abandoned just before the first entry, or just
 * after the last, still falls inside. The span of the whole entry period is
 * deliberately NOT used: online entries trickle in for weeks and would sweep
 * in every unrelated orphan row.
 */
export const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
export const WINDOW_PAD_MS = 30 * 60 * 1000;

export interface ActivityWindow {
  startMs: number;
  endMs: number;
}

export function buildActivityWindows(createdAts: ReadonlyArray<string | null>): ActivityWindow[] {
  const times = createdAts
    .map(value => (value ? Date.parse(value) : Number.NaN))
    .filter(ms => Number.isFinite(ms))
    .sort((a, b) => a - b);
  const windows: ActivityWindow[] = [];
  let start: number | null = null;
  let last = 0;
  for (const ms of times) {
    if (start === null) {
      start = ms;
    } else if (ms - last > SESSION_GAP_MS) {
      windows.push({ startMs: start - WINDOW_PAD_MS, endMs: last + WINDOW_PAD_MS });
      start = ms;
    }
    last = ms;
  }
  if (start !== null) {
    windows.push({ startMs: start - WINDOW_PAD_MS, endMs: last + WINDOW_PAD_MS });
  }
  return windows;
}

export function inAnyWindow(iso: string | null, windows: readonly ActivityWindow[]): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && windows.some(w => ms >= w.startMs && ms <= w.endMs);
}

export function describeWindows(windows: readonly ActivityWindow[]): string {
  if (windows.length === 0) return 'no live entries, so no window could be built';
  return windows
    .map(w => `${new Date(w.startMs).toISOString()} to ${new Date(w.endMs).toISOString()}`)
    .join('; ');
}

/**
 * Entry statuses (stored values, from `entries_entry_status_check` in migration
 * 20260924094300; a test checks each against that file) that mean the entry no
 * longer holds a place, so two of them for the same dog and class are history,
 * not a duplicate.
 */
export const INACTIVE_ENTRY_STATUSES: ReadonlySet<string> = new Set([
  'withdrawn',
  'scratched',
  'not_accepted',
  'moved',
  'promotion-expired',
]);

export interface LooseEntry {
  id: string;
  dog_id: string | null;
  class_id: string | null;
  registration_id: string | null;
  handler_id: string | null;
  entry_status: string | null;
  confirmation_email_status: string | null;
  created_at: string | null;
}

/** Groups of two or more place-holding live entries for one dog and class. */
export function findDuplicateEntryGroups(entries: readonly LooseEntry[]): LooseEntry[][] {
  const byKey = new Map<string, LooseEntry[]>();
  for (const entry of entries) {
    if (!entry.dog_id || !entry.class_id) continue;
    if (entry.entry_status && INACTIVE_ENTRY_STATUSES.has(entry.entry_status)) continue;
    const key = `${entry.dog_id}|${entry.class_id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  return [...byKey.values()].filter(group => group.length > 1);
}

/**
 * Server-side states that are detectable on the entry row. Values are the real
 * ones: `entry_status` 'draft' / 'pending-payment' (entries_entry_status_check)
 * and `confirmation_email_status` 'failed' / 'bounced'
 * (confirmation_email_status check, migration 192). There is no 'pending' or
 * 'failed' entry_status; payment_status 'pending' is the normal state of every
 * unpaid or pay-at-show entry and is therefore NOT flagged.
 */
export function stuckReasons(entry: LooseEntry): string[] {
  const reasons: string[] = [];
  if (entry.entry_status === 'draft') {
    reasons.push("entry_status 'draft': started but never submitted (may be in progress)");
  }
  if (entry.entry_status === 'pending-payment') {
    reasons.push("entry_status 'pending-payment': waitlist offer not yet paid");
  }
  if (
    entry.confirmation_email_status === 'failed' ||
    entry.confirmation_email_status === 'bounced'
  ) {
    reasons.push(`confirmation_email_status '${entry.confirmation_email_status}'`);
  }
  return reasons;
}

/** Split into chunks so an `in (...)` filter stays under URL limits. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
