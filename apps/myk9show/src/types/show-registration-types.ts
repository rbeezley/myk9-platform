import type { CheckInStatus } from './check-in-types';

// Enhanced Entry Status Enums with Foundation Phase support
export enum EntryStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WAITLIST = 'waitlist',
  CANCELLED = 'cancelled',
  MISSING_INFO = 'missing_info',
}

// Enhanced Payment Status with refund support
export enum PaymentStatus {
  PENDING = 'pending',
  PAID_ONLINE = 'paid_online',
  PAID_BY_CHECK = 'paid_by_check',
  PAID_BY_CASH = 'paid_by_cash',
  REFUNDED = 'refunded',
  PARTIAL_REFUND = 'partial_refund',
}

// Payment method options (exhibitor + secretary/admin options)
export type PaymentMethod =
  | 'credit_card'
  | 'check'
  | 'cash'
  | 'secretary_paid'
  | 'group_payment'
  | 'waived';

// Registration context for role-based workflows
export interface RegistrationContext {
  mode: 'exhibitor' | 'secretary_existing' | 'secretary_new';
  permissions: string[];
  scopedClubs?: string[] | undefined;
  showId: string;
  userId: string;
}

export interface ShowRegistration {
  id: string;
  showId: string;
  userId: string;
  registrationNumber?: string | undefined;
  status: 'draft' | 'submitted' | 'confirmed' | 'cancelled';
  entryStatus?: EntryStatus | undefined; // New field for entry acceptance status
  totalFees: number;
  paymentStatus: 'pending' | 'paid' | 'refunded' | PaymentStatus; // Backward compatible
  paymentMethod?: PaymentMethod | undefined;
  paymentReference?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date | undefined;
  confirmedAt?: Date | undefined;
  notes?: string | undefined;
  entries: ShowEntry[];
  // New fields for status tracking
  statusHistory?: StatusChange[] | undefined;
  createdByUserId?: string | undefined; // Track who created the registration (for secretary registrations)
  lastModifiedByUserId?: string | undefined;
}

// Handler management types
export interface Handler {
  id: string;
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  isOwner: boolean; // True if handler is the dog owner
  validatedAt?: Date | undefined; // When handler was validated
}

// Simple handler info for assignments.
// Keyed by handler key (dogId|classId) for per-entry granularity.
export interface HandlerInfo {
  handlerId: string;
  handlerName: string;
  isOwner: boolean;
}

// Handler key helpers for per-entry (dog+class) handler assignments
export const makeHandlerKey = (dogId: string, classId: string): string => `${dogId}|${classId}`;
export const parseHandlerKey = (key: string): { dogId: string; classId: string } => {
  const [dogId, classId] = key.split('|');
  return { dogId, classId };
};

// Armband assignment types
export interface ArmbandAssignment {
  number: string;
  showDay?: Date | undefined; // For multi-day shows
  trialId?: string | undefined; // Can be scoped to specific trial/ring
  rangeStart?: number | undefined; // For range management
  rangeEnd?: number | undefined;
  prefix?: string | undefined; // For prefixed numbers (e.g., "A-101")
  isManualOverride?: boolean | undefined;
}

export interface ShowEntry {
  id: string;
  registrationId: string;
  dogId: string;
  dogName: string; // Denormalized for display
  trialId: string;
  trialName: string; // Denormalized for display
  classes: ClassEntry[];
  handlerName: string;
  handlerId?: string | undefined;
  // Enhanced handler management
  handler?: Handler | undefined; // Full handler object
  isHandlerValidated?: boolean | undefined;
  handlerOverrideReason?: string | undefined; // If handler != owner
  // Enhanced armband management
  armband?: string | undefined; // Backward compatible
  armbandAssignment?: ArmbandAssignment | undefined; // New detailed assignment
  specialRequests?: string | undefined;

  // Sync metadata for Local-First architecture
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

export interface ClassEntry {
  id: string;
  entryId: string;
  classId: string;
  className: string; // Denormalized for display
  classNumber: string;
  fee: number;
  jumpHeight?: string | undefined;
  preferredJudge?: string | undefined;
  moveUpRequested?: boolean | undefined;
  runOrder?: number | undefined;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
  // Check-in status for this specific class entry
  checkInStatus?: CheckInStatus | undefined;
  checkInTime?: Date | undefined;
  checkInNotes?: string | undefined;
  checkInByUserId?: string | undefined;

  // Sync metadata for Local-First architecture
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

export interface RegistrationDocument {
  id: string;
  registrationId: string;
  type: 'vaccination' | 'registration' | 'health_certificate' | 'other';
  fileName: string;
  fileUrl: string;
  uploadedAt: Date;
  verified: boolean;
  notes?: string | undefined;
}

export interface RegistrationFormData {
  selectedDogs: string[];
  entries: Omit<ShowEntry, 'id' | 'registrationId'>[];
  documents: File[];
  paymentMethod?: PaymentMethod | undefined;
  specialRequests?: string | undefined;
  registrationNumber?: string | undefined;
  // Optional workflow state for draft persistence
  _workflowState?:
    | {
        currentStep: string;
        stepCompletionState: Record<string, boolean>;
        classSelections: ClassSelectionData[];
        handlerAssignments: Record<string, HandlerInfo>;
        paymentStatus: PaymentStatus;
        entryStatus: EntryStatus;
      }
    | undefined;
}

export interface ClassSelectionData {
  dogId: string;
  trialId: string;
  selectedClasses: {
    classId: string;
    jumpHeight?: string | undefined;
    moveUpRequested?: boolean | undefined;
  }[];
}

export interface FeeCalculation {
  subtotal: number;
  discounts: {
    type: string;
    amount: number;
    description: string;
  }[];
  taxes: number;
  total: number;
  breakdown: {
    dogId: string;
    dogName: string;
    classes: {
      className: string;
      fee: number;
    }[];
    subtotal: number;
  }[];
}

// Status change tracking
export interface StatusChange {
  id: string;
  registrationId: string;
  changeType: 'entry_status' | 'payment_status' | 'registration_status';
  fromStatus: string;
  toStatus: string;
  changedAt: Date;
  changedByUserId: string;
  changedByUserName?: string | undefined; // Denormalized for display
  reason?: string | undefined;
  notes?: string | undefined;
}

// Notification preferences
export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  statusChanges: boolean;
  paymentReceipts: boolean;
  remindersBefore: number; // Days before show
}

// Migration helpers for backward compatibility
export const migratePaymentStatus = (oldStatus: string): PaymentStatus => {
  const statusMap: Record<string, PaymentStatus> = {
    pending: PaymentStatus.PENDING,
    paid: PaymentStatus.PAID_ONLINE, // Default paid to online
    refunded: PaymentStatus.REFUNDED,
  };
  return statusMap[oldStatus] || PaymentStatus.PENDING;
};

export const isLegacyPaymentStatus = (status: string): boolean => {
  return ['pending', 'paid', 'refunded'].includes(status);
};
