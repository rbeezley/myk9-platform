import { isCompletedStatus } from '@/features/show-closeout/closeoutStatus';
import {
  replicatedClassesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { readReopenReason, saveReopenReason } from '@/services/database/showCloseNotes';
import { formatReopenNote } from './showCloseNotes';

/** The status a reopened show returns to: it was running when it was closed. */
export const REOPENED_SHOW_STATUS = 'in_progress';

/** The reason could not be saved (online-only step), so nothing was changed. */
export class ReopenNoteError extends Error {}

export interface ReopenShowInput {
  showId: string;
  reason: string;
  /** The signed-in secretary's name, kept with the reason. */
  person: string;
  /** One instant for `shows.reopened_at` and the note. */
  now?: Date;
}

/**
 * MYK9-2428: reopen a closed show. The note (reason, person, time) is written first and is
 * online-only, so a device without a connection stops here and nothing is reopened without its
 * reason kept. Each trial and class that the close step completed goes back to the status it
 * had before; a row that was already completed or cancelled before the close has no
 * `statusBeforeClose` and is left alone. The show goes last, so a failed restore can be retried.
 */
export async function reopenShow(input: ReopenShowInput): Promise<void> {
  const at = (input.now ?? new Date()).toISOString();
  try {
    // A second reopen keeps the first: the new note goes above what is already there.
    const earlier = (await readReopenReason(input.showId))?.trim();
    const note = formatReopenNote({ reason: input.reason, person: input.person, at });
    await saveReopenReason(input.showId, earlier ? `${note}\n\n${earlier}` : note);
  } catch {
    throw new ReopenNoteError('The reopen reason could not be saved.');
  }

  const trials = await replicatedTrialsTable.getTrialsByShow(input.showId);
  const classLists = await Promise.all(
    trials.map(trial => replicatedClassesTable.getClassesByTrial(trial.id))
  );

  const restores: Promise<unknown>[] = [];
  for (const trial of trials) {
    if (trial.statusBeforeClose && isCompletedStatus(trial.status)) {
      restores.push(
        replicatedTrialsTable.updateTrial(trial.id, {
          status: trial.statusBeforeClose,
          statusBeforeClose: null,
        })
      );
    }
  }
  for (const cls of classLists.flat()) {
    if (cls.statusBeforeClose && isCompletedStatus(cls.classStatus)) {
      restores.push(
        replicatedClassesTable.updateClass(cls.id, {
          classStatus: cls.statusBeforeClose,
          statusBeforeClose: null,
        })
      );
    }
  }
  const results = await Promise.allSettled(restores);
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Some trials or classes could not be restored.');
  }

  await replicatedShowsTable.updateShow(input.showId, {
    status: REOPENED_SHOW_STATUS,
    closedAt: null,
    reopenedAt: at,
  });
}
