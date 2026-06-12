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

/** A trial and its classes (mapped to ringside `ClassEntry`), for grouped display. */
export interface AtShowClassGroup {
  trial: ReplicatedTrial;
  classes: ClassEntry[];
}

/** Render the class name from element + level (+ section unless '-'). */
export function buildClassName(cls: ReplicatedClass): string {
  const section = cls.section && cls.section !== '-' ? ` ${cls.section}` : '';
  return `${cls.element ?? ''} ${cls.level ?? ''}${section}`.trim();
}

/** Section normalized to 'A'/'B' for pairing, else '' (no pairing). */
function normalizeSection(section: string | undefined): string {
  return section === 'A' || section === 'B' ? section : '';
}

function toClassEntry(
  cls: ReplicatedClass,
  entries: ReplicatedEntry[],
  favoriteClassIds: Set<string>
): ClassEntry {
  const completed = entries.filter(e => e.isScored ?? e.is_scored ?? false).length;

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
    // The card navigates by counts + identity; per-dog detail isn't needed here.
    dogs: [],
  };
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

  const entriesByClass = new Map<string, ReplicatedEntry[]>();
  for (const entry of allEntries) {
    const classId = entry.classId;
    if (!classId) continue;
    const bucket = entriesByClass.get(classId);
    if (bucket) bucket.push(entry);
    else entriesByClass.set(classId, [entry]);
  }

  return Promise.all(
    trials.map(async trial => {
      const classes = await replicatedClassesTable.getClassesByTrial(trial.id);
      const favoriteClassIds = getFavoriteClassIdsForTrial(showId, trial.id);
      const classEntries = classes.map(cls =>
        toClassEntry(cls, entriesByClass.get(cls.id) ?? [], favoriteClassIds)
      );
      classEntries.sort((a, b) => a.class_order - b.class_order);
      return { trial, classes: classEntries };
    })
  );
}
