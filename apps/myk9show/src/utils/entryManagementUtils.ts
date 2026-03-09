import React from 'react';
import { Badge } from '@/components/ui/badge';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

/**
 * Entry management utility functions
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */

/**
 * Map database entry status to UI enum
 */
export const mapEntryStatus = (status?: string | null): EntryStatus => {
  switch (status) {
    case 'accepted':
      return EntryStatus.ACCEPTED;
    case 'pending':
    case 'submitted':
      return EntryStatus.PENDING;
    case 'waitlisted':
      return EntryStatus.WAITLIST;
    case 'rejected':
      return EntryStatus.REJECTED;
    case 'cancelled':
    case 'withdrawn':
      return EntryStatus.CANCELLED;
    default:
      return EntryStatus.PENDING;
  }
};

/**
 * Map database payment status to UI enum
 */
export const mapPaymentStatus = (status?: string | null): PaymentStatus => {
  switch (status) {
    case 'paid':
      return PaymentStatus.PAID_ONLINE;
    case 'pending':
      return PaymentStatus.PENDING;
    case 'refunded':
      return PaymentStatus.REFUNDED;
    default:
      return PaymentStatus.PENDING;
  }
};

/**
 * Map database class entry status to UI string
 */
export const mapClassEntryStatus = (
  status?: string | null
): 'entered' | 'scratched' | 'moved' | 'absent' => {
  switch (status) {
    case 'accepted':
    case 'pending':
      return 'entered';
    case 'withdrawn':
    case 'scratched':
      return 'scratched';
    case 'moved':
      return 'moved';
    case 'rejected':
    case 'absent':
      return 'absent';
    default:
      return 'entered';
  }
};

/**
 * Map UI entry status to database string
 */
export const mapStatusToDb = (status: EntryStatus): string => {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return 'accepted';
    case EntryStatus.PENDING:
      return 'pending';
    case EntryStatus.WAITLIST:
      return 'waitlisted';
    case EntryStatus.REJECTED:
      return 'rejected';
    case EntryStatus.CANCELLED:
      return 'cancelled';
    default:
      return 'pending';
  }
};

/**
 * Get badge component for entry status
 */
export function getEntryStatusBadge(status: EntryStatus): React.ReactNode {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return React.createElement(Badge, { className: 'bg-green-100 text-green-800' }, 'Accepted');
    case EntryStatus.PENDING:
      return React.createElement(Badge, { variant: 'secondary' }, 'Pending');
    case EntryStatus.WAITLIST:
      return React.createElement(Badge, { className: 'bg-yellow-100 text-yellow-800' }, 'Waitlist');
    case EntryStatus.REJECTED:
      return React.createElement(Badge, { variant: 'destructive' }, 'Rejected');
    case EntryStatus.CANCELLED:
      return React.createElement(Badge, { variant: 'outline' }, 'Cancelled');
    case EntryStatus.MISSING_INFO:
      return React.createElement(
        Badge,
        { className: 'bg-orange-100 text-orange-800' },
        'Missing Info'
      );
    default:
      return React.createElement(Badge, { variant: 'outline' }, 'Unknown');
  }
}

/**
 * Get badge component for payment status
 */
export function getPaymentStatusBadge(status: PaymentStatus): React.ReactNode {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return React.createElement(Badge, { className: 'bg-green-100 text-green-800' }, 'Paid');
    case PaymentStatus.PENDING:
      return React.createElement(Badge, { className: 'bg-red-100 text-red-800' }, 'Payment Due');
    case PaymentStatus.REFUNDED:
      return React.createElement(
        Badge,
        { variant: 'outline', className: 'text-blue-600' },
        'Refunded'
      );
    default:
      return React.createElement(Badge, { variant: 'outline' }, 'Unknown');
  }
}

/**
 * Get Tailwind CSS classes for an entry status badge (string-based, for tables).
 * Accepts raw status strings from DB queries (e.g., 'confirmed', 'pending').
 */
export function getEntryStatusClasses(status: string | null): string {
  switch (status?.toLowerCase()) {
    case 'confirmed':
    case 'accepted':
      return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-200';
    case 'pending':
    case 'submitted':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-yellow-900 dark:text-yellow-200';
    case 'cancelled':
    case 'withdrawn':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-200';
    case 'waitlisted':
      return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-200';
  }
}

/**
 * Format date string for display
 */
export const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
