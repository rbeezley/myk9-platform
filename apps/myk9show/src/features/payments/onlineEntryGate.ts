import { getErrorMessage } from '@myk9/core';

// Publishing a show opens online entries (status 'published' is the
// entries-open state), and online entry fees can only be paid out to clubs
// with a working Stripe Connect account. Fail closed: no account row, or a
// row without payouts_enabled, blocks NEWLY publishing. Shows that are
// already published are never un-published by this gate.

export const PUBLISH_BLOCKED_MESSAGE =
  "Connect your club's payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.";

/** Mirrors enforce_show_publish_gate()'s club_id IS NULL refusal verbatim
 * (supabase/migrations/20260915221500). Distinct from PUBLISH_BLOCKED_MESSAGE
 * so callers can decide whether a "connect Stripe" action makes sense --
 * it never does for this refusal. */
export const CLUB_REQUIRED_MESSAGE =
  'Assign a club to this show before publishing — entry fees are paid out to the club.';

export function canEnableOnlineEntries(
  account: { payouts_enabled: boolean } | null | undefined
): boolean {
  return account?.payouts_enabled === true;
}

// MYK9-579: the client-side checks above are a UX convenience, not the
// enforcement boundary — enforce_show_publish_gate() (a BEFORE INSERT OR
// UPDATE OF status trigger on public.shows,
// supabase/migrations/20260915221500) is the backstop that actually blocks a
// stale-cache or hand-crafted publish, on both a status UPDATE and an INSERT
// that creates an already-published row. It raises with this SQLSTATE for
// BOTH of its refusals (missing club, and no payouts-enabled Stripe
// account), and its RAISE EXCEPTION text is already this module's own
// friendly copy — see the trigger's own comment — so the client never needs
// a second static message table keyed by code the way MK001/MK002
// (apps/myk9show/src/utils/errorMessages.ts) are: it can just trust
// `error.message` once the code confirms the refusal came from here.
export const PUBLISH_GATE_ERRCODE = 'MK003';

/** True when `error` is the DB publish-gate trigger's refusal (SQLSTATE MK003),
 * as opposed to any other failure (network, unrelated constraint, ...). */
export function isPublishGateDbError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === PUBLISH_GATE_ERRCODE
  );
}

/**
 * The friendly message for a publish-gate DB refusal, or `null` when `error`
 * is not one. The trigger's exception text already IS the friendly copy (it
 * mirrors PUBLISH_BLOCKED_MESSAGE and the "assign a club" message verbatim),
 * so this trusts `error.message` rather than re-deriving it — one code covers
 * both of the trigger's refusals, and only the DB text tells them apart.
 */
export function publishGateDbErrorMessage(error: unknown): string | null {
  if (!isPublishGateDbError(error)) return null;
  return getErrorMessage(error);
}
