import { useQuery } from '@tanstack/react-query';
import {
  getEntriesByClass,
  getPublicEntriesByClass,
  type PublicEntryRow,
} from '@/services/database/entries';
import { cacheStrategies } from '@/lib/queryClient';
import { useAuthContext } from '@/hooks/useAuthContext';

/** Raw DB entry row with all columns intact (no mapper that drops scoring fields). */
export interface RawEntryRow {
  id: string;
  class_id: string;
  show_id: string;
  dog_id: string;
  entry_status?: string | null;
  payment_status?: string | null;
  registration?: { payment_status?: string | null } | null;
  handler_id: string | null;
  armband: string | null;
  handler: string | null;
  result_status: string | null;
  is_scored: boolean | null;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  judge_notes: string | null;
  disqualification_reason: string | null;
  scoring_completed_at: string | null;
  check_in_status: string | null;
  run_order: number | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
    registrations?:
      | Array<{
          organization: string | null;
          breed: string | null;
        }>
      | null
      | undefined;
    owner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  } | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Adapt a cascade-gated public view row into the RawEntryRow shape. Scored
 * columns arrive already NULLed by the database when withheld; PII (owner,
 * judge notes) is unavailable to anon and maps to null.
 */
export function publicRowToRawEntryRow(row: PublicEntryRow): RawEntryRow {
  return {
    id: row.id,
    class_id: row.class_id ?? '',
    show_id: row.show_id ?? '',
    dog_id: row.dog_id ?? '',
    entry_status: row.entry_status,
    payment_status: null,
    registration: null,
    handler_id: null,
    armband: row.armband,
    handler: row.handler,
    result_status: row.result_status,
    is_scored: row.is_scored,
    search_time_seconds: row.search_time_seconds,
    total_faults: row.total_faults,
    final_placement: row.final_placement,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: row.scoring_completed_at,
    check_in_status: row.check_in_status,
    run_order: row.run_order,
    dog: row.dog_id
      ? {
          id: row.dog_id,
          name: row.dog_name ?? '',
          call_name: row.dog_call_name,
          breed: row.dog_breed,
          owner: null,
        }
      : null,
    created_at: row.created_at,
    updated_at: null,
  };
}

/**
 * Returns raw DB entry rows for a class with all scoring columns intact.
 * Unlike useClassEntriesWithQuery, this does NOT run through mapDatabaseToEntry
 * which drops scoring fields.
 *
 * Anonymous visitors read through `view_public_entry_results`, which the
 * database has already gated per the result-visibility cascade — withheld
 * scored columns arrive NULL. Authenticated callers use the full table read
 * (still governed by RLS).
 */
export function useClassEntriesRaw(classId: string | undefined) {
  const { user, loading } = useAuthContext();
  const isAnon = !user;

  return useQuery({
    queryKey: ['classes', classId, 'entries', isAnon ? 'public' : 'auth'],
    queryFn: async () => {
      if (!classId) return [];
      if (isAnon) {
        const { data } = await getPublicEntriesByClass(classId);
        return data.map(publicRowToRawEntryRow);
      }
      const { data, error } = await getEntriesByClass(classId);
      if (error) throw error;
      return (data ?? []) as unknown as RawEntryRow[];
    },
    enabled: !!classId && !loading,
    ...cacheStrategies.dynamic,
  });
}
