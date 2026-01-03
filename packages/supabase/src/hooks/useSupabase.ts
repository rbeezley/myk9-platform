/**
 * React Hook for Supabase
 *
 * Provides access to the Supabase client in React components.
 */

import { useMemo } from 'react';
import { getSupabase, isSupabaseInitialized } from '../client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Hook to access the Supabase client
 *
 * @throws Error if Supabase is not initialized
 * @returns The Supabase client instance
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const supabase = useSupabase();
 *
 *   const fetchData = async () => {
 *     const { data, error } = await supabase
 *       .from('entries')
 *       .select('*');
 *   };
 * }
 * ```
 */
export function useSupabase(): SupabaseClient {
  // useMemo ensures we don't call getSupabase on every render
  return useMemo(() => {
    if (!isSupabaseInitialized()) {
      throw new Error(
        'Supabase client not initialized. Make sure to call initSupabase() in your app entry point.'
      );
    }
    return getSupabase();
  }, []);
}
