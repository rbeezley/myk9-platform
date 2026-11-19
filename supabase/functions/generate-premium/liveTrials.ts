/**
 * MYK9-2044: the trials a premium prints in its schedule: not cancelled and not soft-deleted.
 * The premium's recording fee line is derived in the app from the trial dates the schedule
 * prints, so filtering here also keeps a cancelled trial out of that line.
 *
 * MYK9-2186: returned in schedule order (date, then start time as a clock time, then id),
 * because the PostgREST embed has no order and the first live trial picks the premium template.
 */
export interface PremiumScheduleTrialRow {
  id?: string | null;
  date?: string | null;
  planned_start_time?: string | null;
  status?: string | null;
  deleted_at?: string | null;
}

/**
 * Minutes since midnight for a stored start time ("9:00 AM", "1:30 PM", "13:30", "09:00:00"),
 * or null when it cannot be read. A local mirror of `@myk9/core`'s `parseStoredClockTime`,
 * which this Deno module cannot import.
 */
export function storedStartMinutes(value: string | null | undefined): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([ap])\.?\s*m?\.?)?\s*$/i.exec(value ?? '');
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59 || hour > 23 || (meridiem && (hour < 1 || hour > 12))) return null;
  if (meridiem === 'a' && hour === 12) hour = 0;
  if (meridiem === 'p' && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

/** Missing or unreadable text sorts after every real value. */
function compareNullableText(a: string | null | undefined, b: string | null | undefined): number {
  if (a == null || b == null) return (a == null ? 1 : 0) - (b == null ? 1 : 0);
  return a.localeCompare(b);
}

function compareStartTime(a: string | null | undefined, b: string | null | undefined): number {
  const am = storedStartMinutes(a);
  const bm = storedStartMinutes(b);
  if (am === null || bm === null) return (am === null ? 1 : 0) - (bm === null ? 1 : 0);
  return am - bm;
}

function compareSchedule(a: PremiumScheduleTrialRow, b: PremiumScheduleTrialRow): number {
  return (
    compareNullableText(a.date, b.date) ||
    compareStartTime(a.planned_start_time, b.planned_start_time) ||
    compareNullableText(a.id, b.id)
  );
}

export function livePremiumTrials<T extends PremiumScheduleTrialRow>(
  trials: readonly T[] | null | undefined
): T[] {
  return (trials ?? [])
    .filter(trial => !trial.deleted_at && trial.status !== 'cancelled')
    .sort(compareSchedule);
}

/**
 * MYK9-2231: the classes a premium prints (labels, waitlist and fee lines): not cancelled
 * (classes.status, MYK9-1863) and not soft-deleted, in the order the trial lists them.
 */
export function livePremiumClasses<
  T extends { status?: string | null; deleted_at?: string | null },
>(classes: readonly T[] | null | undefined): T[] {
  return (classes ?? []).filter(cls => !cls.deleted_at && cls.status !== 'cancelled');
}
