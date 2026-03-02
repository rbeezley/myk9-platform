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
import { Calendar, MapPin, DollarSign, Eye, Edit, Download } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { ResultBadge } from '@/components/common/ResultBadge';
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

  const canEdit =
    entry.entryStatus === EntryStatus.PENDING || entry.entryStatus === EntryStatus.ACCEPTED;

  const canShowReceipt = entry.confirmationNumber && isPaid;

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

      {/* Status Stepper */}
      <div className="py-4 px-1">
        <EntryStatusStepper entryStatus={entry.entryStatus} paymentStatus={entry.paymentStatus} />
      </div>

      {/* Show Details */}
      <div className="myk9-entries-details-grid">
        <div className="myk9-entries-detail-item">
          <Calendar className="h-4 w-4" />
          <span>{entry.showDate.toLocaleDateString()}</span>
        </div>

        <div className="myk9-entries-detail-item">
          <MapPin className="h-4 w-4" />
          <span>
            {entry.location.city}, {entry.location.state}
          </span>
        </div>

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
                <span className="myk9-entries-class-name">
                  {cls.name} #{cls.number}
                  {cls.jumpHeight && ` (${cls.jumpHeight})`}
                </span>

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
                      status={cls.checkInStatus || 'none'}
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
