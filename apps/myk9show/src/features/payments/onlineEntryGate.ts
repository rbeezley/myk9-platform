import { getErrorMessage } from '@myk9/core';

// Publishing a show opens online entries (status 'published' is the
// entries-open state), and online entry fees can only be paid out to clubs
// with a working Stripe Connect account. Fail closed: no account row, or a
// row without payouts_enabled, blocks NEWLY publishing. Shows that are
// already published are never un-published by this gate.

export const PUBLISH_BLOCKED_MESSAGE =
  "Connect your club's payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.";

export function canEnableOnlineEntries(
  account: { payouts_enabled: boolean } | null | undefined
): boolean {
  return account?.payouts_enabled === true;
}

// MYK9-579: the client-side checks above are a UX convenience, not the
// enforcement boundary — enforce_show_publish_gate() (a BEFORE UPDATE OF
// status trigger on public.shows, supabase/migrations/20260915195500) is the
// backstop that actually blocks a stale-cache or hand-crafted publish. It
// raises with this SQLSTATE for BOTH of its refusals (missing club, and no
// payouts-enabled Stripe account), and its RAISE EXCEPTION text is already
// this module's own friendly copy — see the trigger's own comment — so the
// client never needs a second static message table keyed by code the way
// MK001/MK002 (apps/myk9show/src/utils/errorMessages.ts) are: it can just
// trust `error.message` once the code confirms the refusal came from here.
export const PUBLISH_GATE_ERRCODE = 'MK003';

// MYK9-572: a club must be authorized by a site admin before it can open
// online entries at all, independent of Stripe readiness. The trigger
// (enforce_show_publish_gate, supabase/migrations/20260915223500) raises a
// DISTINCT SQLSTATE for this refusal so the client can show distinct copy
// instead of the Stripe-connect message.
export const PUBLISH_GATE_ERRCODE_UNAUTHORIZED = 'MK004';

export const CLUB_UNAUTHORIZED_MESSAGE =
  "This club hasn't been authorized by myK9 yet. Shows can be built now and published once the club is approved.";

const PUBLISH_GATE_ERRCODES: readonly string[] = [
  PUBLISH_GATE_ERRCODE,
  PUBLISH_GATE_ERRCODE_UNAUTHORIZED,
];

/** True when `error` is the DB publish-gate trigger's refusal (SQLSTATE MK003
 * or MK004 — MYK9-572's club-authorization refusal), as opposed to any other
 * failure (network, unrelated constraint, ...). */
export function isPublishGateDbError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    PUBLISH_GATE_ERRCODES.includes((error as { code?: unknown }).code as string)
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
