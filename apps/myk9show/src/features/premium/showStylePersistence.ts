import { onlineManager } from '@tanstack/react-query';
import type { Show } from '@/types/show-types';
import type { ShowStyle } from '@/features/registries';
import { createSessionBoundSupabaseClient, supabase } from '@/services/database/supabaseClient';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { replicatedShowsTable } from '@/services/replication';

interface SaveShowDraftStyleInput {
  show: Show;
  style: ShowStyle;
  ownerId: string;
}

export class ShowStyleSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShowStyleSaveError';
  }
}

async function getSessionForOwner(ownerId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session || data.session.user.id !== ownerId) {
    throw new ShowStyleSaveError('Your account changed. Reload this show before saving a style.');
  }
  return data.session;
}

async function assertShowHasNoPendingChanges(showId: string): Promise<void> {
  const [replicatedRow, pendingMutations] = await Promise.all([
    replicatedShowsTable.getReplicatedRow(showId),
    mutationManager.getPendingMutationsForRow('shows', showId),
  ]);
  if (replicatedRow?.isDirty || pendingMutations.length > 0) {
    throw new ShowStyleSaveError('Sync this show’s pending changes before saving its style.');
  }
}

/** Save online, then let the normal versioned show sync refresh persistent readers. */
export async function saveShowDraftStyle({
  show,
  style,
  ownerId,
}: SaveShowDraftStyleInput): Promise<void> {
  if (!onlineManager.isOnline() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    throw new ShowStyleSaveError('Reconnect to the internet before saving this style.');
  }

  const session = await getSessionForOwner(ownerId);
  await assertShowHasNoPendingChanges(show.id);
  await getSessionForOwner(ownerId);

  const sessionClient = createSessionBoundSupabaseClient(session.access_token);
  const { data, error } = await sessionClient.rpc('update_show_style', {
    p_show_id: show.id,
    p_style: style,
  });
  if (error) throw error;
  if (typeof data !== 'number') {
    throw new ShowStyleSaveError(
      'The server did not confirm the saved style version. Refresh and try again.'
    );
  }

  // No persistent replica or query-cache write is safe here: those stores are
  // shared across auth changes. The RPC's UPDATE advances shows.updated_at and
  // version, so the established incremental show sync can refresh readers.
  try {
    await getSessionForOwner(ownerId);
  } catch {
    throw new ShowStyleSaveError(
      'The style may have been saved, but your account changed or could not be confirmed. Reload this show before continuing.'
    );
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('replication:sync-requested'));
  }
}
