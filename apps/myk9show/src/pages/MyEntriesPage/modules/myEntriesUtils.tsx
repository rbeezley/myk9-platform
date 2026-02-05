/**
 * Utility functions for MyEntriesPage
 * Badge rendering and status helpers
 * @module MyEntriesPage/utils
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';

/**
 * Returns a styled badge for entry status
 */
export function getEntryStatusBadge(status: EntryStatus): React.ReactNode {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return (
        <Badge className="bg-success-green/10 text-success-green border-success-green/20 border">
          Accepted
        </Badge>
      );
    case EntryStatus.PENDING:
      return (
        <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 border">
          Pending Review
        </Badge>
      );
    case EntryStatus.WAITLIST:
      return (
        <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 border">
          Waitlist
        </Badge>
      );
    case EntryStatus.REJECTED:
      return (
        <Badge className="bg-error-red/10 text-error-red border-error-red/20 border">
          Rejected
        </Badge>
      );
    case EntryStatus.CANCELLED:
      return (
        <Badge className="bg-muted text-muted-foreground border-border border">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge className="bg-muted text-muted-foreground border-border border">
          Unknown
        </Badge>
      );
  }
}

/**
 * Returns a styled badge for payment status
 */
export function getPaymentStatusBadge(status: PaymentStatus): React.ReactNode {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return (
        <Badge className="bg-success-green/10 text-success-green border-success-green/20 border">
          Paid
        </Badge>
      );
    case PaymentStatus.PENDING:
      return (
        <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20 border">
          Payment Due
        </Badge>
      );
    case PaymentStatus.REFUNDED:
    case PaymentStatus.PARTIAL_REFUND:
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20 border">
          Refunded
        </Badge>
      );
    default:
      return (
        <Badge className="bg-muted text-muted-foreground border-border border">
          Unknown
        </Badge>
      );
  }
}

/**
 * Returns an icon representing the combined entry and payment status
 */
export function getStatusIcon(entryStatus: EntryStatus, paymentStatus: PaymentStatus): React.ReactNode {
  if (entryStatus === EntryStatus.ACCEPTED && paymentStatus !== PaymentStatus.PENDING) {
    return <CheckCircle2 className="h-5 w-5 text-[#34C759]" />;
  }
  if (entryStatus === EntryStatus.REJECTED || entryStatus === EntryStatus.CANCELLED) {
    return <XCircle className="h-5 w-5 text-[#FF3B30]" />;
  }
  if (entryStatus === EntryStatus.PENDING || paymentStatus === PaymentStatus.PENDING) {
    return <AlertCircle className="h-5 w-5 text-[#FF9500]" />;
  }
  return <Clock className="h-5 w-5 text-[#007AFF]" />;
}

/**
 * Formats entry status message based on context
 */
export function getContextualStatusMessage(
  entry: {
    showDate: Date;
    entryStatus: EntryStatus;
    paymentStatus: PaymentStatus;
    submittedAt: Date;
    lastUpdated: Date;
  },
  formatDistanceToNow: (date: Date, options?: { addSuffix?: boolean }) => string,
  format: (date: Date, formatStr: string) => string,
  isToday: (date: Date) => boolean,
  isTomorrow: (date: Date) => boolean,
  differenceInDays: (dateLeft: Date, dateRight: Date) => number
): { message: string; className?: string } {
  const showDate = new Date(entry.showDate);
  const daysUntilShow = differenceInDays(showDate, new Date());

  // Show is today or tomorrow - highlight check-in
  if (isToday(showDate)) {
    return { message: 'Show is today!', className: 'text-primary font-medium' };
  }
  if (isTomorrow(showDate)) {
    return { message: 'Show is tomorrow', className: 'text-primary' };
  }

  // Upcoming show within a week
  if (daysUntilShow > 0 && daysUntilShow <= 7) {
    return { message: `Show in ${daysUntilShow} days` };
  }

  // Status-based messaging
  if (entry.entryStatus === EntryStatus.ACCEPTED && entry.paymentStatus === PaymentStatus.PENDING) {
    return {
      message: `Payment pending since ${format(entry.submittedAt, 'MMM d')}`,
      className: 'text-warning-orange',
    };
  }

  if (entry.entryStatus === EntryStatus.ACCEPTED) {
    return {
      message: `Accepted ${formatDistanceToNow(entry.lastUpdated, { addSuffix: true })}`,
      className: 'text-success-green',
    };
  }

  if (entry.entryStatus === EntryStatus.PENDING) {
    return { message: `Submitted ${formatDistanceToNow(entry.submittedAt, { addSuffix: true })}` };
  }

  // Default fallback
  return { message: `Updated ${formatDistanceToNow(entry.lastUpdated, { addSuffix: true })}` };
}
