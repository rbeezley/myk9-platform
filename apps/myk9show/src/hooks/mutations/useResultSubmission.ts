/**
 * useResultSubmission — React Query mutation and query hooks for the
 * result_submissions table.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResultSubmissionInsert {
  show_id: string;
  trial_id?: string | null;
  organization: string;
  sport_type: string;
  xml_payload?: string | null;
  status?: 'pending' | 'sent' | 'failed';
}

export interface ResultSubmissionRow {
  id: string;
  show_id: string;
  trial_id: string | null;
  organization: string;
  sport_type: string;
  submitted_at: string;
  submitted_by: string | null;
  xml_payload: string | null;
  status: 'pending' | 'sent' | 'failed';
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const resultSubmissionKeys = {
  byShow: (showId: string) => ['result_submissions', 'show', showId] as const,
};

// ---------------------------------------------------------------------------
// Mutation — insert a new submission record
// ---------------------------------------------------------------------------

async function insertSubmission(input: ResultSubmissionInsert): Promise<ResultSubmissionRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('result_submissions')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to record submission: ${error.message}`);
  return data as ResultSubmissionRow;
}

export function useResultSubmission(showId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: insertSubmission,
    onSuccess: () => {
      if (showId) {
        queryClient.invalidateQueries({ queryKey: resultSubmissionKeys.byShow(showId) });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Query — fetch submission history for a show
// ---------------------------------------------------------------------------

async function fetchSubmissions(showId: string): Promise<ResultSubmissionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('result_submissions')
    .select('*')
    .eq('show_id', showId)
    .order('submitted_at', { ascending: false });

  if (error) throw new Error(`Failed to load submissions: ${error.message}`);
  return (data ?? []) as ResultSubmissionRow[];
}

export function useResultSubmissions(showId: string) {
  return useQuery({
    queryKey: resultSubmissionKeys.byShow(showId),
    queryFn: () => fetchSubmissions(showId),
    enabled: Boolean(showId),
  });
}
