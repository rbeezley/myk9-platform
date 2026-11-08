import { useState } from 'react';
import { toast } from 'sonner';
import { showUndoToast } from '@/lib/undoToast';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { useAuthContext } from '@/hooks/useAuthContext';
import { EntryStatus } from '@/types/show-registration-types';
import { changeSecretaryEntryStatus } from '@/services/database/entries/lifecycle';
import {
  scratchShowMapEntry,
  undoShowMapScratch,
} from '@/features/show-map/showMapActionMutations';
import { getEntryStatusHistory } from '@/services/database/entries/statusHistory';
import { clearFlaggedPull } from '@/services/database/entries/flaggedPull';
import type { PeopleRosterClassRow } from './peopleRoster';
import { ACCEPTED_DB_STATUS, deskStatusLabel, statusBeforeLatestPull } from './deskStatus';

/**
 * Pulled on the Check-in desk is the real Pull (owner, MYK9-1749): the entry is stored as pulled
 * (scratched) and goes to refund review, the same write as Entries' Pull. It asks first
 * (`PullAtShowDialog`) and offers Undo afterwards, which puts the entry and its check-in back.
 * A pulled class can also be put back later from its status, as Entries' Accept does, unless a
 * refund has been issued or decided (`deskCanUnpull`).
 *
 * Each confirmation holds only the entry id and reads the class live (`findRow`): if ringside
 * takes the dog or the run is scored while it is open, it closes and writes nothing.
 */
export function useDeskPull(
  findRow: (entryId: string) => PeopleRosterClassRow | undefined,
  onRefreshEntries?: () => void | Promise<void>
) {
  const { user } = useAuthContext();
  const [pending, setPending] = useState<{ id: string; act: 'pull' | 'unpull' } | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const live = pending ? findRow(pending.id) : undefined;
  const pullRow = pending?.act === 'pull' && live?.deskStatusEditable ? live : undefined;
  const unpullRow = pending?.act === 'unpull' && live?.deskCanUnpull ? live : undefined;
  // Forget a confirmation whose class moved on, so it never reopens on its own.
  if (pending && !pullRow && !unpullRow && !isWorking) setPending(null);

  const refresh = async () => {
    try {
      await onRefreshEntries?.();
    } catch {
      // The write landed; the next read shows it.
    }
  };

  const confirmPull = async (reason: string | undefined) => {
    if (!pullRow || isWorking) return;
    const row = pullRow;
    setIsWorking(true);
    try {
      const undoInput = await scratchShowMapEntry(
        row.entryId,
        reason,
        'Pulled at the check-in desk'
      );
      setPending(null);
      await refresh();
      showUndoToast({
        message: `${row.dogName} pulled from ${row.className}`,
        onUndo: () => {
          void undoShowMapScratch(undoInput)
            .then(refresh)
            .catch(error => toast.error(getUserFriendlyError(error)));
        },
      });
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsWorking(false);
    }
  };

  // Entries' Accept: back to entered, and the database restores the check-in the Pull overwrote.
  // Only for a Pull of an accepted entry; anything else (pending, waitlist, withdrawn) is put back
  // on Entries, where its own status is chosen. Reading the history needs a connection.
  const confirmUnpull = async () => {
    if (!unpullRow || isWorking) return;
    const row = unpullRow;
    setIsWorking(true);
    try {
      const before = statusBeforeLatestPull(await getEntryStatusHistory(row.entryId));
      if (before !== ACCEPTED_DB_STATUS) {
        setPending(null);
        toast.error(
          `${row.dogName} was not accepted before the pull. Put this entry back on the Entries page.`
        );
        return;
      }
      await changeSecretaryEntryStatus({
        entry: row.sourceEntry,
        newStatus: EntryStatus.ACCEPTED,
        ...(user?.id ? { secretaryId: user.id } : {}),
      });
      setPending(null);
      await refresh();
      toast.success(`${row.dogName} is back in ${row.className}`);
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsWorking(false);
    }
  };

  // MYK9-1753: Clear a flagged pull. The database restores the check-in the flag overwrote (only it
  // remembers it); a flag set by mistake costs nothing to clear, so it does not ask first.
  const clearFlag = async (row: PeopleRosterClassRow) => {
    if (clearingId) return;
    setClearingId(row.entryId);
    try {
      const restored = await clearFlaggedPull(row.entryId);
      await refresh();
      toast.success(`${row.dogName}, ${row.className}: ${deskStatusLabel(restored)}`);
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setClearingId(null);
    }
  };

  return {
    pullRow,
    unpullRow,
    isWorking,
    clearingId,
    clearFlag,
    requestPull: (row: PeopleRosterClassRow) => setPending({ id: row.entryId, act: 'pull' }),
    requestUnpull: (row: PeopleRosterClassRow) => setPending({ id: row.entryId, act: 'unpull' }),
    cancel: () => setPending(null),
    confirmPull,
    confirmUnpull,
  };
}
