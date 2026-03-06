// Database type mappings and utilities
// Maps to actual table names from generated Supabase types
import type { Database } from './supabase';

// Extract table types for easier use
export type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];

// Core entity types (mapped from database - using actual plural table names)
export type DbDog = Tables['dogs']['Row'];
export type DbDogInsert = Tables['dogs']['Insert'];
export type DbDogUpdate = Tables['dogs']['Update'];

export type DbPerson = Tables['people']['Row'];
export type DbPersonInsert = Tables['people']['Insert'];
export type DbPersonUpdate = Tables['people']['Update'];

// Legacy aliases for backward compatibility
export type DbUser = DbPerson;
export type DbUserInsert = DbPersonInsert;
export type DbUserUpdate = DbPersonUpdate;

export type DbShow = Tables['shows']['Row'];
export type DbShowInsert = Tables['shows']['Insert'];
export type DbShowUpdate = Tables['shows']['Update'];

export type DbClub = Tables['clubs']['Row'];
export type DbClubInsert = Tables['clubs']['Insert'];
export type DbClubUpdate = Tables['clubs']['Update'];

export type DbClass = Tables['classes']['Row'];
export type DbClassInsert = Tables['classes']['Insert'];
export type DbClassUpdate = Tables['classes']['Update'];

export type DbEntry = Tables['entries']['Row'];
export type DbEntryInsert = Tables['entries']['Insert'];
export type DbEntryUpdate = Tables['entries']['Update'];

export type DbTrial = Tables['trials']['Row'];
export type DbTrialInsert = Tables['trials']['Insert'];
export type DbTrialUpdate = Tables['trials']['Update'];

// Template system types
// Note: class_templates table was dropped (migration 032), replaced by sport_templates.
// DbClassTemplate types are defined locally in templateMappers.ts for backward compat.

export type DbShowTemplate = Tables['show_templates']['Row'];
export type DbShowTemplateInsert = Tables['show_templates']['Insert'];
export type DbShowTemplateUpdate = Tables['show_templates']['Update'];

export type DbTemplateField = Tables['template_fields']['Row'];
export type DbTemplateFieldInsert = Tables['template_fields']['Insert'];
export type DbTemplateFieldUpdate = Tables['template_fields']['Update'];

// Health records types
export type DbHealthRecord = Tables['health_records']['Row'];
export type DbHealthRecordInsert = Tables['health_records']['Insert'];
export type DbHealthRecordUpdate = Tables['health_records']['Update'];

export type DbVaccination = Tables['vaccinations']['Row'];
export type DbVaccinationInsert = Tables['vaccinations']['Insert'];
export type DbVaccinationUpdate = Tables['vaccinations']['Update'];

export type DbMedication = Tables['medications']['Row'];
export type DbMedicationInsert = Tables['medications']['Insert'];
export type DbMedicationUpdate = Tables['medications']['Update'];

export type DbAllergy = Tables['allergies']['Row'];
export type DbAllergyInsert = Tables['allergies']['Insert'];
export type DbAllergyUpdate = Tables['allergies']['Update'];

export type DbVetVisit = Tables['vet_visits']['Row'];
export type DbVetVisitInsert = Tables['vet_visits']['Insert'];
export type DbVetVisitUpdate = Tables['vet_visits']['Update'];

// Registration types
export type DbDogRegistration = Tables['dog_registrations']['Row'];
export type DbDogRegistrationInsert = Tables['dog_registrations']['Insert'];
export type DbDogRegistrationUpdate = Tables['dog_registrations']['Update'];

// Achievement types
export type DbAchievement = Tables['achievements']['Row'];
export type DbAchievementInsert = Tables['achievements']['Insert'];
export type DbAchievementUpdate = Tables['achievements']['Update'];

// Judge management types
export type DbJudgeAssignment = Tables['judge_assignments']['Row'];
export type DbJudgeAssignmentInsert = Tables['judge_assignments']['Insert'];
export type DbJudgeAssignmentUpdate = Tables['judge_assignments']['Update'];

