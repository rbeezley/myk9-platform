import { getErrorMessage } from '@myk9/core';
import { toLocalDateOnly } from '@/utils/date-format';

// Publishing a show opens online entries (status 'published' is the
// entries-open state), and online entry fees can only be paid out to clubs
// with a working Stripe Connect account. Fail closed: no account row, or a
// row without payouts_enabled, blocks NEWLY publishing. Shows that are
// already published are never un-published by this gate.

// MYK9-579 round 5: 'accepting_entries' is not a permitted shows.status
// (072_align_show_class_statuses.sql), so an earlier round's widening of
// this gate (and the DB trigger's gated set) to cover it was a no-op that
// could never fire -- the write dies on the CHECK constraint first.
// stripe-checkout/index.ts's own 'accepting_entries' branch is dead code and
// out of scope here. The gated status is 'published' only.

export const PUBLISH_BLOCKED_MESSAGE =
  "Connect your club's payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.";

/** Mirrors enforce_show_publish_gate()'s club_id IS NULL refusal verbatim
 * (supabase/migrations/20260916003500). Distinct from PUBLISH_BLOCKED_MESSAGE
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
// supabase/migrations/20260916003500) is the backstop that actually blocks a
// stale-cache or hand-crafted publish, on both a status UPDATE and an INSERT
// that creates an already-published row. It raises with this SQLSTATE for
// BOTH of its refusals (missing club, and no payouts-enabled Stripe
// account), and its RAISE EXCEPTION text is already this module's own
// friendly copy — see the trigger's own comment — so the client never needs
// a second static message table keyed by code the way MK001/MK002
// (apps/myk9show/src/utils/errorMessages.ts) are: it can just trust
// `error.message` once the code confirms the refusal came from here.
export const PUBLISH_GATE_ERRCODE = 'MK003';

// MYK9-572: a club must be authorized by a site admin before it can open
// online entries at all, independent of Stripe readiness. Its OWN trigger
// (enforce_show_club_authorization, supabase/migrations/20260916004500),
// separate from enforce_show_publish_gate's Stripe-readiness check, raises
// a DISTINCT SQLSTATE for this refusal so the client can show distinct
// copy instead of the Stripe-connect message.
export const PUBLISH_GATE_ERRCODE_UNAUTHORIZED = 'MK004';

export const CLUB_UNAUTHORIZED_MESSAGE =
  "This club hasn't been authorized by myK9 yet. Shows can be built now and published once the club is approved.";

// MYK9-716: a draft may have no entry window, but publishing requires one —
// both dates set, and the window opening before it closes. Checked LAST by
// enforce_show_publish_gate() (supabase/migrations/20260925023700), after the
// club and Stripe checks, with its own SQLSTATE so the client can link to the
// entry dates instead of the payments page. The two messages below are that
// trigger's RAISE text verbatim.
export const PUBLISH_GATE_ERRCODE_ENTRY_WINDOW = 'MK005';

export const ENTRY_WINDOW_REQUIRED_MESSAGE =
  'Set the entry window before publishing — exhibitors need to know when entries open and close.';

export const ENTRY_WINDOW_ORDER_MESSAGE =
  "The entry window can't close before it opens. Fix the entry dates, then publish.";

/** MYK9-716: the trigger also refuses an edit that clears or reverses an
 * ALREADY-published show's window. That arrives through replication (the
 * wizard's edit save), so formatSyncFailureToast shows this text. */
export const ENTRY_WINDOW_PUBLISHED_MESSAGE =
  'A published show has to keep its entry window: both dates set, and the close on or after the open. Discard this change or fix the dates.';

/** The calendar day the save stores for this value (YYYY-MM-DD), or null. */
function storedEntryDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const day = toLocalDateOnly(value.trim());
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Why this show's entry window cannot be published yet, or `null` when it can.
 * The trigger's rule, applied to the dates exactly as the save stores them:
 * each value becomes its calendar day via `toLocalDateOnly` (what
 * buildCreateShowPayload writes to `entry_open_date` / `entry_close_date`), a
 * missing or unreadable day is "required", and a close day before the open day
 * is "order". A same-day window is valid whatever its times (the close day is
 * inclusive), so no raw time is ever compared.
 */
export function entryWindowPublishError(
  entryOpenDate: string | null | undefined,
  entryCloseDate: string | null | undefined
): string | null {
  const open = storedEntryDate(entryOpenDate);
  const close = storedEntryDate(entryCloseDate);
  if (open === null || close === null) return ENTRY_WINDOW_REQUIRED_MESSAGE;
  return open <= close ? null : ENTRY_WINDOW_ORDER_MESSAGE;
}

const PUBLISH_GATE_ERRCODES: readonly string[] = [
  PUBLISH_GATE_ERRCODE,
  PUBLISH_GATE_ERRCODE_UNAUTHORIZED,
  PUBLISH_GATE_ERRCODE_ENTRY_WINDOW,
];

/** True when `error` is a DB publish-gate trigger's refusal (SQLSTATE MK003,
 * MK004 — MYK9-572's club-authorization refusal — or MK005, MYK9-716's
 * entry-window refusal), as opposed to any other failure (network, unrelated
 * constraint, ...). */
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
