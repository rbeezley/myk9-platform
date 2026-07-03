/**
 * Entry card component for MyEntriesPage
 * Displays a single entry with all its details
 * @module MyEntriesPage/components
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatusIndicator } from '@/components/common/CheckInStatusIndicator';
import { EntryStatusStepper } from '@/components/entries/EntryStatusStepper';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import {
  Calendar,
  CalendarDays,
  ListOrdered,
  MapPin,
  Eye,
  Edit,
  Download,
  User,
  CreditCard,
  MessageSquare,
} from 'lucide-react';
import { formatDistanceToNow, format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { ResultBadge } from '@/components/common/ResultBadge';
import { PlacementPill } from '@/components/base/PlacementPill';
import {
  buildResultCardModel,
  buildResultCardVisibility,
  type ResultCardModel,
} from '@/features/result-card';
import { buildVenueMapsUrls, formatVenueAddress } from '@/utils/venueMaps';
import { buildFinishPaymentHref } from '@/features/payments/finishPaymentHref';
import { formatConfirmationNumberLabel } from '@/features/registration/confirmationNumberDisplay';
import type { MyEntry, EntryClass } from './my-entries-types';
import {
  getEntryStatusBadge,
  getPaymentStatusBadge,
  getStatusIcon,
  getContextualStatusMessage,
} from './myEntriesUtils';
import { isPastShowEntry } from './myEntriesStats.helpers';

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

function buildEntryPaymentHref(entry: MyEntry): string {
  // EntryClass.id is the underlying entries-row id in useMyEntriesData.
  const entryIds = entry.classes.map(cls => cls.id).filter(Boolean);
  return buildFinishPaymentHref(entry.showId, entryIds.length > 0 ? entryIds : [entry.id]);
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

  // The registration stepper has nothing left to show once an entry is scored,
  // or accepted/move-up-requested and paid — the header badges carry that state.
  const isFullyComplete =
    entry.entryStatus === EntryStatus.COMPLETED ||
    (isPaid &&
      (entry.entryStatus === EntryStatus.ACCEPTED ||
        entry.entryStatus === EntryStatus.MOVE_UP_REQUESTED));

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
  // Payment eligibility is intentionally split from edit eligibility: a
  // move-up request is a confirmed entry that can still owe its fee even though
  // it isn't editable while awaiting secretary approval. Waitlisted entries stay
  // out — they pay on promotion, not before.
  const canPayStatus = hasEditableStatus || entry.entryStatus === EntryStatus.MOVE_UP_REQUESTED;
  const canFinishPayment =
    canPayStatus && entry.paymentStatus === PaymentStatus.PENDING && entry.totalFee > 0;

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
      {/* Header */}
      <div className="myk9-entries-card-header">
        <div>
          <div className="myk9-entries-card-title">
            {getStatusIcon(entry.entryStatus, entry.paymentStatus)}
            {entry.showName}
          </div>
          <div className="myk9-entries-card-subtitle flex flex-wrap items-center gap-2">
            {entry.armband && (
              <ArmbandBadge armband={entry.armband} className="size-8 rounded-lg text-xs" />
            )}
            <span>{entry.dogName}</span>
            <span aria-hidden="true">•</span>
            <span>
              {formatConfirmationNumberLabel(
                entry.confirmationNumber || (isTerminalStatus ? '—' : 'Pending')
              )}
            </span>
          </div>
        </div>
        <div className="myk9-entries-badges">
          {getEntryStatusBadge(entry.entryStatus, { isPastShow })}
          {getPaymentStatusBadge(entry.paymentStatus, { isPastShow })}
        </div>
      </div>

      {/* Status Stepper — hidden once accepted + paid; header badges carry that state */}
      {!isFullyComplete && (
        <div className="py-4 px-1">
          <EntryStatusStepper entryStatus={entry.entryStatus} paymentStatus={entry.paymentStatus} />
        </div>
      )}

      {/* Show Details */}
      <div className="myk9-entries-details-grid">
        <div className="myk9-entries-detail-item">
          <Calendar className="h-4 w-4" />
          <span>{entry.showDate.toLocaleDateString()}</span>
        </div>

        {entry.entryCloseDate && (
          <div className="myk9-entries-detail-item">
            <Calendar className="h-4 w-4" />
            <span>
              <span className="text-sm text-muted-foreground">Entries close </span>
              {entry.entryCloseDate.toLocaleDateString()}
            </span>
          </div>
        )}

        {directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Get directions to ${mapAddress}`}
            className="myk9-entries-detail-item rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {locationContent}
          </a>
        ) : (
          <div className="myk9-entries-detail-item">{locationContent}</div>
        )}

        <div className="myk9-entries-detail-item">
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary/10 px-1 text-sm font-bold text-primary">
            {entry.classes.length}
          </span>
          <span>
            {entry.classes.length === 1
              ? '1 class entered'
              : `${entry.classes.length} classes entered`}
          </span>
        </div>
      </div>

      {/* Classes */}
      <div className="myk9-entries-classes-section">
        <h5 className="myk9-entries-classes-title">Classes Entered:</h5>
        <div className="myk9-entries-classes-grid">
          {entry.classes.map(cls => {
            const resultModel = buildResultCardModel({
              entry,
              classEntry: cls,
              visibility: buildResultCardVisibility(cls),
            });
            const showNewResult =
              resultModel != null && !seenResultReleaseKeys.has(resultModel.releaseKey);
            const showResultCardAction = resultModel != null && onResultRevealClick != null;

            return (
              <div key={cls.id} className="myk9-entries-class-item">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <span className="myk9-entries-class-name">
                      {cls.name}
                      {cls.number ? ` #${cls.number}` : ''}
                      {cls.jumpHeight && ` (${cls.jumpHeight})`}
                    </span>
                    {(cls.trialDate || cls.trialNumber) && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {cls.trialDate && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-2 py-1 font-medium">
                            <CalendarDays className="h-3 w-3" />
                            {format(cls.trialDate, 'MMM d')}
                          </span>
                        )}
                        {cls.trialNumber && (
                          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">
                            Trial {cls.trialNumber}
                          </span>
                        )}
                      </span>
                    )}
                    {cls.handler && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <User className="h-3 w-3 flex-shrink-0" />
                        {cls.handler}
                      </span>
                    )}
                  </div>

                  {/* Result badge for scored entries */}
                  {cls.isScored && cls.resultStatus && (
                    <div className="flex items-center gap-1.5">
                      <ResultBadge resultStatus={cls.resultStatus} />
                      {/* Show the finishing rank for every qualifying run. 1st–4th are the official
                        AKC ribbon placements (PlacementPill gives them medal colors); 5th+ render
                        as a muted participation rank — nice to know where you came in (not capped
                        at 4th). final_placement is only set once the whole class is scored and
                        ranked by the trigger; exclude null and the 0 default so an un-ranked row
                        never renders "0th". */}
                      {cls.resultStatus === 'qualified' &&
                        cls.finalPlacement != null &&
                        cls.finalPlacement >= 1 && (
                          <PlacementPill placement={cls.finalPlacement} size="sm" />
                        )}
                    </div>
                  )}

                  {showResultCardAction && resultModel && onResultRevealClick && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onResultRevealClick(resultModel)}
                      className={
                        showNewResult
                          ? 'min-h-[36px] border-primary/30 text-primary'
                          : 'min-h-[36px] border-muted-foreground/25 text-muted-foreground'
                      }
                    >
                      {showNewResult ? 'New result' : 'Result card'}
                    </Button>
                  )}

                  {/* Check-in Status Controls — gated by the secretary's
                      self-check-in toggle (cascade resolved per class; defaults
                      open). When off, show a non-interactive indicator with a
                      reason instead of a tappable button the RPC would reject. */}
                  {!cls.isScored &&
                    ((cls.classId ? (selfCheckinByClassId[cls.classId] ?? true) : true) ? (
                      <button
                        onClick={() => onCheckInClick(entry, cls)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-1 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-transform"
                      >
                        <CheckInStatusIndicator
                          status={cls.checkInStatus || 'no-status'}
                          size="sm"
                          showLabel={true}
                          showTooltip={true}
                        />
                      </button>
                    ) : (
                      <span
                        className="cursor-not-allowed opacity-60"
                        title="Self check-in isn't available for this class right now."
                        aria-label="Self check-in not available"
                      >
                        <CheckInStatusIndicator
                          status={cls.checkInStatus || 'no-status'}
                          size="sm"
                          showLabel={true}
                          showTooltip={false}
                        />
                      </span>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  {cls.isScored && cls.searchTimeSeconds != null && (
                    <span className="text-xs text-muted-foreground">
                      {cls.searchTimeSeconds.toFixed(1)}s
                    </span>
                  )}
                  {cls.isScored && cls.totalFaults != null && cls.totalFaults > 0 && (
                    <span className="text-xs text-warning">{cls.totalFaults}F</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="myk9-entries-actions">
        <div className="myk9-entries-last-updated">
          <span className={statusMessage.className}>{statusMessage.message}</span>
        </div>
        <div className="myk9-entries-action-buttons">
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

          {canFinishPayment && (
            <Button asChild className="min-h-[44px] transition-all duration-200">
              <Link to={buildEntryPaymentHref(entry)}>
                <CreditCard className="h-5 w-5 mr-1.5" />
                Finish Payment
              </Link>
            </Button>
          )}

          {canEdit && (
            <Button
              variant="outline"
              onClick={() => onEditClick(entry)}
              className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
            >
              <Edit className="h-5 w-5 mr-1.5" />
              Edit Entry
            </Button>
          )}

          {canViewRunOrder && (
            <Button
              variant="outline"
              asChild
              className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
            >
              <Link to={`/shows/${entry.showId}?tab=classes`}>
                <ListOrdered className="h-5 w-5 mr-1.5" />
                View run order
              </Link>
            </Button>
          )}

          {canRequestPostDeadlineHelp && (
            <Button
              variant="outline"
              asChild
              className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
            >
              <Link to={`/messages/${entry.showId}`}>
                <MessageSquare className="h-5 w-5 mr-1.5" />
                Message the show team
              </Link>
            </Button>
          )}

          {canShowReceipt && (
            <Button
              variant="outline"
              onClick={() => onReceiptClick(entry)}
              className="min-h-[44px] hover:bg-muted/50 transition-all duration-200"
            >
              <Download className="h-5 w-5 mr-1.5" />
              Receipt
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export const MyEntryCard = React.memo(MyEntryCardComponent);
MyEntryCard.displayName = 'MyEntryCard';
