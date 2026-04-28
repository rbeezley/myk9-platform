import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { CheckInStatus } from '@/types/check-in-types';

/**
 * Entry management types
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */

export interface EntryClass {
  id: string;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
  checkInStatus?: CheckInStatus;
  checkInTime?: Date;
}

export interface EntryManagementEntry {
  id: string;
  registrationId: string;
  entryNumber: string;
  showId: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  ownerEmail: string;
  handlerName: string;
  classes: EntryClass[];
  totalFee: number;
  paidAmount: number;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  submittedAt: Date;
  lastUpdated: Date;
  notes?: string;
  armbandNumber?: string;
  confirmationNumber?: string;
  comped?: boolean;
  compedReason?: string;
  enrollmentPaymentStatus?: PaymentStatus | null;
  enrollmentPaymentReference?: string | null;
  enrollmentTotalAmount?: number | null;
}

export interface EntryManagementShow {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface BulkAction {
  type: 'status_change' | 'payment_update' | 'send_notification' | 'export';
  data: Record<string, unknown>;
}

export interface EntryStats {
  total: number;
  pending: number;
  accepted: number;
  waitlist: number;
  revenue: number;
}

export interface CheckInDialogState {
  open: boolean;
  entry: EntryManagementEntry | null;
  classEntry: EntryClass | null;
}

export interface ArmbandDialogState {
  open: boolean;
  entry: EntryManagementEntry | null;
  value: string;
  error?: string | null;
}

export interface AutoArmbandDialogState {
  open: boolean;
  startNumber: string;
}

export interface BulkActionDialogState {
  open: boolean;
  action: string | null;
}
