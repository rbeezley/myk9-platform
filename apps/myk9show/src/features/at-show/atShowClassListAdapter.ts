/**
 * Phase 1h — at-show ClassList data adapter (myK9Show replication → ringside).
 *
 * Fetches a show's trials → classes and maps each `ReplicatedClass` into a
 * ringside `ClassEntry` so the at-show ClassList can render myK9Q-faithful
 * class cards AND reuse ringside's pairing helper (`findPairedSectionedClass`)
 * for Novice Section A/B navigation. Entry counts come from the replicated
 * entries table (offline-first).
 *
 * Not a full ringside ClassList extraction — a lean host-side picker (plan D3).
 */

import type { ClassEntry } from '@myk9/ringside';
import type { SyncMetadata } from '@myk9/replication';
import {
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
} from '@/services/replication';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { toRingsideClassStatus } from './ringsideClassStatusMap';
import { getFavoriteClassIdsForTrial } from '@/features/show-today/accountTodayEntries.helpers';
import { composeClassTitle } from '@/services/entryDisplay/entryDisplaySelectors';
import { buildNextUpPreview, type AtShowNextUpPreview } from './atShowNextUpPreview';

/** A trial and its classes (mapped to ringside `ClassEntry`), for grouped display. */
export interface AtShowClassGroup {
  trial: ReplicatedTrial;
  classes: ClassEntry[];
  /** Per-class "in ring / next up" row preview, keyed by class id. */
  nextUpByClassId: Map<string, AtShowNextUpPreview>;
}

/** Render the class name from element + level (+ section). The '-' "no section" sentinel is handled by resolveClassSection inside composeClassTitle. */
export function buildClassName(cls: ReplicatedClass): string {
  return composeClassTitle({
    element: cls.element ?? null,
    level: cls.level ?? null,
    section: cls.section ?? null,
  });
}

/** Section normalized to 'A'/'B' for pairing, else '' (no pairing). */
function normalizeSection(section: string | undefined): string {
  return section === 'A' || section === 'B' ? section : '';
}

export function toClassEntry(
  cls: ReplicatedClass,
  entries: ReplicatedEntry[],
  favoriteClassIds: Set<string>
): ClassEntry {
  const completed = countCompletedEntries(entries);

  return {
    id: cls.id,
    element: cls.element ?? '',
    level: cls.level ?? '',
    section: normalizeSection(cls.section),
    class_name: buildClassName(cls),
    class_order: cls.classOrder ?? 0,
    judge_name: cls.judgeName ?? 'No Judge Assigned',
    entry_count: entries.length,
    completed_count: completed,
    class_status: toRingsideClassStatus(cls.classStatus),
    is_favorite: favoriteClassIds.has(cls.id),
    ...(cls.startTime ? { planned_start_time: cls.startTime } : {}),
    ...(cls.revisedExpectedStart
      ? {
          start_time: cls.revisedExpectedStart,
          revised_expected_start: cls.revisedExpectedStart,
        }
      : cls.startTime
        ? { start_time: cls.startTime }
        : {}),
    ...(cls.actual_start_time ? { actual_start_time: cls.actual_start_time } : {}),
    ...(cls.actual_end_time ? { actual_end_time: cls.actual_end_time } : {}),
    // The card navigates by counts + identity; per-dog detail isn't needed here.
    dogs: [],
  };
}

function countCompletedEntries(entries: ReplicatedEntry[]): number {
  return entries.filter(entry => entry.isScored ?? entry.is_scored ?? false).length;
}

function groupEntriesByClass(entries: ReplicatedEntry[]): Map<string, ReplicatedEntry[]> {
  const entriesByClass = new Map<string, ReplicatedEntry[]>();
  for (const entry of entries) {
    const classId = entry.classId;
    if (!classId) continue;
    const bucket = entriesByClass.get(classId);
    if (bucket) bucket.push(entry);
    else entriesByClass.set(classId, [entry]);
  }
  return entriesByClass;
}

/**
 * Re-project entry-derived class facts from a replication subscription's
 * already-materialized snapshot. This avoids a second IndexedDB getAll() and
 * unchanged trial/class reads for every score or check-in write.
 */
export function refreshAtShowClassListEntries(
  groups: AtShowClassGroup[],
  allEntries: ReplicatedEntry[],
  showId: string
): AtShowClassGroup[] {
  const entriesByClass = groupEntriesByClass(allEntries.filter(entry => entry.showId === showId));

  return groups.map(group => {
    const nextUpByClassId = new Map<string, AtShowNextUpPreview>();
    const classes = group.classes.map(classEntry => {
      const entries = entriesByClass.get(classEntry.id) ?? [];
      nextUpByClassId.set(classEntry.id, buildNextUpPreview(entries));
      return {
        ...classEntry,
        entry_count: entries.length,
        completed_count: countCompletedEntries(entries),
      };
    });
    return { ...group, classes, nextUpByClassId };
  });
}

/**
 * Persisted proof that the locally empty trial/class scopes are complete.
 * Row counts alone are insufficient because a cold or evicted replica is also
 * empty; expectedRemoteRows is server-derived and survives app restarts.
 */
export async function isAtShowClassDataHydrated(
  showId: string,
  groups: AtShowClassGroup[]
): Promise<boolean> {
  const trialsMeta = (await replicatedTrialsTable.getSyncMetadata(showId)) as SyncMetadata | null;
  if (
    trialsMeta?.expectedRemoteRows === undefined ||
    groups.length < trialsMeta.expectedRemoteRows
  ) {
    return false;
  }

  const classHydration = await Promise.all(
    groups.map(async group => {
      const metadata = (await replicatedClassesTable.getSyncMetadata(
        group.trial.id
      )) as SyncMetadata | null;
      return (
        metadata?.expectedRemoteRows !== undefined &&
        group.classes.length >= metadata.expectedRemoteRows
      );
    })
  );
  return classHydration.every(Boolean);
}

/**
 * Fetch a show's trials and their classes (as ringside `ClassEntry`s), sorted
 * by class order within each trial.
 *
 * Entry counts come from a SINGLE `getEntriesByShow` scan grouped locally by
 * class — not a per-class fetch — so a show with many classes doesn't trigger
 * one full-table scan per class (matters on show-day / offline IndexedDB).
 */
export async function fetchAtShowClassList(showId: string): Promise<AtShowClassGroup[]> {
  const [trials, allEntries] = await Promise.all([
    replicatedTrialsTable.getTrialsByShow(showId),
    replicatedEntriesTable.getEntriesByShow(showId),
  ]);

  const entriesByClass = groupEntriesByClass(allEntries);

  return Promise.all(
    trials.map(async trial => {
      const classes = await replicatedClassesTable.getClassesByTrial(trial.id);
      const favoriteClassIds = getFavoriteClassIdsForTrial(showId, trial.id);
      const nextUpByClassId = new Map<string, AtShowNextUpPreview>();
      const classEntries = classes.map(cls => {
        // Same grouped-entries pass that feeds the counts — no extra fetch, so
        // the preview stays offline-first and costs nothing on show day.
        const classEntriesForClass = entriesByClass.get(cls.id) ?? [];
        nextUpByClassId.set(cls.id, buildNextUpPreview(classEntriesForClass));
        return toClassEntry(cls, classEntriesForClass, favoriteClassIds);
      });
      classEntries.sort((a, b) => a.class_order - b.class_order);
      return { trial, classes: classEntries, nextUpByClassId };
    })
  );
}
