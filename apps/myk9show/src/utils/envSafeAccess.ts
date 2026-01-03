/**
 * Environment Variable Safe Access Utility
 * 
 * Provides type-safe access to environment variables when using
 * noPropertyAccessFromIndexSignature TypeScript option
 */

interface ImportMetaEnv {
  readonly NODE_ENV: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ENABLE_RUM?: string;
  readonly VITE_PERFORMANCE_MODE?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

// Type-safe environment variable access
export const env = {
  NODE_ENV: import.meta.env['NODE_ENV'] as string,
  DEV: import.meta.env['DEV'] as boolean,
  PROD: import.meta.env['PROD'] as boolean,
  VITE_SUPABASE_URL: import.meta.env['VITE_SUPABASE_URL'] as string | undefined,
  VITE_SUPABASE_ANON_KEY: import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined,
  VITE_ENABLE_RUM: import.meta.env['VITE_ENABLE_RUM'] as string | undefined,
  VITE_PERFORMANCE_MODE: import.meta.env['VITE_PERFORMANCE_MODE'] as string | undefined,
} as const;

// Helper functions for common environment checks
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isProduction = () => env.NODE_ENV === 'production';
export const isTest = () => env.NODE_ENV === 'test';

// Feature flag helpers
export const isRUMEnabled = () => env.VITE_ENABLE_RUM === 'true';
export const isPerformanceModeEnabled = () => env.VITE_PERFORMANCE_MODE === 'true';
export const hasSupabaseConfig = () => !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);

// Safe environment variable getter with fallback
export function getEnvVar(key: keyof ImportMetaEnv, fallback?: string): string | undefined {
  return import.meta.env[key] as string | undefined ?? fallback;
}

// Required environment variable getter (throws if missing)
export function getRequiredEnvVar(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value) {
    throw new Error(`Required environment variable ${key} is not defined`);
  }
  return value;
}