import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { TVClass, TVDogInfo, TVEntry, TVShowInfo } from './types';

export const TV_ACTIVE_STATUSES = new Set([
  'In Progress',
  'Scheduled',
  'in_progress',
  'briefing',
  'setup',
  'start_time',
]);

export function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isDeleted(row: {
  deletedAt?: string | null | undefined;
  deleted_at?: string | null | undefined;
}): boolean {
  return Boolean(row.deletedAt ?? row.deleted_at);
}

export function getClassStatus(cls: ReplicatedClass): string | null {
  return (
    cls.classStatus ?? (((cls as unknown as Record<string, unknown>).status as string) || null)
  );
}

export function getJudgeName(cls: ReplicatedClass): string | null {
  if (cls.judgeFirstName || cls.judgeLastName) {
    return [cls.judgeFirstName, cls.judgeLastName].filter(Boolean).join(' ').trim() || null;
  }
  return cls.judgeName ?? null;
}

export function mapReplicatedDog(dog: ReplicatedDog | null | undefined): TVDogInfo | null {
  if (!dog) return null;
  return {
    name: dog.name,
    callName: dog.callName ?? null,
    breed: dog.breed ?? null,
    imageUrl: dog.imageUrl ?? null,
  };
}

export function mapJoinedDog(
  raw: {
    name: string;
    call_name: string | null;
    breed: string | null;
    image_url: string | null;
  } | null
): TVDogInfo | null {
  if (!raw) return null;
  return {
    name: raw.name,
    callName: raw.call_name,
    breed: raw.breed,
    imageUrl: raw.image_url,
  };
}

export function getEntryIsInRing(entry: ReplicatedEntry): boolean {
  return entry.isInRing ?? entry.is_in_ring ?? false;
}

export function getEntryIsScored(entry: ReplicatedEntry): boolean {
  return entry.isScored ?? entry.is_scored ?? false;
}

export function getEntryResultStatus(entry: ReplicatedEntry): string | null {
  return entry.resultStatus ?? entry.result_status ?? null;
}

export function getEntrySearchTime(entry: ReplicatedEntry): number | null {
  return entry.searchTimeSeconds ?? entry.search_time_seconds ?? null;
}

export function getEntryTotalScore(entry: ReplicatedEntry): number | null {
  const raw = entry as unknown as Record<string, unknown>;
  return (
    (raw.totalScore as number | null | undefined) ??
    entry.totalPoints ??
    entry.total_points ??
    (raw.total_score as number | null | undefined) ??
    null
  );
}

export function getEntryFinalPlacement(entry: ReplicatedEntry): number | null {
  return toNullableNumber(entry.finalPlacement ?? entry.final_placement);
}

export function mapReplicatedEntry(
  entry: ReplicatedEntry,
  dog: ReplicatedDog | null | undefined
): TVEntry {
  return {
    id: entry.id,
    armband: entry.armband ?? null,
    handler: entry.handler ?? entry.handlerName ?? entry.handler_name ?? null,
    runOrder: entry.runOrder ?? null,
    isInRing: getEntryIsInRing(entry),
    isScored: getEntryIsScored(entry),
    dog: mapReplicatedDog(dog),
  };
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

export function mapClass(
  cls: ReplicatedClass,
  trial: ReplicatedTrial | undefined,
  entries: TVEntry[],
  allClassEntries: ReplicatedEntry[]
): TVClass {
  return {
    id: cls.id,
    name: cls.name,
    element: cls.element ?? null,
    level: cls.level ?? null,
    status: getClassStatus(cls),
    judgeName: getJudgeName(cls),
    totalEntries: cls.totalEntriesCount ?? allClassEntries.length,
    scoredCount: cls.scoredCount ?? allClassEntries.filter(getEntryIsScored).length,
    startTime: cls.startTime ?? null,
    trialDate: trial?.date ?? null,
    trialNumber: toNullableNumber(trial?.trialNumber),
    entries,
  };
}
