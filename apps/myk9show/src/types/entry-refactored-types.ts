/**
 * Refactored Entry Types
 *
 * New split-table design following e-commerce pattern:
 * - Entry: Order-level data (payment, submission, dog/handler)
 * - ClassEntry: Product-level data (class-specific details)
 */

import { BaseEntity, SyncableEntity } from './core-types';

// ============================================================================
// Core Entry Types (Order-level)
// ============================================================================

export type EntryStatus =
  | 'draft' // Being created/edited
  | 'submitted' // Submitted for review
  | 'accepted' // Entry accepted (all classes processed)
  | 'rejected' // Entry rejected
  | 'withdrawn'; // Withdrawn by handler

export type PaymentStatus =
  | 'pending' // Payment not yet made
  | 'paid' // Payment completed
  | 'partial' // Partial payment made
  | 'refunded' // Payment refunded
  | 'failed'; // Payment failed

export interface Entry extends BaseEntity, SyncableEntity {
  // Core Relationships
  dogId: string;
  handlerId: string;
  showId: string; // Keep for performance queries

  // Entry-level Status
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;

  // Entry-level Data
  totalFees: number; // Calculated from class entries
  specialRequests?: string; // Overall requests for this entry
  moveUpRequested: boolean; // Handler wants to move up if possible
  submittedAt?: Date; // When entry was submitted

  // Computed/Related Data (not in database)
  classEntries?: ClassEntry[]; // Associated class entries
  classCount?: number; // Number of classes entered
  acceptedClasses?: number; // Number of accepted classes
  rejectedClasses?: number; // Number of rejected classes
  waitlistedClasses?: number; // Number of waitlisted classes
}

// ============================================================================
// Class Entry Types (Product-level)
// ============================================================================

export type ClassEntryStatus =
  | 'pending' // Awaiting review
  | 'accepted' // Accepted into class
  | 'rejected' // Rejected from class
  | 'waitlisted' // On waiting list
  | 'withdrawn' // Withdrawn from class
  | 'moved'; // Moved to different class

export interface ClassEntry extends BaseEntity, SyncableEntity {
  // Core Relationships
  entryId: string;
  classId: string;
  trialId: string; // Denormalized for performance

  // Class-specific Competition Data
  armband?: string; // Assigned armband number
  runOrder?: number; // Running order within class
  jumpHeight?: string; // Jump height for this class
  entryFee?: number; // Fee for this specific class
  preferredJudge?: string; // Judge preference for this class

  // Class-specific Status
  status: ClassEntryStatus;

  // Class-specific Metadata
  notes?: string | undefined; // Class-specific notes
  qualifiedForFinals: boolean; // Whether qualified for finals
  movedFromClassId?: string; // If moved from another class
  movedToClassId?: string; // If moved to another class

  // Related Data (not in database, populated by joins)
  entry?: Entry; // Parent entry
  class?: {
    // Class details
    id: string;
    name: string;
    division?: string;
    level?: string;
    maxEntries?: number;
  };
  trial?: {
    // Trial details
    id: string;
    name: string;
    date: string;
  };
  show?: {
    // Show details
    id: string;
    name: string;
  };
}

// ============================================================================
// Input/Output Types
// ============================================================================

// Entry Creation (when creating a new entry)
export interface CreateEntryInput {
  dogId: string;
  handlerId: string;
  showId: string;
  specialRequests?: string;
  moveUpRequested?: boolean;
  classIds: string[]; // Classes to enter initially
}

// Entry Update (updating entry-level data)
export interface UpdateEntryInput {
  specialRequests?: string;
  moveUpRequested?: boolean;
  entryStatus?: EntryStatus;
  paymentStatus?: PaymentStatus;
}

// Class Entry Creation (adding a class to an existing entry)
export interface CreateClassEntryInput {
  entryId: string;
  classId: string;
  jumpHeight?: string;
  preferredJudge?: string;
  notes?: string | undefined;
}

// Class Entry Update (updating class-specific data)
export interface UpdateClassEntryInput {
  jumpHeight?: string;
  preferredJudge?: string;
  notes?: string | undefined;
  status?: ClassEntryStatus;
  armband?: string;
  runOrder?: number;
  entryFee?: number;
  qualifiedForFinals?: boolean;
}

// ============================================================================
// Query/Response Types
// ============================================================================

// Entry with all class entries
export interface EntryWithClasses extends Entry {
  classEntries: ClassEntry[];
}

// Class entry with full context
export interface ClassEntryWithContext extends ClassEntry {
  entry: Entry;
  class: {
    id: string;
    name: string;
    division: string;
    level: string;
    maxEntries?: number;
  };
  trial: {
    id: string;
    name: string;
    date: string;
    trialNumber?: string;
  };
  show: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  };
  dog: {
    id: string;
    name: string;
    callName: string;
    breed: string;
  };
  handler: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

// Entry summary for lists/tables
export interface EntrySummary {
  id: string;
  dogName: string;
  dogCallName: string;
  handlerName: string;
  entryStatus: EntryStatus;
  paymentStatus: PaymentStatus;
  totalFees: number;
  classCount: number;
  acceptedClasses: number;
  rejectedClasses: number;
  waitlistedClasses: number;
  submittedAt?: Date;
  createdAt: Date;
}

