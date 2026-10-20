import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_RETRY_POLICY,
  type RetryPolicy,
  withTransientRetry,
} from './loadPacketCleanupRetry';

const TRIAL_PACKET_BUCKET = 'trial-packets';

interface TrialPacketSnapshotPath {
  id: string;
  storage_path: string;
}

export async function clearLoadTrialPacketSnapshots(
  client: SupabaseClient,
  showId: string,
  retry: RetryPolicy = DEFAULT_RETRY_POLICY
): Promise<{ objectsRemoved: number; rowsRemoved: number }> {
  const data = await withTransientRetry(
    'Could not read trial packet snapshots',
    () => client.from('trial_packet_snapshots').select('id, storage_path').eq('show_id', showId),
    retry
  );

  const rows = (data ?? []) as TrialPacketSnapshotPath[];
  const paths = [...new Set(rows.map(row => row.storage_path))];
  const invalidPath = paths.find(path => !path.startsWith(`${showId}/`));
  if (invalidPath) {
    throw new Error('Trial packet cleanup refused a path outside the canonical show prefix.');
  }

  // Both writes are idempotent, so a retry after a response lost in transit
  // cannot remove anything the first attempt did not already target.
  if (paths.length > 0) {
    await withTransientRetry(
      'Could not remove trial packet objects',
      () => client.storage.from(TRIAL_PACKET_BUCKET).remove(paths),
      retry
    );
  }

  if (rows.length > 0) {
    await withTransientRetry(
      'Could not remove trial packet snapshot rows',
      () =>
        client
          .from('trial_packet_snapshots')
          .delete()
          .in(
            'id',
            rows.map(row => row.id)
          ),
      retry
    );
  }

  const remaining = await withTransientRetry(
    'Could not verify trial packet cleanup',
    () => client.from('trial_packet_snapshots').select('id').eq('show_id', showId),
    retry
  );
  if ((remaining ?? []).length > 0) {
    throw new Error('A canonical trial packet snapshot appeared during cleanup.');
  }

  return { objectsRemoved: paths.length, rowsRemoved: rows.length };
}
