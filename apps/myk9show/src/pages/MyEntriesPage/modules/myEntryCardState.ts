import { formatDistanceToNow, format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { buildVenueMapsUrls, formatVenueAddress } from '@/utils/venueMaps';
import { getEntryWindowTimezone } from '@/utils/entryWindowDate';
import { calendarDayOf, isEntryCloseDayPast } from './dayCheckIn';
import {
  buildOrderPaymentHref,
  getOrderOnlinePrompt,
  getOrderPayAtShowPrompt,
} from './myEntryOrderBalance';
import type { EntryPaymentPrompt } from '@/features/payments/entryPaymentPrompt';
import {
  deriveEntryNextAction,
  hasPaymentEligibleClass,
  type EntryNextAction,
} from './entryNextAction';
import { isPastShowEntry } from './myEntriesStats.helpers';
import { getContextualStatusMessage } from './myEntriesUtils';
import { findOwningDog } from './myEntryDogView';
import type { EntryClass, MyEntry, MyEntryDogGroup } from './my-entries-types';

export interface MyEntryCardDerivedState {
  statusMessage: ReturnType<typeof getContextualStatusMessage>;
  isPastShow: boolean;
  paymentHref: string | null;
  isPaid: boolean;
  canEdit: boolean;
  canRequestPostDeadlineHelp: boolean;
  isTerminalStatus: boolean;
  canShowReceipt: boolean;
  isPendingReview: boolean;
  nextAction: EntryNextAction;
  nextActionClass: EntryClass | undefined;
  nextActionDog: MyEntryDogGroup | undefined;
  isMultiDogOrder: boolean;
  onlinePrompt: EntryPaymentPrompt;
  payAtShowPrompt: EntryPaymentPrompt;
  mapAddress: string;
  directionsUrl: string | null;
}

/**
 * Derive the values that control the card's summary and detail affordances.
 * Keeping these calculations outside the component makes the workflow rules
 * independently testable and keeps JSX focused on presentation.
 */
export function deriveMyEntryCardState(
  entry: MyEntry,
  currentTime: Date,
  selfCheckinByClassId: Record<string, boolean> = {}
): MyEntryCardDerivedState {
  const statusMessage = getContextualStatusMessage(
    entry,
    formatDistanceToNow,
    format,
    isToday,
    isTomorrow,
    differenceInDays
  );
  const isPastShow = isPastShowEntry(entry, currentTime);
  // The checkout endpoint rejects past-show entries. Keep the balance and its
  // Payment Due status visible, but never leave a cart link on the card.
  const paymentHref = isPastShow ? null : buildOrderPaymentHref(entry);
  const isPaid = [
    PaymentStatus.PAID_ONLINE,
    PaymentStatus.PAID_BY_CHECK,
    PaymentStatus.PAID_BY_CASH,
  ].includes(entry.paymentStatus);
  // The close date is INCLUSIVE and belongs to a calendar day, not an instant:
  // entries stay open through the end of the day the show wrote down, which is
  // how the server guard reads it. Comparing instants shut the window at 00:00
  // on the close date and retired BOTH the edit control and its replacement for
  // that whole day — a dead end on the last day anyone would need them
  // (Codex, PR #2201). `getEntryWindowTimezone` picks the same primary trial
  // the submission guard does, so the page and the server agree at midnight.
  //
  // The zone is derived from the classes the exhibitor ENTERED, while the
  // submission guard reads every trial on the show. Those two agree because a
  // show runs at one venue and therefore in one timezone: verified 2026-09-13
  // against the live database, where no show has trials in more than one zone
  // (max 1 distinct zone across all shows carrying trials), and confirmed as a
  // domain rule by the product owner. If a show ever spans two zones, this
  // must stop inferring and carry the show's own entry-window timezone through
  // the data layer instead — the entered classes cannot name the show's
  // primary trial when the exhibitor skipped it.
  const entryWindowTimezone = getEntryWindowTimezone(
    entry.classes.map(cls => ({
      id: cls.trialNumber ?? null,
      date: cls.trialDate ? calendarDayOf(cls.trialDate) : null,
      timezone: cls.trialTimezone ?? null,
    }))
  );
  const isPastEntryDeadline = isEntryCloseDayPast(
    entry.entryCloseDate,
    entryWindowTimezone,
    currentTime
  );
  const isCompleted =
    entry.entryStatus === EntryStatus.COMPLETED || entry.entryStatusKind === 'completed';
  const hasEditableStatus =
    !isCompleted &&
    (entry.entryStatus === EntryStatus.PENDING || entry.entryStatus === EntryStatus.ACCEPTED);
  const canEdit = hasEditableStatus && !isPastEntryDeadline;
  const canRequestPostDeadlineHelp = hasEditableStatus && isPastEntryDeadline;
  const isTerminalStatus =
    isCompleted ||
    [
      EntryStatus.CANCELLED,
      EntryStatus.SCRATCHED,
      EntryStatus.REJECTED,
      EntryStatus.MOVED,
    ].includes(entry.entryStatus);
  const canShowReceipt = Boolean(entry.confirmationNumber && isPaid);
  const isPendingReview =
    entry.entryStatus === EntryStatus.PENDING &&
    (entry.entryStatusKind ?? 'pending') === 'pending' &&
    !isPastShow;
  const nextAction = deriveEntryNextAction(entry, {
    now: currentTime,
    selfCheckinByClassId,
  });
  const nextActionClass =
    nextAction.kind === 'check-in'
      ? entry.classes.find(cls => cls.id === nextAction.classId)
      : undefined;
  const nextActionDog = nextActionClass ? findOwningDog(entry, nextActionClass.id) : undefined;
  const canPayStatus = hasPaymentEligibleClass(entry);
  const onlinePrompt = canPayStatus ? getOrderOnlinePrompt(entry) : { kind: 'none' as const };
  const payAtShowPrompt = canPayStatus ? getOrderPayAtShowPrompt(entry) : { kind: 'none' as const };
  const mapAddress = formatVenueAddress([
    entry.location.venue,
    entry.location.city,
    entry.location.state,
  ]);

  return {
    statusMessage,
    isPastShow,
    paymentHref,
    isPaid,
    canEdit,
    canRequestPostDeadlineHelp,
    isTerminalStatus,
    canShowReceipt,
    isPendingReview,
    nextAction,
    nextActionClass,
    nextActionDog,
    isMultiDogOrder: entry.dogs.length > 1,
    onlinePrompt,
    payAtShowPrompt,
    mapAddress,
    directionsUrl: mapAddress ? buildVenueMapsUrls(mapAddress).directionsUrl : null,
  };
}
