// Server-side show gate for stripe-checkout (MYK9-979).
//
// A show takes card entries only when it is open for entries AND its
// secretary turned online entries on (shows.online_entries_enabled). With the
// switch off the show is mail-in / at-the-show only: the public page hides
// "Enter this show", submit_show_entries refuses exhibitors, and this refuses
// the card path, so a hand-crafted call cannot charge an exhibitor for a show
// whose club may have no payout account at all.
//
// Fails closed: anything but an explicit `true` is off.

export const ONLINE_ENTRIES_NOT_OPEN_ERROR = 'Online entries are not currently open for this show.';

export const ONLINE_ENTRIES_OFF_ERROR =
  "This show doesn't take online entries. Mail your entry to the trial secretary — the premium has the details.";

// 'accepting_entries' is not a permitted shows.status (072_align_show_class_
// statuses.sql); kept so this gate refuses nothing it accepted before.
const ENTRY_STATUSES: readonly string[] = ['published', 'accepting_entries'];

export interface ShowForOnlineEntryGate {
  status: string | null;
  online_entries_enabled: boolean | null | undefined;
}

/** Why this show refuses an online (card) entry, or `null` when it accepts one. */
export function showOnlineEntryRefusal(show: ShowForOnlineEntryGate): string | null {
  if (!show.status || !ENTRY_STATUSES.includes(show.status)) return ONLINE_ENTRIES_NOT_OPEN_ERROR;
  if (show.online_entries_enabled !== true) return ONLINE_ENTRIES_OFF_ERROR;
  return null;
}
