/**
 * Supabase Client Factory
 *
 * Creates a configurable Supabase client with license key header injection
 * for multi-tenant RLS policies.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@myk9/core';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

// Track current license key for header injection
let currentLicenseKey: string | null = null;

// Singleton client instance
let clientInstance: SupabaseClient | null = null;
let clientConfig: SupabaseConfig | null = null;

/**
 * Custom fetch that adds x-license-key header to all requests
 * This enables RLS policies to filter by license_key at the database level
 */
const createCustomFetch = () => {
  return (url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers);

    if (currentLicenseKey) {
      headers.set('x-license-key', currentLicenseKey);
    }

    return fetch(url, { ...options, headers });
  };
};

/**
 * Initialize the Supabase client
 *
 * Must be called once at app startup with configuration.
 * Subsequent calls will return the same client instance.
 *
 * @param config - Supabase URL and anon key
 * @returns The Supabase client instance
 *
 * @example
 * ```ts
 * // In app entry point
 * initSupabase({
 *   url: import.meta.env.VITE_SUPABASE_URL,
 *   anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
 * });
 * ```
 */
export function initSupabase(config: SupabaseConfig): SupabaseClient {
  if (!config.url || !config.anonKey) {
    logger.error('❌ Missing Supabase configuration!');
    logger.error('📝 Please provide url and anonKey');
    throw new Error('Missing Supabase configuration');
  }

  // If already initialized with same config, return existing instance
  if (clientInstance && clientConfig?.url === config.url && clientConfig?.anonKey === config.anonKey) {
    return clientInstance;
  }

  // Store config for comparison
  clientConfig = config;

  // Create client with custom fetch for RLS header injection
  clientInstance = createClient(config.url, config.anonKey, {
    global: {
      fetch: createCustomFetch(),
    },
  });

  return clientInstance;
}

/**
 * Get the Supabase client instance
 *
 * @throws Error if initSupabase() hasn't been called
 * @returns The Supabase client instance
 */
export function getSupabase(): SupabaseClient {
  if (!clientInstance) {
    throw new Error('Supabase client not initialized. Call initSupabase() first.');
  }
  return clientInstance;
}

/**
 * Set the license key for RLS filtering
 * Call this after login to enable server-side tenant isolation
 *
 * @param licenseKey - The license key for the current show, or null to clear
 */
export function setLicenseKey(licenseKey: string | null): void {
  currentLicenseKey = licenseKey;
  logger.debug(`[Supabase] License key ${licenseKey ? 'set' : 'cleared'}`);
}

/**
 * Get the current license key
 */
export function getLicenseKey(): string | null {
  return currentLicenseKey;
}

/**
 * Check if the Supabase client is initialized
 */
export function isSupabaseInitialized(): boolean {
  return clientInstance !== null;
}

// Re-export SupabaseClient type for convenience
export type { SupabaseClient };
