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
import { Calendar, MapPin, DollarSign, Eye, Edit, Download, User } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { ResultBadge } from '@/components/common/ResultBadge';
import { buildVenueMapsUrls, formatVenueAddress } from '@/utils/venueMaps';
import type { MyEntry, EntryClass } from './my-entries-types';
import {
  getEntryStatusBadge,
  getPaymentStatusBadge,
  getStatusIcon,
  getContextualStatusMessage,
} from './myEntriesUtils';

interface MyEntryCardProps {
  entry: MyEntry;
  onCheckInClick: (entry: MyEntry, classEntry: EntryClass) => void;
  onEditClick: (entry: MyEntry) => void;
  onReceiptClick: (entry: MyEntry) => void;
}

/**
 * Card component displaying a single entry's details
 */
export const MyEntryCard: React.FC<MyEntryCardProps> = ({
  entry,
  onCheckInClick,
  onEditClick,
  onReceiptClick,
}) => {
  const statusMessage = getContextualStatusMessage(
    entry,
    formatDistanceToNow,
    format,
    isToday,
    isTomorrow,
    differenceInDays
  );

  const isPaid =
    entry.paymentStatus === PaymentStatus.PAID_ONLINE ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CASH;

  const isFullyComplete = entry.entryStatus === EntryStatus.ACCEPTED && isPaid;

  const canEdit =
    entry.entryStatus === EntryStatus.PENDING || entry.entryStatus === EntryStatus.ACCEPTED;

  const canShowReceipt = entry.confirmationNumber && isPaid;

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
          <div className="myk9-entries-card-subtitle">
            {entry.dogName} • Registration #{entry.registrationNumber || 'Pending'}
          </div>
        </div>
        <div className="myk9-entries-badges">
          {getEntryStatusBadge(entry.entryStatus)}
          {getPaymentStatusBadge(entry.paymentStatus)}
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
          <DollarSign className="h-4 w-4" />
          <span>${entry.totalFee} total</span>
        </div>
      </div>

      {/* Classes */}
      <div className="myk9-entries-classes-section">
        <h5 className="myk9-entries-classes-title">Classes Entered:</h5>
        <div className="myk9-entries-classes-grid">
          {entry.classes.map(cls => (
            <div key={cls.id} className="myk9-entries-class-item">
              <div className="flex items-center gap-2 flex-1">
                <div className="flex flex-col min-w-0">
                  <span className="myk9-entries-class-name">
                    {cls.name}
                    {cls.number ? ` #${cls.number}` : ''}
                    {cls.jumpHeight && ` (${cls.jumpHeight})`}
                  </span>
                  {cls.handler && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <User className="h-3 w-3 flex-shrink-0" />
                      {cls.handler}
                    </span>
                  )}
                </div>

                {/* Result badge for scored entries */}
                {cls.isScored && cls.resultStatus && (
                  <ResultBadge resultStatus={cls.resultStatus} />
                )}

                {/* Check-in Status Controls */}
                {!cls.isScored && (
                  <button
                    onClick={() => onCheckInClick(entry, cls)}
                    className="hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded transition-transform"
                  >
                    <CheckInStatusIndicator
                      status={cls.checkInStatus || 'no-status'}
                      size="sm"
                      showLabel={true}
                      showTooltip={true}
                    />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {cls.isScored && cls.searchTimeSeconds != null && (
                  <span className="text-xs text-muted-foreground">
                    {cls.searchTimeSeconds.toFixed(1)}s
                  </span>
                )}
                {cls.isScored && cls.totalFaults != null && cls.totalFaults > 0 && (
                  <span className="text-xs text-warning-orange">{cls.totalFaults}F</span>
                )}
                <span className="myk9-entries-class-fee">${cls.fee}</span>
              </div>
            </div>
          ))}
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
