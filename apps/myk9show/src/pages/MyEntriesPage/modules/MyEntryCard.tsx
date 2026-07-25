/**
 * Entry card component for MyEntriesPage
 * Displays a single entry with all its details
 * @module MyEntriesPage/components
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import {
  Calendar,
  ChevronDown,
  MapPin,
  Eye,
  CreditCard,
  ClipboardCheck,
  Wallet,
} from 'lucide-react';
import { formatDistanceToNow, format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { type ResultCardModel } from '@/features/result-card';
import { buildVenueMapsUrls, formatVenueAddress } from '@/utils/venueMaps';
import { buildOrderPaymentHref, getOrderPaymentPrompt } from './myEntryOrderBalance';
import type { MyEntry, EntryClass } from './my-entries-types';
import {
  getEntryStatusBadge,
  getPaymentStatusBadge,
  getStatusIcon,
  getContextualStatusMessage,
} from './myEntriesUtils';
import { isPastShowEntry } from './myEntriesStats.helpers';
import { formatEntryDate, formatShortDate } from '@/lib/format/dates';
import { deriveEntryNextAction } from './entryNextAction';
import { PENDING_REVIEW_REASSURANCE } from './myShowsCopy';
import { MyEntryCardDetails } from './MyEntryCardDetails';
import { findOwningDog, toDogEntryView } from './myEntryDogView';

interface MyEntryCardProps {
  entry: MyEntry;
  /**
   * Resolved self-check-in cascade by class id (class ?? trial ?? show ?? true).
   * Missing/absent entries default to enabled. Gates the check-in control so the
   * secretary's "self-check-in" toggle is honored, not just `!isScored`.
   */
  selfCheckinByClassId?: Record<string, boolean>;
  onCheckInClick: (entry: MyEntry, classEntry: EntryClass) => void;
  onEditClick: (entry: MyEntry) => void;
  onReceiptClick: (entry: MyEntry) => void;
  onResultRevealClick?: (model: ResultCardModel) => void;
  seenResultReleaseKeys?: Set<string>;
}

/**
 * Card component displaying a single entry's details.
 *
 * Memoized: the page maps this over `filteredEntries`, so without memoization
 * every dialog open or tab change would re-render (and rebuild result-card
 * models for) every card. Parent passes stable callbacks for this to bite.
 */
