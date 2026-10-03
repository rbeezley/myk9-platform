import { getErrorMessage } from '@myk9/core';
import { toLocalDateOnly } from '@/utils/date-format';

// Online entry fees can only be paid out to clubs with a working Stripe
// Connect account. A show takes online entries only when its secretary turns
// them on (shows.online_entries_enabled, MYK9-979); publishing such a show,
// or turning the switch on once it is public, needs the club's payouts. Fail
// closed: no account row, or a row without payouts_enabled, blocks it. A
// mail-in show (switch off) publishes without a payment account. Shows that
// are already public are never un-published by this gate.

// MYK9-979: the gate fires when a show BECOMES PUBLICLY VISIBLE — any move
// from a non-public status into published, upcoming, in_progress or completed
// (PUBLIC_SHOW_STATUSES below) — not only on 'published'.

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

// ---------------------------------------------------------------------------
// MYK9-979: the per-show "Accept online entries" switch
// (shows.online_entries_enabled). Publishing needs the club's Stripe payouts
// ONLY when the show takes online entries; a mail-in show publishes without a
// payment account. Turning the switch on for an already-public show needs the
// payouts too. Mirrors enforce_show_publish_gate()
// (supabase/migrations/20261003221700).
// ---------------------------------------------------------------------------

/** Help text under the switch, in the wizard and the show edit panel. */
export const ONLINE_ENTRIES_HELP_TEXT =
  "Needs your club's payment account. Off: exhibitors see the premium and mail in their entries.";

/** Under a disabled switch while the show's value is not known yet. */
export const ONLINE_ENTRIES_UNKNOWN_HINT =
  'Loading this setting… refresh the page to change online entries.';

/** Under a disabled switch where this surface does not own the setting. */
export const ONLINE_ENTRIES_LOCKED_HINT = "Change online entries from the show's Edit panel.";

/** The trigger's refusal to turn online entries on for a public show without
 * Stripe payouts (MK003), verbatim. */
export const ONLINE_ENTRIES_BLOCKED_MESSAGE =
  "Connect your club's payment account before turning on online entries — online entry fees need somewhere to go. Find it under My Club → Payments.";

/** What exhibitors read on a show that takes no online entries. */
export const MAIL_IN_ENTRY_NOTE =
  "This show doesn't take online entries. Mail your entry to the trial secretary or enter at the show — the premium has the details.";

/**
 * How a show takes entries, as far as this client knows:
 * - 'online': the switch is on; exhibitors may enter online.
 * - 'mail_in': the switch is off; exhibitors mail theirs in or enter at the show.
 * - 'unknown': no value yet (a replica row cached before the column existed,
 *   until its next sync brings it; the migration re-stamps every show so that
 *   sync happens). Never treated as online: no Enter / Add Entry is offered
 *   for it, and no mail-in claim is made either.
 * The server is the boundary regardless: submit_show_entries and
 * stripe-checkout refuse an online entry for a mail-in show.
 */
export type OnlineEntryMode = 'online' | 'mail_in' | 'unknown';

type OnlineEntryShow = { onlineEntriesEnabled?: boolean | null | undefined } | null | undefined;

export function onlineEntryMode(show: OnlineEntryShow): OnlineEntryMode {
  const value = show?.onlineEntriesEnabled;
  if (value === true) return 'online';
  if (value === false) return 'mail_in';
  return 'unknown';
}

/** True only when the show is known to take online entries. */
export function acceptsOnlineEntries(show: OnlineEntryShow): boolean {
  return onlineEntryMode(show) === 'online';
}

/** True only when the show is known to be mail-in / at-the-show only. */
export function isMailInOnlyShow(show: OnlineEntryShow): boolean {
  return onlineEntryMode(show) === 'mail_in';
}

/**
 * The statuses that make a show publicly visible — shows_anon_select's list,
 * the same one private.show_status_is_public() holds. The publish gate runs
 * when a show moves from a status outside this set into one inside it.
 */
export const PUBLIC_SHOW_STATUSES: readonly string[] = [
  'published',
  'upcoming',
  'in_progress',
  'completed',
];

export function isPublicShowStatus(status: string | null | undefined): boolean {
  return status != null && PUBLIC_SHOW_STATUSES.includes(status);
}

/** True when moving `from` -> `to` makes the show publicly visible, i.e. the
 * transition the DB publish gates check. */
export function becomesPublic(from: string | null | undefined, to: string): boolean {
  return isPublicShowStatus(to) && !isPublicShowStatus(from);
}

/** Publishing (becoming public) needs Stripe payouts only with online entries on. */
export function publishNeedsStripe(onlineEntriesEnabled: boolean | null | undefined): boolean {
  return onlineEntriesEnabled === true;
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
 * each value becomes its calendar day via `toLocalDateOnly`, what every show
 * write sends (buildCreateShowPayload, and ReplicatedShowsTable's writes), so a
 * wizard draft's raw picker instant and a stored midnight-UTC row both resolve
 * to the day the trigger compares. A missing or unreadable day is "required",
 * and a close day before the open day is "order". A same-day window is valid
 * whatever its times (the close day is inclusive), so no raw time is ever
 * compared. For a legacy non-midnight stored value the trigger's UTC day is
 * authoritative; if it disagrees, its MK005 reaches the same toast and link.
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

/** Every refusal text the two publish-gate triggers raise. A replicated show
 * save (the edit panel) reports the DB text in the sync-failure toast. */
export const PUBLISH_GATE_MESSAGES: readonly string[] = [
  PUBLISH_BLOCKED_MESSAGE,
  CLUB_REQUIRED_MESSAGE,
  CLUB_UNAUTHORIZED_MESSAGE,
  ONLINE_ENTRIES_BLOCKED_MESSAGE,
  ENTRY_WINDOW_REQUIRED_MESSAGE,
  ENTRY_WINDOW_ORDER_MESSAGE,
  ENTRY_WINDOW_PUBLISHED_MESSAGE,
];

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
