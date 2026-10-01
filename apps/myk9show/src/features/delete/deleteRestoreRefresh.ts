/**
 * After an Undo, bring the restored rows back onto this device so the item
 * reappears in its lists without a reload. `restore_*` stamps `updated_at`, so
 * an incremental replica sync picks the rows up again.
 *
 * Runs only after the server restore succeeded, so it never throws: a failed
 * sync is logged, and background sync converges later.
 */
import { logger } from '@/services/LoggingService';
import {
  replicatedClassesTable,
  replicatedClubsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClubStore } from '@/store/clubStore';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

async function quietly(step: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.warn('Refresh after Undo failed; background sync will catch up', 'delete', {
      step,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function syncShowStructure(showId: string, trialIds: readonly string[]): Promise<void> {
  await quietly('trials', () => replicatedTrialsTable.sync(showId));
  let ids = [...trialIds];
  if (ids.length === 0) {
    await quietly('trial-ids', async () => {
      const trials = await replicatedTrialsTable.getAllOrThrow();
      ids = trials.filter(trial => trial.showId === showId).map(trial => trial.id);
    });
  }
  await Promise.all(
    ids.map(trialId => quietly('classes', () => replicatedClassesTable.sync(trialId)))
  );
  await quietly('entries', () => replicatedEntriesTable.sync(showId));
  await quietly('trial-store', () => useTrialStore.getState().loadTrials());
  await quietly('trial-classes', () => useTrialStore.getState().loadTrialClasses());
}

export async function refreshAfterRestore(
  kind: DeleteObjectKind,
  target: DeleteTarget
): Promise<void> {
  const { id, context } = target;
  try {
    switch (kind) {
      case 'show':
        await quietly('shows', () => replicatedShowsTable.sync(''));
        await quietly('show-store', () => useShowStore.getState().loadShows());
        await syncShowStructure(id, []);
        return;
      case 'trial':
        if (context?.showId) await syncShowStructure(context.showId, [id]);
        return;
      case 'class':
        if (context?.trialId) {
          await quietly('classes', () => replicatedClassesTable.sync(context.trialId ?? ''));
        }
        if (context?.showId) {
          const showId = context.showId;
          await quietly('entries', () => replicatedEntriesTable.sync(showId));
        }
        await quietly('trial-classes', () => useTrialStore.getState().loadTrialClasses());
        return;
      case 'entry':
        replicatedEntriesTable.forgetServerDeletion(id);
        if (context?.showId) {
          const showId = context.showId;
          await quietly('entries', () => replicatedEntriesTable.sync(showId));
        }
        return;
      case 'dog':
        await quietly('dogs', () => replicatedDogsTable.sync(''));
        return;
      case 'club':
        await quietly('clubs', () => replicatedClubsTable.sync());
        await quietly('club-store', () => useClubStore.getState().loadClubs());
        return;
      case 'person':
        return;
    }
  } catch (error) {
    logger.warn('Refresh after Undo failed', 'delete', {
      kind,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
