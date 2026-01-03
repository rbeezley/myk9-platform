import type { CheckInStatus } from './check-in-types';

// Enhanced Entry Status Enums with Foundation Phase support
export enum EntryStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WAITLIST = 'waitlist',
  CANCELLED = 'cancelled',
  MISSING_INFO = 'missing_info'
}

// Enhanced Payment Status with refund support
export enum PaymentStatus {
  PENDING = 'pending',
  PAID_ONLINE = 'paid_online',
  PAID_BY_CHECK = 'paid_by_check',
  PAID_BY_CASH = 'paid_by_cash',
  REFUNDED = 'refunded',
  PARTIAL_REFUND = 'partial_refund'
}

// Registration context for role-based workflows
export interface RegistrationContext {
  mode: 'exhibitor' | 'secretary_existing' | 'secretary_new';
  permissions: string[];
  scopedClubs?: string[];
  showId: string;
  userId: string;
}

export interface ShowRegistration {
  id: string;
  showId: string;
  userId: string;
  registrationNumber?: string;
  status: 'draft' | 'submitted' | 'confirmed' | 'cancelled';
  entryStatus?: EntryStatus; // New field for entry acceptance status
  totalFees: number;
  paymentStatus: 'pending' | 'paid' | 'refunded' | PaymentStatus; // Backward compatible
  paymentMethod?: 'credit_card' | 'check' | 'cash';
  paymentReference?: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  confirmedAt?: Date;
  notes?: string;
  entries: ShowEntry[];
  // New fields for status tracking
  statusHistory?: StatusChange[];
  createdByUserId?: string; // Track who created the registration (for secretary registrations)
  lastModifiedByUserId?: string;
}

// Handler management types
export interface Handler {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isOwner: boolean; // True if handler is the dog owner
  validatedAt?: Date; // When handler was validated
}

// Simple handler info for assignments
export interface HandlerInfo {
  handlerId: string;
  handlerName: string;
  isOwner: boolean;
}

// Armband assignment types
export interface ArmbandAssignment {
  number: string;
  showDay?: Date; // For multi-day shows
  trialId?: string; // Can be scoped to specific trial/ring
  rangeStart?: number; // For range management
  rangeEnd?: number;
  prefix?: string; // For prefixed numbers (e.g., "A-101")
  isManualOverride?: boolean;
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
  handlerId?: string;
  // Enhanced handler management
  handler?: Handler; // Full handler object
  isHandlerValidated?: boolean;
  handlerOverrideReason?: string; // If handler != owner
  // Enhanced armband management
  armband?: string; // Backward compatible
  armbandAssignment?: ArmbandAssignment; // New detailed assignment
  specialRequests?: string;

  // Sync metadata for Local-First architecture
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

export interface ClassEntry {
  id: string;
  entryId: string;
  classId: string;
  className: string; // Denormalized for display
  classNumber: string;
  fee: number;
  jumpHeight?: string;
  preferredJudge?: string;
  moveUpRequested?: boolean;
  runOrder?: number;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
  // Check-in status for this specific class entry
  checkInStatus?: CheckInStatus;
  checkInTime?: Date;
  checkInNotes?: string;
  checkInByUserId?: string;

  // Sync metadata for Local-First architecture
  _version?: number;
  _lastModified?: Date;
  _lastModifiedBy?: string;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

export interface RegistrationDocument {
  id: string;
  registrationId: string;
  type: 'vaccination' | 'registration' | 'health_certificate' | 'other';
  fileName: string;
  fileUrl: string;
  uploadedAt: Date;
  verified: boolean;
  notes?: string;
}

export interface RegistrationFormData {
  selectedDogs: string[];
  entries: Omit<ShowEntry, 'id' | 'registrationId'>[];
  documents: File[];
  paymentMethod?: 'credit_card' | 'check' | 'cash';
  specialRequests?: string;
  registrationNumber?: string;
  // Optional workflow state for draft persistence
  _workflowState?: {
    currentStep: string;
    stepCompletionState: Record<string, boolean>;
    classSelections: ClassSelectionData[];
    handlerAssignments: Record<string, HandlerInfo>;
    paymentStatus: PaymentStatus;
    entryStatus: EntryStatus;
  };
}

export interface ClassSelectionData {
  dogId: string;
  trialId: string;
  selectedClasses: {
    classId: string;
    jumpHeight?: string;
    moveUpRequested?: boolean;
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
  changedByUserName?: string; // Denormalized for display
  reason?: string;
  notes?: string;
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
    'pending': PaymentStatus.PENDING,
    'paid': PaymentStatus.PAID_ONLINE, // Default paid to online
    'refunded': PaymentStatus.REFUNDED
  };
  return statusMap[oldStatus] || PaymentStatus.PENDING;
};

export const isLegacyPaymentStatus = (status: string): boolean => {
  return ['pending', 'paid', 'refunded'].includes(status);
};