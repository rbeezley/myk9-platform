// Database type mappings and utilities
import type { Database } from './supabase';

// Extract table types for easier use
export type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];

// Core entity types (mapped from database)
export type DbDog = Tables['dog']['Row'];
export type DbDogInsert = Tables['dog']['Insert'];
export type DbDogUpdate = Tables['dog']['Update'];

export type DbUser = Tables['user']['Row'];
export type DbUserInsert = Tables['user']['Insert'];
export type DbUserUpdate = Tables['user']['Update'];

// Legacy alias for backward compatibility
export type DbPerson = DbUser;
export type DbPersonInsert = DbUserInsert;
export type DbPersonUpdate = DbUserUpdate;

export type DbShow = Tables['show']['Row'];
export type DbShowInsert = Tables['show']['Insert'];
export type DbShowUpdate = Tables['show']['Update'];

export type DbClub = Tables['club']['Row'];
export type DbClubInsert = Tables['club']['Insert'];
export type DbClubUpdate = Tables['club']['Update'];

export type DbClass = Tables['class']['Row'];
export type DbClassInsert = Tables['class']['Insert'];
export type DbClassUpdate = Tables['class']['Update'];

export type DbEntry = Tables['entry']['Row'];
export type DbEntryInsert = Tables['entry']['Insert'];
export type DbEntryUpdate = Tables['entry']['Update'];

export type DbResult = Tables['result']['Row'];
export type DbResultInsert = Tables['result']['Insert'];
export type DbResultUpdate = Tables['result']['Update'];

// Template system types
export type DbClassTemplate = Tables['class_template']['Row'];
export type DbClassTemplateInsert = Tables['class_template']['Insert'];
export type DbClassTemplateUpdate = Tables['class_template']['Update'];

export type DbShowTemplate = Tables['show_template']['Row'];
export type DbShowTemplateInsert = Tables['show_template']['Insert'];
export type DbShowTemplateUpdate = Tables['show_template']['Update'];

export type DbTemplateField = Tables['template_field']['Row'];
export type DbTemplateFieldInsert = Tables['template_field']['Insert'];
export type DbTemplateFieldUpdate = Tables['template_field']['Update'];

// Health records types
export type DbHealthRecord = Tables['health_record']['Row'];
export type DbHealthRecordInsert = Tables['health_record']['Insert'];
export type DbHealthRecordUpdate = Tables['health_record']['Update'];

export type DbVaccination = Tables['vaccination']['Row'];
export type DbVaccinationInsert = Tables['vaccination']['Insert'];
export type DbVaccinationUpdate = Tables['vaccination']['Update'];

export type DbMedication = Tables['medication']['Row'];
export type DbMedicationInsert = Tables['medication']['Insert'];
export type DbMedicationUpdate = Tables['medication']['Update'];

export type DbAllergy = Tables['allergy']['Row'];
export type DbAllergyInsert = Tables['allergy']['Insert'];
export type DbAllergyUpdate = Tables['allergy']['Update'];

export type DbVetVisit = Tables['vet_visit']['Row'];
export type DbVetVisitInsert = Tables['vet_visit']['Insert'];
export type DbVetVisitUpdate = Tables['vet_visit']['Update'];

// Registration types
export type DbDogRegistration = Tables['dog_registration']['Row'];
export type DbDogRegistrationInsert = Tables['dog_registration']['Insert'];
export type DbDogRegistrationUpdate = Tables['dog_registration']['Update'];

// Achievement types
export type DbAchievement = Tables['achievement']['Row'];
export type DbAchievementInsert = Tables['achievement']['Insert'];
export type DbAchievementUpdate = Tables['achievement']['Update'];

export type DbCompetition = Tables['competition']['Row'];
export type DbCompetitionInsert = Tables['competition']['Insert'];
export type DbCompetitionUpdate = Tables['competition']['Update'];

