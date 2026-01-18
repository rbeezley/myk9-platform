/**
 * Enhanced Judge Management Types
 * 
 * Comprehensive types for judge qualifications, certifications, and assignments
 * supporting multiple organizations and disciplines.
 */

// Core Judge Qualification Entity
export interface JudgeQualification {
  id: string;
  person_id: string;
  organization: string;
  qualification_level: string;
  disciplines: string[];
  date_obtained: string;
  expiration_date?: string;
  approval_number?: string;
  approved_by?: string;
  is_active: boolean;
  suspension_date?: string;
  suspension_reason?: string;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

// Judge Assignment Entity  
export interface JudgeAssignment {
  id: string;
  judge_id: string;
  show_id?: string;
  assignment_type: string;
  assignment_date: string;
  assigned_classes?: string[];
  assigned_rings?: string[];
  assignment_status?: string;
  confirmed_at?: string;
  confirmed_by?: string;
  compensation_amount?: number;
  travel_provided?: boolean;
  expenses_covered?: boolean;
  special_requirements?: string;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

// Judge Certification Entity
export interface JudgeCertification {
  id: string;
  person_id: string;
  certification_name: string;
  issuing_body: string;
  certification_number?: string;
  date_obtained: string;
  expiration_date?: string;
  renewal_required: boolean;
  next_renewal_date?: string;
  continuing_education_hours: number;
  is_active: boolean;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

// Create/Update Data Types
export interface CreateJudgeQualificationData {
  person_id: string;
  organization: string;
  qualification_level: string;
  disciplines: string[];
  date_obtained: string;
  expiration_date?: string;
  approval_number?: string;
  approved_by?: string;
  is_active?: boolean;
  notes?: string | undefined;
}

export interface UpdateJudgeQualificationData {
  id: string;
  organization?: string;
  qualification_level?: string;
  disciplines?: string[];
  date_obtained?: string;
  expiration_date?: string;
  approval_number?: string;
  approved_by?: string;
  is_active?: boolean;
  suspension_date?: string;
  suspension_reason?: string;
  notes?: string | undefined;
}

export interface CreateJudgeAssignmentData {
  judge_id: string;
  show_id?: string;
  assignment_type: string;
  assignment_date: string;
  assigned_classes?: string[];
  assigned_rings?: string[];
  assignment_status?: string;
  compensation_amount?: number;
  travel_provided?: boolean;
  expenses_covered?: boolean;
  special_requirements?: string;
  notes?: string | undefined;
}

export interface UpdateJudgeAssignmentData {
  id: string;
  assignment_type?: string;
  assignment_date?: string;
  assigned_classes?: string[];
  assigned_rings?: string[];
  assignment_status?: string;
  confirmed_at?: string;
  confirmed_by?: string;
  compensation_amount?: number;
  travel_provided?: boolean;
  expenses_covered?: boolean;
  special_requirements?: string;
  notes?: string | undefined;
}

export interface CreateJudgeCertificationData {
  person_id: string;
  certification_name: string;
  issuing_body: string;
  certification_number?: string;
  date_obtained: string;
  expiration_date?: string;
  renewal_required?: boolean;
  next_renewal_date?: string;
  continuing_education_hours?: number;
  is_active?: boolean;
  notes?: string | undefined;
}

export interface UpdateJudgeCertificationData {
  id: string;
  certification_name?: string;
  issuing_body?: string;
  certification_number?: string;
  date_obtained?: string;
  expiration_date?: string;
  renewal_required?: boolean;
  next_renewal_date?: string;
  continuing_education_hours?: number;
  is_active?: boolean;
  notes?: string | undefined;
}

// Filter Types
export interface JudgeQualificationFilters {
  organization?: string;
  qualification_level?: string;
  discipline?: string;
  is_active?: boolean;
  expiring_within_days?: number;
  suspended?: boolean;
}

export interface JudgeAssignmentFilters {
  show_id?: string;
  assignment_type?: string;
  assignment_status?: string;
  assignment_date_from?: string;
  assignment_date_to?: string;
  confirmed?: boolean;
}

export interface JudgeCertificationFilters {
  issuing_body?: string;
  certification_name?: string;
  is_active?: boolean;
  expiring_within_days?: number;
  renewal_required?: boolean;
}

// Summary Types
export interface JudgeQualificationSummary {
  total_qualifications: number;
  active_qualifications: number;
  expired_qualifications: number;
  suspended_qualifications: number;
  expiring_soon: number; // Within 30 days
  organizations: string[];
  disciplines: string[];
  latest_qualification?: JudgeQualification;
  qualifications_by_organization: Record<string, number>;
  qualifications_by_level: Record<string, number>;
}

export interface JudgeAssignmentSummary {
  total_assignments: number;
  upcoming_assignments: number;
  completed_assignments: number;
  confirmed_assignments: number;
  pending_assignments: number;
  shows_judged: string[];
  assignment_types: string[];
  total_compensation: number;
  recent_assignments: JudgeAssignment[];
  assignments_by_type: Record<string, number>;
  assignments_by_status: Record<string, number>;
}

export interface JudgeCertificationSummary {
  total_certifications: number;
  active_certifications: number;
  expired_certifications: number;
  expiring_soon: number; // Within 30 days
  renewal_required: number;
  continuing_education_total: number;
  issuing_bodies: string[];
  certification_types: string[];
  latest_certification?: JudgeCertification;
  certifications_by_body: Record<string, number>;
  certifications_by_type: Record<string, number>;
}

// Analytics Types
export interface JudgePerformanceStats {
  qualification_summary: JudgeQualificationSummary;
  assignment_summary: JudgeAssignmentSummary;
  certification_summary: JudgeCertificationSummary;
  career_highlights: {
    first_qualification?: JudgeQualification;
    first_certification?: JudgeCertification;
    most_recent_assignment?: JudgeAssignment;
    highest_compensation_assignment?: JudgeAssignment;
    total_shows_judged: number;
    years_active: number;
    favorite_disciplines: string[];
  };
  activity_trend: Array<{
    month: string;
    assignments: number;
    shows: number;
    compensation: number;
  }>;
}

// Organization and Discipline Configuration
export interface JudgeOrganizationConfig {
  name: string;
  code: string;
  qualification_levels: string[];
  disciplines: string[];
  certification_requirements: {
    minimum_experience_years?: number;
    required_training_hours?: number;
    requires_renewal?: boolean;
    renewal_period_years?: number;
    requires_continuing_education?: boolean;
  };
  assignment_types: string[];
  compensation_guidelines?: {
    per_class?: number;
    per_day?: number;
    travel_reimbursement?: boolean;
    expense_allowance?: boolean;
  };
}

export interface JudgeDisciplineConfig {
  name: string;
  organizations: string[];
  required_qualifications: string[];
  typical_assignment_duration: string; // e.g., "1 day", "2 days"
  special_requirements?: string[];
}

// Import/Export Types
export interface ImportJudgeQualificationData {
  judge_identifier: string; // Name, email, or ID
  organization: string;
  qualification_level: string;
  disciplines: string[];
  date_obtained: string;
  expiration_date?: string;
  approval_number?: string;
  source: string;
}

export interface ImportJudgeAssignmentData {
  judge_identifier: string;
  show_identifier?: string;
  assignment_type: string;
  assignment_date: string;
  assigned_classes?: string[];
  compensation_amount?: number;
  source: string;
}

export interface ImportJudgeCertificationData {
  judge_identifier: string;
  certification_name: string;
  issuing_body: string;
  certification_number?: string;
  date_obtained: string;
  expiration_date?: string;
  source: string;
}

export interface ExportJudgeData {
  qualifications: JudgeQualification[];
  assignments: JudgeAssignment[];
  certifications: JudgeCertification[];
  export_date: string;
  exported_by: string;
  filters_applied?: Record<string, unknown>;
}

// Constants
export const JUDGE_QUALIFICATION_LEVELS = [
  'Provisional',
  'Regular',
  'All-Breed',
  'Specialty',
  'Senior',
  'Master',
  'Emeritus'
] as const;

export const ASSIGNMENT_TYPES = [
  'Regular Class',
  'Specialty Match',
  'Fun Match', 
  'Championship',
  'Premier',
  'Trial',
  'Test',
  'Workshop',
  'Seminar'
] as const;

export const ASSIGNMENT_STATUSES = [
  'Requested',
  'Offered',
  'Accepted',
  'Confirmed',
  'Completed',
  'Cancelled',
  'Declined'
] as const;

export const JUDGE_ORGANIZATIONS = [
  'AKC',
  'UKC', 
  'NACSW',
  'CPE',
  'USDAA',
  'NADAC',
  'ASCA',
  'CKC',
  'OTHER'
] as const;

export const JUDGE_DISCIPLINES = [
  'Scent Work',
  'Agility',
  'Obedience',
  'Rally',
  'Conformation',
  'Field Trials',
  'Hunt Tests',
  'Herding',
  'Lure Coursing',
  'Tracking',
  'Barn Hunt',
  'FastCAT',
  'Dock Diving',
  'Weight Pull'
] as const;

export type JudgeQualificationLevel = typeof JUDGE_QUALIFICATION_LEVELS[number];
export type AssignmentType = typeof ASSIGNMENT_TYPES[number];
export type AssignmentStatus = typeof ASSIGNMENT_STATUSES[number];
export type JudgeOrganization = typeof JUDGE_ORGANIZATIONS[number];
export type JudgeDiscipline = typeof JUDGE_DISCIPLINES[number];