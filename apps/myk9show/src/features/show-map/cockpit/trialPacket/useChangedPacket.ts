import { useCallback, useMemo, useState } from 'react';

import type { DbClass, DbEntry } from '@/types/database-mappings';

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
  /** The classes the narrowed view holds, once printing has pinned them. */
  pinned: boolean;
  /** Some classes are fine or changed, so "only what needs printing" says something. */
  narrowable: boolean;
  /** How many classes the narrowed view holds, split by why. */
  changedCount: number;
  unprintedCount: number;
  chooseOnlyNeed: (only: boolean) => void;
  /** Keeps the classes just printed on screen, so they do not vanish from the view they came from. */
  pinShown: () => void;
}

/**
 * The trial panel's "only what needs printing" view (MYK9-2074). It opens narrowed when some
 * classes changed since printing or were never printed while others are fine, and on every class
 * when nothing was ever printed, or when the print history cannot be read.
 */
export function useChangedPacket(input: {
  showId: string;
  fullPacket: CollatedTrialPacket | null;
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
}): ChangedPacket {
  const { showId, fullPacket, classes, entries } = input;
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
            records: prints.data,
            recordsLoading: prints.isLoading && !recordsFailed,
            recordsUnavailable: recordsFailed,
          })
        : null,
    [fullPacket, showId, classes, entries, prints.data, prints.isLoading, recordsFailed]
  );
  const known = status?.kind === 'known' ? status : null;
  const [choice, setChoice] = useState<boolean | null>(null);
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string> | null>(null);

  // Narrowing says something only when some classes are fine or some changed; when nothing was
  // ever printed it is the same packet, so the view stays on every class without a note.
  const narrowable = Boolean(
    known && (known.changedIds.size > 0 || known.needIds.size < known.total)
  );
  const onlyNeed = (narrowable || pinnedIds !== null) && (choice ?? true);
  const shownIds = pinnedIds ?? known?.needIds ?? null;
  const packet = useMemo(
    () =>
      fullPacket && onlyNeed && shownIds ? onlyPacketClasses(fullPacket, shownIds) : fullPacket,
    [fullPacket, onlyNeed, shownIds]
  );
  const pinShown = useCallback(() => {
    if (onlyNeed && shownIds && !pinnedIds) setPinnedIds(shownIds);
  }, [onlyNeed, shownIds, pinnedIds]);

  return {
    status,
    packet,
    onlyNeed,
    emptyView: onlyNeed && Boolean(fullPacket) && packet?.judges.length === 0,
    pinned: pinnedIds !== null,
    narrowable,
    changedCount: known?.changedIds.size ?? 0,
    unprintedCount: known?.unprintedIds.size ?? 0,
    chooseOnlyNeed: setChoice,
    pinShown,
  };
}
