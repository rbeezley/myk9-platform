/**
 * Public (anonymous) class reads.
 *
 * Logged-out visitors hit public class routes — `/shows/:id/trials/:trialId/classes/:classId`
 * and its `/results` variant (both render `ClassDetailsPage`). Those pages source the
 * class record from the replication layer (React Query `getAllClasses` + the trialStore),
 * which is **cold-empty for a true guest** (guest sync is skipped). The page then bails to a
 * "No Classes Available" empty state at `ClassDetailsPage/index.tsx` (`!currentClass`) — even
 * though the release-gated `view_public_entry_results` read returns 200 with data. The result
 * is a dead-end on shared public-results links.
 *
 * This module is the class-identity counterpart of `entries/publicReads.ts` (the #779/#799
 * anon entry-results path). It mirrors `getPublicShows`: a direct PostgREST read, no
 * replication layer.
 *
 * ANON-SAFETY: this select fetches an **explicit lean column list** (only what
 * `mapDatabaseToClass` consumes) plus the trial join. Two deliberate omissions:
 *   1. No `entries`/`dogs`/`owner`/`people` join — the sibling `postgrestGetClassById`
 *      fans into that PII chain, which anon RLS withholds (it would error or return empty
 *      for a guest). Entry data for the page comes separately through the cascade-gated
 *      `view_public_entry_results`.
 *   2. No `*` — unlike the sibling reads, this names columns so internal audit fields
 *      (`deleted_by`, `results_released_by`, `judge_name`, counts) never travel to anon.
 * The `classes_select` RLS policy admits anon for a published show (migration 016/108), so
 * the lean class read succeeds; an unpublished show's class returns null (no leak).
 */

import { supabase, createDatabaseError } from '../supabaseClient';
import { mapDatabaseToClass, type DbClassWithRelations } from '@/services/mappers/classMappers';

/**
 * Anon-safe explicit column set: exactly the class scalars `mapDatabaseToClass` reads, plus the
 * trial join. Names columns (never `*`) so internal/audit fields are not shipped to guests, and
 * never joins `entries`/`dogs`/`owner`/`people`. Exported so a unit test can pin the
 * no-PII-join invariant.
 */
export const PUBLIC_CLASS_SELECT = `
      id,
      trial_id,
      name,
      status,
      start_time,
      description,
      class_number,
      element,
      level,
      section,
      entry_fee,
      max_entries,
      jump_heights,
      display_order,
      results_released_at,
      created_at,
      updated_at,
      trial:trials (
        id,
        name,
        date,
        trial_number,
        status
      )
    `;

/**
 * Fetch a single class by id for anonymous/public render, bypassing the replication layer.
 * Returns the same `SyncableClassData` shape the store yields (via `mapDatabaseToClass`), so
 * it is a drop-in fallback for `currentClass`. Returns `null` when the class is absent or
 * soft-deleted.
 */
export async function getPublicClassById(
  classId: string
): Promise<ReturnType<typeof mapDatabaseToClass> | null> {
  const { data, error } = await supabase
    .from('classes')
    .select(PUBLIC_CLASS_SELECT)
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw createDatabaseError(error, 'class', 'select_public_by_id');
  if (!data) return null;

  return mapDatabaseToClass(data as unknown as DbClassWithRelations);
}
