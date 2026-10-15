import { useEffect, useState } from 'react';
import { isHeldEntry } from '@/features/dogs/identity';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

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
 */
export function useEntryHeld(entryId: string | undefined): boolean {
  const [held, setHeld] = useState<{ entryId: string; held: boolean } | null>(null);

  useEffect(() => {
    if (!entryId) return;
    let active = true;
    const read = () => {
      // Through a resolved promise, so a read that throws synchronously is a
      // failed read (not held) like one that rejects.
      Promise.resolve()
        .then(() => replicatedEntriesTable.getEntryById(entryId))
        .then(row => {
          if (active) setHeld({ entryId, held: row ? isHeldEntry(row) : false });
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
