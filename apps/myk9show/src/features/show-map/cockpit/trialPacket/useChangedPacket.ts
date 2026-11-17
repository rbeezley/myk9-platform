import { useMemo, useState } from 'react';

import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { DbClass, DbEntry } from '@/types/database-mappings';

import type { PrintedSheetRows } from '../printedSheetDescriptor';
import { useShowPaperworkPrints } from '../useShowPaperworkPrints';
import { onlyPacketClasses, packetPrintStatus, type PacketPrintStatus } from './changedClasses';
import type { CollatedTrialPacket } from './collateTrialPacket';

export interface ChangedPacket {
  status: PacketPrintStatus | null;
  /** The packet as shown: only what needs printing, or every class. */
  packet: CollatedTrialPacket | null;
  /** The view is "only what needs printing". */
  onlyNeed: boolean;
  /** "Only what needs printing" with nothing in it: everything is printed and unchanged. */
  emptyView: boolean;
  /** Classes that need printing right now, split by why. */
  changedCount: number;
  unprintedCount: number;
  /** Classes the narrowed view holds, which includes ones printed since the panel opened. */
  shownCount: number;
  chooseOnlyNeed: (only: boolean) => void;
}

interface Decision {
  /** The mode the panel opened on. Only her clicks change the mode after this. */
  mode: 'need' | 'all';
  /** The classes that needed printing at that moment. */
  baseIds: ReadonlySet<string>;
}

/**
 * The trial panel's "only what needs printing" view (MYK9-2074). The opening mode is decided ONCE,
 * when the print history first settles, and never re-derived: a print, a sync or a new record
 * must not swap the view out from under the "marked as printed" line (round 3).
 *
 * - Some but not all classes need printing, or none do: opens on "need" (none is the empty view).
 * - Nothing was ever printed, every class changed, or the history is unknown: opens on "all".
 *
 * In "need" the shown classes are those that needed printing when it opened plus any that need it
 * now, so a class she just printed stays on screen and a newly changed one appears.
 */
export function useChangedPacket(input: {
  showId: string;
  fullPacket: CollatedTrialPacket | null;
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
  /** The rows the check-in sheet and scoresheet print from, and whether they are settled. */
  printedSheets: PrintedSheetRows;
  printedSheetsSettled: boolean;
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> | undefined;
}): ChangedPacket {
  const {
    showId,
    fullPacket,
    classes,
    entries,
    printedSheets,
    printedSheetsSettled,
    assignedJudges,
  } = input;
  const prints = useShowPaperworkPrints(showId);
  const recordsFailed = prints.isError || prints.syncFailed;
  const status = useMemo(
    () =>
      fullPacket
        ? packetPrintStatus({
            showId,
            packet: fullPacket,
            classes,
            entries,
            printedSheets,
            printedSheetsSettled,
            records: prints.data,
            recordsLoading: prints.isLoading && !recordsFailed,
            recordsUnavailable: recordsFailed,
            assignedJudges,
          })
        : null,
    [
      fullPacket,
      showId,
      classes,
      entries,
      printedSheets,
      printedSheetsSettled,
      assignedJudges,
      prints.data,
      prints.isLoading,
      recordsFailed,
    ]
  );
  const known = status?.kind === 'known' ? status : null;
  const [decision, setDecision] = useState<Decision | null>(null);
  const [choice, setChoice] = useState<boolean | null>(null);

  // Decided once, as soon as the history is known or known to be unreadable (render-phase update,
  // guarded so it runs a single time).
  if (decision === null && status && status.kind !== 'loading') {
    setDecision(
      status.kind === 'known' && status.needIds.size < status.total
        ? { mode: 'need', baseIds: status.needIds }
        : { mode: 'all', baseIds: new Set() }
    );
  }

  const onlyNeed = choice ?? decision?.mode === 'need';
  const shownIds = useMemo(
    () => new Set([...(decision?.baseIds ?? []), ...(known?.needIds ?? [])]),
    [decision, known]
  );
  // Narrow only while the history is known: when it goes unavailable the packet holds every class,
  // as the note says, and the opening decision comes back when the history does.
  const narrowed = onlyNeed && known !== null;
  const packet = useMemo(
    () => (fullPacket && narrowed ? onlyPacketClasses(fullPacket, shownIds) : fullPacket),
    [fullPacket, narrowed, shownIds]
  );

  return {
    status,
    packet,
    onlyNeed: narrowed,
    emptyView: narrowed && Boolean(fullPacket) && packet?.judges.length === 0,
    changedCount: known?.changedIds.size ?? 0,
    unprintedCount: known?.unprintedIds.size ?? 0,
    shownCount: narrowed ? shownIds.size : 0,
    chooseOnlyNeed: setChoice,
  };
}
