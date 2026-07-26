import {
  TV_ACTIVE_STATUSES as TV_ACTIVE_STATUS_LIST,
  mapDogInfo,
  type TVDogInfo,
  type TVEntry,
  type TVShowInfo,
} from '@/pages/TVDisplay/types';

export const TV_ACTIVE_STATUSES = new Set<string>(TV_ACTIVE_STATUS_LIST);

export function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function mapJoinedDog(
  raw: {
    name: string;
    call_name: string | null;
    image_url: string | null;
  } | null
): TVDogInfo | null {
  return mapDogInfo(raw);
}

function sortTVEntries(a: TVEntry, b: TVEntry): number {
  if (a.isInRing && !b.isInRing) return -1;
  if (!a.isInRing && b.isInRing) return 1;
  return (a.runOrder ?? 999) - (b.runOrder ?? 999);
}

export function groupEntriesByClass(
  entries: TVEntry[],
  classIdByEntryId: Map<string, string>
): Map<string, TVEntry[]> {
  const grouped = new Map<string, TVEntry[]>();
  for (const entry of entries) {
    const classId = classIdByEntryId.get(entry.id);
    if (!classId) continue;
    const group = grouped.get(classId) ?? [];
    group.push(entry);
    grouped.set(classId, group);
  }
  for (const group of grouped.values()) {
    group.sort(sortTVEntries);
  }
  return grouped;
}

export function mapShow(show: {
  id: string;
  name: string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
}): TVShowInfo {
  return {
    id: show.id,
    name: show.name,
    startDate: show.startDate ?? show.start_date ?? '',
    endDate: show.endDate ?? show.end_date ?? '',
  };
}
