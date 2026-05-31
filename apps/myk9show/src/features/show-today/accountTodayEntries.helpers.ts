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
  show_id?: string | null;
  show_name?: string | null;
  class_id?: string | null;
  trial_id?: string | null;
  class_name?: string | null;
  class_start_time?: string | null;
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
  const entriesById = new Map(rows.entries.map(entry => [entry.id, entry]));
  const classesById = new Map(rows.classes.map(cls => [cls.id, cls]));
  const trialsById = new Map(rows.trials.map(trial => [trial.id, trial]));
  const showsById = new Map(rows.shows.map(show => [show.id, show]));
  const hydrated: HydratedAccountTodayEntry[] = [];

  for (const accountRow of accountEntryIds) {
    const entry = entriesById.get(accountRow.entry_id);

    const cls = entry?.classId ? classesById.get(entry.classId) : undefined;
    const trial = cls?.trialId ? trialsById.get(cls.trialId) : undefined;
    const showId = entry?.showId ?? trial?.showId ?? accountRow.show_id;
    const show = showId ? showsById.get(showId) : undefined;
    const showName = show?.name ?? accountRow.show_name;
    if (!showId || !showName) continue;

    hydrated.push({
      entryId: accountRow.entry_id,
      showId,
      showName,
      classId: entry?.classId ?? accountRow.class_id ?? null,
      trialId: cls?.trialId ?? accountRow.trial_id ?? null,
      className: cls ? buildClassName(cls) : (accountRow.class_name ?? null),
      classStartTime:
        cls?.startTime ?? trial?.plannedStartTime ?? accountRow.class_start_time ?? null,
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
