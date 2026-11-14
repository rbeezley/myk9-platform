import { judgeSignOffWording } from './judgeSignOff';
import { SHOW_MAP_WRAP_UP_STATUS } from './showMapTypes';
import type { ShowMapTree } from './showMapTypes';
import type { EntryLike } from './attention';
import { getShowMapNodeId } from './showMapTree';
import { getCockpitFinishListHref } from './cockpit/cockpitRoutes';
import { countRawEntryManagementPendingBucket } from '@/utils/entryCountSelectors';
import {
  classifyRawEntryAttention,
  type RawOperationalEntryInput,
} from '@/features/entry-operations/attentionClassification';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { getCheckInDeskHref } from '@/components/entries/management/checkInDesk/checkInDeskRoutes';
import { ENTRY_LIST_LABELS } from '@/components/entries/management/entryManagementViews';
import { isTrialDateToday } from '@/features/_shared/trialDateEligibility';

/**
 * The subset of a raw entry row `countEntriesWaitingCheckIn` needs to look up
 * its class's trial date. `EntryLike` stays narrow (it's shared with the
 * legacy attention classifier); `class_id` is additive here.
 */
interface CheckInEntryLike extends EntryLike {
  class_id?: string | null;
}

export type ShowDeskPendingSignalId =
  | 'entries-waiting-review'
  | 'entries-waiting-checkin'
  | 'entries-payment-due'
  | 'classes-needing-signature'
  | 'results-pending-closeout';

export type ShowDeskPendingSignalPriority = 'highest' | 'high' | 'medium';

/**
 * Minimal typed scope carrying the show context an attention signal was
 * computed within. Every signal is currently show-scoped; this is kept as
 * a discriminated shape so a future trial/class-scoped signal can extend it
 * without widening every existing signal's type.
 */
export interface ShowDeskPendingSignalScope {
  kind: 'show';
  showId: string;
}

export interface ShowDeskPendingSignal {
  id: ShowDeskPendingSignalId;
  count: number;
  label: string;
  priority: ShowDeskPendingSignalPriority;
  /**
   * Destination that clears this signal, built via the canonical route
   * helpers in `entryAttentionRoutes`. `null` means no verified destination
   * exists yet — per spec, such a signal MUST NOT render as a link.
   */
  href: string | null;
  /**
   * Name of the page `href` opens, when the label alone does not say it (MYK9-1618): the chip
   * keeps its count wording and carries the destination in its accessible name.
   */
  destinationName?: string;
  /** Show (and, when relevant, narrower) scope this signal was computed within. */
  scope: ShowDeskPendingSignalScope;
}

export interface ComputeShowDeskPendingSignalsInput {
  showId: string;
  tree: ShowMapTree;
  entries: readonly CheckInEntryLike[];
  /** "Today" reference for the check-in signal. `null`/omitted skips the
   *  date gate (matches `checkInEligibility`'s own no-currentDate behavior). */
  currentDate?: Date | null | undefined;
}

const PRIORITY_ORDER: Record<ShowDeskPendingSignalPriority, number> = {
  highest: 0,
  high: 1,
  medium: 2,
};

