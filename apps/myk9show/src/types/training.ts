// Training Journal Types matching Supabase schema

export type TrainingAssessment = 'breakthrough' | 'solid' | 'needs_work' | 'regression';

export interface TrainingJournalEntry {
  id: string;
  dog_id: string;
  owner_id: string;
  title: string;
  content: string | null;
  date: string;
  duration_minutes: number | null;
  location: string | null;
  sport_tag: string | null;
  assessment: TrainingAssessment | null;
  linked_result_id: string | null;
  notes: string | null;
  goals: string[];
  created_at: string;
  updated_at: string;
}

export type MilestoneSource = 'manual' | 'auto';

export interface TrainingMilestone {
  id: string;
  dog_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  date: string;
  source: MilestoneSource;
  linked_title_id: string | null;
  created_at: string;
  updated_at: string;
}

// Training statistics (computed client-side)
export interface TrainingStatistics {
  total_sessions: number;
  total_hours: number;
  sessions_this_month: number;
  average_duration_minutes: number;
  assessment_breakdown: Record<TrainingAssessment, number>;
  sport_tags: string[];
  streak_days: number;
}
