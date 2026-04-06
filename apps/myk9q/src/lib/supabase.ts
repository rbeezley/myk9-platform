import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';

// Get environment variables (with safe access for test environments)
const supabaseUrl =
  typeof import.meta !== 'undefined'
    ? import.meta.env?.VITE_SUPABASE_URL
    : process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  typeof import.meta !== 'undefined'
    ? import.meta.env?.VITE_SUPABASE_ANON_KEY
    : process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error('❌ Missing Supabase environment variables!');
  logger.error('📝 Please create a .env.local file with:');
  logger.error('   VITE_SUPABASE_URL=your_supabase_project_url');
  logger.error('   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key');
  logger.error('💡 See .env.example for template');
  throw new Error(
    'Missing Supabase environment variables. Please check console for setup instructions.'
  );
}

// Track current license key for header injection
let currentLicenseKey: string | null = null;

// Custom fetch that adds x-license-key header to all requests
// This enables RLS policies to filter by license_key at the database level
const customFetch = (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers);

  if (currentLicenseKey) {
    headers.set('x-license-key', currentLicenseKey);
  }

  return fetch(url, { ...options, headers });
};

// Create Supabase client with custom fetch for RLS header injection
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch,
  },
});

/**
 * Set the license key for RLS filtering
 * Call this after login to enable server-side tenant isolation
 *
 * @param licenseKey - The license key for the current show, or null to clear
 */
export const setSupabaseLicenseKey = (licenseKey: string | null): void => {
  currentLicenseKey = licenseKey;
  // Logging is handled by AuthContext to avoid console.log lint warnings
};

/**
 * Get the current license key (for debugging/logging)
 */
export const getSupabaseLicenseKey = (): string | null => currentLicenseKey;

// Database types based on actual platform schema
export interface ShowQueue {
  id: number;
  license_key: string;
  name: string;
  club_id: string;
  type: string;
  status: string;
  organization: string | null;
  description: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface TrialQueue {
  id: number;
  show_id: number;
  name: string;
  date: string;
  trial_number: string;
  status: string;
  // NOTE: Counter fields removed in migration 016 - calculate on-demand
  planned_start_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassQueue {
  id: number;
  trial_id: number;
  name: string;
  description: string | null;
  element: string;
  level: string;
  section: string;
  judge_name: string | null;
  time_limit_seconds: number;
  num_areas: number;
  self_checkin_enabled: boolean;
  is_scoring_finalized: boolean;
  status: string;
  // NOTE: Counter fields removed in migration 016 - calculate on-demand
  // See ClassList.tsx and useTVData.ts for examples
  actual_start_time: string | null;
  actual_end_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryQueue {
  id: number;
  class_id: number;
  armband: number;
  handler: string;
  run_order: number;
  entry_status: string;
  section: string | null;
  // Scoring fields (merged from results table on platform)
  is_scored: boolean;
  is_in_ring: boolean;
  result_status: string | null;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  area1_time_seconds: number | null;
  area2_time_seconds: number | null;
  area3_time_seconds: number | null;
  area4_time_seconds: number | null;
  total_correct_finds: number | null;
  total_incorrect_finds: number | null;
  no_finish_count: number | null;
  area1_correct: number | null;
  area1_incorrect: number | null;
  area1_faults: number | null;
  area2_correct: number | null;
  area2_incorrect: number | null;
  area2_faults: number | null;
  area3_correct: number | null;
  area3_incorrect: number | null;
  area3_faults: number | null;
  total_score: number | null;
  points_earned: number | null;
  points_possible: number | null;
  has_video_review: boolean | null;
  bonus_points: number | null;
  penalty_points: number | null;
  time_over_limit: boolean | null;
  time_limit_exceeded_seconds: number | null;
  ring_entry_time: string | null;
  ring_exit_time: string | null;
  scoring_started_at: string | null;
  scoring_completed_at: string | null;
  disqualification_reason: string | null;
  judge_notes: string | null;
  video_review_notes: string | null;
  judge_signature: string | null;
  judge_signature_timestamp: string | null;
  created_at: string;
  updated_at: string;
}
