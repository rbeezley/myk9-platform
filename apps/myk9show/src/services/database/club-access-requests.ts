import { supabase } from './supabaseClient';

export interface SubmitNewClubAccessRequestInput {
  clubName: string;
  website?: string;
  note?: string;
}

export type ClubAccessRequestStatus = 'pending' | 'approved' | 'denied';

export interface ClubAccessRequest {
  id: string;
  requesterPersonId: string;
  requesterName: string;
  requesterEmail: string;
  requestedClubName: string;
  requestedClubWebsite: string | null;
  requestNote: string | null;
  status: ClubAccessRequestStatus;
  approvedClubId: string | null;
  createdAt: string;
  reviewNote: string | null;
}

interface ClubAccessRequestDbRow {
  id: string;
  requester_person_id: string;
  requested_club_name: string;
  requested_club_website: string | null;
  request_note: string | null;
  status: string;
  approved_club_id: string | null;
  created_at: string;
  review_note: string | null;
  requester:
    | { first_name: string | null; last_name: string | null; email: string | null }
    | { first_name: string | null; last_name: string | null; email: string | null }[]
    | null;
}

function mapClubAccessRequest(row: ClubAccessRequestDbRow): ClubAccessRequest {
  const requester = Array.isArray(row.requester) ? row.requester[0] : row.requester;
  return {
    id: row.id,
    requesterPersonId: row.requester_person_id,
    requesterName:
      [requester?.first_name, requester?.last_name].filter(Boolean).join(' ') ||
      'Unknown requester',
    requesterEmail: requester?.email ?? 'No email on file',
    requestedClubName: row.requested_club_name,
    requestedClubWebsite: row.requested_club_website,
    requestNote: row.request_note,
    status: row.status as ClubAccessRequestStatus,
    approvedClubId: row.approved_club_id,
    createdAt: row.created_at,
    reviewNote: row.review_note,
  };
}

/**
 * Asks the myK9Show team to set up a club that is not on the platform yet.
 * This creates a review request; it does not create the club or grant access.
 */
export async function submitNewClubAccessRequest(
  input: SubmitNewClubAccessRequestInput
): Promise<string | null> {
  const { data, error } = await (supabase.rpc as CallableFunction)('submit_club_access_request', {
    p_requested_club_name: input.clubName,
    p_requested_club_website: input.website || null,
    p_request_note: input.note || null,
  });

  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function getPendingClubAccessRequests(): Promise<ClubAccessRequest[]> {
  const { data, error } = await supabase
    .from('club_access_requests')
    .select(
      '*, requester:people!club_access_requests_requester_person_id_fkey(first_name,last_name,email)'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as ClubAccessRequestDbRow[]).map(mapClubAccessRequest);
}

export interface ReviewClubAccessRequestInput {
  requestId: string;
  decision: 'approved' | 'denied';
  existingClubId?: string | null;
  clubName?: string | null;
  reviewNote?: string | null;
}

export async function reviewClubAccessRequest(
  input: ReviewClubAccessRequestInput
): Promise<string | null> {
  const { data, error } = await (supabase.rpc as CallableFunction)('review_club_access_request', {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_existing_club_id: input.existingClubId ?? null,
    p_club_name: input.clubName ?? null,
    p_review_note: input.reviewNote ?? null,
  });

  if (error) throw error;
  return (data as string | null) ?? null;
}