export type DbJudgeCertification = Tables['judge_certifications']['Row'];
export type DbJudgeCertificationInsert = Tables['judge_certifications']['Insert'];
export type DbJudgeCertificationUpdate = Tables['judge_certifications']['Update'];

export type DbJudgeAvailability = Tables['judge_availability']['Row'];
export type DbJudgeAvailabilityInsert = Tables['judge_availability']['Insert'];
export type DbJudgeAvailabilityUpdate = Tables['judge_availability']['Update'];

// Sync system types
export type DbSyncConflict = Tables['sync_conflicts']['Row'];
export type DbSyncConflictInsert = Tables['sync_conflicts']['Insert'];
export type DbSyncConflictUpdate = Tables['sync_conflicts']['Update'];

// Show management types
export type DbArmband = Tables['armbands']['Row'];
export type DbArmbandInsert = Tables['armbands']['Insert'];
export type DbArmbandUpdate = Tables['armbands']['Update'];

// Offline capabilities types
export type DbOfflineScoring = Tables['offline_scoring']['Row'];
export type DbOfflineScoringInsert = Tables['offline_scoring']['Insert'];
export type DbOfflineScoringUpdate = Tables['offline_scoring']['Update'];

// User preferences types
export type DbUserPreference = Tables['user_preferences']['Row'];
export type DbUserPreferenceInsert = Tables['user_preferences']['Insert'];
export type DbUserPreferenceUpdate = Tables['user_preferences']['Update'];

// Cart types
export type DbEntryCart = Tables['entry_carts']['Row'];
export type DbEntryCartInsert = Tables['entry_carts']['Insert'];
export type DbEntryCartUpdate = Tables['entry_carts']['Update'];

export type DbEntryCartItem = Tables['entry_cart_items']['Row'];
export type DbEntryCartItemInsert = Tables['entry_cart_items']['Insert'];
export type DbEntryCartItemUpdate = Tables['entry_cart_items']['Update'];

// Waitlist types
export type DbWaitlistEntry = Tables['waitlist_entries']['Row'];
export type DbWaitlistEntryInsert = Tables['waitlist_entries']['Insert'];
export type DbWaitlistEntryUpdate = Tables['waitlist_entries']['Update'];

// Training types
export type DbTrainingJournalEntry = Tables['training_journal_entries']['Row'];
export type DbTrainingJournalEntryInsert = Tables['training_journal_entries']['Insert'];
export type DbTrainingJournalEntryUpdate = Tables['training_journal_entries']['Update'];

export type DbTrainingMilestone = Tables['training_milestones']['Row'];
export type DbTrainingMilestoneInsert = Tables['training_milestones']['Insert'];
export type DbTrainingMilestoneUpdate = Tables['training_milestones']['Update'];

// Exhibitor types
export type DbExhibitorProfile = Tables['exhibitor_profiles']['Row'];
export type DbExhibitorProfileInsert = Tables['exhibitor_profiles']['Insert'];
export type DbExhibitorProfileUpdate = Tables['exhibitor_profiles']['Update'];

// Manual results types
export type DbManualResult = Tables['manual_results']['Row'];
export type DbManualResultInsert = Tables['manual_results']['Insert'];
export type DbManualResultUpdate = Tables['manual_results']['Update'];

// Pedigree ancestors types
export type DbPedigreeAncestor = Tables['pedigree_ancestors']['Row'];
export type DbPedigreeAncestorInsert = Tables['pedigree_ancestors']['Insert'];
export type DbPedigreeAncestorUpdate = Tables['pedigree_ancestors']['Update'];

// OFA screening types
export type DbOFAScreening = Tables['ofa_screenings']['Row'];
export type DbOFAScreeningInsert = Tables['ofa_screenings']['Insert'];
export type DbOFAScreeningUpdate = Tables['ofa_screenings']['Update'];

