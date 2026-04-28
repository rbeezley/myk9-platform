import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { computeArmbandAssignments, resolveStartNumber } from '@/utils/armbandUtils';

/**
 * Returns the string representation of the highest assigned armband for a show,
 * sorted numerically. Queries the armbands table (source of truth), not entries.
 * Text ordering is broken for multi-digit numbers, so we fetch all and sort in JS.
 */
async function fetchMaxArmbandForShow(showId: string): Promise<string | null> {
  const { data } = await supabase
    .from('armbands')
    .select('armband_number')
    .eq('show_id', showId)
    .not('armband_number', 'is', null);

  if (!data || data.length === 0) return null;

  const nums = data
    .map(r => parseInt(r.armband_number, 10))
    .filter(n => !isNaN(n));

  return nums.length === 0 ? null : String(Math.max(...nums));
}

export const assignArmband = async (entryId: string, armband: string) => {
  const startTime = Date.now();

  try {
    const { data: entry, error: lookupError } = await supabase
      .from('entries')
      .select('dog_id, show_id')
      .eq('id', entryId)
      .single();

    if (lookupError || !entry || !entry.dog_id || !entry.show_id) {
      throw createDatabaseError(
        lookupError ?? new Error('Entry not found'),
        'entries',
        'assign_armband'
      );
    }

    const { error: armbandError } = await supabase.from('armbands').upsert(
      {
        show_id: entry.show_id,
        dog_id: entry.dog_id,
        armband_number: armband,
        assigned_at: new Date().toISOString(),
        is_available: false,
      },
      { onConflict: 'show_id,dog_id' }
    );

    if (armbandError) {
      const isConflict = (armbandError as { code?: string }).code === '23505';
      if (isConflict) {
        return {
          data: null,
          error: createDatabaseError(
            new Error(`Armband ${armband} is already assigned to another dog in this show.`),
            'armbands',
            'assign_armband'
          ),
        };
      }
      throw createDatabaseError(armbandError, 'armbands', 'assign_armband');
    }

    const { data, error: updateError } = await supabase
      .from('entries')
      .update({ armband, updated_at: new Date().toISOString() })
      .eq('dog_id', entry.dog_id)
      .eq('show_id', entry.show_id)
      .is('deleted_at', null)
      .select('id');

    const duration = Date.now() - startTime;
    logQuery('entries', 'assign_armband', duration, updateError?.message);

    if (updateError) throw createDatabaseError(updateError, 'entries', 'assign_armband');

    return { data: { updated: data?.length ?? 0, armband }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'assign_armband');
    logQuery('entries', 'assign_armband', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const autoAssignArmbands = async (showId: string, startNumber: number = 1) => {
  const startTime = Date.now();

  try {
    const { data: unassigned, error: fetchError } = await supabase
      .from('entries')
      .select('dog_id')
      .eq('show_id', showId)
      .in('entry_status', ['accepted', 'confirmed'])
      .is('deleted_at', null)
      .is('armband', null);

    if (fetchError) throw createDatabaseError(fetchError, 'entries', 'auto_assign_armbands_fetch');

    const dogIds = [...new Set((unassigned ?? []).map(e => e.dog_id).filter(Boolean) as string[])];

    if (dogIds.length === 0) {
      return { data: { assigned: 0, startedAt: startNumber }, error: null };
    }

    const maxArmband = await fetchMaxArmbandForShow(showId);
    const nextNumber = resolveStartNumber(maxArmband, startNumber);
    const assignments = computeArmbandAssignments(dogIds, nextNumber);

    let assignedCount = 0;
    let skippedCount = 0;
    for (const { dogId, armband } of assignments) {
      const { error: upsertError } = await supabase.from('armbands').upsert(
        {
          show_id: showId,
          dog_id: dogId,
          armband_number: armband,
          assigned_at: new Date().toISOString(),
          is_available: false,
        },
        { onConflict: 'show_id,dog_id' }
      );

      if (upsertError) {
        skippedCount++;
        logQuery('armbands', 'auto_assign_upsert_skip', Date.now() - startTime, upsertError.message);
        continue;
      }

      const { error: updateError } = await supabase
        .from('entries')
        .update({ armband, updated_at: new Date().toISOString() })
        .eq('dog_id', dogId)
        .eq('show_id', showId)
        .is('deleted_at', null);

      if (!updateError) assignedCount++;
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
  const maxArmband = await fetchMaxArmbandForShow(showId);
  return resolveStartNumber(maxArmband, 1);
};

/**
 * Fetches the armband assigned to a single entry (after trigger execution).
 * Used to update local state after accepting an entry without a full reload.
 */
export const getEntryArmbandById = async (
  entryId: string
): Promise<{ armband: string | null; dogId: string | null; showId: string | null } | null> => {
  const { data } = await supabase
    .from('entries')
    .select('armband, dog_id, show_id')
    .eq('id', entryId)
    .single();

  return data ? { armband: data.armband, dogId: data.dog_id, showId: data.show_id } : null;
};
