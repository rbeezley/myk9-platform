import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

export function getPaymentMethodDisplay(paymentMethod: string): string {
  switch (paymentMethod) {
    case 'credit_card':
      return 'Credit Card';
    case 'check':
      return 'Check (Pay at Show)';
    case 'cash':
      return 'Cash (Pay at Show)';
    case 'secretary_paid':
      return 'Secretary Payment';
    case 'group_payment':
      return 'Group Payment';
    case 'waived':
      return 'Fees Waived';
    default:
      return 'Unknown';
  }
}

export function getStatusBadgeVariant(
  status: EntryStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return 'default';
    case EntryStatus.PENDING:
      return 'secondary';
    case EntryStatus.REJECTED:
      return 'destructive';
    case EntryStatus.WAITLIST:
      return 'outline';
    case EntryStatus.MISSING_INFO:
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function getEntryStatusBadgeColor(status: EntryStatus): string {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return 'bg-green-100 text-green-800 border-green-200';
    case EntryStatus.REJECTED:
      return 'bg-red-100 text-red-800 border-red-200';
    case EntryStatus.WAITLIST:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case EntryStatus.MISSING_INFO:
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function getPaymentStatusBadgeColor(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return 'bg-green-100 text-green-800 border-green-200';
    case PaymentStatus.REFUNDED:
    case PaymentStatus.PARTIAL_REFUND:
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function isPaidStatus(status: PaymentStatus): boolean {
  return (
    status === PaymentStatus.PAID_ONLINE ||
    status === PaymentStatus.PAID_BY_CHECK ||
    status === PaymentStatus.PAID_BY_CASH
  );
}
