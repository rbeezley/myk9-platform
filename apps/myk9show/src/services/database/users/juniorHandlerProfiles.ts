import { supabase } from '@/lib/supabase';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';

/**
 * MYK9-570 / MYK9-664: is each entry's handler a junior at that entry's trial?
 *
 * The secretary printing a catalog may not read a handler's date of birth
 * (MYK9-664, owner decision b). Each entry RECORDS the answer when it is created
 * (`entries.handler_is_junior`, written by one database trigger), and
 * `recorded_entry_handler_junior_flags()` returns that stored boolean for entries
 * in shows the caller manages, nothing else. It is never derived live on a
 * manager's request: a manager who can edit the trial date could otherwise ask
 * again after each edit and bisect the handler's 18th birthday.
 *
 * The handler's own name comes with it, from `people` (which managers may
 * read), so the mapper can still refuse to mark a line whose printed handler
 * is not the person `handler_id` names (`handlerNameMatchesPerson`).
 *
 * Why a separate read rather than a join: the report/catalog entry rows come
 * from the replication-backed scoped reads, and the replica carries
 * `entries.handler_id` but nothing from `people`. Paperwork enrichment, not a
 * core offline flow, and ANCILLARY: a failure marks the read incomplete and the
 * catalog prints without junior marks rather than refusing to print.
 */
export interface EntryHandlerJunior {
  /** The handler's own name, used to check they are the handler the paperwork prints. */
  firstName: string | null;
  lastName: string | null;
  /** Recorded at entry: true = junior at this entry's trial, false = adult, null = unknown. */
  isJunior: boolean | null;
}

export interface EntryHandlerJuniorResult {
  byEntryId: Map<string, EntryHandlerJunior>;
  /** False when any read failed, so a caller can say "not marked" rather than "not junior". */
  readComplete: boolean;
}

export interface EntryHandlerRef {
  entryId: string;
  handlerId: string;
}

export async function loadEntryHandlerJuniorFlags(
  entries: readonly EntryHandlerRef[]
): Promise<EntryHandlerJuniorResult> {
  const refs = entries.filter(ref => ref.entryId && ref.handlerId);
  if (refs.length === 0) return { byEntryId: new Map(), readComplete: true };

  const namesByPersonId = new Map<string, { firstName: string | null; lastName: string | null }>();
  const flagsByEntryId = new Map<string, boolean | null>();
  let readComplete = true;

  const handlerIds = [...new Set(refs.map(ref => ref.handlerId))];
  // Batched, not one `.in(...)`: the filter travels in the URL, and a secretary
  // printing a whole show's catalog sends hundreds of handler ids (MYK9-272).
  for (const batch of chunk(handlerIds, ID_CHUNK_SIZE)) {
    try {
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name')
        .in('id', batch);
      if (error) {
        readComplete = false;
        continue;
      }
      for (const row of data ?? []) {
        namesByPersonId.set(row.id, {
          firstName: row.first_name ?? null,
          lastName: row.last_name ?? null,
        });
      }
    } catch {
      // Offline. Keep whatever the earlier batches returned and report partial.
      readComplete = false;
    }
  }

  // An RPC body is POSTed, so the id list has no URL ceiling; batched anyway so
  // one oversized show cannot time out the whole read.
  for (const batch of chunk(
    refs.map(ref => ref.entryId),
    ID_CHUNK_SIZE
  )) {
    try {
      const { data, error } = await supabase.rpc('recorded_entry_handler_junior_flags', {
        p_entry_ids: batch,
      });
      if (error) {
        readComplete = false;
        continue;
      }
      for (const row of data ?? []) {
        flagsByEntryId.set(row.entry_id, row.is_junior ?? null);
      }
    } catch {
      readComplete = false;
    }
  }

  const byEntryId = new Map<string, EntryHandlerJunior>();
  for (const ref of refs) {
    const name = namesByPersonId.get(ref.handlerId);
    if (!name) continue;
    byEntryId.set(ref.entryId, {
      ...name,
      isJunior: flagsByEntryId.get(ref.entryId) ?? null,
    });
  }

  return { byEntryId, readComplete };
}
