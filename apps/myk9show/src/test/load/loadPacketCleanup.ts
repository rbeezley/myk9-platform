import type { SupabaseClient } from '@supabase/supabase-js';

const TRIAL_PACKET_BUCKET = 'trial-packets';

interface TrialPacketSnapshotPath {
  id: string;
  storage_path: string;
}

export async function clearLoadTrialPacketSnapshots(
  client: SupabaseClient,
  showId: string
): Promise<{ objectsRemoved: number; rowsRemoved: number }> {
  const { data, error: readError } = await client
    .from('trial_packet_snapshots')
    .select('id, storage_path')
    .eq('show_id', showId);
  if (readError) throw new Error(`Could not read trial packet snapshots: ${readError.message}`);

  const rows = (data ?? []) as TrialPacketSnapshotPath[];
  const paths = [...new Set(rows.map(row => row.storage_path))];
  const invalidPath = paths.find(path => !path.startsWith(`${showId}/`));
  if (invalidPath) {
    throw new Error('Trial packet cleanup refused a path outside the canonical show prefix.');
  }

  if (paths.length > 0) {
    const { error: storageError } = await client.storage
      .from(TRIAL_PACKET_BUCKET)
      .remove(paths);
    if (storageError) {
      throw new Error(`Could not remove trial packet objects: ${storageError.message}`);
    }
  }

  if (rows.length > 0) {
    const { error: deleteError } = await client
      .from('trial_packet_snapshots')
      .delete()
      .in(
        'id',
        rows.map(row => row.id)
      );
    if (deleteError) {
      throw new Error(`Could not remove trial packet snapshot rows: ${deleteError.message}`);
    }
  }

  const { data: remaining, error: verifyError } = await client
    .from('trial_packet_snapshots')
    .select('id')
    .eq('show_id', showId);
  if (verifyError) {
    throw new Error(`Could not verify trial packet cleanup: ${verifyError.message}`);
  }
  if ((remaining ?? []).length > 0) {
    throw new Error('A canonical trial packet snapshot appeared during cleanup.');
  }

  return { objectsRemoved: paths.length, rowsRemoved: rows.length };
}
