/**
 * Nationals Scoring Service (Stub)
 *
 * This is a placeholder stub. The actual implementation exists in myk9q.
 * TODO: Move to a shared package when nationals features are needed.
 */

export type ElementType = 'CONTAINER' | 'BURIED' | 'INTERIOR' | 'EXTERIOR' | 'HD_CHALLENGE';
export type CompetitionDay = 1 | 2 | 3;

export interface NationalsScore {
  id?: number;
  entry_id: number;
  armband: string;
  element_type: ElementType;
  day: CompetitionDay;
  judge_id?: number;
  points: number;
  time_seconds: number;
  alerts_correct: number;
  alerts_incorrect: number;
  faults: number;
  finish_call_errors: number;
  excused: boolean;
  disqualified: boolean;
  no_time: boolean;
  scored_at?: string;
  scored_by?: string;
  notes?: string;
  mobile_app_lic_key: string;
}

export interface NationalsRanking {
  entry_id: number;
  armband: string;
  total_points: number;
  day1_points: number;
  day2_points: number;
  day3_points: number;
  total_time_seconds: number;
  day1_time_seconds: number;
  day2_time_seconds: number;
  day3_time_seconds: number;
  container_completed: boolean;
  buried_completed: boolean;
  interior_completed: boolean;
  exterior_completed: boolean;
  hd_challenge_completed: boolean;
  rank?: number;
  qualified_for_finals: boolean;
  final_rank?: number;
  eliminated: boolean;
  withdrawal: boolean;
  updated_at?: string;
  mobile_app_lic_key: string;
}

// Stub service - no-op implementations
export const nationalsScoring = {
  calculatePoints: (_score: Partial<NationalsScore>): number => 0,
  submitScore: async (_score: NationalsScore): Promise<void> => {},
  getRankings: async (): Promise<NationalsRanking[]> => [],
};

export default nationalsScoring;
