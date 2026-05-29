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
import { toRingsideClassStatus } from './ringsideClassStatusMap';

/** A trial and its classes (mapped to ringside `ClassEntry`), for grouped display. */
export interface AtShowClassGroup {
  trial: ReplicatedTrial;
  classes: ClassEntry[];
}

/** Render the class name from element + level (+ section unless '-'). */
function buildClassName(cls: ReplicatedClass): string {
  const section = cls.section && cls.section !== '-' ? ` ${cls.section}` : '';
  return `${cls.element ?? ''} ${cls.level ?? ''}${section}`.trim();
}

/** Section normalized to 'A'/'B' for pairing, else '' (no pairing). */
function normalizeSection(section: string | undefined): string {
  return section === 'A' || section === 'B' ? section : '';
}

async function toClassEntry(cls: ReplicatedClass): Promise<ClassEntry> {
  const rawEntries = await replicatedEntriesTable.getEntriesByClass(cls.id);
  const completed = rawEntries.filter(e => e.isScored ?? e.is_scored ?? false).length;

  return {
    id: cls.id,
    element: cls.element ?? '',
    level: cls.level ?? '',
    section: normalizeSection(cls.section),
    class_name: buildClassName(cls),
    class_order: cls.classOrder ?? 0,
    judge_name: cls.judgeName ?? 'No Judge Assigned',
    entry_count: rawEntries.length,
    completed_count: completed,
    class_status: toRingsideClassStatus(cls.classStatus),
    is_favorite: false,
    // The card navigates by counts + identity; per-dog detail isn't needed here.
    dogs: [],
  };
}

/**
 * Fetch a show's trials and their classes (as ringside `ClassEntry`s), sorted
 * by class order within each trial. Per-class entry counts are fetched in
 * parallel from the replicated entries table.
 */
export async function fetchAtShowClassList(showId: string): Promise<AtShowClassGroup[]> {
  const trials = await replicatedTrialsTable.getTrialsByShow(showId);

  return Promise.all(
    trials.map(async trial => {
      const classes = await replicatedClassesTable.getClassesByTrial(trial.id);
      const classEntries = await Promise.all(classes.map(toClassEntry));
      classEntries.sort((a, b) => a.class_order - b.class_order);
      return { trial, classes: classEntries };
    })
  );
}
