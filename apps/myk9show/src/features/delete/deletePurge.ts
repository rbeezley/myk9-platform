/**
 * The local half of the one delete path: after the server has soft-deleted an
 * item, drop it (and what went with it) from this device so every list updates
 * without a reload. The replicas pull only LIVE rows and never deliver a
 * tombstone, so without this a deleted item stays in IndexedDB and the lists.
 *
 * Every purge here runs only AFTER the server delete succeeded, so none of them
 * may throw: a replica failure is logged and the stores still drop the item. The
 * caller can always treat the delete as done (same contract as
 * `showStore.purgeDeletedShow`, #2640). No purge queues a mutation: the server
 * already has the delete.
 */
import { logger } from '@/services/LoggingService';
import {
  replicatedClassesTable,
  replicatedClubsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClubStore } from '@/store/clubStore';
import { useEntryStore } from '@/store/entryStore';
import type { DeleteObjectKind, DeleteTarget } from './deleteTypes';

async function quietly(step: string, id: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.warn('Delete purge step failed; the server delete stands', 'delete', {
      step,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Entries that went with a deleted parent: drop them from the entries replica. */
async function purgeEntriesWhere(
  step: string,
  id: string,
  matches: (entry: {
    id: string;
    classId?: string | undefined;
    showId?: string | undefined;
    dogId?: string | undefined;
  }) => boolean
): Promise<void> {
  let ids: string[] = [];
  await quietly(`${step}:entries`, id, async () => {
    const entries = await replicatedEntriesTable.getAllOrThrow();
    ids = entries.filter(matches).map(entry => entry.id);
    if (ids.length > 0) await replicatedEntriesTable.batchDelete(ids);
  });
  if (ids.length > 0) {
    const gone = new Set(ids);
    useEntryStore.setState(state => ({ entries: state.entries.filter(e => !gone.has(e.id)) }));
  }
}

/** A class and its entries. Shared by every class delete surface (Setup, Class Details,
 * Class Management, the trial page). */
async function purgeClassIds(classIds: readonly string[], step: string, id: string): Promise<void> {
  if (classIds.length === 0) return;
  const gone = new Set(classIds);
  await quietly(`${step}:classes`, id, () => replicatedClassesTable.batchDelete([...classIds]));
  await purgeEntriesWhere(step, id, entry => !!entry.classId && gone.has(entry.classId));
  useTrialStore.setState(state => ({
    trialClasses: Object.fromEntries(
      Object.entries(state.trialClasses).map(([trialId, classes]) => [
        trialId,
        classes.filter(cls => !gone.has(cls.id)),
      ])
    ),
  }));
}

async function purgeTrialIds(trialIds: readonly string[], step: string, id: string): Promise<void> {
  if (trialIds.length === 0) return;
  const gone = new Set(trialIds);
  let classIds: string[] = [];
  await quietly(`${step}:trial-classes`, id, async () => {
    const classes = await replicatedClassesTable.getAllOrThrow();
    classIds = classes.filter(cls => !!cls.trialId && gone.has(cls.trialId)).map(cls => cls.id);
  });
  // The trial store keys its classes by trial, so those go even if the replica read failed.
  for (const trialId of trialIds) {
    classIds.push(...(useTrialStore.getState().trialClasses[trialId] ?? []).map(cls => cls.id));
  }
  await purgeClassIds([...new Set(classIds)], step, id);
  await quietly(`${step}:trials`, id, () => replicatedTrialsTable.batchDelete([...trialIds]));
  useTrialStore.setState(state => {
    const trialClasses = { ...state.trialClasses };
    for (const trialId of trialIds) delete trialClasses[trialId];
    return {
      trials: state.trials.filter(trial => !gone.has(trial.id)),
      trialClasses,
      selectedTrialId:
        state.selectedTrialId && gone.has(state.selectedTrialId) ? null : state.selectedTrialId,
    };
  });
}

/**
 * Drop one deleted item from this device. Never throws (see header).
 */
export async function purgeDeletedLocally(
  kind: DeleteObjectKind,
  target: DeleteTarget
): Promise<void> {
  const { id } = target;
  try {
    switch (kind) {
      case 'show': {
        await useShowStore.getState().purgeDeletedShow(id);
        let trialIds: string[] = [];
        await quietly('show:trials', id, async () => {
          const trials = await replicatedTrialsTable.getAllOrThrow();
          trialIds = trials.filter(trial => trial.showId === id).map(trial => trial.id);
        });
        trialIds.push(
          ...useTrialStore
            .getState()
            .trials.filter(trial => trial.showId === id)
            .map(trial => trial.id)
        );
        await purgeTrialIds([...new Set(trialIds)], 'show', id);
        await purgeEntriesWhere('show', id, entry => entry.showId === id);
        return;
      }
      case 'trial':
        return await purgeTrialIds([id], 'trial', id);
      case 'class':
        return await purgeClassIds([id], 'class', id);
      case 'entry':
        // The server call already evicted the row with its version guard
        // (`acknowledgeServerDeletion`); the store copy goes here.
        useEntryStore.setState(state => ({ entries: state.entries.filter(e => e.id !== id) }));
        return;
      case 'dog':
        await quietly('dog', id, () => replicatedDogsTable.delete(id));
        await purgeEntriesWhere('dog', id, entry => entry.dogId === id);
        return;
      case 'club':
        await quietly('club', id, () => replicatedClubsTable.delete(id));
        useClubStore.setState(state => ({
          clubs: state.clubs.filter(club => club.id !== id),
          selectedClubId: state.selectedClubId === id ? '' : state.selectedClubId,
        }));
        return;
      case 'person':
        // People are not replicated; the query invalidation drops them.
        return;
    }
  } catch (error) {
    logger.warn('Delete purge failed; the server delete stands', 'delete', {
      kind,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
