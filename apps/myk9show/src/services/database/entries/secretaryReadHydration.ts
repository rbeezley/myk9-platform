import { logQuery } from '../supabaseClient';
import { logger } from '@/services/LoggingService';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { getReplicatedSecretaryEntriesForShow } from './secretaryReadReplication';

/** Hydrate a show-scoped replica for a direct Entry Management deep link. */
export async function hydrateSecretaryEntriesForShow(showId: string, startTime: number) {
  try {
    const syncResult = await replicatedEntriesTable.sync(showId);
    if (!syncResult?.success) return null;

    const hydrated = await getReplicatedSecretaryEntriesForShow(showId);
    if (hydrated.isColdStore) return null;

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