const MyEntryCardComponent: React.FC<MyEntryCardProps> = ({
  entry,
  selfCheckinByClassId = {},
  onCheckInClick,
  onEditClick,
  onReceiptClick,
  onResultRevealClick,
  seenResultReleaseKeys = new Set(),
}) => {
  const [currentTime] = React.useState(() => Date.now());
  // Details panel is collapsed by default on every viewport (progressive
  // disclosure — exhibitor-my-shows-legibility). Per-card local state, no
  // effect involved.
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const detailsId = `entry-details-${entry.id}`;
  const statusMessage = getContextualStatusMessage(
    entry,
    formatDistanceToNow,
    format,
    isToday,
    isTomorrow,
    differenceInDays
  );
  const isPastShow = isPastShowEntry(entry, new Date(currentTime));

  const isPaid =
    entry.paymentStatus === PaymentStatus.PAID_ONLINE ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CASH;

  const isPastEntryDeadline = entry.entryCloseDate
    ? entry.entryCloseDate.getTime() < currentTime
    : false;
  const hasEditableStatus =
    entry.entryStatus === EntryStatus.PENDING || entry.entryStatus === EntryStatus.ACCEPTED;
  const canEdit = hasEditableStatus && !isPastEntryDeadline;
  const canRequestPostDeadlineHelp = hasEditableStatus && isPastEntryDeadline;

  // Terminal statuses have no active workflow — "Confirmation # Pending" reads as
  // a contradictory status label next to Withdrawn/Refunded badges (P1-04w-1).
  const isTerminalStatus =
    entry.entryStatus === EntryStatus.CANCELLED ||
    entry.entryStatus === EntryStatus.SCRATCHED ||
    entry.entryStatus === EntryStatus.REJECTED ||
    entry.entryStatus === EntryStatus.MOVED ||
    entry.entryStatus === EntryStatus.COMPLETED;

  // Run order link: show once the secretary has assigned run orders (at least one
  // class has a run_order number) and the exhibitor has a confirmed spot.
  const hasRunOrder = entry.classes.some(cls => cls.runOrder != null);
  const canViewRunOrder =
    !isPastShow &&
    hasRunOrder &&
    (entry.entryStatus === EntryStatus.ACCEPTED ||
      entry.entryStatus === EntryStatus.MOVE_UP_REQUESTED);

  const canShowReceipt = entry.confirmationNumber && isPaid;
  // Pending Review reassurance line — only while the badge itself reads
  // "Pending Review" (never for a past/unresolved history card, which uses
  // "Review incomplete" wording instead).
  const isPendingReview = entry.entryStatus === EntryStatus.PENDING && !isPastShow;
  const nextAction = deriveEntryNextAction(entry, {
    now: new Date(currentTime),
    selfCheckinByClassId,
  });
  const nextActionClass =
    nextAction.kind === 'check-in'
      ? entry.classes.find(cls => cls.id === nextAction.classId)
      : undefined;
  // Scope the check-in click to the dog that actually owns this class — an
  // order can span several dogs, and the check-in dialog must show the right
  // dog's name/armband, not just the order's lead dog.
  const nextActionDog = nextActionClass ? findOwningDog(entry, nextActionClass.id) : undefined;
  const isMultiDogOrder = entry.dogs.length > 1;
  // Payment eligibility is intentionally split from edit eligibility: a
  // move-up request is a confirmed entry that can still owe its fee even though
  // it isn't editable while awaiting secretary approval. Waitlisted entries stay
  // out — they pay on promotion, not before.
  const canPayStatus = hasEditableStatus || entry.entryStatus === EntryStatus.MOVE_UP_REQUESTED;
  // "Finish Payment" is an ONLINE action — cash/check exhibitors chose to pay at
  // the show and must see a calm status, not a debt CTA (4.C). No payment prompt
  // at all unless the entry status is one that can still owe its fee.
  // Amount, status and method all come from the ROW-level order balance, so a
  // mixed paid/pending order can never claim "Paid" while the page summary
  // shows money due (exhibitor-money-clarity).
  const paymentPrompt = canPayStatus ? getOrderPaymentPrompt(entry) : ({ kind: 'none' } as const);

  // Build a "Get directions" link from the full venue address (venue, city,
  // state) while the card still displays the shorter "city, state" label.
  // Falls back to a non-interactive row when no address parts are available.
  const mapAddress = formatVenueAddress([
    entry.location.venue,
    entry.location.city,
    entry.location.state,
  ]);
  const directionsUrl = mapAddress ? buildVenueMapsUrls(mapAddress).directionsUrl : null;
  const locationContent = (
    <>
      <MapPin className="h-4 w-4" />
      <span>
        {entry.location.city}, {entry.location.state}
      </span>
    </>
  );

  return (
    <div className="myk9-entries-card">
      {/* Summary band — always visible: status, dog + armband, show date,
          location/directions, and the single next-action button. */}
      <div className="myk9-entries-card-header">
        <div>
          <div className="myk9-entries-card-title">
            {getStatusIcon(entry.entryStatus, entry.paymentStatus)}
            {entry.showName}
          </div>
          <div className="myk9-entries-card-subtitle flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {isMultiDogOrder ? (
              // Every dog's identity stays visible on the always-shown summary
              // band (exhibitor-my-shows-legibility) — wraps, never scrolls.
              entry.dogs.map(dog => (
                <span key={dog.dogId} className="inline-flex items-center gap-1.5">
                  {dog.armband && (
                    <ArmbandBadge armband={dog.armband} className="size-8 rounded-lg text-xs" />
                  )}
                  <span>{dog.dogName}</span>
                </span>
              ))
            ) : (
              <>
                {entry.armband && (
                  <ArmbandBadge armband={entry.armband} className="size-8 rounded-lg text-xs" />
                )}
                <span>{entry.dogName}</span>
              </>
            )}
          </div>
        </div>
        <div className="myk9-entries-badges">
          {getEntryStatusBadge(entry.entryStatus, { isPastShow })}
          {/* Cash/check "pay at show" entries carry their own calm status line
              below — the red "Payment Due" debt chip would contradict it (4.C).
              A raw PENDING paymentStatus with no actionable online balance
              (waived, secretary-recorded, zero fee, or a non-payable entry
              status) must not show "Payment Due" either — the chip previously
              fired off the raw status alone, contradicting the dashboard/My
              Payments amount-due figure that already derives from
              getEntryPaymentPrompt (exhibitor-money-clarity). */}
          {!(
            entry.paymentStatus === PaymentStatus.PENDING && paymentPrompt.kind !== 'finish-online'
          ) && getPaymentStatusBadge(entry.paymentStatus, { isPastShow })}
        </div>
      </div>

      {isPendingReview && (
        <p className="myk9-entries-pending-reassurance text-base text-muted-foreground">
          {PENDING_REVIEW_REASSURANCE}
        </p>
      )}

      <div className="myk9-entries-details-grid">
        <div className="myk9-entries-detail-item">
          <Calendar className="h-4 w-4" />
          <span>{formatEntryDate(entry.showDate)}</span>
        </div>

        {/* "Entries close" only while editing is still possible (same
            predicate gating Edit Entry, task 3.3) — once the deadline has
            passed it moves into details alongside the rest of the history. */}
        {canEdit && entry.entryCloseDate && (
          <div className="myk9-entries-detail-item">
            <Calendar className="h-4 w-4" />
            <span>
              <span className="text-sm text-muted-foreground">Entries close </span>
              {formatShortDate(entry.entryCloseDate)}
            </span>
          </div>
        )}

        {directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Get directions to ${mapAddress}`}
            className="myk9-entries-detail-item flex min-h-[44px] items-center rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {locationContent}
          </a>
        ) : (
          <div className="myk9-entries-detail-item">{locationContent}</div>
        )}
      </div>

      <div className="myk9-entries-last-updated">
        <span className={statusMessage.className}>{statusMessage.message}</span>
      </div>

      {paymentPrompt.kind === 'pay-at-show' && (
        <p className="flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4 flex-shrink-0" />
          {paymentPrompt.text}
        </p>
      )}

      {/* INTENT: single next action, precedence finish payment > check-in >
          view show (deriveEntryNextAction). Check-in MUST reuse the same
          onCheckInClick(entry, cls) handler the per-class details control
          calls — never a separate write path. */}
      <div className="myk9-entries-action-buttons">
        {nextAction.kind === 'finish-payment' && (
          <Button asChild className="min-h-[44px] transition-all duration-200">
            <Link to={buildOrderPaymentHref(entry)}>
              <CreditCard className="h-5 w-5 mr-1.5" />
              Finish Payment
            </Link>
          </Button>
        )}

        {nextAction.kind === 'check-in' && nextActionClass && (
          <Button
            type="button"
            onClick={() =>
              onCheckInClick(
                nextActionDog ? toDogEntryView(entry, nextActionDog) : entry,
                nextActionClass
              )
            }
            className="min-h-[44px] transition-all duration-200"
          >
            <ClipboardCheck className="h-5 w-5 mr-1.5" />
            Check In
          </Button>
        )}

        {nextAction.kind === 'view-show' && (
          <Button
            variant="outline"
            asChild
            className="min-h-[44px] border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200"
          >
            <Link to={`/shows/${entry.showId}`}>
              <Eye className="h-5 w-5 mr-1.5" />
              View Show
            </Link>
          </Button>
        )}
      </div>

      {/* Details toggle — full-width, labeled, collapsed by default on every
          viewport (task 3.1). */}
      <button
        type="button"
        onClick={() => setDetailsOpen(open => !open)}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-border/60 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {detailsOpen ? 'Hide details' : 'Show details'}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {detailsOpen && (
        <MyEntryCardDetails
          entry={entry}
          detailsId={detailsId}
          isTerminalStatus={isTerminalStatus}
          canEdit={canEdit}
          canViewRunOrder={canViewRunOrder}
          canRequestPostDeadlineHelp={canRequestPostDeadlineHelp}
          canShowReceipt={Boolean(canShowReceipt)}
          summaryShowsViewShow={nextAction.kind === 'view-show'}
          selfCheckinByClassId={selfCheckinByClassId}
          seenResultReleaseKeys={seenResultReleaseKeys}
          onCheckInClick={onCheckInClick}
          onEditClick={onEditClick}
          onReceiptClick={onReceiptClick}
          onResultRevealClick={onResultRevealClick}
        />
      )}
    </div>
  );
};

export const MyEntryCard = React.memo(MyEntryCardComponent);
MyEntryCard.displayName = 'MyEntryCard';
