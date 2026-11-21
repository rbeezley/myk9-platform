/**
 * MYK9-2145 / MYK9-2180: check-in "pulled" flags (Ringside's Pull, the exhibitor's own check-in
 * pull) that the secretary has not confirmed at the Check-in desk.
 *
 * The one reading of them: `useCloseoutFlaggedPulls` runs it once over a screen's entries read,
 * and the Results tab's Finish list and the close step both render that result, so their counts
 * cannot disagree. A flag is not a removal and owes no refund decision until confirmed
 * (docs/INTENT.md, Withdraw vs Pull).
 */
import { deskStatusEditableFor } from '@/components/entries/management/checkInDesk/deskEditable';
import { classifyEntryRemoval } from '@/features/payments/pullReconciliation';
import { formatTrialDayLabel } from '@/features/_shared/trialDateEligibility';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';

/** The entry fields a flag is read from. Every one is on `SecretaryEntry`. */
export interface FlaggedPullEntry {
  id: string;
  /** Counts a dog flagged in two classes once. */
  dog_id?: string | null;
  armband?: string | null;
  entry_status?: string | null;
  check_in_status?: string | null;
  /** A scored run is finished: its flag is not one the Check-in desk can confirm. */
  is_scored?: boolean | null;
  withdrawal_reason_code?: string | null;
  /** The joined dog; `null` when the replica holds the entry but not its dog. */
  dog?: { name?: string | null; call_name?: string | null } | null;
  /**
   * The joined class. `null` when this device could not match it to a class on its list (the row
   * is missing, or the class read failed). This device cannot tell which, so nothing here says the
   * class was removed (MYK9-2180, owner decision 2026-11-20).
   */
  class?: { name?: string | null } | null;
  /** The joined trial, which names the trial day; `null` when this device could not join it. */
  trial?: { trial_date?: string | null; trial_number?: string | null } | null;
}

export interface FlaggedPull {
  entryId: string;
  dogName: string;
  armband: string | null;
  /** The Check-in desk lists it on its class line (its class is on this device's class list). */
  onDesk: boolean;
  /**
   * Which entry this is, in words no other flag shares: the trial day (date and trial number, as
   * the entry row carries them) and a short entry reference, e.g. "Sat Nov 21, Trial 1, entry
   * 3F9A2C". One dog flagged in the same class on two days reads differently.
   */
  place: string;
}

export interface FlaggedPullList {
  /** Dogs flagged, each once however many classes it is flagged in. */
  dogCount: number;
  items: readonly FlaggedPull[];
  /**
   * Flags the Check-in desk cannot list (no class on this device's class list), so the close-out
   * screens carry Confirm and Clear for them, in one group (`OFF_DESK_GROUP`).
   */
  offDesk: readonly FlaggedPull[];
  /** At least one flag is on a class line the Check-in desk lists. */
  deskResolvable: boolean;
}

/**
 * What the close-out screens know about flags. `failed` is its own state: a read that did not
 * succeed (an error, or a failed attempt awaiting retry) is never a count, however recent the
 * cached rows (MYK9-2180).
 */
export type FlaggedPullsRead =
  { status: 'loading' } | { status: 'failed' } | ({ status: 'read' } & FlaggedPullList);

export const FLAGGED_PULLS_FAILED_TEXT = "Couldn't check for dogs flagged as pulled at the show.";
export const FLAGGED_PULLS_LOADING_TEXT = 'Checking for dogs flagged as pulled at the show...';

/**
 * The one group the close-out screens list off-desk flags under. Worded neutrally: this device
 * could not match the class, which is not proof it was removed (MYK9-2180).
 */
export const OFF_DESK_GROUP = {
  label: "Not on this device's class list",
  note: 'Flagged as pulled in a class that could not be matched to the schedule on this device, so the Check-in desk cannot list them. Confirm the pull or clear the flag here.',
} as const;

/**
 * Said when no flag can be resolved at the Check-in desk, which cannot list them: the screen's own
 * list (`FlaggedPullsOffDesk`) is where they are confirmed or cleared.
 */
export const OFF_DESK_HINT = `Confirm or clear each one under ${OFF_DESK_GROUP.label} on this page.`;

/**
 * A flag the Check-in desk would offer to confirm, by the desk's own rule (`deskStatusEditableFor`,
 * mapped as the Show Desk class table maps a raw entry). A flag on a scored, pending, waitlisted,
 * rejected, cancelled or already-removed entry is not listed: it is neither a pull nor something
 * the secretary can act on.
 */
export function isDeskConfirmableFlag(entry: FlaggedPullEntry): boolean {
  if (entry.check_in_status?.toLowerCase() !== 'pulled') return false;
  const removal = classifyEntryRemoval({
    entryStatus: entry.entry_status,
    withdrawalReasonCode: entry.withdrawal_reason_code,
  });
  if (removal) return false;
  return deskStatusEditableFor({
    entryStatus: mapEntryStatus(entry.entry_status),
    classStatus: mapClassEntryStatus(entry.entry_status),
    checkInStatus: 'pulled',
    isScored: entry.is_scored,
  });
}

/** `entryDogName`'s rule, over the narrower shape this module reads. */
function dogNameOf(entry: FlaggedPullEntry): string {
  return entry.dog?.call_name || entry.dog?.name || 'Unknown Dog';
}

/** The trial day as the entry row carries it: its date, its trial number, or both. */
function trialDayOf(entry: FlaggedPullEntry): string {
  const day = formatTrialDayLabel(entry.trial?.trial_date);
  const number = entry.trial?.trial_number?.trim();
  const trial = number ? `Trial ${number}` : null;
  return [day, trial].filter(Boolean).join(', ') || 'trial day unknown';
}

/** A short entry reference, the last six characters of its id. */
export function entryReference(entryId: string): string {
  return `entry ${entryId.slice(-6).toUpperCase()}`;
}

export function collectFlaggedPulls(entries: readonly FlaggedPullEntry[]): FlaggedPullList {
  const dogs = new Set<string>();
  const items: FlaggedPull[] = [];
  for (const entry of entries) {
    if (!isDeskConfirmableFlag(entry)) continue;
    dogs.add(entry.dog_id ?? `entry:${entry.id}`);
    items.push({
      entryId: entry.id,
      dogName: dogNameOf(entry),
      armband: entry.armband ?? null,
      // `undefined` is a caller that did not join the class; only a joined null is off the list.
      onDesk: entry.class !== null,
      place: `${trialDayOf(entry)}, ${entryReference(entry.id)}`,
    });
  }
  const offDesk = items.filter(item => !item.onDesk);
  return {
    dogCount: dogs.size,
    items,
    offDesk,
    deskResolvable: offDesk.length < items.length,
  };
}