// Class entry summary for class management
export interface ClassEntrySummary {
  id: string;
  entryId: string;
  dogName: string;
  dogCallName: string;
  handlerName: string;
  armband?: string;
  runOrder?: number;
  jumpHeight?: string;
  status: ClassEntryStatus;
  entryFee?: number;
  qualifiedForFinals: boolean;
}

// ============================================================================
// Filtering and Sorting Types
// ============================================================================

export interface EntryFilters {
  showId?: string | undefined;
  handlerId?: string;
  dogId?: string;
  entryStatus?: EntryStatus[];
  paymentStatus?: PaymentStatus[];
  submittedAfter?: Date;
  submittedBefore?: Date;
  hasClasses?: boolean;
}

export interface ClassEntryFilters {
  entryId?: string;
  classId?: string;
  trialId?: string;
  status?: ClassEntryStatus[];
  hasArmband?: boolean;
  hasRunOrder?: boolean;
  jumpHeight?: string[];
  qualifiedForFinals?: boolean;
}

export type EntrySortField =
  | 'dogName'
  | 'handlerName'
  | 'entryStatus'
  | 'paymentStatus'
  | 'totalFees'
  | 'classCount'
  | 'submittedAt'
  | 'createdAt';

export type ClassEntrySortField =
  | 'dogName'
  | 'handlerName'
  | 'armband'
  | 'runOrder'
  | 'status'
  | 'jumpHeight'
  | 'entryFee';

// ============================================================================
// Validation Types
// ============================================================================

export interface EntryValidation {
  canSubmit: boolean;
  canEdit: boolean;
  canAddClasses: boolean;
  canRemoveClasses: boolean;
  canChangePaymentStatus: boolean;
  issues: string[];
  warnings: string[];
}

export interface ClassEntryValidation {
  canEdit: boolean;
  canChangeStatus: boolean;
  canAssignArmband: boolean;
  canSetRunOrder: boolean;
  canMove: boolean;
  issues: string[];
  warnings: string[];
}

// ============================================================================
// Statistics and Analytics Types
// ============================================================================

export interface EntryStatistics {
  totalEntries: number;
  entriesByStatus: Record<EntryStatus, number>;
  entriesByPaymentStatus: Record<PaymentStatus, number>;
  totalFees: number;
  averageFeesPerEntry: number;
  averageClassesPerEntry: number;
  topHandlers: Array<{
    handlerId: string;
    handlerName: string;
    entryCount: number;
    totalFees: number;
  }>;
}

export interface ClassEntryStatistics {
  totalClassEntries: number;
  entriesByStatus: Record<ClassEntryStatus, number>;
  entriesByJumpHeight: Record<string, number>;
  averageEntryFee: number;
  totalEntryFees: number;
  classCapacityUtilization: Array<{
    classId: string;
    className: string;
    maxEntries: number;
    currentEntries: number;
    utilizationPercent: number;
  }>;
}

// ============================================================================
// Migration Support Types
// ============================================================================

// For backward compatibility during migration
export interface LegacyEntry {
  id: string;
  dogId: string;
  handlerId: string;
  classId: string; // Old: single class per entry
  showId: string;
  armband?: string;
  runOrder?: number;
  jumpHeight?: string;
  entryFee?: number;
  preferredJudge?: string;
  paymentStatus: PaymentStatus;
  status?: string; // Old status field
  specialRequests?: string;
  moveUpRequested: boolean;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Migration mapping helper
export interface EntryMigrationData {
  entry: Omit<Entry, 'classEntries' | 'classCount'>;
  classEntry: ClassEntry;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isValidEntryStatus(status: string): status is EntryStatus {
  return ['draft', 'submitted', 'accepted', 'rejected', 'withdrawn'].includes(status);
}

export function isValidPaymentStatus(status: string): status is PaymentStatus {
  return ['pending', 'paid', 'partial', 'refunded', 'failed'].includes(status);
}

export function isValidClassEntryStatus(status: string): status is ClassEntryStatus {
  return ['pending', 'accepted', 'rejected', 'waitlisted', 'withdrawn', 'moved'].includes(status);
}

export function isEntryEditable(entry: Entry): boolean {
  return entry.entryStatus === 'draft' || entry.entryStatus === 'submitted';
}

export function isClassEntryEditable(classEntry: ClassEntry): boolean {
  return classEntry.status === 'pending' || classEntry.status === 'waitlisted';
}

// ============================================================================
// Constants
// ============================================================================

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  partial: 'Partial',
  refunded: 'Refunded',
  failed: 'Failed',
};

export const CLASS_ENTRY_STATUS_LABELS: Record<ClassEntryStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  moved: 'Moved',
};

export const ENTRY_STATUS_COLORS: Record<EntryStatus, string> = {
  draft: 'gray',
  submitted: 'blue',
  accepted: 'green',
  rejected: 'red',
  withdrawn: 'orange',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  pending: 'yellow',
  paid: 'green',
  partial: 'orange',
  refunded: 'purple',
  failed: 'red',
};

export const CLASS_ENTRY_STATUS_COLORS: Record<ClassEntryStatus, string> = {
  pending: 'yellow',
  accepted: 'green',
  rejected: 'red',
  waitlisted: 'orange',
  withdrawn: 'gray',
  moved: 'blue',
};
