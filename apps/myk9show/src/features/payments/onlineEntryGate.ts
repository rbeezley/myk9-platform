import { getErrorMessage } from '@myk9/core';
import { toLocalDateOnly } from '@/utils/date-format';

// Entry fees can only be paid out to clubs with a working Stripe Connect
// account, so every show needs the club's payouts before it is published
// (MYK9-2164). The server decides: enforce_show_publish_gate() refuses
// a club without payouts_enabled (demo clubs are exempt) and the app shows that
// refusal as written. Shows that
// are already public are never un-published by this gate.

// MYK9-979: the gate fires when a show BECOMES PUBLICLY VISIBLE — any move
// from a non-public status into published, upcoming, in_progress or completed
// (PUBLIC_SHOW_STATUSES below) — not only on 'published'.

/** MYK9-2163: enforce_show_publish_gate()'s payouts refusal (MK003) verbatim.
 * Publishing needs the club's payouts whatever online_entries_enabled says. Kept to recognise
 * the refusal so the Publish menu can add the Payments link. */
export const PUBLISH_BLOCKED_MESSAGE =
  "This club's payouts aren't enabled yet, so the show can't be published. A club admin connects the bank account on the club's Payments tab. If Stripe is reviewing the account, that usually takes a day or two.";

/** Mirrors enforce_show_publish_gate()'s club_id IS NULL refusal verbatim
 * (latest definition: supabase/migrations/20261113204300, MYK9-1887). Distinct from PUBLISH_BLOCKED_MESSAGE
 * so callers can decide whether a "connect Stripe" action makes sense --
 * it never does for this refusal. */
export const CLUB_REQUIRED_MESSAGE =
  'Assign a club to this show before publishing. Entry fees are paid out to the club.';

/** The trigger's refusal to turn online entries on for a public show without Stripe payouts
 * (MK003), verbatim. Nothing in the app turns online entries on or off any more (MYK9-2164); the
 * text stays because migration 20261003221700 raises it and its contract test reads it. */
export const ONLINE_ENTRIES_BLOCKED_MESSAGE =
  "Connect your club's payment account before turning on online entries. Online entry fees need somewhere to go. Find it under My Club → Payments.";

/** MYK9-2163: the trigger's refusal (MK003), verbatim, to publish a show with
 * online entries off or to turn them off on a public show. */
export const ONLINE_ENTRIES_REQUIRED_MESSAGE =
  'A published show always takes online entries. Turn online entries on, or keep this show as a draft.';

/** MYK9-2163: the trigger's refusal (MK003), verbatim, to create a show with
 * online entries off or to turn them off, on any status (drafts included). */
export const ONLINE_ENTRIES_ALWAYS_ON_MESSAGE =
  "Every show takes online entries. This can't be turned off.";

/** MYK9-2197: enforce_show_publish_gate()'s refusal (MK003), verbatim, to publish a show whose
 * premium list is not published, unless the club publishes its own premium list
 * (shows.publishes_own_premium). The blocker key is premium_not_published in
 * public.show_publish_blockers. */
export const PREMIUM_NOT_PUBLISHED_MESSAGE =
  'Publish the premium list before publishing the show, or turn on "We publish our own premium list" in the show\'s settings. Exhibitors need the premium to enter.';

type OnlineEntryShow = { onlineEntriesEnabled?: boolean | null | undefined } | null | undefined;

/**
 * True only when the show is known to take online entries. Every show does (the
 * server refuses the switch off, MYK9-2163), so false here means no value yet: a
 * replica row cached before the column existed, until its next sync. Never
 * treated as online until known: no Enter / Add Entry is offered for it.
 */
export function acceptsOnlineEntries(show: OnlineEntryShow): boolean {
  return show?.onlineEntriesEnabled === true;
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
  'This club is waiting for myK9Show approval. Shows can be built now and published once the club is approved.';

// MYK9-716: a draft may have no entry window, but publishing requires one —
// both dates set, and the window opening before it closes. Checked LAST by
// enforce_show_publish_gate() (supabase/migrations/20260925023700), after the
// club and Stripe checks, with its own SQLSTATE so the client can link to the
// entry dates instead of the payments page. The two messages below are that
// trigger's RAISE text verbatim.
export const PUBLISH_GATE_ERRCODE_ENTRY_WINDOW = 'MK005';

export const ENTRY_WINDOW_REQUIRED_MESSAGE =
  'Set the entry window before publishing. Exhibitors need to know when entries open and close.';

export const ENTRY_WINDOW_ORDER_MESSAGE =
  "The entry window can't close before it opens. Fix the entry dates, then publish.";

/** MYK9-716: the trigger also refuses an edit that clears or reverses an
 * ALREADY-published show's window. That arrives through replication (the
 * wizard's edit save), so formatSyncFailureToast shows this text. */
export const ENTRY_WINDOW_PUBLISHED_MESSAGE =
  'A published show has to keep its entry window: both dates set, and the close on or after the open. Discard this change or fix the dates.';

/** True when a server refusal's text is one of the payouts refusals the app mirrors. Compared
 * against the exported mirror constants, never by wording. */
export function isPayoutsRefusalMessage(message: string): boolean {
  return message === PUBLISH_BLOCKED_MESSAGE || message === ONLINE_ENTRIES_BLOCKED_MESSAGE;
}

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
  ONLINE_ENTRIES_BLOCKED_MESSAGE,
  CLUB_UNAUTHORIZED_MESSAGE,
  ONLINE_ENTRIES_REQUIRED_MESSAGE,
  ONLINE_ENTRIES_ALWAYS_ON_MESSAGE,
  PREMIUM_NOT_PUBLISHED_MESSAGE,
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
