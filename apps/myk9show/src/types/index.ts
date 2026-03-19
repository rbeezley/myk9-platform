// Unified type definitions for myK9Show
// This file serves as the main entry point for all application types
// Note: Using explicit named exports for better tree-shaking and clarity

// Supabase Database Types (generated from schema)
export type { Database } from './supabase';

// Database Mappings - explicit exports for tree-shaking
export type {
  Tables,
  Enums,
  DbDog,
  DbDogInsert,
  DbDogUpdate,
  DbPerson,
  DbPersonInsert,
  DbPersonUpdate,
  DbUser,
  DbUserInsert,
  DbUserUpdate,
  DbShow,
  DbShowInsert,
  DbShowUpdate,
  DbClub,
  DbClubInsert,
  DbClubUpdate,
  DbClass,
  DbClassInsert,
  DbClassUpdate,
  DbEntry,
  DbEntryInsert,
  DbEntryUpdate,
  DbTrial,
  DbTrialInsert,
  DbTrialUpdate,
  DbShowTemplate,
  DbHealthRecord,
  DbVaccination,
  DbMedication,
  DbAllergy,
  DbVetVisit,
  DbDogRegistration,
  DbAchievement,
  DbJudgeAssignment,
  DbJudgeCertification,
  DbSyncConflict,
  DbArmband,
  DbOfflineScoring,
  DbUserPreference,
  DbEntryCart,
  DbEntryCartItem,
  DbWaitlistEntry,
  DbExhibitorProfile,
  TableName,
} from './database-mappings';
export {
  isDogRecord,
  isPersonRecord,
  isUserRecord,
  isShowRecord,
  isClubRecord,
  createTimestamps,
  updateTimestamp,
  TABLE_NAMES,
} from './database-mappings';

// Core Entity Types (legacy - to be migrated to database types)
export type { Dog, Owner, Registration } from './dog-types';
export type { User } from './user-types';
export type { Show, ShowStat, ShowTrial } from './show-types';
export type { VaccinationRecord, VetVisitRecord, MedicationRecord, AllergyRecord } from './health';
export type { Achievement } from './achievement-types';

// Achievement System Types - explicit exports
export type {
  CreateAchievementData,
  UpdateAchievementData,
  Competition,
  CreateCompetitionData,
  UpdateCompetitionData,
  PastResult,
  CreatePastResultData,
  UpdatePastResultData,
  AchievementSummary,
  CompetitionSummary,
  PerformanceStats,
  AchievementFilters,
  CompetitionFilters,
  PastResultFilters,
  OrganizationConfig,
  DisciplineConfig,
  ImportAchievementData,
  ImportCompetitionData,
  ImportSummary,
  AchievementType,
  CompetitionPlacement,
  Organization,
  Discipline,
} from './achievement';
export {
  ACHIEVEMENT_TYPES,
  COMPETITION_PLACEMENTS,
  ORGANIZATIONS,
  DISCIPLINES,
} from './achievement';

// Judge Management Types - explicit exports
export type {
  JudgeQualification,
  JudgeAssignment,
  JudgeCertification,
  CreateJudgeQualificationData,
  UpdateJudgeQualificationData,
  CreateJudgeAssignmentData,
  UpdateJudgeAssignmentData,
  CreateJudgeCertificationData,
  UpdateJudgeCertificationData,
  JudgeQualificationFilters,
  JudgeAssignmentFilters,
  JudgeCertificationFilters,
  JudgeQualificationSummary,
  JudgeAssignmentSummary,
  JudgeCertificationSummary,
  JudgePerformanceStats,
  JudgeOrganizationConfig,
  JudgeDisciplineConfig,
  JudgeQualificationLevel,
  AssignmentType,
  AssignmentStatus,
  JudgeOrganization,
  JudgeDiscipline,
} from './judge-management';
export {
  JUDGE_QUALIFICATION_LEVELS,
  ASSIGNMENT_TYPES,
  ASSIGNMENT_STATUSES,
  JUDGE_ORGANIZATIONS,
  JUDGE_DISCIPLINES,
} from './judge-management';

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
  FeeCalculation,
} from './show-registration-types';

// Entry Types - explicit exports
export type {
  EntryStatus,
  PaymentStatus,
  Entry,
  ClassEntryStatus,
  ClassEntry,
  CreateEntryInput,
  UpdateEntryInput,
  CreateClassEntryInput,
  UpdateClassEntryInput,
  EntryWithClasses,
  ClassEntryWithContext,
  EntrySummary,
  ClassEntrySummary,
  EntryFilters,
  ClassEntryFilters,
  EntrySortField,
  ClassEntrySortField,
  EntryValidation,
  ClassEntryValidation,
  EntryStatistics,
  ClassEntryStatistics,
  LegacyEntry,
  EntryMigrationData,
} from './entry-refactored-types';
export {
  isValidEntryStatus,
  isValidPaymentStatus,
  isValidClassEntryStatus,
  isEntryEditable,
  isClassEntryEditable,
  ENTRY_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  CLASS_ENTRY_STATUS_LABELS,
  ENTRY_STATUS_COLORS,
  PAYMENT_STATUS_COLORS,
  CLASS_ENTRY_STATUS_COLORS,
} from './entry-refactored-types';

// Audit Types
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
  NotificationSubscription,
} from './audit-types';
export { AuditAction, NotificationType } from './audit-types';

// UI and Component Types
export interface Feature {
  icon: React.ReactNode;
  label: string;
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

// User Preferences Types (Phase 6.4) - explicit exports
export type {
  UserPreferencesRow,
  UserPreferencesInsert,
  UserPreferencesUpdate,
  ThemeMode,
  ColorScheme,
  LayoutDensity,
  FontSizeScale,
  ThemePreferences,
  DefaultView,
  SortOption,
  RefreshInterval,
  CompetitionPreferences,
  QuietHours,
  NotificationPreferences,
  SyncMode,
  CacheStrategy,
  BandwidthMode,
  DataPreferences,
  PrivacyPreferences,
  DeviceOverrides,
  UserPreferences,
  PreferencesUpdate,
  SyncStatus,
  SyncState,
  DeviceInfo,
  UseUserPreferencesReturn,
} from './user-preferences';
export {
  DEFAULT_THEME_PREFERENCES,
  DEFAULT_COMPETITION_PREFERENCES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_DATA_PREFERENCES,
  DEFAULT_PRIVACY_PREFERENCES,
  DEFAULT_USER_PREFERENCES,
} from './user-preferences';

// Export commonly used type combinations
