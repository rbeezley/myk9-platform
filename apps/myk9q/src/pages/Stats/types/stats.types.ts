/**
 * TypeScript interfaces for Stats feature
 */

// Core stats data structure
export interface StatsData {
  // Summary metrics
  totalAllEntries: number;  // All entries (scored + unscored)
  totalEntries: number;     // Scored entries only (from view)
  scoredEntries: number;
  qualifiedCount: number;
  nqCount: number;
  excusedCount: number;
  absentCount: number;
  withdrawnCount: number;
  uniqueDogs: number;  // Count of unique dogs (by armband)

  // Calculated percentages
  qualificationRate: number;
  nqRate: number;
  excusedRate: number;
  absentRate: number;
  withdrawnRate: number;

  // Time statistics
  fastestTime: FastestTimeEntry | null;
  averageTime: number | null;
  medianTime: number | null;

  // By breed
  breedStats: BreedStat[];

  // By judge
  judgeStats: JudgeStat[];

  // Clean sweep dogs (show-level only)
  cleanSweepDogs: CleanSweepDog[];

  // Fastest times leaderboard
  fastestTimes: FastestTimeEntry[];
}

// Breed statistics
export interface BreedStat {
  breed: string;
  totalEntries: number;
  qualifiedCount: number;
  nqCount: number;
  qualificationRate: number;
  averageTime: number | null;
  fastestTime: number | null;
}

// Judge statistics
export interface JudgeStat {
  judgeName: string | null;  // Can be null for TBD judges
  classesJudged: number;
  totalEntries: number;
  qualifiedCount: number;
  qualificationRate: number;
  averageQualifiedTime: number | null;
}

// Clean sweep dog (100% qualification across all elements)
export interface CleanSweepDog {
  armbandNumber: string;
  dogCallName: string;
  handlerName: string;
  dogBreed: string;
  elementsEntered: number;
  elementsQualified: number;
  elementsList: string[];
}

// Fastest time entry with tie handling
export interface FastestTimeEntry {
  entryId: string;
  armbandNumber: string;
  dogCallName: string;
  handlerName: string;
  dogBreed: string;
  searchTimeSeconds: number;
  timeRank: number;  // Same rank for ties
  element?: string;
  level?: string;
}

// Filter state
export interface StatsFilters {
  breed: string | null;
  judge: string | null;
  trialDate: string | null;    // ISO date string (YYYY-MM-DD)
  trialNumber: number | null;   // Trial number within the show
  element: string | null;       // Container, Handler Discrimination, etc.
  level: string | null;         // Novice, Advanced, Excellent, Masters
  classId: number | null;       // Specific class ID for filtering
}

// Navigation level
export type StatsLevel = 'show' | 'trial' | 'class';

// Stats context for different levels
export interface StatsContext {
  level: StatsLevel;
  showId?: string;
  trialId?: string;
  classId?: string;
  filters: StatsFilters;
}

// Chart data formats for Recharts
export interface PieChartData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface BarChartData {
  name: string;
  value: number;
  percentage?: number;
  color?: string;
}

// API response from database views
export interface StatsQueryResult {
  show_id?: string;
  show_name?: string;
  trial_id?: string;
  trial_name?: string;
  trial_date?: string;
  class_id?: string;
  element?: string;
  level?: string;
  judge_name?: string | null;
  entry_id?: string;
  armband_number?: string;
  dog_call_name?: string;
  dog_breed?: string;
  handler_name?: string;
  result_status?: string;
  is_scored?: boolean;
  search_time_seconds?: number | null;
  is_qualified?: number;
  valid_time?: number | null;
}

export interface BreedStatsQueryResult {
  license_key: string;
  show_id?: string;
  trial_id?: string;
  class_id?: string;
  dog_breed: string;
  total_entries: number;
  qualified_count: number;
  nq_count: number;
  excused_count: number;
  absent_count: number;
  withdrawn_count: number;
  qualification_rate: number;
  fastest_time: number | null;
  avg_time: number | null;
  qualified_times_array: number[] | null;
}

export interface JudgeStatsQueryResult {
  license_key: string;
  show_id?: string;
  trial_id?: string;
  judge_name: string | null;
  classes_judged: number;
  total_entries: number;
  qualified_count: number;
  qualification_rate: number;
  avg_qualified_time: number | null;
}

export interface CleanSweepQueryResult {
  license_key: string;
  show_id?: string;
  trial_id?: string;
  armband_number: string;
  dog_call_name: string;
  handler_name: string;
  dog_breed: string;
  elements_entered: number;
  elements_qualified: number;
  elements_list: string[];
  is_clean_sweep: boolean;
}

export interface FastestTimesQueryResult {
  license_key: string;
  show_id?: string;
  trial_id?: string;
  class_id?: string;
  entry_id: string;
  armband_number: string;
  dog_call_name: string;
  dog_breed: string;
  handler_name: string;
  search_time_seconds: number;
  element?: string;
  level?: string;
  time_rank: number;
}