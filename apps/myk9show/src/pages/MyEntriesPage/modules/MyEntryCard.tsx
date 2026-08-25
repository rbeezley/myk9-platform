/**
 * Entry card component for MyEntriesPage
 * Displays a single entry with all its details
 * @module MyEntriesPage/components
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PaymentStatus } from '@/types/show-registration-types';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import {
  Calendar,
  CalendarPlus,
  ChevronDown,
  MapPin,
  Eye,
  CreditCard,
  ClipboardCheck,
  Wallet,
} from 'lucide-react';
import { type ResultCardModel } from '@/features/result-card';
import type { MyEntry, EntryClass } from './my-entries-types';
import { getEntryStatusBadge, getPaymentStatusBadge, getStatusIcon } from './myEntriesUtils';
import { formatEntryDate, formatShortDate } from '@/lib/format/dates';
import { PENDING_REVIEW_REASSURANCE } from './myShowsCopy';
import { MyEntryCardDetails } from './MyEntryCardDetails';
import { AddToCalendarDialog } from '@/features/calendar-subscribe';
import { toDogEntryView } from './myEntryDogView';
import { deriveMyEntryCardState } from './myEntryCardState';
import { getPartiallyScoredState, isSettledWithoutScore } from './myEntriesStats.helpers';

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
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const detailsId = `entry-details-${entry.id}`;
  const {
    statusMessage,
    isPastShow,
    paymentHref,
    canEdit,
    canRequestPostDeadlineHelp,
    isTerminalStatus,
    canViewRunOrder,
    canShowReceipt,
    isPendingReview,
    nextAction,
    nextActionClass,
    nextActionDog,
    isMultiDogOrder,
    onlinePrompt,
    payAtShowPrompt,
    mapAddress,
    directionsUrl,
  } = deriveMyEntryCardState(entry, new Date(currentTime), selfCheckinByClassId);
  // An order with results for SOME of its classes reports `completed` at the
  // top level (COMPLETED tops the grouping's priority scale), which rendered a
  // flat "Scored" badge while runs were still outstanding. Describe the classes
  // still to run instead, and let the label carry the partial state.
  const partiallyScored = React.useMemo(() => getPartiallyScoredState(entry), [entry]);
  // An order settled entirely by absences is done, but its lifecycle columns
  // still read 'confirmed' — without this it renders a green "Accepted" badge
  // from inside the Completed tab.
  const settledWithoutScore = React.useMemo(() => isSettledWithoutScore(entry), [entry]);
  const summaryStatus = partiallyScored?.entryStatus ?? entry.entryStatus;
  const summaryStatusKind =
    partiallyScored?.entryStatusKind ?? (settledWithoutScore ? 'absent' : entry.entryStatusKind);
  // Build a "Get directions" link from the full venue address (venue, city,
  // state) while the card still displays the shorter "city, state" label.
  // Falls back to a non-interactive row when no address parts are available.
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
          {/* h3: each entry card sits under the "All entries" h2. Was a <div>,
            so the entry list had no navigable structure at all. */}
          <h3 className="myk9-entries-card-title">
            {getStatusIcon(summaryStatus, entry.paymentStatus, summaryStatusKind)}
            {entry.showName}
          </h3>
          <div className="myk9-entries-card-subtitle flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {isMultiDogOrder ? (
              // Every dog's identity stays visible on the always-shown summary
              // band (exhibitor-my-shows-legibility) — wraps, never scrolls.
              entry.dogs.map(dog => (
                <span key={dog.dogId} className="inline-flex items-center gap-1.5">
                  {dog.armband && (
                    <ArmbandBadge armband={dog.armband} className="h-8 min-w-8 rounded-lg text-xs" />
                  )}
                  <span>{dog.dogName}</span>
                </span>
              ))
            ) : (
              <>
                {entry.armband && (
                  <ArmbandBadge armband={entry.armband} className="h-8 min-w-8 rounded-lg text-xs" />
                )}
                <span>{entry.dogName}</span>
              </>
            )}
          </div>
        </div>
        <div className="myk9-entries-badges">
          {getEntryStatusBadge(summaryStatus, {
            isPastShow,
            isShowCancelled: entry.isShowCancelled,
            statusKind: summaryStatusKind,
            partiallyScored: Boolean(partiallyScored),
          })}
          {/* Cash/check "pay at show" entries carry their own calm status line
              below — the red "Payment Due" debt chip would contradict it (4.C).
              A raw PENDING paymentStatus with no actionable online balance
              (waived, secretary-recorded, zero fee, or a non-payable entry
              status) must not show "Payment Due" either — the chip previously
              fired off the raw status alone, contradicting the dashboard/My
              Payments amount-due figure that already derives from
              getEntryPaymentPrompt (exhibitor-money-clarity). */}
          {!(
            entry.paymentStatus === PaymentStatus.PENDING && onlinePrompt.kind !== 'finish-online'
          ) &&
            getPaymentStatusBadge(entry.balance?.paymentStatus ?? entry.paymentStatus, {
              isPastShow,
            })}
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

      {payAtShowPrompt.kind === 'pay-at-show' && (
        <p className="flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4 flex-shrink-0" />
          {payAtShowPrompt.text}
        </p>
      )}

      {/* INTENT: single next action, precedence finish payment > check-in >
          view show (deriveEntryNextAction). Check-in MUST reuse the same
          onCheckInClick(entry, cls) handler the per-class details control
          calls — never a separate write path. */}
      <div className="myk9-entries-action-buttons">
        {nextAction.kind === 'finish-payment' &&
          (paymentHref ? (
            <Button asChild className="min-h-[44px] transition-all duration-state">
              <Link to={paymentHref}>
                <CreditCard className="h-5 w-5 mr-1.5" />
                Finish Payment
              </Link>
            </Button>
          ) : (
            // INTENT: an exhibitor who owes money must never face a dead end.
            // The order owes an online balance but no cart can be built safely,
            // so say which kind of "not yet" this is rather than rendering
            // nothing — or sending them to a cart for the wrong rows. An empty
            // showId is the replication window and WILL resolve; anything else
            // is a data inconsistency that waiting cannot fix, so that copy
            // points at the secretary instead of promising a spinner.
            <Button disabled className="min-h-[44px]">
              <CreditCard className="h-5 w-5 mr-1.5" />
              {entry.showId ? 'Contact the show secretary to pay' : 'Payment options loading…'}
            </Button>
          ))}

        {nextAction.kind === 'check-in' && nextActionClass && (
          <Button
            type="button"
            onClick={() =>
              onCheckInClick(
                nextActionDog ? toDogEntryView(entry, nextActionDog) : entry,
                nextActionClass
              )
            }
            className="min-h-[44px] transition-all duration-state"
          >
            <ClipboardCheck className="h-5 w-5 mr-1.5" />
            Check In
          </Button>
        )}

        {nextAction.kind === 'view-show' && (
          <Button
            variant="outline"
            asChild
            className="min-h-[44px] text-primary transition-all duration-state"
          >
            <Link to={`/shows/${entry.showId}`}>
              <Eye className="h-5 w-5 mr-1.5" />
              View Show
            </Link>
          </Button>
        )}

        {entry.showId && (
          <Button
            variant="outline"
            onClick={() => setCalendarOpen(true)}
            className="min-h-[44px] transition-all duration-state"
          >
            <CalendarPlus className="h-5 w-5 mr-1.5" />
            Add to Calendar
          </Button>
        )}
      </div>

      {calendarOpen && (
        <AddToCalendarDialog
          open={calendarOpen}
          onOpenChange={setCalendarOpen}
          showId={entry.showId}
          showName={entry.showName}
        />
      )}

      {/* Details toggle — full-width, labeled, collapsed by default on every
          viewport (task 3.1). */}
      <button
        type="button"
        onClick={() => setDetailsOpen(open => !open)}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors duration-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
