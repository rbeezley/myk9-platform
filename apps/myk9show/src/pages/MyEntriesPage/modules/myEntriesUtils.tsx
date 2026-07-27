/**
 * Utility functions for MyEntriesPage
 * Badge rendering and status helpers
 * @module MyEntriesPage/utils
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';
import { StatusBadge, StatusIcon } from '@/components/status';
import type { EntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';

/**
 * Normalize a raw DB check-in status into the dialog's model. Both `null` and
 * the replication default `'no-status'` mean "not checked in" (→ undefined).
 * Without this, MyEntriesPage hardcoded `undefined` and the card always read
 * "Not Checked In" even after a check-in persisted.
 */
export function normalizeCheckInStatus(raw: unknown): CheckInStatus | undefined {
  if (!raw || raw === 'no-status') return undefined;
  return raw as CheckInStatus;
}

/**
 * Label a class row's trial chip. `trial_number` is sometimes a bare index
 * ("1") and sometimes already a full label ("Saturday Trial") depending on how
 * the trial was named — always prefixing "Trial " produced a stuttering
 * "Trial Saturday Trial" for the latter case. Only prefix when the value
 * doesn't already read as a trial label.
 */
export function formatTrialLabel(trialNumber: string): string {
  return /trial/i.test(trialNumber) ? trialNumber : `Trial ${trialNumber}`;
}

interface StatusBadgeOptions {
  isPastShow?: boolean;
  statusKind?: EntryStatusKind | undefined;
}

function getStatusBadgeValue(status: EntryStatus, statusKind?: EntryStatusKind): string {
  switch (statusKind) {
    case 'in_ring':
      return 'in_ring';
    case 'absent':
      return 'absent';
    case 'unknown':
      return 'no-status';
    case 'completed':
      return 'completed';
    default:
      return status;
  }
}

function isSecretaryReviewKind(statusKind: EntryStatusKind): boolean {
  return statusKind === 'pending' || statusKind === 'accepted' || statusKind === 'not_accepted';
}

/**
 * Returns a styled badge for entry status
 */
export function getEntryStatusBadge(
  status: EntryStatus,
  options: StatusBadgeOptions = {}
): React.ReactNode {
  const statusKind = options.statusKind ?? (status === EntryStatus.PENDING ? 'pending' : undefined);
  let contextualLabel: string | undefined;
  switch (statusKind === 'completed' ? EntryStatus.COMPLETED : status) {
    case EntryStatus.PENDING:
      if (statusKind === 'in_ring') contextualLabel = 'In Ring';
      else if (statusKind === 'absent') contextualLabel = 'Absent';
      else if (statusKind === 'unknown') contextualLabel = 'Status unavailable';
      else if (options.isPastShow) contextualLabel = 'Review incomplete';
      else if (statusKind && isSecretaryReviewKind(statusKind)) {
        contextualLabel = 'Pending Secretary Approval';
      } else contextualLabel = 'Pending Review';
      break;
    case EntryStatus.WAITLIST:
      contextualLabel = 'Waitlist';
      break;
    case EntryStatus.REJECTED:
      contextualLabel = 'Rejected';
      break;
    case EntryStatus.COMPLETED:
      contextualLabel = 'Scored';
      break;
    case EntryStatus.MOVE_UP_REQUESTED:
      contextualLabel = 'Move-Up Requested';
      break;
  }
  return (
    <StatusBadge
      family="entry"
      status={getStatusBadgeValue(status, statusKind)}
      variant="outline"
      label={contextualLabel}
    />
  );
}

/**
 * Returns a styled badge for payment status
 */
export function getPaymentStatusBadge(
  status: PaymentStatus,
  options: StatusBadgeOptions = {}
): React.ReactNode {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return <Badge className="bg-success/10 text-success border-success/20 border">Paid</Badge>;
    case PaymentStatus.PENDING:
      return (
        <Badge className="bg-warning/10 text-warning border-warning/20 border">
          {options.isPastShow ? 'Payment unresolved' : 'Payment Due'}
        </Badge>
      );
    case PaymentStatus.REFUNDED:
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20 border">Refunded</Badge>
      );
    case PaymentStatus.PARTIAL_REFUND:
      return (
        <Badge className="bg-primary/10 text-primary border-primary/20 border">
          Partial Refund
        </Badge>
      );
    default:
      return <Badge className="bg-muted text-muted-foreground border-border border">Unknown</Badge>;
  }
}

/**
 * Returns an icon representing the combined entry and payment status
 */
export function getStatusIcon(
  entryStatus: EntryStatus,
  paymentStatus: PaymentStatus,
  statusKind?: EntryStatusKind
): React.ReactNode {
  const status =
    statusKind === 'in_ring'
      ? 'in_ring'
      : statusKind === 'absent'
        ? 'absent'
        : statusKind === 'unknown'
          ? 'no-status'
          : statusKind === 'completed'
            ? 'completed'
            : entryStatus === EntryStatus.ACCEPTED && paymentStatus === PaymentStatus.PENDING
              ? 'pending-payment'
              : entryStatus;
  return <StatusIcon family="entry" status={status} size="lg" />;
}

/**
 * Formats entry status message based on context
 */
export function getContextualStatusMessage(
  entry: {
    showDate: Date;
    entryStatus: EntryStatus;
    entryStatusKind?: EntryStatusKind | undefined;
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

  if (entry.entryStatusKind === 'in_ring') {
    return { message: 'In ring', className: 'text-info' };
  }
  if (entry.entryStatusKind === 'absent') {
    return { message: 'Absent', className: 'text-muted-foreground' };
  }
  if (entry.entryStatusKind === 'unknown') {
    return { message: 'Status unavailable', className: 'text-muted-foreground' };
  }
  if (entry.entryStatusKind === 'completed' || entry.entryStatus === EntryStatus.COMPLETED) {
    return { message: 'Scored', className: 'text-success' };
  }

  if (entry.entryStatus === EntryStatus.CANCELLED || entry.entryStatus === EntryStatus.SCRATCHED) {
    if (entry.paymentStatus === PaymentStatus.REFUNDED) {
      return {
        message: 'Withdrawn - refunded',
        className: 'text-muted-foreground',
      };
    }

    if (entry.paymentStatus === PaymentStatus.PARTIAL_REFUND) {
      return {
        message: 'Withdrawn - partial refund issued',
        className: 'text-muted-foreground',
      };
    }

    return {
      message: entry.entryStatus === EntryStatus.SCRATCHED ? 'Scratched' : 'Withdrawn',
      className: 'text-muted-foreground',
    };
  }

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
      className: 'text-warning',
    };
  }

  if (entry.entryStatus === EntryStatus.ACCEPTED) {
    return {
      message: `Accepted ${formatDistanceToNow(entry.lastUpdated, { addSuffix: true })}`,
      className: 'text-success',
    };
  }

  if (entry.entryStatus === EntryStatus.PENDING) {
    return { message: `Submitted ${formatDistanceToNow(entry.submittedAt, { addSuffix: true })}` };
  }

  // Default fallback
  return { message: `Updated ${formatDistanceToNow(entry.lastUpdated, { addSuffix: true })}` };
}
