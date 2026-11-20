/**
 * MYK9-2145 / MYK9-2180: check-in "pulled" flags (Ringside's Pull, the exhibitor's own check-in
 * pull) that the secretary has not confirmed at the Check-in desk.
 *
 * The one reading of them: `useCloseoutFlaggedPulls` runs it once over the show's entries, and the
 * Results tab's Finish list and the close step both render that result, so their counts cannot
 * disagree. A flag is not a removal and owes no refund decision until confirmed (docs/INTENT.md,
 * Withdraw vs Pull).
 */
import { deskStatusEditableFor } from '@/components/entries/management/checkInDesk/deskEditable';
import { classifyEntryRemoval } from '@/features/payments/pullReconciliation';
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
  /** The joined class; `null` when the class row is missing or was deleted. */
  class?: { name?: string | null } | null;
}

export interface FlaggedPull {
  entryId: string;
  dogName: string;
  armband: string | null;
  /**
   * The class row is missing or deleted, so the Check-in desk has no class line to offer Confirm
   * or Clear on. These are listed in the "Class removed" group, which carries both.
   */
  classRemoved: boolean;
}

export interface FlaggedPullList {
  /** Dogs flagged, each once however many classes it is flagged in. */
  dogCount: number;
  items: readonly FlaggedPull[];
  /** The entries of `items` whose class row is missing. */
  classRemoved: readonly FlaggedPull[];
}

/**
 * What the close-out screens know about flags. `failed` is its own state: a refresh that did not
 * succeed is never a count, however recent the cached rows (MYK9-2180).
 */
export type FlaggedPullsRead =
  { status: 'loading' } | { status: 'failed' } | ({ status: 'read' } & FlaggedPullList);

export const FLAGGED_PULLS_FAILED_TEXT = "Couldn't check for dogs flagged as pulled at the show.";
export const FLAGGED_PULLS_LOADING_TEXT = 'Checking for dogs flagged as pulled at the show...';
export const CLASS_REMOVED_LABEL = 'Class removed';

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
      // `undefined` is a caller that did not join the class; only a joined null is missing.
      classRemoved: entry.class === null,
    });
  }
  return { dogCount: dogs.size, items, classRemoved: items.filter(item => item.classRemoved) };
}
