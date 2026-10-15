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
 * `onPlayable` runs once per entry, on the first read that finds it NOT held:
 * when the sheet opens for a dog that is free to run, or later, when a hold
 * clears on an open sheet. The sheets move the dog in-ring there, so a held dog
 * is never marked in-ring and a released one is, without reopening the sheet.
 */
export function useEntryHeld(
  entryId: string | undefined,
  onPlayable?: (row: ReplicatedEntry) => void
): boolean {
  const [held, setHeld] = useState<{ entryId: string; held: boolean } | null>(null);
  const onPlayableRef = useRef(onPlayable);
  useEffect(() => {
    onPlayableRef.current = onPlayable;
  });

  useEffect(() => {
    if (!entryId) return;
    let active = true;
    let released = false;
    const read = () => {
      // Through a resolved promise, so a read that throws synchronously is a
      // failed read (not held) like one that rejects.
      Promise.resolve()
        .then(() => replicatedEntriesTable.getEntryById(entryId))
        .then(row => {
          if (!active) return;
          const isHeld = row ? isHeldEntry(row) : false;
          setHeld({ entryId, held: isHeld });
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
  return held !== null && held.entryId === entryId && held.held;
}
