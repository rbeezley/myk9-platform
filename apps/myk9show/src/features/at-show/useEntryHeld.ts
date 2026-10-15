import { useEffect, useRef, useState } from 'react';
import { isHeldEntry } from '@/features/dogs/identity';
import {
  replicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable';

/**
 * MYK9-1162: is this entry held right now (awaiting a registration number)?
 *
 * Live, in both directions: read from the replica when the sheet opens and again
 * on every replica change, so a hold that sync brings in locks an open sheet and
 * a hold that clears unlocks it, with no reload and no lost draft. The server's
 * score guard stays the authority; this only keeps a sheet from offering a score
 * the server will refuse. An entry that cannot be read is not held.
 *
 * One hook for every scoresheet (ringside and the secretary's paper scoring), so
 * the two can never disagree about the same dog.
 *
 * Two answers: `held` (right now) and `locked` (held since the sheet opened, so
 * no run has started). Only a LOCKED sheet is frozen behind the notice. A hold
 * that arrives on a sheet already open leaves the sheet working, so a judge mid
 * run can still stop the clock (a frozen stopwatch kept running and could time
 * the dog out); only the save is refused. Once a hold clears, a later one is
 * never a lock again for this sheet.
 *
 * `onPlayable` runs once per entry, on the first read that finds it NOT held:
 * when the sheet opens for a dog that is free to run, or later, when a hold
 * clears on an open sheet. The sheets move the dog in-ring there, so a held dog
 * is never marked in-ring and a released one is, without reopening the sheet.
 */
export function useEntryHeld(
  entryId: string | undefined,
  onPlayable?: (row: ReplicatedEntry) => void
): EntryHoldState {
  const [state, setState] = useState<{ entryId: string; held: boolean; locked: boolean } | null>(
    null
  );
  const onPlayableRef = useRef(onPlayable);
  useEffect(() => {
    onPlayableRef.current = onPlayable;
  });

  useEffect(() => {
    if (!entryId) return;
    let active = true;
    let released = false;
    let firstRead = true;
    let locked = false;
    const read = () => {
      // Through a resolved promise, so a read that throws synchronously is a
      // failed read (not held) like one that rejects.
      Promise.resolve()
        .then(() => replicatedEntriesTable.getEntryById(entryId))
        .then(row => {
          if (!active) return;
          const isHeld = row ? isHeldEntry(row) : false;
          // Locked only by a hold present on the first read; cleared for good.
          locked = firstRead ? isHeld : locked && isHeld;
          firstRead = false;
          setState({ entryId, held: isHeld, locked });
          if (row && !isHeld && !released) {
            released = true;
            onPlayableRef.current?.(row);
          }
        })
        .catch(() => undefined);
    };
    read();
    const unsubscribe = replicatedEntriesTable.subscribe(read);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [entryId]);

  // A verdict read for another entry says nothing about this one.
  if (state === null || state.entryId !== entryId) return NOT_HELD;
  return { held: state.held, locked: state.locked };
}

export interface EntryHoldState {
  /** Held right now: the save is refused. */
  held: boolean;
  /** Held since the sheet opened: the sheet is frozen behind the notice. */
  locked: boolean;
}

const NOT_HELD: EntryHoldState = { held: false, locked: false };
