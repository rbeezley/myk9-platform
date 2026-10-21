/**
 * Server row count for the dog_registrations adapter (MYK9-1302).
 *
 * The engine compares `getRemoteRowCount` with the rows this device holds to
 * spot a partial replica (MYK9-752) and, with `detectOverReplica`, a server-side
 * removal (MYK9-775); a mismatch forces a full sync, which makes the id pass due.
 * The count reads the same RLS-visible set `fetchVisibleRegistrationIds` reads,
 * so the two agree. A failed count returns `undefined`, which the engine treats
 * as "no count this pass", never as zero.
 *
 * Dogs deliberately have NO count yet: their fetch is one request capped at
 * PostgREST's 1000 rows, so a count above that would read as a partial replica
 * on every pass and force a full sync plus id scan each time (MYK9-1321 pages
 * the fetch and adds the count together).
 */

import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';

async function countOrUndefined(
  label: string,
  run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number | undefined> {
  try {
    const { count, error } = await run();
    if (error) {
      logger.warn(`[${label}] Coverage count unavailable; continuing sync`, 'replication', {
        message: error.message,
      });
      return undefined;
    }
    return count ?? 0;
  } catch (error) {
    logger.warn(`[${label}] Coverage count unavailable; continuing sync`, 'replication', {
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export function countRemoteRegistrations(): Promise<number | undefined> {
  return countOrUndefined('dog_registrations', () =>
    supabase.from('dog_registrations').select('id', { count: 'exact', head: true })
  );
}
