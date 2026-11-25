/**
 * showEntryRunQueue — adapts entry-store `ShowEntry` rows onto the shared
 * run-queue primitive in @myk9/ringside.
 *
 * Why this exists: the exhibitor-facing hooks (`useShowEntriesForUser`,
 * `useMyEntriesInClass`), the ring-conflict scanner (`utils/conflictDetection`)
 * and the push monitor (`hooks/useNotificationMonitor`) each used to count
 * "dogs ahead" their own way — three of them from the front of the run order,
 * one of them *from* the in-ring dog. A push notification could therefore state
 * a different number than the screen the exhibitor was looking at.
 *
 * They now all normalize through here, so the ordering rule and the queue
 * semantics come from `runQueue` in the package. See the INTENT note there:
 * the in-ring dog is EXCLUDED from the waiting queue, which is why "You're next"
 * shows while a dog is still running.
 *
 * `ReplicatedEntry` rows have their own normalizer — see
 * `@/features/at-show/replicatedRunQueue`.
 */

// The run-queue subpath keeps the ringside UI out of the entry chunk: this
// module is reached eagerly from App's notification monitor.
import {
  compareByRunOrder,
  isInQueue,
  isInRingEntry,
  notRunningReasonOf,
  pendingByRunOrder,
  resolveClaim,
  runQueueStateOf,
  stateForClaim,
  type RunQueueEntry,
  type RunQueueState,
} from '@myk9/ringside/run-queue';
import { isAwaitingApproval } from '@/features/_shared/entryAccounting';
import type { ShowEntry } from '@/store/entry-store-types';
import type { QueuePlace } from '@/hooks/queries/useMyEntryQueuePlaces';

/** A `ShowEntry` plus the normalized fields the run queue sorts on. */
export interface ShowEntryQueueRow extends RunQueueEntry {
  entry: ShowEntry;
}

