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
  abbreviation?: string | undefined;
  organization: string;
  discipline?: string | undefined;
  level?: string | undefined;
  date_earned: string; // ISO date string
  points?: number | undefined;
  location?: string | undefined;
  judge_name?: string | undefined;
  certificate_number?: string | undefined;
  certificate_url?: string | undefined;
  notes?: string | undefined;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAchievementData {
  dog_id: string;
  achievement_type: string;
  title: string;
  abbreviation?: string | undefined;
  organization: string;
  discipline?: string | undefined;
  level?: string | undefined;
  date_earned: string;
  points?: number | undefined;
  location?: string | undefined;
  judge_name?: string | undefined;
  certificate_number?: string | undefined;
  certificate_url?: string | undefined;
  notes?: string | undefined;
  is_active?: boolean | undefined;
}

export interface UpdateAchievementData extends Partial<CreateAchievementData> {
  id: string;
}

// Competition Types
export interface Competition {
  id: string;
  dog_id: string;
  show_id?: string | undefined;
  class_id?: string | undefined;
  competition_name: string;
  competition_date: string; // ISO date string
  location?: string | undefined;
  placement?: string | undefined;
  score?: string | undefined;
  time_seconds?: number | undefined;
  qualified?: boolean | undefined;
  points_earned: number;
  organization?: string | undefined;
  discipline?: string | undefined;
  level?: string | undefined;
  judge_name?: string | undefined;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface CreateCompetitionData {
  dog_id: string;
  show_id?: string | undefined;
  class_id?: string | undefined;
  competition_name: string;
  competition_date: string;
  location?: string | undefined;
  placement?: string | undefined;
  score?: string | undefined;
  time_seconds?: number | undefined;
  qualified?: boolean | undefined;
  points_earned?: number | undefined;
  organization?: string | undefined;
  discipline?: string | undefined;
  level?: string | undefined;
  judge_name?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateCompetitionData extends Partial<CreateCompetitionData> {
  id: string;
}

// Past Results Types
export interface PastResult {
  id: string;
  dog_id: string;
  show_id?: string | undefined;
  show_name: string;
  show_date: string; // ISO date string
  show_location?: string | undefined;
  class_name: string;
  class_level?: string | undefined;
  placement?: string | undefined;
  score?: string | undefined;
  qualified?: boolean | undefined;
  judge_name?: string | undefined;
  notes?: string | undefined;
  imported_from?: string | undefined;
  external_id?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface CreatePastResultData {
  dog_id: string;
  show_id?: string | undefined;
  show_name: string;
  show_date: string;
  show_location?: string | undefined;
  class_name: string;
  class_level?: string | undefined;
  placement?: string | undefined;
  score?: string | undefined;
  qualified?: boolean | undefined;
  judge_name?: string | undefined;
  notes?: string | undefined;
  imported_from?: string | undefined;
  external_id?: string | undefined;
}

export interface UpdatePastResultData extends Partial<CreatePastResultData> {
  id: string;
}

// Achievement Analytics Types
export interface AchievementSummary {
  total_achievements: number;
  active_achievements: number;
  organizations: string[];
  latest_achievement?: Achievement | undefined;
  achievements_by_type: Record<string, number>;
  achievements_by_organization: Record<string, number>;
}

export interface CompetitionSummary {
  total_competitions: number;
  qualified_competitions: number;
  qualification_rate: number;
  total_points: number;
  average_score?: number | undefined;
  best_placement?: string | undefined;
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
    first_achievement?: Achievement | undefined;
    highest_scoring_competition?: Competition | undefined;
    most_recent_title?: Achievement | undefined;
    qualification_streak?: number | undefined;
  };
}

// Search and Filter Types
export interface AchievementFilters {
  organization?: string | undefined;
  achievement_type?: string | undefined;
  discipline?: string | undefined;
  level?: string | undefined;
  is_active?: boolean | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
}

export interface CompetitionFilters {
  organization?: string | undefined;
  discipline?: string | undefined;
  level?: string | undefined;
  qualified?: boolean | undefined;
  show_id?: string | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
  location?: string | undefined;
}

export interface PastResultFilters {
  show_name?: string | undefined;
  class_name?: string | undefined;
  class_level?: string | undefined;
  qualified?: boolean | undefined;
  judge_name?: string | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
  imported_from?: string | undefined;
}

// Organization-specific Types
export interface OrganizationConfig {
  name: string;
  abbreviation: string;
  achievement_types: string[];
  disciplines: string[];
  levels: string[];
  scoring_system: 'points' | 'time' | 'placement' | 'qualified';
  website?: string | undefined;
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
  raw_data?: Record<string, unknown> | undefined;
}

export interface ImportCompetitionData {
  dog_identifier: string;
  competition_name: string;
  competition_date: string;
  placement?: string | undefined;
  score?: string | undefined;
  qualified?: boolean | undefined;
  organization?: string | undefined;
  source: string;
  raw_data?: Record<string, unknown> | undefined;
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