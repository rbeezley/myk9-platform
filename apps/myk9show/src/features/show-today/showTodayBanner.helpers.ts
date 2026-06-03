export interface HydratedAccountTodayEntry {
  entryId: string;
  showId: string;
  showName: string;
  classId: string | null;
  trialId: string | null;
  className: string | null;
  classStartTime: string | null;
}

export interface ShowTodayBannerItem {
  showId: string;
  showName: string;
  earliestClassTime: string | null;
  entryCount: number;
  classCount: number;
}

export type ShowTodayBannerVariant = 'hidden' | 'single' | 'stacked';

/**
 * Format a class start time for display as "h:mm AM/PM".
 *
 * The upstream value arrives from three different sources (class.startTime,
 * trial.plannedStartTime, or the RPC row), so it may be raw 24h ("08:00",
 * "08:00:00") OR already carry a meridiem ("8:00 AM"). The previous formatter
 * assumed raw 24h and naively re-appended a period, producing "8:00 AM AM".
 * This normalizes every shape and never double-appends.
 */
export function formatClassTime(time: string | null | undefined): string {
  if (!time) return 'Time pending';
  const trimmed = time.trim();
  if (!trimmed) return 'Time pending';

  // Honor an existing meridiem rather than re-deriving (and re-appending) one.
  const meridiemMatch = trimmed.match(/\b([AP]M)\b/i);
  const existingMeridiem = meridiemMatch?.[1]?.toUpperCase() as 'AM' | 'PM' | undefined;

  const timeOnly = trimmed.replace(/\s*[AP]M\b/i, '').trim();
  const [hourRaw = '', minuteRaw = ''] = timeOnly.split(':');
  const hourNumber = Number(hourRaw);
  if (!Number.isFinite(hourNumber)) return trimmed; // unparseable — show as-is

  const minute = (minuteRaw.match(/\d+/)?.[0] ?? '0').padStart(2, '0').slice(0, 2);
  const period = existingMeridiem ?? (hourNumber >= 12 ? 'PM' : 'AM');
  const displayHour = hourNumber % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function compareNullableTimes(a: string | null, b: string | null): number {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}

export function buildShowTodayBannerItems(
  entries: HydratedAccountTodayEntry[]
): ShowTodayBannerItem[] {
  const byShow = new Map<
    string,
    {
      showName: string;
      earliestClassTime: string | null;
      entryIds: Set<string>;
      classIds: Set<string>;
    }
  >();

  for (const entry of entries) {
    const existing =
      byShow.get(entry.showId) ??
      ({
        showName: entry.showName,
        earliestClassTime: null,
        entryIds: new Set<string>(),
        classIds: new Set<string>(),
      } satisfies {
        showName: string;
        earliestClassTime: string | null;
        entryIds: Set<string>;
        classIds: Set<string>;
      });

    existing.entryIds.add(entry.entryId);
    if (entry.classId) existing.classIds.add(entry.classId);
    if (compareNullableTimes(entry.classStartTime, existing.earliestClassTime) < 0) {
      existing.earliestClassTime = entry.classStartTime;
    }
    byShow.set(entry.showId, existing);
  }

  return Array.from(byShow.entries())
    .map(([showId, value]) => ({
      showId,
      showName: value.showName,
      earliestClassTime: value.earliestClassTime,
      entryCount: value.entryIds.size,
      classCount: value.classIds.size,
    }))
    .sort((a, b) => compareNullableTimes(a.earliestClassTime, b.earliestClassTime));
}

export function getShowTodayBannerVariant(
  items: ShowTodayBannerItem[]
): ShowTodayBannerVariant {
  if (items.length === 0) return 'hidden';
  return items.length === 1 ? 'single' : 'stacked';
}
