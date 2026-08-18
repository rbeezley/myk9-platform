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

// Database connection health check
export const checkDatabaseConnection = async (): Promise<{
  connected: boolean;
  error?: string;
  latency?: number;
}> => {
  const startTime = Date.now();

  try {
    // Simple query to test connection
    const { error } = await supabase.from('clubs').select('id').limit(1);

    const latency = Date.now() - startTime;

    if (error) {
      return {
        connected: false,
        error: error.message,
        latency,
      };
    }

    return {
      connected: true,
      latency,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown connection error',
      latency: Date.now() - startTime,
    };
  }
};

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

// Authentication utilities
export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

// Batch operation utilities
export const executeBatch = async <T>(
  operations: Array<() => Promise<T>>
): Promise<Array<{ success: boolean; data?: T; error?: DatabaseError }>> => {
  const results = await Promise.allSettled(operations.map(op => op()));

  return results.map(result => {
    if (result.status === 'fulfilled') {
      return { success: true, data: result.value };
    } else {
      return {
        success: false,
        error: createDatabaseError(result.reason),
      };
    }
  });
};

// Connection pool status (informational)
export const getConnectionInfo = () => ({
  url: supabaseUrl,
  hasValidConfig: !!(supabaseUrl && supabaseAnonKey),
  environment: import.meta.env.MODE || 'development',
});

export default supabase;
