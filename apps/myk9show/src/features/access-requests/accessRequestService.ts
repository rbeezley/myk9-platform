import { supabase } from '@/lib/supabase';
import type {
  ApproveClubAccessRequestInput,
  ClubAccessRequest,
  DenyClubAccessRequestInput,
} from './accessRequestTypes';

const REQUEST_SELECT =
  'id, requester_person_id, requester_auth_user_id, requested_club_name, requested_club_website, request_note, status, approved_club_id, reviewed_by, reviewed_at, review_note, created_at, updated_at, requester:people!club_access_requests_requester_person_id_fkey(id, first_name, last_name, email)';

function throwIfError(error: unknown): asserts error is null {
  if (error) {
    const message = error instanceof Error ? error.message : 'Access request operation failed';
    throw new Error(message);
  }
}

export const accessRequestService = {
  async listPending(): Promise<ClubAccessRequest[]> {
    const { data, error } = await supabase
      .from('club_access_requests')
      .select(REQUEST_SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    throwIfError(error);
    return (data ?? []) as ClubAccessRequest[];
  },

  async listMine(): Promise<ClubAccessRequest[]> {
    const { data, error } = await supabase
      .from('club_access_requests')
      .select(REQUEST_SELECT)
      .order('created_at', { ascending: false });

    throwIfError(error);
    return (data ?? []) as ClubAccessRequest[];
  },

  async approve(input: ApproveClubAccessRequestInput): Promise<string | null> {
    const { data, error } = await supabase.rpc('review_club_access_request', {
      p_request_id: input.requestId,
      p_decision: 'approved',
      p_existing_club_id: input.existingClubId ?? null,
      p_club_name: input.clubName ?? null,
      p_review_note: input.reviewNote ?? null,
    });

    throwIfError(error);
    return data as string | null;
  },

  async deny(input: DenyClubAccessRequestInput): Promise<void> {
    const { error } = await supabase.rpc('review_club_access_request', {
      p_request_id: input.requestId,
      p_decision: 'denied',
      p_existing_club_id: null,
      p_club_name: null,
      p_review_note: input.reviewNote ?? null,
    });

    throwIfError(error);
  },
};
