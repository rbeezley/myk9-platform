/**
 * MYK9-979: the show edit panel's "Accept online entries" switch saves itself.
 *
 * It is NOT part of the edit form's data: a form holds a snapshot, and a
 * snapshot of this switch, resent with an unrelated save, could reverse a
 * change made on another device. Flipping it queues its own replicated UPDATE
 * that carries only `online_entries_enabled`
 * (ReplicatedShowsTable.setOnlineEntriesEnabled), and the value shown is the
 * live replica row, never form state.
 *
 * Turning it on for a public show needs the club's Stripe payouts, the same
 * rule the publish gate enforces (MK003). The check here is the friendly
 * early answer; the trigger stays the backstop, and its refusal reaches the
 * secretary through the sync-failure toast (PUBLISH_GATE_MESSAGES).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useShowStore } from '@/store/showStore';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { useClubStripeAccount } from './useClubStripeAccount';
import {
  canEnableOnlineEntries,
  isPublicShowStatus,
  ONLINE_ENTRIES_BLOCKED_MESSAGE,
  publishGateDbErrorMessage,
} from './onlineEntryGate';

export const ONLINE_ENTRIES_ON_TOAST = 'Online entries are on.';
export const ONLINE_ENTRIES_OFF_TOAST =
  'Online entries are off. Exhibitors see the premium and mail in their entries.';
export const ONLINE_ENTRIES_SAVE_FAILED = "Couldn't change online entries. Please try again.";

/** Store statuses are not always the DB spelling ('In Progress'). */
function dbStatus(status: string | undefined): string | undefined {
  return status?.trim().toLowerCase().replace(/\s+/g, '_');
}

export interface OnlineEntriesSwitch {
  /** The live value; `undefined` while unknown (the switch stays disabled). */
  value: boolean | undefined;
  pending: boolean;
  setEnabled: (next: boolean) => Promise<void>;
}

export function useOnlineEntriesSwitch(showId: string | undefined): OnlineEntriesSwitch {
  const show = useShowStore(state =>
    showId ? state.shows.find(candidate => candidate.id === showId) : undefined
  );
  const value =
    typeof show?.onlineEntriesEnabled === 'boolean' ? show.onlineEntriesEnabled : undefined;
  const stripe = useClubStripeAccount(show?.clubId);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function setEnabled(next: boolean): Promise<void> {
    if (!showId || value === undefined || pending || next === value) return;
    if (next && isPublicShowStatus(dbStatus(show?.status))) {
      if (stripe.isLoading) {
        toast.info('Checking the club’s payment account — try again in a moment.');
        return;
      }
      if (stripe.isError || !canEnableOnlineEntries(stripe.data)) {
        toast.error(ONLINE_ENTRIES_BLOCKED_MESSAGE, {
          action: { label: 'Open Payments', onClick: () => navigate('/club-admin/payments') },
        });
        return;
      }
    }
    setPending(true);
    try {
      await replicatedShowsTable.setOnlineEntriesEnabled(showId, next);
      toast.success(next ? ONLINE_ENTRIES_ON_TOAST : ONLINE_ENTRIES_OFF_TOAST);
    } catch (error) {
      toast.error(publishGateDbErrorMessage(error) ?? ONLINE_ENTRIES_SAVE_FAILED);
    } finally {
      setPending(false);
    }
  }

  return { value, pending, setEnabled };
}
