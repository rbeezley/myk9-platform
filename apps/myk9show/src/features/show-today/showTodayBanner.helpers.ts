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
 * Parse a class start time into 24h hour + minute components.
 *
 * The upstream value arrives from three different sources (class.startTime,
 * trial.plannedStartTime, or the RPC row), so it may be raw 24h ("08:00",
 * "08:00:00") OR already carry a meridiem ("8:00 AM"). Returns null when the
 * value can't be parsed.
 */
function parseClassTimeParts(time: string): { hour24: number; minute: number } | null {
  const trimmed = time.trim();
  if (!trimmed) return null;

  const meridiem = trimmed.match(/\b([AP]M)\b/i)?.[1]?.toUpperCase() as 'AM' | 'PM' | undefined;
  const timeOnly = trimmed.replace(/\s*[AP]M\b/i, '').trim();
  const [hourRaw = '', minuteRaw = ''] = timeOnly.split(':');
  let hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return null;

  const minute = Number(minuteRaw.match(/\d+/)?.[0] ?? '0');
  if (meridiem === 'AM') hour = hour === 12 ? 0 : hour;
  else if (meridiem === 'PM') hour = hour === 12 ? 12 : hour + 12;

  return { hour24: hour, minute };
}

/**
 * Minutes-since-midnight for a class time, or null if unparseable. Used to order
 * times numerically — a raw lexicographic compare ranks "1:30 PM" before
 * "8:00 AM" because "1" < "8".
 */
export function classTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const parts = parseClassTimeParts(time);
  return parts ? parts.hour24 * 60 + parts.minute : null;
}

/**
 * Format a class start time for display as "h:mm AM/PM". Normalizes every shape
 * and never double-appends a meridiem (the old formatter produced "8:00 AM AM").
 */
export function formatClassTime(time: string | null | undefined): string {
  if (!time) return 'Time pending';
  const trimmed = time.trim();
  if (!trimmed) return 'Time pending';

  const parts = parseClassTimeParts(trimmed);
  if (!parts) return trimmed; // unparseable — show as-is

  const minute = String(parts.minute).padStart(2, '0');
  const period = parts.hour24 >= 12 ? 'PM' : 'AM';
  const displayHour = parts.hour24 % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function compareNullableTimes(a: string | null, b: string | null): number {
  const am = classTimeToMinutes(a);
  const bm = classTimeToMinutes(b);
  if (am !== null && bm !== null) return am - bm;
  if (am !== null) return -1;
  if (bm !== null) return 1;
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