function parseArmband(entry: ShowEntry): number {
  const parsed = Number.parseInt(entry.registrationData?.armband ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The status the run queue actually cares about.
 *
 * `ShowEntry` carries TWO status axes: `checkInStatus` (the show-day flow —
 * this is where `pulled` and `in-ring` live, see `CheckInStatus` in @myk9/core)
 * and `status` (the registration lifecycle). `isInQueue` / `isInRingEntry` test
 * for `pulled` / `in-ring`, so the check-in axis must win; comparing the
 * lifecycle axis against those values silently never matches. Lifecycle states
 * that also mean "won't run" fold onto `pulled` so a single field answers queue
 * membership.
 */
function queueStatus(entry: ShowEntry): string | undefined {
  const checkIn = entry.checkInStatus;
  // The shared precedence (MYK9-1940): a lifecycle absent, moved or withdrawn beats a check-in pulled.
  const reason = notRunningReasonOf(entry.status, checkIn);
  if (reason) return reason;
  if (checkIn === 'in-ring') return checkIn;
  return checkIn ?? entry.status;
}

export function toShowEntryQueueRow(entry: ShowEntry): ShowEntryQueueRow {
  const runOrder = entry.registrationData?.runOrder ?? 0;
  return {
    id: entry.id,
    armband: parseArmband(entry),
    // Entry-store rows carry run order under `registrationData.runOrder`;
    // ringside sorts on `exhibitorOrder`. 0 means "unassigned", and the
    // comparator's `exhibitorOrder || armband` fallback then orders by armband.
    exhibitorOrder: runOrder > 0 ? runOrder : null,
    isScored: entry.status === 'completed' || !!entry.competitionData,
    status: queueStatus(entry),
    inRing: entry.checkInStatus === 'in-ring',
    // A Pending (not yet approved) entry has no place in line (MYK9-2376, MYK9-2391): the queue
    // honors the flag, so `dogsAheadInClass` and `ownEntryQueueState` need no rule of their own.
    awaitingApproval: isAwaitingApproval({ entryStatus: entry.status }),
    entry,
  };
}

/** True once the secretary has numbered this entry; the server gives no place before that. */
export function hasRunOrder(entry: ShowEntry): boolean {
  return (entry.registrationData?.runOrder ?? 0) > 0;
}

/** Every entry still waiting to run in this class, in run order. */
export function pendingShowEntriesByRunOrder(entries: readonly ShowEntry[]): ShowEntry[] {
  return pendingByRunOrder(entries.map(toShowEntryQueueRow)).map(row => row.entry);
}

/**
 * How many dogs run before `entryId` in its class, or null when the entry is
 * not in the class / no longer in the queue (scored or pulled).
 *
 * The in-ring dog is not counted (INTENT in `runQueue`), so the dog at the head
 * of the waiting queue gets 0 — "You're next" — while a dog is still running.
 * An entry that is itself in the ring also reports 0: nobody runs before it.
 */
export function dogsAheadInClass(entries: readonly ShowEntry[], entryId: string): number | null {
  const rows = entries.map(toShowEntryQueueRow);
  const target = rows.find(row => row.id === entryId);
  if (!target || !isInQueue(target)) return null;
  if (isInRingEntry(target)) return 0;

  const position = pendingByRunOrder(rows).findIndex(row => row.id === entryId);
  return position === -1 ? null : position;
}

/**
 * What an exhibitor's own entry may honestly say about its place (MYK9-992).
 *
 * The exhibitor surfaces hold their own dogs' rows, not the class's queue
 * (`entries_select` is own/handler/manager only; the show-wide view needs a
 * warm per-show replica that account routes never seed), so a place counted
 * from them would call a lone dog "Next up" with strangers ahead of it. The
 * dog's own row does decide in ring / done / pulled. A waiting dog says
 * "Waiting" once the secretary has set an order, and nothing before that.
 * A true place needs the full queue from the server.
 */
export function ownEntryQueueState(entry: ShowEntry, onPaper = false): RunQueueState | null {
  // `toShowEntryQueueRow` folds every not-running lifecycle onto 'pulled' for
  // queue membership; a withdrawal is a different act and keeps its own label.
  if (entry.status === 'withdrawn') return { kind: 'withdrawn' };
  const state = runQueueStateOf([toShowEntryQueueRow(entry)], entry.id);
  if (state?.kind !== 'waiting') return state;
  if ((entry.registrationData?.runOrder ?? 0) <= 0) return null;
  // MYK9-1970: the class row this device already holds says it is judged on paper, so the paper
  // line shows offline too; the place is added when the server answers.
  return onPaper ? { kind: 'paper' } : { kind: 'waiting-unknown' };
}

/**
 * The ONE "is this class scored on paper?" for the exhibitor surfaces (MYK9-1970): the class's own
 * setting, else the show's device-scoring switch off (the server's `coalesce(scores_on_paper, NOT
 * uses_device_scoring)`). Both come from the replicated tables, so it holds offline. Fails closed
 * to paper only on a known answer: an unknown class and show is not paper (today's behaviour).
 */
export function isClassScoredOnPaper(
  classOnPaper: boolean | null | undefined,
  showUsesDeviceScoring: boolean | null | undefined
): boolean {
  return resolveClaim({ classOnPaper, showUsesDeviceScoring }) === 'paper';
}

/** `ownEntryQueueState` for a class, paper by the class's own setting or else the show's switch. */
export function ownEntryQueueStateInClass(
  entry: ShowEntry,
  classOnPaper: boolean | null | undefined,
  showUsesDeviceScoring: boolean | null | undefined
): RunQueueState | null {
  return ownEntryQueueState(entry, isClassScoredOnPaper(classOnPaper, showUsesDeviceScoring));
}

/** True for a state that may take the server's place: waiting with an order, or a paper class. */
export function isAwaitingServerPlace(state: RunQueueState | null | undefined): boolean {
  return state?.kind === 'waiting-unknown' || state?.kind === 'paper';
}

/**
 * An own-row state upgraded by the server's count (MYK9-995) and its claim state (MYK9-1969,
 * MYK9-1970). Only a dog the row already calls waiting, with an order set, may take a place;
 * every other state is the row's own fact and wins. When the server answers it wins over the
 * device's paper mirror (the switch may have flipped since the class row synced). No answer (offline, loading, or the server
 * says it is not waiting) leaves the state label as it was. The claim state decides how the
 * place reads: live is a count, paper is a position only, stale says the order may be out of date.
 */
export function withServerPlace(
  state: RunQueueState | null,
  answer: QueuePlace | undefined
): RunQueueState | null {
  if (state?.kind !== 'waiting-unknown' && state?.kind !== 'paper') return state;
  if (answer === undefined || answer.place < 1) return state;
  return stateForClaim(answer.place, answer.claimState);
}

/**
 * Order two stored run numbers through the shared comparator, with an unset
 * (null) number LAST. `compareByRunOrder` alone sorts a null first (its
 * armband fallback is 0), which is wrong for dogs the secretary has not
 * numbered yet. A stored 0 is still a number and sorts before 1.
 */
export function compareStoredRunOrderNullLast(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return compareByRunOrder(
    { id: '', armband: null, exhibitorOrder: a },
    { id: '', armband: null, exhibitorOrder: b }
  );
}
