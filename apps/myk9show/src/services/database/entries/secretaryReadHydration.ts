import { logQuery } from '../supabaseClient';
import { logger } from '@/services/LoggingService';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { getReplicatedSecretaryEntriesForShow } from './secretaryReadReplication';

/** Hydrate a show-scoped replica for a direct Entry Management deep link. */
export async function hydrateSecretaryEntriesForShow(showId: string, startTime: number) {
  try {
    const syncResult = await replicatedEntriesTable.sync(showId);
    if (!syncResult?.success) return null;

    const hydratedEntries = await replicatedEntriesTable.getEntriesByShow(showId);
    const trialIds = [
      ...new Set(hydratedEntries.map(entry => entry.trialId ?? entry.trial_id).filter(Boolean)),
    ] as string[];
    const trialSync = await replicatedTrialsTable.sync(showId);
    if (!trialSync?.success) return null;

    const classSyncResults = await Promise.all(
      trialIds.map(trialId => replicatedClassesTable.sync(trialId))
    );
    if (classSyncResults.some(result => !result?.success)) return null;

    const hydrated = await getReplicatedSecretaryEntriesForShow(showId);
    if (hydrated.isColdStore) return null;
    if (
      hydrated.data.some(
        entry =>
          (entry.class_id !== null && entry.class === null) ||
          (entry.trial_id !== null && entry.trial === null)
      )
    ) {
      return null;
    }

    logQuery('entries', 'get_entries_for_show', Date.now() - startTime);
    return hydrated.data;
  } catch (error) {
    logger.warn('Secretary entries scoped replica hydration failed', 'database', {
      showId,
      operation: 'get_entries_for_show',
      error,
    });
    return null;
  }
}
