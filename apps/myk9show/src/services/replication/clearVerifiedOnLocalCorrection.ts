/**
 * MYK9-1031: a local score correction retracts the paper check at once, mirroring the server.
 *
 * The server clears `results_verified_at` when a result of the class changes, but only when it
 * hears of the change. On this device the correction is a local write long before that, and the
 * check on screen would still say "checked" for results that are no longer the ones checked.
 * Watching the replica (not any one scoring screen) catches every path: ringside scoring, the
 * score-correction flow, paper entry, a placement recalculation.
 *
 * For each class that carries a check, every entry's results line (`replicatedEntryResultsLine`,
 * the unit the server fingerprints) is remembered. When a line changes and the entry holds a
 * local write the server has not got (the row is dirty), the check on that class is cleared
 * locally: a clean write (`clearResultsVerifiedLocally`), nothing queued, no write lock. A line
 * that changes because a sync downloaded it is left alone: the server clears its own stamp for
 * those. The map follows the checked classes only, so a class's entries are first seen (and only
 * remembered) when its check appears.
 *
 * Known limit: a class row that is itself dirty (a release still waiting to upload) cannot be
 * written clean, so its local check stays until the server's own clear arrives.
 */
import { logger } from '@myk9/core';

import { replicatedClassesTable } from './ReplicatedClassesTable';
import { replicatedEntriesTable } from './ReplicatedEntriesTable';
import { replicatedEntryResultsLine } from './replicatedEntryResultsLine';

export function startClearVerifiedOnLocalCorrection(): () => void {
  let lines = new Map<string, string | null>();
  let running = false;
  let rerun = false;
  let stopped = false;

  const pass = async () => {
    const classes = await replicatedClassesTable.getAll();
    const checked = new Set(classes.filter(cls => cls.resultsVerifiedAt).map(cls => cls.id));
    if (checked.size === 0) {
      lines = new Map();
      return;
    }
    const entries = (await replicatedEntriesTable.getAll()).filter(
      entry => entry.classId && checked.has(entry.classId)
    );
    const next = new Map<string, string | null>();
    const changedClasses = new Set<string>();
    for (const entry of entries) {
      const line = replicatedEntryResultsLine(entry);
      next.set(entry.id, line);
      if (!lines.has(entry.id) || lines.get(entry.id) === line) continue;
      if ((await replicatedEntriesTable.getReplicatedRow(entry.id))?.isDirty) {
        changedClasses.add(entry.classId as string);
      }
    }
    lines = next;
    for (const classId of changedClasses) {
      await replicatedClassesTable.clearResultsVerifiedLocally(classId);
    }
  };

  const run = async () => {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      do {
        rerun = false;
        if (stopped) return;
        await pass();
      } while (rerun);
    } catch (error) {
      logger.warn('Could not check for corrections to a checked class', { error });
    } finally {
      running = false;
    }
  };

  const stops = [
    replicatedEntriesTable.subscribe(() => void run(), { emitCurrent: false }),
    // A check appearing (or going) changes which classes are watched.
    replicatedClassesTable.subscribe(() => void run(), { emitCurrent: true }),
  ];
  return () => {
    stopped = true;
    stops.forEach(stop => stop());
  };
}
