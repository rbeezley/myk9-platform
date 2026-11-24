import { withTimeout } from '@myk9/core';
import { replicatedShowsTable } from '@/services/replication';
import { reportDebug } from '@/utils/standardizedErrorHandler';

/**
 * MYK9-2361: moving a trial's day makes the server rewrite the show's start and end dates
 * (trg_sync_show_dates_from_trial), which moves the show row's version. The Edit Show sheet
 * saves on the copy of the row it already holds, so its save would be rejected as a change made
 * somewhere else, against the secretary's own earlier edit. Taking the server's current row
 * first makes the save start from it. A row with unsent local work is never overwritten (the
 * pull skips it), and a failed or offline pull is not a failed save: the save goes ahead on the
 * local row exactly as before.
 */
/** Longest the Save waits on the server's row before saving on the local one. */
export const REFRESH_SHOW_TIMEOUT_MS = 4000;

export async function refreshShowBeforeSave(showId: string): Promise<void> {
  try {
    await withTimeout(
      replicatedShowsTable.pullShowById(showId),
      REFRESH_SHOW_TIMEOUT_MS,
      'Show refresh before save'
    );
  } catch (error) {
    reportDebug('shows', 'Could not refresh the show before saving the edit', {
      showId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