function lower(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

function countEntriesWaitingReview(entries: readonly EntryLike[]): number {
  return countRawEntryManagementPendingBucket(entries);
}

// Entry states where the entry is in the run order and therefore eligible to be
// checked in at the gate. Pre-acceptance states (submitted, draft, pending) and
// terminal states (scratched, no-show, withdrawn) are excluded — they'd either
// double-count against waiting-for-review or shouldn't show at the gate at all.
const RUN_ORDER_ELIGIBLE_ENTRY_STATUSES: ReadonlySet<string> = new Set(['accepted', 'confirmed']);

function countEntriesWaitingCheckIn(
  entries: readonly CheckInEntryLike[],
  tree: ShowMapTree,
  currentDate: Date | null | undefined
): number {
  // INTENT: Treat missing / null / empty / 'no-status' all as "not yet checked in".
  // Real DB rows often arrive with null check_in_status before the gate steward has
  // touched the entry; mappers preserve that null. Narrowing to literal 'no-status'
  // would undercount the chip on most shows.
  //
  // BUT only count entries that are run-order-eligible — submitted/draft/pending
  // entries are still pre-acceptance and already surface in waiting-for-review.
  // Counting them here too would show the same entry in both chips.
  return entries.filter(entry => {
    const entryStatus = lower(entry.entry_status);
    if (!RUN_ORDER_ELIGIBLE_ENTRY_STATUSES.has(entryStatus)) return false;
    const checkInStatus = lower(entry.check_in_status);
    if (checkInStatus !== '' && checkInStatus !== 'no-status') return false;

    // MYK9-825/826: the roster's own eligibility check (checkInEligibility)
    // already excludes a class whose trial isn't today, so this signal must
    // count exactly the same entries — otherwise the chip can read positive
    // while its linked Needs check-in filter comes up empty.
    const classNode = entry.class_id
      ? tree.nodesById[getShowMapNodeId('class', entry.class_id)]
      : undefined;
    return isTrialDateToday(classNode?.trialDate, classNode?.timezone, currentDate);
  }).length;
}

function countEntriesPaymentDue(entries: readonly EntryLike[]): number {
  return entries.filter(entry =>
    classifyRawEntryAttention(
      entry as RawOperationalEntryInput,
      entries as readonly RawOperationalEntryInput[]
    ).includes('payment_due')
  ).length;
}

function countClassesByWrapUpValue(tree: ShowMapTree, values: readonly string[]): number {
  const targets = new Set(values);
  let count = 0;
  for (const node of Object.values(tree.nodesById)) {
    if (node.type !== 'class') continue;
    const value = node.wrapUpStatus?.value;
    if (value && targets.has(value)) count++;
  }
  return count;
}

export function computeShowDeskPendingSignals({
  showId,
  tree,
  entries,
  currentDate,
}: ComputeShowDeskPendingSignalsInput): ShowDeskPendingSignal[] {
  const signals: ShowDeskPendingSignal[] = [];
  const scope: ShowDeskPendingSignalScope = { kind: 'show', showId };

  const waitingReview = countEntriesWaitingReview(entries);
  if (waitingReview > 0) {
    signals.push({
      id: 'entries-waiting-review',
      count: waitingReview,
      priority: 'highest',
      // Verb-first: the chip is the single route to pending-review work
      // (MYK9-64 F1/F3) — it names the action, not just the count.
      label: `Review ${waitingReview} ${waitingReview === 1 ? 'entry' : 'entries'}`,
      href: getEntryManagementHref({ showId, attention: 'pending', mode: 'review' }),
      scope,
    });
  }

  const waitingCheckIn = countEntriesWaitingCheckIn(entries, tree, currentDate);
  if (waitingCheckIn > 0) {
    signals.push({
      id: 'entries-waiting-checkin',
      count: waitingCheckIn,
      priority: 'high',
      label: `Check in ${waitingCheckIn} ${waitingCheckIn === 1 ? 'entry' : 'entries'}`,
      // MYK9-1690: opens the Check-in desk already filtered to not checked in.
      href: getCheckInDeskHref({ showId, notCheckedIn: true }),
      destinationName: ENTRY_LIST_LABELS['check-in'],
      scope,
    });
  }

  const paymentDue = countEntriesPaymentDue(entries);
  if (paymentDue > 0) {
    signals.push({
      id: 'entries-payment-due',
      count: paymentDue,
      priority: 'high',
      label: `Resolve ${paymentDue} ${paymentDue === 1 ? 'payment' : 'payments'}`,
      href: getEntryManagementHref({
        showId,
        attention: 'accepted',
        payment: 'pending',
        mode: 'review',
      }),
      scope,
    });
  }

  const needingSignature = countClassesByWrapUpValue(tree, [
    SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
  ]);
  if (needingSignature > 0) {
    signals.push({
      id: 'classes-needing-signature',
      count: needingSignature,
      priority: 'high',
      label: judgeSignOffWording(showRegistryId(tree)).pendingSignalLabel(needingSignature),
      // The count is classes, and the Results tab lists classes with the judge sign-off on each
      // (MYK9-1031), so it opens on the same unit (MYK9-1727). It points at the "Finish the show"
      // list (MYK9-1945), whose judge line links on to those classes; the cockpit shows the
      // per-class links beside this and drops this chip when they cover every counted class.
      href: getCockpitFinishListHref({ showId }),
      destinationName: 'Results',
      scope,
    });
  }

  const pendingCloseout = countClassesByWrapUpValue(tree, [
    SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
    SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
  ]);
  if (pendingCloseout > 0) {
    signals.push({
      id: 'results-pending-closeout',
      count: pendingCloseout,
      priority: 'medium',
      label: `Close out ${pendingCloseout} ${pendingCloseout === 1 ? 'result' : 'results'}`,
      // Classes again, so the Finish the show list on Results, not the show-level close step.
      href: getCockpitFinishListHref({ showId }),
      destinationName: 'Results',
      scope,
    });
  }

  return signals.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

/** A show never mixes registries (MYK9-490), so the first trial speaks for all of them. */
function showRegistryId(tree: ShowMapTree): string | undefined {
  return Object.values(tree.nodesById).find(node => node.type === 'trial')?.registryId;
}
