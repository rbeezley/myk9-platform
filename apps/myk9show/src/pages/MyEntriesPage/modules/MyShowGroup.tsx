/**
 * One show on My Shows: a header, the money strips that need attention, then
 * one dog card per dog.
 *
 * Money is deliberately quiet here. A settled show says "Paid" in the meta
 * line and nothing else; only a balance the exhibitor can act on earns a
 * strip, and a refund is a note on the dog it touched. No payment chip renders
 * anywhere on this page (exhibitor-money-on-exception).
 *
 * @module MyEntriesPage/modules/MyShowGroup
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToCalendarDialog } from '@/features/calendar-subscribe';
import { formatPaymentCents } from '@/features/payments/moneyPresentation';
import { formatShortCalendarDate } from '@/lib/format/dates';
import { buildVenueMapsUrls, formatVenueAddress } from '@/utils/venueMaps';
import type { ResultCardModel } from '@/features/result-card';
import { EntryStatus } from '@/types/show-registration-types';
import type { DayCheckInContext } from './dayCheckIn';
import { indexOrdersById, type MyShowClass, type MyShowDog } from './groupEntriesByShow';
import type { MyShowGroup as MyShowGroupModel } from './groupEntriesByShow';
import { MyShowDogCard } from './MyShowDogCard';
import type { MyEntry } from './my-entries-types';
import { deriveMyEntryCardState } from './myEntryCardState';
import { isPastShowEntry } from './myEntriesStats.helpers';
import { formatDogNamesPossessive, formatShowHeaderDateRange } from './myShowHeaderFormat';
import { derivePaidStrip, hasSeenPaidStrip, markPaidStripSeen } from './paidStripSeen';
import { deriveShowMoneyState, refundNotesByDog } from './showMoneyState';

const HEADER_LINK_CLASS =
  'inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded font-medium text-primary ' +
  'hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

export interface MyShowGroupProps {
  group: MyShowGroupModel;
  /** Captured once per render pass by the list; never `new Date()` inline. */
  now: Date;
  selfCheckinByClassId?: Record<string, boolean> | undefined;
  seenResultReleaseKeys: Set<string>;
  onCheckInDay: (dog: MyShowDog, classes: MyShowClass[]) => void;
  onOpenCheckIn: (order: MyEntry, cls: MyShowClass) => void;
  /** One editable order opens directly; several open the picker (design D9). */
  onOpenEdit: (orders: MyEntry[]) => void;
  onOpenReceipts: (group: MyShowGroupModel) => void;
  onResultRevealClick?: ((model: ResultCardModel) => void) | undefined;
}

