export interface ClubAccessRequest {
  id: string;
  requester_person_id: string;
  requester_auth_user_id: string;
  requested_club_name: string;
  requested_club_website: string | null;
  request_note: string | null;
  status: 'pending' | 'approved' | 'denied';
  approved_club_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  requester?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

export interface ApproveClubAccessRequestInput {
  requestId: string;
  existingClubId?: string | null;
  clubName?: string | null;
  reviewNote?: string | null;
}

export interface DenyClubAccessRequestInput {
  requestId: string;
  reviewNote?: string | null;
}
