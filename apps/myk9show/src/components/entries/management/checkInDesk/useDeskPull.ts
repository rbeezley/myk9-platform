import { useState } from 'react';
import { toast } from 'sonner';
import { showUndoToast } from '@/lib/undoToast';
import { deskPullCopy, showDayErrorMessage } from '@/features/show-map/showDayErrorCopy';
import { useAuthContext } from '@/hooks/useAuthContext';
import { EntryStatus } from '@/types/show-registration-types';
import { changeSecretaryEntryStatus } from '@/services/database/entries/lifecycle';
import {
  scratchShowMapEntry,
  undoShowMapScratch,
} from '@/features/show-map/showMapActionMutations';
import { getEntryStatusHistory } from '@/services/database/entries/statusHistory';
import { clearFlaggedPull } from '@/services/database/entries/flaggedPull';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { refreshWithoutWaiting } from './refreshWithoutWaiting';
import { ACCEPTED_DB_STATUS, deskStatusLabel, statusBeforeLatestPull } from './deskStatus';

/**
 * What a Pull needs from a class row: the desk's `PeopleRosterClassRow` and the Show Desk class
 * table's rows both fit. Putting a Pull back also needs the stored entry (`sourceEntry`); a caller
 * that has none never offers it.
 */
export interface DeskPullRow {
  entryId: string;
  dogName: string;
  className: string;
  armband: string | null;
  deskStatusEditable: boolean;
  deskCanUnpull: boolean;
  sourceEntry?: EntryManagementEntry | undefined;
}

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
  findRow: (entryId: string) => DeskPullRow | undefined,
  onRefreshEntries?: () => void | Promise<void>
) {
  const { user } = useAuthContext();
  const [pending, setPending] = useState<{ id: string; act: 'pull' | 'unpull' } | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const live = pending ? findRow(pending.id) : undefined;
  const pullRow = pending?.act === 'pull' && live?.deskStatusEditable ? live : undefined;
  const unpullRow =
    pending?.act === 'unpull' && live?.deskCanUnpull && live.sourceEntry ? live : undefined;
  // Forget a confirmation whose class moved on, so it never reopens on its own.
  if (pending && !pullRow && !unpullRow && !isWorking) setPending(null);

  // Never awaited: the write is stored, and an entries re-read that pauses offline would
  // otherwise hold `isWorking` and every later Pull confirmation with it.
  const refresh = () => refreshWithoutWaiting(onRefreshEntries);

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
      refresh();
      showUndoToast({
        message: `${row.dogName} pulled from ${row.className}`,
        onUndo: () => {
          void undoShowMapScratch(undoInput)
            .then(refresh)
            .catch(error =>
              toast.error(
                showDayErrorMessage(error, deskPullCopy.undoFailed(row.dogName, row.className))
              )
            );
        },
      });
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === 'already-pulled') {
        // A repeat Pull on a row that had not refreshed yet: nothing was written, and there is
        // nothing to undo.
        setPending(null);
        refresh();
        toast.info(`${row.dogName} is already pulled from ${row.className}`);
        return;
      }
      toast.error(showDayErrorMessage(error, deskPullCopy.pullFailed(row.dogName, row.className)));
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
    const entry = row.sourceEntry;
    if (!entry) return;
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
        entry,
        newStatus: EntryStatus.ACCEPTED,
        ...(user?.id ? { secretaryId: user.id } : {}),
      });
      setPending(null);
      refresh();
      toast.success(`${row.dogName} is back in ${row.className}`);
    } catch (error) {
      toast.error(
        showDayErrorMessage(error, deskPullCopy.putBackFailed(row.dogName, row.className))
      );
    } finally {
      setIsWorking(false);
    }
  };

  // MYK9-1753: Clear a flagged pull. The database restores the check-in the flag overwrote (only it
  // remembers it); a flag set by mistake costs nothing to clear, so it does not ask first.
  const clearFlag = async (row: DeskPullRow) => {
    if (clearingId) return;
    setClearingId(row.entryId);
    try {
      const restored = await clearFlaggedPull(row.entryId);
      refresh();
      toast.success(`${row.dogName}, ${row.className}: ${deskStatusLabel(restored)}`);
    } catch (error) {
      toast.error(
        showDayErrorMessage(error, deskPullCopy.clearFlagFailed(row.dogName, row.className))
      );
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
    requestPull: (row: DeskPullRow) => setPending({ id: row.entryId, act: 'pull' }),
    requestUnpull: (row: DeskPullRow) => setPending({ id: row.entryId, act: 'unpull' }),
    cancel: () => setPending(null),
    confirmPull,
    confirmUnpull,
  };
}
