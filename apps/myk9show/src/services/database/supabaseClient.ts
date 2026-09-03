// Centralized Supabase client configuration
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';
import { logger } from '@/services/LoggingService';
import { createDatabaseError, type DatabaseError } from './databaseError';

// Environment variables with fallbacks
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validate environment variables
if (!supabaseUrl) {
  throw new Error('Missing environment variable: VITE_SUPABASE_URL');
}

if (!supabaseAnonKey) {
  throw new Error('Missing environment variable: VITE_SUPABASE_ANON_KEY');
}

// Create typed Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'myK9Show@1.0.0',
    },
  },
});

/** Creates a request client whose authorization cannot change with the shared auth session. */
export const createSessionBoundSupabaseClient = (accessToken: string) =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => accessToken,
    db: { schema: 'public' },
    global: { headers: { 'X-Client-Info': 'myK9Show@1.0.0' } },
  });

// Database query logging utility (development only)
export const logQuery = (table: string, operation: string, duration: number, error?: string) => {
  if (import.meta.env.DEV) {
    // Development logging (unused in production)
    const logData = {
      timestamp: new Date().toISOString(),
      table,
      operation,
      duration: `${duration}ms`,
      status: error ? 'ERROR' : 'SUCCESS',
      ...(error && { error }),
    };

    logger.debug(
      `🗄️ DB Query [${operation.toUpperCase()}]: ${table} (${duration}ms) ${error ? `❌ ${error}` : '✅'}`,
      'database',
      logData
    );
  }
};

// Type-safe error handling. Defined in a client-free module so tests can import
// the real implementation without constructing a Supabase client (MYK9-177);
// re-exported here because every call site imports it from this module.
export { createDatabaseError };
export type { DatabaseError };

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

// Connection pool status (informational)
export const getConnectionInfo = () => ({
  url: supabaseUrl,
  hasValidConfig: !!(supabaseUrl && supabaseAnonKey),
  environment: import.meta.env.MODE || 'development',
});

export default supabase;
