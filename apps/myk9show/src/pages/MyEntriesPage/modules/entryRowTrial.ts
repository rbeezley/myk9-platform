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
 * The IANA zone of the trial a class row belongs to.
 *
 * The show-day check-in gate compares calendar days in the TRIAL's zone, so
 * every class row must carry one. `getTrialTimezone` is idempotent here (the
 * replication path already resolved it) and supplies the migration default when
 * the trial relation has not replicated yet.
 */
export function resolveTrialTimezone(
  trial: EntryRowTrial | null | undefined,
  classTrial: EntryRowTrial | null | undefined
): string {
  return getTrialTimezone({
    id: trial?.id ?? classTrial?.id,
    timezone: trial?.timezone ?? classTrial?.timezone ?? null,
  });
}
