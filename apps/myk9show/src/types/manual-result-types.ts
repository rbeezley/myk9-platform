/**
 * App-level types for manual results (historical results from non-platform trials).
 * These feed into the title tracking engine alongside platform-scored results.
 */

export type ManualResultStatus = 'qualified' | 'nq' | 'absent' | 'excused' | 'withdrawn';

export interface ManualResult {
  id: string;
  dog_id: string;
  owner_id: string;
  organization: string;
  sport_template_id: string | null;
  show_name: string;
  trial_date: string;
  judge: string | null;
  location: string | null;
  element: string;
  level: string;
  section: string | null;
  result_status: ManualResultStatus;
  search_time_seconds: number | null;
  placement: number | null;
  points_earned: number;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export type CreateManualResultData = Omit<ManualResult, 'id' | 'created_at' | 'updated_at'>;
export type UpdateManualResultData = Partial<CreateManualResultData>;
