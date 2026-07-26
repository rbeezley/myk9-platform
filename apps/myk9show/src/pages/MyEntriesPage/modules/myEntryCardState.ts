import { formatDistanceToNow, format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { buildVenueMapsUrls, formatVenueAddress } from '@/utils/venueMaps';
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
  canViewRunOrder: boolean;
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
  const paymentHref = buildOrderPaymentHref(entry);
  const isPaid = [
    PaymentStatus.PAID_ONLINE,
    PaymentStatus.PAID_BY_CHECK,
    PaymentStatus.PAID_BY_CASH,
  ].includes(entry.paymentStatus);
  const isPastEntryDeadline = entry.entryCloseDate
    ? entry.entryCloseDate.getTime() < currentTime.getTime()
    : false;
  const hasEditableStatus =
    entry.entryStatus === EntryStatus.PENDING || entry.entryStatus === EntryStatus.ACCEPTED;
  const canEdit = hasEditableStatus && !isPastEntryDeadline;
  const canRequestPostDeadlineHelp = hasEditableStatus && isPastEntryDeadline;
  const isTerminalStatus = [
    EntryStatus.CANCELLED,
    EntryStatus.SCRATCHED,
    EntryStatus.REJECTED,
    EntryStatus.MOVED,
    EntryStatus.COMPLETED,
  ].includes(entry.entryStatus);
  const hasRunOrder = entry.classes.some(cls => cls.runOrder != null);
  const canViewRunOrder =
    !isPastShow &&
    hasRunOrder &&
    (entry.entryStatus === EntryStatus.ACCEPTED ||
      entry.entryStatus === EntryStatus.MOVE_UP_REQUESTED);
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
    canViewRunOrder,
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
