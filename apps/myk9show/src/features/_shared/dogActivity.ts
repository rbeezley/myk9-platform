// Canonical derivation of a single dog's upcoming entries and recent results.
//
// Lives here rather than beside one component because more than one dog surface
// renders "what is this dog entered in next": the Overview activity card and
// Career -> Competitions -> Upcoming Shows. Career previously read a
// client-only Zustand store instead, so it rendered "No Upcoming Shows" for
// every dog while Overview listed real entries (MYK9-121). Both now compose
// this module through `useDogActivity`, so they agree by construction rather
// than by two components happening to filter the same way.
//
// Pair it with `getEntriesByDog`, which is online-first and reports whether the
// rows it returned are authoritative — this derivation cannot tell "no entries"
// from "not synced yet", so that judgement has to live in the read, not here.
import { getEntryStatusKind, isRemovedStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import { toLocalDate } from '@/utils/date-format';
import { isAccountedFor, isExpectedEntry } from '@/features/_shared/entryAccounting';
import { isTrialDayAhead, isTrialDayToday } from '@/pages/MyEntriesPage/modules/dayCheckIn';
import { getTrialTimezone } from '@/features/registries';

export interface DogActivityEntry {
  id: string;
  entry_status?: string | null;
  check_in_status?: string | null;
  deleted_at?: string | null;
  result_status?: string | null;
  is_scored?: boolean | null;
  search_time_seconds?: number | null;
  final_placement?: string | number | null;
  show_id?: string | null;
  show?: {
    name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    id?: string | null;
  } | null;
  class?: { name?: string | null; id?: string | null } | null;
  /** This entry's OWN trial day — a multi-day show has one trial per day. */
  trial?: { date?: string | null; timezone?: string | null } | null;
}

/**
 * The calendar date to show for one entry: its own trial's day when known,
 * else the show's start date (legacy rows / pending offline writes whose
 * trial join hasn't landed — see `getEntriesByDog`'s pending-overlay comment).
 * A multi-day show shares one start date across every trial, so this is what
 * makes each row read its own day instead of the show's first day for all of
 * them (MYK9-806).
 */
export function getEntryDisplayDate(entry: DogActivityEntry): string | null {
  return entry.trial?.date ?? entry.show?.start_date ?? null;
}

export interface DogActivity {
  upcoming: DogActivityEntry[];
  recentResults: DogActivityEntry[];
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseShowDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const date = toLocalDate(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isTodayOrFuture(entry: DogActivityEntry, today: Date): boolean {
  // Prefer the entry's OWN trial day, reckoned in the trial's timezone (same
  // rule My Shows' day check-in gate uses) — a multi-day show shares one
  // start/end date across every trial, so gating on those instead lets a
  // past, unrun trial from an in-progress show read as still upcoming
  // (MYK9-806). Falls back to the show-date rule for rows whose trial join
  // hasn't landed yet (legacy rows, pending offline writes).
  const trialDate = parseShowDate(entry.trial?.date);
  if (trialDate) {
    const timezone = getTrialTimezone(entry.trial);
    return (
      isTrialDayToday(trialDate, timezone, today) || isTrialDayAhead(trialDate, timezone, today)
    );
  }
  // An unscored class is still ahead during a multi-day show, even after its
  // first day. The dog read supplies end_date online and from the replica.
  const showDate = parseShowDate(entry.show?.end_date ?? entry.show?.start_date);
  return showDate != null && showDate >= startOfLocalDay(today);
}

function isTodayOrPast(entry: DogActivityEntry, today: Date): boolean {
  const showDate = parseShowDate(entry.show?.start_date);
  return showDate != null && showDate <= startOfLocalDay(today);
}

function isLiveUpcomingEntry(entry: DogActivityEntry, today: Date): boolean {
  // Preserve display aliases such as promotion-expired, which the accounting
  // rule does not list because they are not canonical scoring statuses.
  const kind = getEntryStatusKind(entry.entry_status);
  // Direct authenticated reads cannot select result_status. Do not use a raw
  // replica result here either: an unscored excused row is indistinguishable
  // from a pending run without a release-safe own-entry projection.
  const accountingEntry = {
    entry_status: entry.entry_status ?? undefined,
    check_in_status: entry.check_in_status ?? undefined,
    deleted_at: entry.deleted_at ?? undefined,
    is_scored: entry.is_scored ?? undefined,
  };
  return (
    isTodayOrFuture(entry, today) &&
    !isRemovedStatus(kind) &&
    isExpectedEntry(accountingEntry) &&
    !isAccountedFor(accountingEntry)
  );
}

function hasRealResult(entry: DogActivityEntry, today: Date): boolean {
  const kind = getEntryStatusKind(entry.entry_status);
  return (
    entry.is_scored === true &&
    entry.result_status != null &&
    entry.result_status !== 'pending' &&
    !isRemovedStatus(kind) &&
    isTodayOrPast(entry, today)
  );
}

export function deriveDogActivity(
  entries: DogActivityEntry[],
  today: Date = new Date()
): DogActivity {
  const upcoming = entries
    .filter(entry => isLiveUpcomingEntry(entry, today))
    .sort((a, b) => (getEntryDisplayDate(a) ?? '').localeCompare(getEntryDisplayDate(b) ?? ''));

  const recentResults = entries
    .filter(entry => hasRealResult(entry, today))
    .sort((a, b) => (getEntryDisplayDate(b) ?? '').localeCompare(getEntryDisplayDate(a) ?? ''))
    .slice(0, 10);

  return { upcoming, recentResults };
}

export function formatActivityDate(
  date?: string | null
): { weekday: string; monthDay: string } | null {
  if (!date) return null;
  const parsed = toLocalDate(date);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    weekday: parsed.toLocaleDateString('en-US', { weekday: 'short' }),
    monthDay: parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}
