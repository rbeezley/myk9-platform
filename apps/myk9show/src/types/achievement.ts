/**
 * Achievement and Competition System Types
 * 
 * Types for tracking dog achievements, competition results, and performance history.
 * Supports multi-organization tracking (AKC, UKC, etc.) with comprehensive scoring.
 */

// Core Achievement Types
export interface Achievement {
  id: string;
  dog_id: string;
  achievement_type: string;
  title: string;
  abbreviation?: string;
  organization: string;
  discipline?: string;
  level?: string;
  date_earned: string; // ISO date string
  points?: number;
  location?: string;
  judge_name?: string;
  certificate_number?: string;
  certificate_url?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAchievementData {
  dog_id: string;
  achievement_type: string;
  title: string;
  abbreviation?: string;
  organization: string;
  discipline?: string;
  level?: string;
  date_earned: string;
  points?: number;
  location?: string;
  judge_name?: string;
  certificate_number?: string;
  certificate_url?: string;
  notes?: string;
  is_active?: boolean;
}

export interface UpdateAchievementData extends Partial<CreateAchievementData> {
  id: string;
}

// Competition Types
export interface Competition {
  id: string;
  dog_id: string;
  show_id?: string;
  class_id?: string;
  competition_name: string;
  competition_date: string; // ISO date string
  location?: string;
  placement?: string;
  score?: string;
  time_seconds?: number;
  qualified?: boolean;
  points_earned: number;
  organization?: string;
  discipline?: string;
  level?: string;
  judge_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCompetitionData {
  dog_id: string;
  show_id?: string;
  class_id?: string;
  competition_name: string;
  competition_date: string;
  location?: string;
  placement?: string;
  score?: string;
  time_seconds?: number;
  qualified?: boolean;
  points_earned?: number;
  organization?: string;
  discipline?: string;
  level?: string;
  judge_name?: string;
  notes?: string;
}

export interface UpdateCompetitionData extends Partial<CreateCompetitionData> {
  id: string;
}

// Past Results Types
export interface PastResult {
  id: string;
  dog_id: string;
  show_id?: string;
  show_name: string;
  show_date: string; // ISO date string
  show_location?: string;
  class_name: string;
  class_level?: string;
  placement?: string;
  score?: string;
  qualified?: boolean;
  judge_name?: string;
  notes?: string;
  imported_from?: string;
  external_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePastResultData {
  dog_id: string;
  show_id?: string;
  show_name: string;
  show_date: string;
  show_location?: string;
  class_name: string;
  class_level?: string;
  placement?: string;
  score?: string;
  qualified?: boolean;
  judge_name?: string;
  notes?: string;
  imported_from?: string;
  external_id?: string;
}

export interface UpdatePastResultData extends Partial<CreatePastResultData> {
  id: string;
}

// Achievement Analytics Types
export interface AchievementSummary {
  total_achievements: number;
  active_achievements: number;
  organizations: string[];
  latest_achievement?: Achievement;
  achievements_by_type: Record<string, number>;
  achievements_by_organization: Record<string, number>;
}

export interface CompetitionSummary {
  total_competitions: number;
  qualified_competitions: number;
  qualification_rate: number;
  total_points: number;
  average_score?: number;
  best_placement?: string;
  recent_competitions: Competition[];
  organizations: string[];
  disciplines: string[];
}

export interface PerformanceStats {
  achievement_summary: AchievementSummary;
  competition_summary: CompetitionSummary;
  performance_trend: {
    month: string;
    competitions: number;
    qualified: number;
    points: number;
  }[];
  career_highlights: {
    first_achievement?: Achievement;
    highest_scoring_competition?: Competition;
    most_recent_title?: Achievement;
    qualification_streak?: number;
  };
}

// Search and Filter Types
export interface AchievementFilters {
  organization?: string;
  achievement_type?: string;
  discipline?: string;
  level?: string;
  is_active?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface CompetitionFilters {
  organization?: string;
  discipline?: string;
  level?: string;
  qualified?: boolean;
  show_id?: string;
  date_from?: string;
  date_to?: string;
  location?: string;
}

export interface PastResultFilters {
  show_name?: string;
  class_name?: string;
  class_level?: string;
  qualified?: boolean;
  judge_name?: string;
  date_from?: string;
  date_to?: string;
  imported_from?: string;
}

// Organization-specific Types
export interface OrganizationConfig {
  name: string;
  abbreviation: string;
  achievement_types: string[];
  disciplines: string[];
  levels: string[];
  scoring_system: 'points' | 'time' | 'placement' | 'qualified';
  website?: string;
}

export interface DisciplineConfig {
  name: string;
  abbreviation: string;
  scoring_type: 'time' | 'points' | 'placement';
  levels: string[];
  organizations: string[];
}

// Import/Export Types
export interface ImportAchievementData {
  dog_identifier: string; // Can be name, registration, or external ID
  achievement_type: string;
  title: string;
  organization: string;
  date_earned: string;
  source: string;
  raw_data?: Record<string, unknown>;
}

export interface ImportCompetitionData {
  dog_identifier: string;
  competition_name: string;
  competition_date: string;
  placement?: string;
  score?: string;
  qualified?: boolean;
  organization?: string;
  source: string;
  raw_data?: Record<string, unknown>;
}

export interface ImportSummary {
  total_records: number;
  successful_imports: number;
  failed_imports: number;
  errors: {
    row: number;
    error: string;
    data: Record<string, unknown>;
  }[];
  preview: (Achievement | Competition | PastResult)[];
}

// Constants
export const ACHIEVEMENT_TYPES = [
  'Title',
  'Championship',
  'Certificate',
  'Award',
  'Recognition',
  'Qualification',
  'License',
  'Other'
] as const;

export const COMPETITION_PLACEMENTS = [
  '1st',
  '2nd', 
  '3rd',
  '4th',
  'Q', // Qualified
  'NQ', // Not Qualified
  'WD', // Withdrawn
  'DQ', // Disqualified
  'E', // Eliminated
  'A', // Absent
  'T' // Tied
] as const;

export const ORGANIZATIONS = [
  'AKC',
  'UKC', 
  'CKC',
  'USDAA',
  'CPE',
  'NADAC',
  'TDAA',
  'PSA',
  'Other'
] as const;

export const DISCIPLINES = [
  'Conformation',
  'Obedience',
  'Rally',
  'Agility',
  'Tracking',
  'Herding',
  'Hunt Test',
  'Field Trial',
  'Lure Coursing',
  'Earth Dog',
  'Barn Hunt',
  'Dock Diving',
  'Fast CAT',
  'Scent Work',
  'Therapy',
  'Service',
  'Other'
] as const;

export type AchievementType = typeof ACHIEVEMENT_TYPES[number];
export type CompetitionPlacement = typeof COMPETITION_PLACEMENTS[number];
export type Organization = typeof ORGANIZATIONS[number];
export type Discipline = typeof DISCIPLINES[number];