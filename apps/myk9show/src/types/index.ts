// Unified type definitions for myK9Show
// This file serves as the main entry point for all application types

// Supabase Database Types (generated from schema)
export type { Database } from './supabase';
export type * from './database-mappings';

// Core Entity Types (legacy - to be migrated to database types)
export type { Dog, Owner, Registration } from './dog-types';
export type { User } from './user-types';
export type { Show, ShowStat, ShowTrial } from './show-types';
export type { 
  VaccinationRecord, 
  VetVisitRecord, 
  MedicationRecord, 
  AllergyRecord 
} from './health';
export type { Achievement } from './achievement-types';

// New Achievement System Types
export type * from './achievement';
export type * from './judge-management';

// Trial and Class Types  
export type { Trial, TrialClass, TrialFormData } from '../components/trials/types/trial.types';

// Class Management Types
export type { ClassData, EntryData } from '../components/classes/types/classTypes';

// Show Registration Types (Legacy - to be deprecated)
export type { 
  ShowRegistration, 
  ShowEntry, 
  ClassEntry as LegacyClassEntry, 
  RegistrationDocument,
  RegistrationFormData,
  ClassSelectionData,
  FeeCalculation
} from './show-registration-types';

// New Refactored Entry Types
export type * from './entry-refactored-types';

// Enhanced Foundation Types
export type { EntryStatus, PaymentStatus } from './entry-refactored-types';
export type {
  AuditEntry,
  AuditEntryInput,
  AuditSearchFilters,
  AuditSearchResult,
  ImpersonationContext,
  ImpersonationSession,
  SystemMetrics,
  ErrorMetric,
  NotificationMessage,
  NotificationSubscription
} from './audit-types';
export { AuditAction, NotificationType } from './audit-types';

// UI and Component Types
export interface LandingShow {
  id: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
}

export interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

// Common utility types for the application
export type EntityId = string;
export type DateString = string;
export type Status = 'Active' | 'Inactive' | 'Pending' | 'Completed' | 'Cancelled';

// Form state types
export type FormMode = 'create' | 'edit' | 'view';

// API and store types
export interface ApiResponse<T> {
  data: T;
  error?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// User Preferences Types (Phase 6.4)
export type * from './user-preferences';

// Export commonly used type combinations
