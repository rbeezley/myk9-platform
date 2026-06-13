import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { computeArmbandAssignments, resolveStartNumber } from '@/utils/armbandUtils';
import { replicatedArmbandsTable } from '@/services/replication/ReplicatedArmbandsTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

/**
 * Returns the string representation of the highest assigned armband for a show,
 * sorted numerically. Reads the replicated armbands table (source of truth),
 * not entries.
 * Text ordering is broken for multi-digit numbers, so we fetch all and sort in JS.
 */
async function fetchMaxArmbandForShow(showId: string): Promise<string | null> {
  const data = await replicatedArmbandsTable.getByShow(showId);

  if (!data || data.length === 0) return null;

  const nums = data
    .map(r => parseInt(r.armbandNumber, 10))
    .filter(n => !isNaN(n));

  return nums.length === 0 ? null : String(Math.max(...nums));
}

async function fetchStartingArmbandForShow(showId: string): Promise<number> {
  const { data } = await supabase
    .from('shows')
    .select('starting_armband_number')
    .eq('id', showId)
    .maybeSingle();

  const start = Number(data?.starting_armband_number);
  return Number.isFinite(start) && start > 0 ? start : 100;
}

/**
 * Set a specific armband number for an entry. The caller picks the number;
 * this function upserts the armbands row and syncs the entries.armband field.
 *
 * For auto-claiming the next available number, use claimNextArmband() from
 * the reads side of this module.
 */
export const setEntryArmband = async (entryId: string, armband: string) => {
  const startTime = Date.now();

  try {
    const entry = await replicatedEntriesTable.getEntryById(entryId);

    if (!entry?.dogId || !entry.showId) {
      throw new Error('Entry not found');
    }

    await replicatedArmbandsTable.upsertAssignedArmband({
      showId: entry.showId,
      dogId: entry.dogId,
      armbandNumber: armband,
    });
    const data = await replicatedEntriesTable.updateArmbandForDogInShow(
      entry.showId,
      entry.dogId,
      armband
    );

    const duration = Date.now() - startTime;
    logQuery('entries', 'assign_armband', duration);

    return { data: { updated: data.updated, armband }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'assign_armband');
    logQuery('entries', 'assign_armband', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const autoAssignArmbands = async (showId: string, startNumber?: number) => {
  const startTime = Date.now();

  try {
    const configuredStartNumber = startNumber ?? (await fetchStartingArmbandForShow(showId));
    const showEntries = await replicatedEntriesTable.getEntriesByShow(showId);
    const unassigned = showEntries.filter(
      entry =>
        !entry.deletedAt &&
        !entry.deleted_at &&
        !entry.armband &&
        (entry.entryStatus === 'accepted' ||
          entry.entry_status === 'accepted' ||
          entry.entryStatus === 'confirmed' ||
          entry.entry_status === 'confirmed')
    );

    const dogIds = [...new Set(unassigned.map(e => e.dogId).filter(Boolean) as string[])];

    if (dogIds.length === 0) {
      return { data: { assigned: 0, startedAt: configuredStartNumber }, error: null };
    }

    const maxArmband = await fetchMaxArmbandForShow(showId);
    const nextNumber = resolveStartNumber(maxArmband, configuredStartNumber);
    const assignments = computeArmbandAssignments(dogIds, nextNumber);

    let assignedCount = 0;
    let skippedCount = 0;
    for (const { dogId, armband } of assignments) {
      try {
        await replicatedArmbandsTable.upsertAssignedArmband({
          showId,
          dogId,
          armbandNumber: armband,
        });
        await replicatedEntriesTable.updateArmbandForDogInShow(showId, dogId, armband);
        assignedCount++;
      } catch (error) {
        skippedCount++;
        const message = error instanceof Error ? error.message : String(error);
        logQuery('armbands', 'auto_assign_upsert_skip', Date.now() - startTime, message);
      }
    }

    const duration = Date.now() - startTime;
    logQuery('entries', 'auto_assign_armbands', duration);
    return {
      data: { assigned: assignedCount, skipped: skippedCount, startedAt: nextNumber },
      error: null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'auto_assign_armbands');
    logQuery('entries', 'auto_assign_armbands', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/** Returns the next available armband number for a show (numeric max + 1, or 1). */
export const getNextArmbandForShow = async (showId: string): Promise<number> => {
  const [maxArmband, startingArmband] = await Promise.all([
    fetchMaxArmbandForShow(showId),
    fetchStartingArmbandForShow(showId),
  ]);
  return resolveStartNumber(maxArmband, startingArmband);
};

/**
 * Fetches the armband assigned to a single entry (after trigger execution).
 * Used to update local state after accepting an entry without a full reload.
 */
export const getEntryArmbandById = async (
  entryId: string
): Promise<{ armband: string | null; dogId: string | null; showId: string | null } | null> => {
  const entry = await replicatedEntriesTable.getEntryById(entryId);
  if (!entry) return null;

  const armband =
    entry.armband ??
    (entry.showId && entry.dogId
      ? (await replicatedArmbandsTable.getByShow(entry.showId)).find(a => a.dogId === entry.dogId)
          ?.armbandNumber
      : null) ??
    null;

  return { armband, dogId: entry.dogId ?? null, showId: entry.showId ?? null };
};