export type DbPastResult = Tables['past_result']['Row'];
export type DbPastResultInsert = Tables['past_result']['Insert'];
export type DbPastResultUpdate = Tables['past_result']['Update'];

// Judge management types (manual definitions until Supabase types are updated)
export interface DbJudgeQualification {
  id: string;
  person_id?: string | null;
  organization: string;
  qualification_level: string;
  disciplines: string[];
  date_obtained: string;
  expiration_date?: string | null;
  approval_number?: string | null;
  approved_by?: string | null;
  is_active?: boolean | null;
  suspension_date?: string | null;
  suspension_reason?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DbJudgeAssignment {
  id: string;
  judge_id?: string | null;
  show_id?: string | null;
  assignment_type: string;
  assignment_date: string;
  assigned_classes?: string[] | null;
  assigned_rings?: string[] | null;
  assignment_status?: string | null;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  compensation_amount?: number | null;
  travel_provided?: boolean | null;
  expenses_covered?: boolean | null;
  special_requirements?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DbJudgeCertification {
  id: string;
  person_id?: string | null;
  certification_name: string;
  issuing_body: string;
  certification_number?: string | null;
  date_obtained: string;
  expiration_date?: string | null;
  renewal_required?: boolean | null;
  next_renewal_date?: string | null;
  continuing_education_hours?: number | null;
  is_active?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type DbJudgeQualificationInsert = Omit<DbJudgeQualification, 'id' | 'created_at' | 'updated_at'>;
export type DbJudgeQualificationUpdate = Partial<DbJudgeQualificationInsert>;

export type DbJudgeAssignmentInsert = Omit<DbJudgeAssignment, 'id' | 'created_at' | 'updated_at'>;
export type DbJudgeAssignmentUpdate = Partial<DbJudgeAssignmentInsert>;

export type DbJudgeCertificationInsert = Omit<DbJudgeCertification, 'id' | 'created_at' | 'updated_at'>;
export type DbJudgeCertificationUpdate = Partial<DbJudgeCertificationInsert>;

// Sync system types
export type DbSyncQueue = Tables['sync_queue']['Row'];
export type DbSyncQueueInsert = Tables['sync_queue']['Insert'];
export type DbSyncQueueUpdate = Tables['sync_queue']['Update'];

export type DbSyncConflict = Tables['sync_conflict']['Row'];
export type DbSyncConflictInsert = Tables['sync_conflict']['Insert'];
export type DbSyncConflictUpdate = Tables['sync_conflict']['Update'];

// Search types
export type DbSearchHistory = Tables['search_history']['Row'];
export type DbSearchHistoryInsert = Tables['search_history']['Insert'];
export type DbSearchHistoryUpdate = Tables['search_history']['Update'];

export type DbSearchAnalytics = Tables['search_analytics']['Row'];
export type DbSearchAnalyticsInsert = Tables['search_analytics']['Insert'];
export type DbSearchAnalyticsUpdate = Tables['search_analytics']['Update'];

// Show management types
export type DbShowRegistration = Tables['show_registration']['Row'];
export type DbShowRegistrationInsert = Tables['show_registration']['Insert'];
export type DbShowRegistrationUpdate = Tables['show_registration']['Update'];

export type DbArmband = Tables['armband']['Row'];
export type DbArmbandInsert = Tables['armband']['Insert'];
export type DbArmbandUpdate = Tables['armband']['Update'];

// Audit system types
export type DbAuditEntry = Tables['audit_entry']['Row'];
export type DbAuditEntryInsert = Tables['audit_entry']['Insert'];
export type DbAuditEntryUpdate = Tables['audit_entry']['Update'];

export type DbSystemAlert = Tables['system_alert']['Row'];
export type DbSystemAlertInsert = Tables['system_alert']['Insert'];
export type DbSystemAlertUpdate = Tables['system_alert']['Update'];

// Offline capabilities types
export type DbOfflineScoring = Tables['offline_scoring']['Row'];
export type DbOfflineScoringInsert = Tables['offline_scoring']['Insert'];
export type DbOfflineScoringUpdate = Tables['offline_scoring']['Update'];

export type DbDraftEntry = Tables['draft_entry']['Row'];
export type DbDraftEntryInsert = Tables['draft_entry']['Insert'];
export type DbDraftEntryUpdate = Tables['draft_entry']['Update'];

// User preferences types
export type DbUserPreference = Tables['user_preference']['Row'];
export type DbUserPreferenceInsert = Tables['user_preference']['Insert'];
export type DbUserPreferenceUpdate = Tables['user_preference']['Update'];

// Type guards for safer type checking
export const isDogRecord = (record: unknown): record is DbDog => {
  return record !== null && typeof record === 'object' && 'id' in record && typeof (record as { id: unknown }).id === 'string' && 'name' in record;
};

export const isUserRecord = (record: unknown): record is DbUser => {
  return record !== null && typeof record === 'object' && 'id' in record && typeof (record as { id: unknown }).id === 'string' && ('first_name' in record || 'last_name' in record);
};

// Legacy alias for backward compatibility
export const isPersonRecord = isUserRecord;

export const isShowRecord = (record: unknown): record is DbShow => {
  return record !== null && typeof record === 'object' && 'id' in record && typeof (record as { id: unknown }).id === 'string' && 'name' in record && 'start_date' in record;
};

export const isClubRecord = (record: unknown): record is DbClub => {
  return record !== null && typeof record === 'object' && 'id' in record && typeof (record as { id: unknown }).id === 'string' && 'name' in record;
};

// Utility functions for common database operations
export const createTimestamps = () => ({
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const updateTimestamp = () => ({
  updated_at: new Date().toISOString(),
});

// Database table names (for programmatic access)
// Note: Mixed naming - some tables singular, others still plural pending migration
export const TABLE_NAMES = {
  // Core entities (singular)
  DOG: 'dog',
  USER: 'user', 
  SHOW: 'show',
  CLUB: 'club',
  CLASS: 'class',
  ENTRY: 'entry',
  RESULT: 'result',
  
  // Templates (singular)
  CLASS_TEMPLATE: 'class_template',
  SHOW_TEMPLATE: 'show_template', 
  TEMPLATE_FIELD: 'template_field',
  
  // Health records (singular)
  HEALTH_RECORD: 'health_record',
  VACCINATION: 'vaccination',
  MEDICATION: 'medication',
  ALLERGY: 'allergy',
  VET_VISIT: 'vet_visit',
  
  // Registrations (singular)
  DOG_REGISTRATION: 'dog_registration',
  
  // Achievements
  ACHIEVEMENT: 'achievement',
  COMPETITION: 'competition',
  PAST_RESULT: 'past_result',
  
  // Judge management
  JUDGE_QUALIFICATION: 'judge_qualification',
  JUDGE_ASSIGNMENT: 'judge_assignment',
  JUDGE_CERTIFICATION: 'judge_certification',
  
  // Sync system
  SYNC_QUEUE: 'sync_queue',
  SYNC_CONFLICT: 'sync_conflict',
  
  // Search
  SEARCH_HISTORY: 'search_history',
  SEARCH_ANALYTICS: 'search_analytics',
  
  // Show management
  SHOW_REGISTRATION: 'show_registration',
  ARMBAND: 'armband',
  
  // Audit system
  AUDIT_ENTRY: 'audit_entry',
  SYSTEM_ALERT: 'system_alert',
  
  // Offline capabilities
  OFFLINE_SCORING: 'offline_scoring',
  DRAFT_ENTRY: 'draft_entry',
  
  // User preferences
  USER_PREFERENCE: 'user_preference',
} as const;

// Type for table names
export type TableName = typeof TABLE_NAMES[keyof typeof TABLE_NAMES];