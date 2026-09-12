/**
 * One dog at one show: armband, name, a rolled-up status chip, one row per
 * class, and at most one primary action — the day-gated batch check-in.
 *
 * INTENT: single write path. Every check-in this card can issue — the day
 * button, a row's "Check in" link, and the "change" link's dialog — ends in
 * `updateEntryCheckIn(entryId, classId, status)`. The batch button is a
 * sequential LOOP over that one mutation, never a second write path: the
 * optimistic update and its revert must behave exactly as the single-class
 * path does, and a half-finished batch must leave each class showing its own
 * real state. Do not add a bulk RPC here without moving the single-class path
 * onto it too.
 *
 * @module MyEntriesPage/modules/MyShowDogCard
 */

import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { StatusBadge } from '@/components/status';
import { formatPaymentCents } from '@/features/payments/moneyPresentation';
import { formatMonthDay } from '@/lib/format/dates';
import type { ResultCardModel } from '@/features/result-card';
import { deriveDayCheckInTargets, type DayCheckInContext } from './dayCheckIn';
import type { MyShowClass, MyShowDog } from './groupEntriesByShow';
import { MyShowClassRow } from './MyShowClassRow';
import type { MyEntry } from './my-entries-types';
import { deriveDogChip } from './myShowDogState';
import { PENDING_REVIEW_REASSURANCE } from './myShowsCopy';
import type { RefundNote } from './showMoneyState';

export interface MyShowDogCardProps {
  dog: MyShowDog;
  /** The show's orders, keyed by id — a dog can span several. */
  ordersById: Record<string, MyEntry>;
  checkInContext: DayCheckInContext;
  isShowCancelled: boolean;
  /** Suppress the trial number when the show only ever ran one trial. */
  showTrialNumber: boolean;
  /** Refund recorded against this dog's order, if any. */
  refundNote?: RefundNote | undefined;
  /** The dog's entry is still awaiting the secretary. */
  isPendingReview: boolean;
  seenResultReleaseKeys: Set<string>;
  onCheckInDay: (dog: MyShowDog, classes: MyShowClass[]) => void;
  onOpenCheckIn: (order: MyEntry, cls: MyShowClass) => void;
  onResultRevealClick?: ((model: ResultCardModel) => void) | undefined;
}

const MyShowDogCardComponent: React.FC<MyShowDogCardProps> = ({
  dog,
  ordersById,
  checkInContext,
  isShowCancelled,
  showTrialNumber,
  refundNote,
  isPendingReview,
  seenResultReleaseKeys,
  onCheckInDay,
  onOpenCheckIn,
  onResultRevealClick,
}) => {
  const chip = deriveDogChip(dog, {
    isPastShow: checkInContext.isPastShow,
    isShowCancelled,
  });
  const targets = deriveDayCheckInTargets(dog, checkInContext);

  return (
    <div className="myk9-entries-dog-card">
      <div className="myk9-entries-dog-card-head">
        <div className="myk9-entries-dog-card-identity">
          {/* ArmbandBadge's own unassigned path renders a muted dash, so the
              "not a filled pill yet" rule is one implementation, not two. */}
          <ArmbandBadge armband={dog.armband} className="h-10 min-w-10 text-base" />
          <span className="myk9-entries-dog-card-name">{dog.dogName}</span>
        </div>
        <div className="myk9-entries-dog-card-actions">
          <StatusBadge family="entry" status={chip.status} label={chip.label} />
          {targets.classes.length > 0 && (
            <Button
              type="button"
              onClick={() => onCheckInDay(dog, targets.classes)}
              className="min-h-[44px]"
            >
              <ClipboardCheck className="mr-1.5 h-5 w-5" />
              Check in for {targets.weekday}
            </Button>
          )}
        </div>
      </div>

      <div className="myk9-entries-dog-classes">
        {dog.classes.map(cls => (
          <MyShowClassRow
            key={cls.id}
            cls={cls}
            dogName={dog.dogName}
            order={ordersById[cls.orderId]}
            checkInContext={checkInContext}
            showTrialNumber={showTrialNumber}
            seenResultReleaseKeys={seenResultReleaseKeys}
            onCheckInClass={one => onCheckInDay(dog, [one])}
            onOpenCheckIn={onOpenCheckIn}
            onResultRevealClick={onResultRevealClick}
          />
        ))}
      </div>

      {/* A refund is a fact about this dog, not a chip: it changes nothing the
          exhibitor has to do, and the show's money word stays "Paid". */}
      {refundNote && (
        <p className="myk9-entries-dog-note">
          {refundNote.kind === 'partial'
            ? `Partial refund of ${formatPaymentCents(refundNote.amountCents, 'USD')} issued ${formatMonthDay(refundNote.date)}.`
            : `Refunded ${formatPaymentCents(refundNote.amountCents, 'USD')} on ${formatMonthDay(refundNote.date)}.`}
        </p>
      )}

      {isPendingReview && <p className="myk9-entries-dog-note">{PENDING_REVIEW_REASSURANCE}</p>}
    </div>
  );
};

/**
 * Memoized: a show group can hold a dozen dogs and the list re-renders on
 * every dialog open. The parent passes stable callbacks for this to bite.
 */
export const MyShowDogCard = React.memo(MyShowDogCardComponent);
MyShowDogCard.displayName = 'MyShowDogCard';
