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
