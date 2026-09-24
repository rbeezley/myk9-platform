/**
 * One state shape for both club-routed asks (MYK9-685): secretary/show-manager
 * access and ordinary club membership. Every state a request can be in has a
 * name here, so a surface can never fall through to "nothing rendered" the
 * way the Request additional access page did when the secretary card
 * silently returned null.
 */
import {
  RoleRequestAlreadyPendingError,
  RoleRequestStandingDenialError,
  type RoleRequestStatus,
} from '@/services/database/role-requests';
import { AlreadyClubMemberError } from '@/services/database/club-membership-requests';

export type ClubRequestState =
  /** No signed-in identity to ask with. */
  | { kind: 'signed-out' }
  | { kind: 'loading' }
  /** The status check failed; fail closed rather than re-offer a submit. */
  | { kind: 'error' }
  /** Nothing to ask for: the person already has what this request grants. */
  | { kind: 'has-access'; message: string }
  | { kind: 'pending' }
  | { kind: 'approved' }
  | { kind: 'denied'; reviewerNote: string | null }
  | { kind: 'available' };

export interface ClubRequestController {
  state: ClubRequestState;
  submit: (note: string) => void;
  isSubmitting: boolean;
  /** True after this session's submit succeeded (drives the inline confirmation). */
  justSubmitted: boolean;
  submitError: string | null;
  retry: () => void;
}

/** Folds the server status into a state, after the has-access checks ran. */
export function stateFromStatus(args: {
  isLoading: boolean;
  isError: boolean;
  status: RoleRequestStatus | null;
  reviewerNote: string | null;
  deniedThisSession: boolean;
}): ClubRequestState {
  if (args.deniedThisSession) return { kind: 'denied', reviewerNote: args.reviewerNote };
  if (args.status === 'approved') return { kind: 'approved' };
  if (args.status === 'denied') return { kind: 'denied', reviewerNote: args.reviewerNote };
  if (args.status === 'pending') return { kind: 'pending' };
  if (args.isError) return { kind: 'error' };
  if (args.isLoading) return { kind: 'loading' };
  return { kind: 'available' };
}

export type SubmitFailure = 'already-pending' | 'standing-denial' | 'already-member' | 'unknown';

export function classifySubmitError(error: unknown): SubmitFailure {
  if (error instanceof RoleRequestAlreadyPendingError) return 'already-pending';
  if (error instanceof RoleRequestStandingDenialError) return 'standing-denial';
  if (error instanceof AlreadyClubMemberError) return 'already-member';
  return 'unknown';
}

export const GENERIC_SUBMIT_ERROR = "We couldn't send that request. Please try again.";
