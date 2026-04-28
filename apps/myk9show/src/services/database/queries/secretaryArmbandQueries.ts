import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { computeArmbandAssignments, resolveStartNumber } from '@/utils/armbandUtils';

/**
 * Assign armband number to an entry (per-dog-per-show: upserts into armbands table
 * and propagates the armband value to ALL class entries for that dog in that show).
 */
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

/**
 * Auto-assign sequential armbands to all unassigned accepted/confirmed dogs in a show.
 * Deduplicates by dog: each dog gets one armband number regardless of how many classes
 * they are entered in, and the number is propagated to all their class entries.
 */
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

    const { data: maxRow } = await supabase
      .from('entries')
      .select('armband')
      .eq('show_id', showId)
      .is('deleted_at', null)
      .not('armband', 'is', null)
      .order('armband', { ascending: false })
      .limit(1)
      .single();

    const nextNumber = resolveStartNumber(maxRow?.armband ?? null, startNumber);
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
        logQuery(
          'armbands',
          'auto_assign_upsert_skip',
          Date.now() - startTime,
          upsertError.message
        );
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

/**
 * Returns the next available armband number for a show (max existing + 1, or 1 if none).
 */
export const getNextArmbandForShow = async (showId: string): Promise<number> => {
  const { data: maxRow } = await supabase
    .from('entries')
    .select('armband')
    .eq('show_id', showId)
    .is('deleted_at', null)
    .not('armband', 'is', null)
    .order('armband', { ascending: false })
    .limit(1)
    .single();

  return resolveStartNumber(maxRow?.armband ?? null, 1);
};
