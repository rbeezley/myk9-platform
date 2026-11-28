import { supabase } from './supabaseClient';
import {
  normalizeClubRegistryNumbers,
  type ClubRegistryNumbers,
} from '@/utils/clubRegistryNumbers';

export type ClubAccessRequestStatus = 'pending' | 'approved' | 'denied';

export interface ClubAccessRequest {
  id: string;
  requesterPersonId: string;
  requesterName: string;
  requesterEmail: string;
  requestedClubName: string;
  requestedClubWebsite: string | null;
  requestNote: string | null;
  clubNumbers: ClubRegistryNumbers;
  status: ClubAccessRequestStatus;
  approvedClubId: string | null;
  /** MYK9-2046: the club the home page form already created, waiting for approval. */
  createdClubId: string | null;
  createdAt: string;
  reviewNote: string | null;
}

interface ClubAccessRequestDbRow {
  id: string;
  requester_person_id: string;
  requested_club_name: string;
  requested_club_website: string | null;
  request_note: string | null;
  club_numbers?: Record<string, string | null> | null;
  status: string;
  approved_club_id: string | null;
  created_club_id?: string | null;
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
    clubNumbers: normalizeClubRegistryNumbers(row.club_numbers),
    status: row.status as ClubAccessRequestStatus,
    approvedClubId: row.approved_club_id,
    createdClubId: row.created_club_id ?? null,
    createdAt: row.created_at,
    reviewNote: row.review_note,
  };
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
  /** MYK9-2513: with a decline, also delete the club the request created (refused while it has shows). */
  deleteClub?: boolean;
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
    // Sent only when asked for, so every other call is the one the server already knew.
    ...(input.deleteClub ? { p_delete_club: true } : {}),
  });

  if (error) throw error;
  return (data as string | null) ?? null;
}
