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
import { buildFullClassLabel } from '@/features/_shared/classLabel';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import type { StoredTrialClass } from '@/store/trial-store-types';

/** The entry fields a flag is read from. Every one is on `SecretaryEntry`. */
export interface FlaggedPullEntry {
  id: string;
  /** Counts a dog flagged in two classes once. */
  dog_id?: string | null;
  class_id?: string | null;
  trial_id?: string | null;
  armband?: string | null;
  entry_status?: string | null;
  check_in_status?: string | null;
  /** A scored run is finished: its flag is not one the Check-in desk can confirm. */
  is_scored?: boolean | null;
  withdrawal_reason_code?: string | null;
  /** The joined dog; `null` when the replica holds the entry but not its dog. */
  dog?: { name?: string | null; call_name?: string | null } | null;
  /**
   * The joined class. `null` when this device could not join it: the class row is missing, was
   * deleted, or the class read failed (the replica then joins every entry to `null`).
   */
  class?: { name?: string | null } | null;
}

/**
 * The confirmed schedule, so a class with no joined row can be told apart: gone from its trial's
 * classes (removed), or still scheduled and only unreadable here. `null` while the schedule is not
 * confirmed: then nothing is called removed.
 */
export type FlaggedPullSchedule = Readonly<
  Record<string, readonly Pick<StoredTrialClass, 'id' | 'name' | 'element' | 'level' | 'section'>[]>
> | null;

/**
 * `joined`: the Check-in desk lists it on its class line. `removed`: its trial's confirmed classes
 * no longer hold it. `unavailable`: no joined class, removal not verified (MYK9-2180).
 */
export type FlaggedPullClassState = 'joined' | 'removed' | 'unavailable';

export interface FlaggedPull {
  entryId: string;
  dogName: string;
  armband: string | null;
  classState: FlaggedPullClassState;
  /** The class's name when known (joined, or read from the schedule); `null` when not. */
  classLabel: string | null;
  /**
   * Where this flag sits, in words that tell two flags of one dog apart: the class label, else a
   * short entry reference.
   */
  place: string;
}

export interface FlaggedPullList {
  /** Dogs flagged, each once however many classes it is flagged in. */
  dogCount: number;
  items: readonly FlaggedPull[];
  /**
   * Flags the Check-in desk cannot list (no joined class), so the close-out screens carry Confirm
   * and Clear for them. Grouped by `classState`.
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
 * Said when no flag can be resolved at the Check-in desk, which cannot list them: the screen's own
 * list (`FlaggedPullsOffDesk`) is where they are confirmed or cleared.
 */
export const OFF_DESK_HINT =
  'Confirm or clear each one under Class removed or Class unavailable on this page.';

/** The groups the close-out screens list off-desk flags under, by class state. */
export const OFF_DESK_GROUPS = [
  {
    state: 'removed',
    label: 'Class removed',
    note: 'Flagged as pulled in a class that is no longer on the schedule, so the Check-in desk cannot list them. Confirm the pull or clear the flag here.',
  },
  {
    state: 'unavailable',
    label: 'Class unavailable',
    note: "Flagged as pulled in a class this device couldn't load, so the Check-in desk cannot list them. Confirm the pull or clear the flag here.",
  },
] as const satisfies readonly { state: FlaggedPullClassState; label: string; note: string }[];

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

function classOf(
  entry: FlaggedPullEntry,
  schedule: FlaggedPullSchedule
): Pick<FlaggedPull, 'classState' | 'classLabel'> {
  // `undefined` is a caller that did not join the class; only a joined null is missing.
  if (entry.class !== null) return { classState: 'joined', classLabel: entry.class?.name || null };
  const trialClasses = schedule && entry.trial_id ? schedule[entry.trial_id] : undefined;
  if (!trialClasses) return { classState: 'unavailable', classLabel: null };
  const scheduled = trialClasses.find(cls => cls.id === entry.class_id);
  if (!scheduled) return { classState: 'removed', classLabel: null };
  return {
    classState: 'unavailable',
    classLabel: buildFullClassLabel(scheduled, '', scheduled.name),
  };
}

export function collectFlaggedPulls(
  entries: readonly FlaggedPullEntry[],
  schedule: FlaggedPullSchedule = null
): FlaggedPullList {
  const dogs = new Set<string>();
  const items: FlaggedPull[] = [];
  for (const entry of entries) {
    if (!isDeskConfirmableFlag(entry)) continue;
    dogs.add(entry.dog_id ?? `entry:${entry.id}`);
    const cls = classOf(entry, schedule);
    items.push({
      entryId: entry.id,
      dogName: dogNameOf(entry),
      armband: entry.armband ?? null,
      ...cls,
      place: cls.classLabel ?? `entry ${entry.id.slice(-6).toUpperCase()}`,
    });
  }
  const offDesk = items.filter(item => item.classState !== 'joined');
  return {
    dogCount: dogs.size,
    items,
    offDesk,
    deskResolvable: offDesk.length < items.length,
  };
}