// Genetic screening types
export type DbGeneticScreening = Tables['genetic_screenings']['Row'];
export type DbGeneticScreeningInsert = Tables['genetic_screenings']['Insert'];
export type DbGeneticScreeningUpdate = Tables['genetic_screenings']['Update'];

// Promo code types
export type DbPromoCode = Tables['promo_codes']['Row'];
export type DbPromoCodeInsert = Tables['promo_codes']['Insert'];
export type DbPromoCodeUpdate = Tables['promo_codes']['Update'];

// Type guards for safer type checking
export const isDogRecord = (record: unknown): record is DbDog => {
  return (
    record !== null &&
    typeof record === 'object' &&
    'id' in record &&
    typeof (record as { id: unknown }).id === 'string' &&
    'name' in record
  );
};

export const isPersonRecord = (record: unknown): record is DbPerson => {
  return (
    record !== null &&
    typeof record === 'object' &&
    'id' in record &&
    typeof (record as { id: unknown }).id === 'string' &&
    ('first_name' in record || 'last_name' in record)
  );
};

// Legacy alias
export const isUserRecord = isPersonRecord;

export const isShowRecord = (record: unknown): record is DbShow => {
  return (
    record !== null &&
    typeof record === 'object' &&
    'id' in record &&
    typeof (record as { id: unknown }).id === 'string' &&
    'name' in record &&
    'start_date' in record
  );
};

export const isClubRecord = (record: unknown): record is DbClub => {
  return (
    record !== null &&
    typeof record === 'object' &&
    'id' in record &&
    typeof (record as { id: unknown }).id === 'string' &&
    'name' in record
  );
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
// Using actual plural table names from the database
export const TABLE_NAMES = {
  // Core entities
  DOGS: 'dogs',
  PEOPLE: 'people',
  SHOWS: 'shows',
  CLUBS: 'clubs',
  CLASSES: 'classes',
  ENTRIES: 'entries',
  TRIALS: 'trials',

  // Templates
  SHOW_TEMPLATES: 'show_templates',
  TEMPLATE_FIELDS: 'template_fields',

  // Health records
  HEALTH_RECORDS: 'health_records',
  VACCINATIONS: 'vaccinations',
  MEDICATIONS: 'medications',
  ALLERGIES: 'allergies',
  VET_VISITS: 'vet_visits',

  // Registrations
  DOG_REGISTRATIONS: 'dog_registrations',

  // Achievements
  ACHIEVEMENTS: 'achievements',

  // Judge management
  JUDGE_ASSIGNMENTS: 'judge_assignments',
  JUDGE_AVAILABILITY: 'judge_availability',
  JUDGE_CERTIFICATIONS: 'judge_certifications',

  // Sync system
  SYNC_CONFLICTS: 'sync_conflicts',

  // Show management
  ARMBANDS: 'armbands',

  // Offline capabilities
  OFFLINE_SCORING: 'offline_scoring',

  // User preferences
  USER_PREFERENCES: 'user_preferences',

  // Cart
  ENTRY_CARTS: 'entry_carts',
  ENTRY_CART_ITEMS: 'entry_cart_items',

  // Waitlist
  WAITLIST_ENTRIES: 'waitlist_entries',

  // Exhibitor
  EXHIBITOR_PROFILES: 'exhibitor_profiles',

  // Training
  TRAINING_JOURNAL_ENTRIES: 'training_journal_entries',
  TRAINING_MILESTONES: 'training_milestones',

  // Manual results
  MANUAL_RESULTS: 'manual_results',

  // Pedigree
  PEDIGREE_ANCESTORS: 'pedigree_ancestors',

  // Health screenings
  OFA_SCREENINGS: 'ofa_screenings',
  GENETIC_SCREENINGS: 'genetic_screenings',

  // Promo codes
  PROMO_CODES: 'promo_codes',
} as const;

// Type for table names
export type TableName = (typeof TABLE_NAMES)[keyof typeof TABLE_NAMES];
