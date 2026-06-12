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

// Database types (generated from Supabase schema)
export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './types/database.types';
export { Constants } from './types/database.types';

// Re-export useful types from @supabase/supabase-js
export type {
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
  PostgrestMaybeSingleResponse,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
