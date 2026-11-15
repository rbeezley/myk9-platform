import { supabase } from './supabaseClient';
import {
  normalizeClubRegistryNumbers,
  type ClubRegistryNumbers,
} from '@/utils/clubRegistryNumbers';

// MYK9-2046: the home page club form. The server creates the club (waiting for
// approval), makes the caller its club admin and secretary, and files the request
// for the owner's queue, all in one transaction (request_new_club).

export interface RequestNewClubInput {
  clubName: string;
  clubNumbers: ClubRegistryNumbers;
  note?: string;
  website?: string;
}

export interface RequestNewClubResult {
  clubId: string;
  requestId: string;
  /** True when the same pending request was already on file; no second club was made. */
  alreadyRequested: boolean;
}

/** The server's refusal for a name that is already a club (SQLSTATE 23505, club_name_taken). */
export class ClubNameTakenError extends Error {
  constructor() {
    super('club_name_taken');
    this.name = 'ClubNameTakenError';
  }
}

/** The pending-request limit (SQLSTATE 53400). Retrying cannot succeed until she is answered. */
export class TooManyClubRequestsError extends Error {
  constructor() {
    super('too_many_club_requests');
    this.name = 'TooManyClubRequestsError';
  }
}

export const TOO_MANY_CLUB_REQUESTS_MESSAGE =
  "You already have 3 club requests waiting. We'll answer those first.";

export async function requestNewClub(input: RequestNewClubInput): Promise<RequestNewClubResult> {
  const { data, error } = await (supabase.rpc as CallableFunction)('request_new_club', {
    p_club_name: input.clubName,
    p_club_numbers: normalizeClubRegistryNumbers(input.clubNumbers),
    p_request_note: input.note || null,
    p_club_website: input.website || null,
  });

  if (error) {
    if (error.code === '23505' && String(error.message).includes('club_name_taken')) {
      throw new ClubNameTakenError();
    }
    if (error.code === '53400') throw new TooManyClubRequestsError();
    throw error;
  }

  const row = data as { club_id: string; request_id: string; already_requested: boolean };
  return {
    clubId: row.club_id,
    requestId: row.request_id,
    alreadyRequested: row.already_requested,
  };
}
