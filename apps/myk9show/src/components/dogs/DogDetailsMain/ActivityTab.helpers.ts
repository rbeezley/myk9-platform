import { getEntryStatusKind, isRemovedStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import { toLocalDate } from '@/utils/date-format';

export interface DogActivityEntry {
  id: string;
  entry_status?: string | null;
  result_status?: string | null;
  is_scored?: boolean | null;
  search_time_seconds?: number | null;
  final_placement?: string | number | null;
  show_id?: string | null;
  show?: { name?: string | null; start_date?: string | null; id?: string | null } | null;
  class?: { name?: string | null; id?: string | null } | null;
}

export interface DogActivity {
  upcoming: DogActivityEntry[];
  recentResults: DogActivityEntry[];
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseShowDate(entry: DogActivityEntry): Date | null {
  const raw = entry.show?.start_date;
  if (!raw) return null;
  const date = toLocalDate(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isTodayOrFuture(entry: DogActivityEntry, today: Date): boolean {
  const showDate = parseShowDate(entry);
  return showDate != null && showDate >= startOfLocalDay(today);
}

function isTodayOrPast(entry: DogActivityEntry, today: Date): boolean {
  const showDate = parseShowDate(entry);
  return showDate != null && showDate <= startOfLocalDay(today);
}

function isLiveUpcomingEntry(entry: DogActivityEntry, today: Date): boolean {
  const kind = getEntryStatusKind(entry.entry_status);
  return (
    isTodayOrFuture(entry, today) &&
    !isRemovedStatus(kind) &&
    kind !== 'completed' &&
    kind !== 'absent' &&
    kind !== 'moved'
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
    .sort((a, b) => (a.show?.start_date ?? '').localeCompare(b.show?.start_date ?? ''));

  const recentResults = entries
    .filter(entry => hasRealResult(entry, today))
    .sort((a, b) => (b.show?.start_date ?? '').localeCompare(a.show?.start_date ?? ''))
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