export const MyShowGroupCard: React.FC<MyShowGroupProps> = ({
  group,
  now,
  selfCheckinByClassId,
  seenResultReleaseKeys,
  onCheckInDay,
  onOpenCheckIn,
  onOpenEdit,
  onOpenReceipts,
  onResultRevealClick,
}) => {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  // Strips dismissed in this render pass. The stored marker survives a reload;
  // this set is what removes the strip immediately, and it also covers the
  // browser where `localStorage` throws.
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());

  const ordersById = React.useMemo(() => indexOrdersById(group), [group]);
  const isPastShow = isPastShowEntry(group.orders[0], now);
  const money = deriveShowMoneyState(group.orders, now);
  const refunds = refundNotesByDog(group.orders);
  const paidStrip = derivePaidStrip(
    group.orders,
    now,
    orderId => hasSeenPaidStrip(orderId) || dismissed.has(orderId)
  );

  const orderStates = group.orders.map(order => ({
    order,
    state: deriveMyEntryCardState(order, now, selfCheckinByClassId ?? {}),
  }));
  const editableOrders = orderStates.filter(({ state }) => state.canEdit).map(({ order }) => order);

  const checkInContext: DayCheckInContext = {
    now,
    ordersById,
    selfCheckinByClassId,
    isPastShow,
  };

  const mapAddress = formatVenueAddress([
    group.location.venue,
    group.location.city,
    group.location.state,
  ]);
  const directionsUrl = mapAddress ? buildVenueMapsUrls(mapAddress).directionsUrl : null;
  const placeLabel = [group.location.city, group.location.state].filter(Boolean).join(', ');
  const dateRange = formatShowHeaderDateRange(group.showDate, group.showEndDate);
  // Two trials on one day are only distinguishable by number; a show that only
  // ever ran one trial does not need the word on every row.
  const showTrialNumber =
    new Set(group.dogs.flatMap(dog => dog.classes.map(cls => cls.trialNumber).filter(Boolean)))
      .size > 1;

  return (
    <section aria-labelledby={`show-${group.key}`}>
      <div className="myk9-entries-show-header">
        <div className="min-w-0">
          {/* h3: the page's h1 is "My Shows" and the list sits under the "All
              entries" h2, so a show is the third level. */}
          <h3 id={`show-${group.key}`} className="myk9-entries-show-title">
            {group.showName}
          </h3>
          <p className="myk9-entries-show-meta">
            {dateRange && <span>{dateRange}</span>}
            {placeLabel && (
              <>
                <span aria-hidden="true">·</span>
                {directionsUrl ? (
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Get directions to ${mapAddress}`}
                    className="inline-flex min-h-[44px] items-center rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    {placeLabel}
                  </a>
                ) : (
                  <span>{placeLabel}</span>
                )}
              </>
            )}
            {money.kind === 'settled' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Paid
                </span>
              </>
            )}
            {money.kind === 'pay-at-show' && (
              <>
                <span aria-hidden="true">·</span>
                <span>Pay at show</span>
              </>
            )}
            {editableOrders.length > 0 && group.entryCloseDate && (
              <>
                <span aria-hidden="true">·</span>
                <span>Entries close {formatShortCalendarDate(group.entryCloseDate)}</span>
              </>
            )}
          </p>
        </div>

        <div className="myk9-entries-show-actions">
          {/* Always offered: a pending, cash or check order still has an order and a
              card-derived receipt to show; only a paid one has a Stripe receipt. */}
          {group.orders.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenReceipts(group)}
              className={HEADER_LINK_CLASS}
            >
              Orders &amp; receipts
            </button>
          )}
          {editableOrders.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenEdit(editableOrders)}
              className={HEADER_LINK_CLASS}
            >
              Edit entry
            </button>
          )}
          {/* The showId guard travels with the control: an empty showId is the
              partial-replication window, and AddToCalendarDialog issues a
              subscription for the id the moment it opens. */}
          {group.showId && (
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className={HEADER_LINK_CLASS}
            >
              Add to calendar
            </button>
          )}
          <Link to={`/shows/${group.showId}`} className={HEADER_LINK_CLASS}>
            View show
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {money.kind === 'balance-due' && (
        <div className="myk9-entries-strip border-warning/20 bg-warning/10 text-warning">
          <div className="min-w-0">
            <p className="myk9-entries-strip-head">
              {formatDogNamesPossessive(money.dueDogNames)}{' '}
              {money.dueDogNames.length > 1 ? 'entries are' : 'entry is'} waiting on payment
            </p>
            <p className="myk9-entries-strip-body">
              {formatPaymentCents(money.amountCents, 'USD')} due · the secretary will review it once
              it is paid.
            </p>
          </div>
          {money.paymentHref ? (
            <Button asChild className="min-h-[44px]">
              <Link to={money.paymentHref}>
                <CreditCard className="mr-1.5 h-5 w-5" />
                Finish payment
              </Link>
            </Button>
          ) : (
            // INTENT: an exhibitor who owes money must never face a dead end.
            // No cart can be built safely, so say which kind of "not yet" this
            // is. An empty showId is the replication window and WILL resolve;
            // anything else needs the secretary, not a spinner.
            <Button disabled className="min-h-[44px]">
              <CreditCard className="mr-1.5 h-5 w-5" />
              {group.showId ? 'Contact the show secretary to pay' : 'Payment options loading…'}
            </Button>
          )}
        </div>
      )}

      {money.kind === 'unresolved' && (
        <div className="myk9-entries-strip border-warning/20 bg-warning/10 text-warning">
          <div className="min-w-0">
            <p className="myk9-entries-strip-head">
              {formatDogNamesPossessive(money.dueDogNames)}{' '}
              {money.dueDogNames.length > 1 ? 'entries have' : 'entry has'} an outstanding balance
            </p>
            <p className="myk9-entries-strip-body">
              Please contact the club to settle this outstanding balance.
            </p>
          </div>
        </div>
      )}

      {paidStrip && (
        <div className="myk9-entries-strip border-success/20 bg-success/10 text-success">
          <div className="min-w-0">
            <p className="myk9-entries-strip-head">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDogNamesPossessive(paidStrip.dogNames)}{' '}
              {paidStrip.dogNames.length > 1 ? 'entries are' : 'entry is'} paid —{' '}
              {formatPaymentCents(paidStrip.amountCents, 'USD')} on{' '}
              {formatShortCalendarDate(paidStrip.date)}
            </p>
            <p className="myk9-entries-strip-body">
              The secretary will review it next. Receipt sent to your email.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              for (const orderId of paidStrip.orderIds) markPaidStripSeen(orderId);
              setDismissed(prev => {
                const next = new Set(prev);
                for (const orderId of paidStrip.orderIds) next.add(orderId);
                return next;
              });
            }}
            className="min-h-[44px] text-muted-foreground"
          >
            Dismiss
          </Button>
        </div>
      )}

      <ul className="space-y-4">
        {group.dogs.map(dog => (
          <li key={dog.dogId}>
            <MyShowDogCard
              dog={dog}
              ordersById={ordersById}
              checkInContext={checkInContext}
              isShowCancelled={group.isShowCancelled}
              showTrialNumber={showTrialNumber}
              refundNote={refunds[dog.dogId]}
              isPendingReview={
                !isPastShow &&
                dog.entryStatus === EntryStatus.PENDING &&
                (dog.entryStatusKind ?? 'pending') === 'pending'
              }
              seenResultReleaseKeys={seenResultReleaseKeys}
              onCheckInDay={onCheckInDay}
              onOpenCheckIn={onOpenCheckIn}
              onResultRevealClick={onResultRevealClick}
            />
          </li>
        ))}
      </ul>

      {calendarOpen && (
        <AddToCalendarDialog
          open={calendarOpen}
          onOpenChange={setCalendarOpen}
          showId={group.showId}
          showName={group.showName}
        />
      )}
    </section>
  );
};
