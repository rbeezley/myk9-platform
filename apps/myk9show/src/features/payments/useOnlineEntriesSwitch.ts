/**
 * MYK9-979: the show edit panel's "Accept online entries" switch saves itself.
 *
 * It is NOT part of the edit form's data: a form holds a snapshot, and a
 * snapshot of this switch, resent with an unrelated save, could reverse a
 * change made on another device. Nor does it ride the replication queue: a
 * queued show UPDATE can be rebuilt into a full row on a stale token. Flipping
 * it calls the online-only RPC set_show_online_entries (setShowOnlineEntries),
 * which writes that one column; the switch is disabled while offline. The
 * value shown is the live replica row, refreshed after each change.
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
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { setShowOnlineEntries } from './setShowOnlineEntries';
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
  /** The RPC needs a connection; the switch is disabled while offline. */
  offline: boolean;
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
  const offline = !useIsOnline();

  async function setEnabled(next: boolean): Promise<void> {
    if (!showId || value === undefined || pending || offline || next === value) return;
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
      await setShowOnlineEntries(showId, next);
      toast.success(next ? ONLINE_ENTRIES_ON_TOAST : ONLINE_ENTRIES_OFF_TOAST);
    } catch (error) {
      toast.error(publishGateDbErrorMessage(error) ?? ONLINE_ENTRIES_SAVE_FAILED);
    } finally {
      setPending(false);
    }
  }

  return { value, pending, offline, setEnabled };
}
