/**
 * Nationals Scoring Service
 *
 * Provides shared types and a default no-op implementation for nationals scoring.
 * The full implementation lives in myk9q; this provides the type contract
 * so both apps can reference the same types.
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

export interface NationalsScoringInterface {
  calculatePoints(score: Partial<NationalsScore>): number;
  submitScore(score: NationalsScore): Promise<void>;
  getRankings(): Promise<NationalsRanking[]>;
}

// No-op default implementation
export const nationalsScoring: NationalsScoringInterface = {
  calculatePoints: (_score: Partial<NationalsScore>): number => 0,
  submitScore: async (_score: NationalsScore): Promise<void> => {},
  getRankings: async (): Promise<NationalsRanking[]> => [],
};

export default nationalsScoring;
