/**
 * Test-specific Supabase client configuration
 * Handles RLS policies and authentication for testing
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';
import { logger } from '@/services/LoggingService';

// Use environment variables for testing
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

// Standard test client (respects RLS policies)
export const testClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// Admin client for bypassing RLS in tests (if service key available)
export const adminClient = supabaseServiceKey 
  ? createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : testClient; // Fallback to regular client if no service key

/**
 * Test authentication helper
 * Creates a temporary test user for tests that need authentication
 */
export async function createTestUser(email?: string, password?: string) {
  const testEmail = email || `test-${Date.now()}@example.com`;
  const testPassword = password || 'testpassword123!';

  try {
    // Try to sign up new user
    const { data: signUpData, error: signUpError } = await testClient.auth.signUp({
      email: testEmail,
      password: testPassword,
    });

    if (signUpError && signUpError.message.includes('already registered')) {
      // User exists, try to sign in
      const { data: signInData, error: signInError } = await testClient.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

      if (signInError) {
        logger.warn('Failed to sign in existing test user:', 'utils', {}, signInError.message as Error);
        return { user: null, session: null, error: signInError };
      }

      return {
        user: signInData.user,
        session: signInData.session,
        error: null,
      };
    }

    if (signUpError) {
      logger.warn('Failed to create test user:', 'utils', {}, signUpError.message as Error);
      return { user: null, session: null, error: signUpError };
    }

    return {
      user: signUpData.user,
      session: signUpData.session,
      error: null,
    };
  } catch (error) {
    logger.warn('Test user creation error:', 'utils', {}, error as Error);
    return {
      user: null,
      session: null,
      error: error as Error,
    };
  }
}

/**
 * Clean up test user
 */
export async function cleanupTestUser() {
  try {
    await testClient.auth.signOut();
  } catch (error) {
    logger.warn('Test cleanup error:', 'utils', {}, error as Error);
  }
}

/**
 * Test data insertion helper that respects RLS
 * Uses the admin client if available, otherwise authenticated client
 */
export async function insertTestData<T>(
  table: string,
  data: Partial<T>,
  useAdmin = false
): Promise<{ data: T | null; error: unknown }> {
  const client = useAdmin && adminClient !== testClient ? adminClient : testClient;
  
  try {
    const { data: result, error } = await client
      .from(table)
      .insert(data)
      .select()
      .single();

    return { data: result as T, error };
  } catch (error) {
    return { data: null, error: error as unknown };
  }
}

/**
 * Test data cleanup helper
 */
export async function cleanupTestData(
  table: string,
  filter: Record<string, unknown>,
  useAdmin = false
): Promise<{ success: boolean; error?: unknown }> {
  const client = useAdmin && adminClient !== testClient ? adminClient : testClient;
  
  try {
    const { error } = await client
      .from(table)
      .delete()
      .match(filter);

    return { success: !error, error };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Check if we have service key for admin operations
 */
export const hasServiceKey = (): boolean => {
  return adminClient !== testClient;
};

/**
 * Test configuration checker
 */
export const validateTestConfig = (): {
  valid: boolean;
  issues: string[];
} => {
  const issues: string[] = [];

  if (!supabaseUrl) {
    issues.push('Missing VITE_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    issues.push('Missing VITE_SUPABASE_ANON_KEY');
  }
  if (!supabaseServiceKey) {
    issues.push('Missing SUPABASE_SERVICE_KEY (tests may fail due to RLS)');
  }

  return {
    valid: issues.length === 0 || issues.length === 1 && issues[0].includes('SERVICE_KEY'),
    issues,
  };
};

export default testClient;