import type {
  ReplicatedClass,
  ReplicatedEntry,
  ReplicatedShow,
  ReplicatedTrial,
} from '@/services/replication';
import type { HydratedAccountTodayEntry } from './showTodayBanner.helpers';

const FAVORITES_KEY_PREFIX = 'favorites';

export interface AccountTodayEntryId {
  entry_id: string;
}

interface ReplicatedRows {
  entries: ReplicatedEntry[];
  classes: ReplicatedClass[];
  trials: ReplicatedTrial[];
  shows: ReplicatedShow[];
}

function buildClassName(cls: ReplicatedClass): string {
  const section = cls.section && cls.section !== '-' ? ` ${cls.section}` : '';
  const elementLevel = `${cls.element ?? ''} ${cls.level ?? ''}${section}`.trim();
  return elementLevel || cls.name;
}

function readJsonArray(key: string): string[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, values: string[]): void {
  localStorage.setItem(key, JSON.stringify(values));
}

export function buildFavoriteStorageKey(showId: string, trialId: string): string {
  return `${FAVORITES_KEY_PREFIX}_${showId}_${trialId}`;
}

export function getFavoriteClassIdsForTrial(showId: string, trialId: string): Set<string> {
  return new Set(readJsonArray(buildFavoriteStorageKey(showId, trialId)));
}

export function hydrateAccountTodayEntriesFromReplicatedRows(
  accountEntryIds: AccountTodayEntryId[],
  rows: ReplicatedRows
): HydratedAccountTodayEntry[] {
  const allowedIds = new Set(accountEntryIds.map(row => row.entry_id));
  const classesById = new Map(rows.classes.map(cls => [cls.id, cls]));
  const trialsById = new Map(rows.trials.map(trial => [trial.id, trial]));
  const showsById = new Map(rows.shows.map(show => [show.id, show]));
  const hydrated: HydratedAccountTodayEntry[] = [];

  for (const entry of rows.entries) {
    if (!allowedIds.has(entry.id)) continue;

    const cls = entry.classId ? classesById.get(entry.classId) : undefined;
    const trial = cls?.trialId ? trialsById.get(cls.trialId) : undefined;
    const showId = entry.showId ?? trial?.showId;
    const show = showId ? showsById.get(showId) : undefined;
    if (!showId || !show) continue;

    hydrated.push({
      entryId: entry.id,
      showId,
      showName: show.name,
      classId: entry.classId ?? null,
      trialId: cls?.trialId ?? null,
      className: cls ? buildClassName(cls) : null,
      classStartTime: cls?.startTime ?? trial?.plannedStartTime ?? null,
    });
  }

  return hydrated;
}

export function buildFavoriteClassIdsByTrial(
  entries: HydratedAccountTodayEntry[]
): Map<string, Set<string>> {
  const favoritesByTrial = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!entry.trialId || !entry.classId) continue;
    const existing = favoritesByTrial.get(entry.trialId) ?? new Set<string>();
    existing.add(entry.classId);
    favoritesByTrial.set(entry.trialId, existing);
  }
  return favoritesByTrial;
}

export function persistAccountTodayClassFavorites(
  showId: string,
  entries: HydratedAccountTodayEntry[]
): boolean {
  let changed = false;
  const favoritesByTrial = buildFavoriteClassIdsByTrial(
    entries.filter(entry => entry.showId === showId)
  );

  for (const [trialId, classIds] of favoritesByTrial) {
    const key = buildFavoriteStorageKey(showId, trialId);
    const merged = new Set(readJsonArray(key));
    const beforeSize = merged.size;
    for (const classId of classIds) merged.add(classId);
    if (merged.size !== beforeSize) {
      writeJsonArray(key, Array.from(merged));
      changed = true;
    }
  }

  return changed;
}
