/**
 * The trial relation as it rides on a raw `getUserEntries` row, and the one
 * rule for reading a class row's timezone off it.
 *
 * Both the PostgREST embed (`trial:trial_id(...)`) and the replication mapper
 * produce this shape, and the row carries it twice — once as `entry.trial`,
 * once through `entry.class.trial` for legacy rows with a null `trial_id`.
 *
 * @module MyEntriesPage/modules/entryRowTrial
 */

import { getTrialTimezone } from '@/features/registries';

export interface EntryRowTrial {
  id?: string;
  trial_type?: string;
  date?: string;
  trial_number?: string | null;
  timezone?: string | null;
}

/**
 * The IANA zone of the trial a class row belongs to, or `undefined` when no
 * trial relation has replicated yet.
 *
 * "Not known yet" is a state of its own, and it must NOT arrive downstream
 * disguised as a real zone. `getTrialTimezone` answers `America/New_York` for
 * an absent trial, which is the right default for DISPLAY but a wrong answer
 * for any decision: a Los Angeles show judged in New York time crosses
 * midnight three hours early, and on an entry-close date that retires the
 * exhibitor's edit control while the server still accepts the edit
 * (Codex, PR #2201). Callers that need a concrete zone still apply the default
 * themselves; callers deciding a deadline must treat `undefined` as unknown.
 *
 * A zone that IS present still goes through `getTrialTimezone`, so an invalid
 * IANA value is validated and reported exactly as before.
 */
export function resolveTrialTimezone(
  trial: EntryRowTrial | null | undefined,
  classTrial: EntryRowTrial | null | undefined
): string | undefined {
  const raw = trial?.timezone ?? classTrial?.timezone ?? null;
  if (!raw) return undefined;
  return getTrialTimezone({ id: trial?.id ?? classTrial?.id, timezone: raw });
}
