/**
 * @myk9/supabase
 *
 * Supabase client and utilities for the myK9 Platform.
 */

// Client
export {
  initSupabase,
  getSupabase,
  setLicenseKey,
  getLicenseKey,
  isSupabaseInitialized,
  type SupabaseConfig,
  type SupabaseClient,
} from './client';

// React hooks
export { useSupabase } from './hooks/useSupabase';

// Re-export useful types from @supabase/supabase-js
export type {
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
  PostgrestMaybeSingleResponse,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
