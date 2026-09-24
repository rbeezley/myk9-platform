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
  /** The server says no new ask is possible; tell them who to contact. */
  | { kind: 'blocked'; message: string }
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

/**
 * The states a server status read can produce. Each request type maps its
 * server answer to one of these directly; nothing is inferred on the client.
 */
export type ServerRequestState = Extract<
  ClubRequestState,
  { kind: 'has-access' | 'blocked' | 'pending' | 'approved' | 'denied' | 'available' }
>;

export type SubmitFailure = 'already-pending' | 'standing-denial' | 'already-member' | 'unknown';

export function classifySubmitError(error: unknown): SubmitFailure {
  if (error instanceof RoleRequestAlreadyPendingError) return 'already-pending';
  if (error instanceof RoleRequestStandingDenialError) return 'standing-denial';
  if (error instanceof AlreadyClubMemberError) return 'already-member';
  return 'unknown';
}

export const GENERIC_SUBMIT_ERROR = "We couldn't send that request. Please try again.";
