import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from './dependencies';

export interface MutationUploadAuthContext {
  authUserId: string;
  supabaseClient: SupabaseClient;
}

export interface MutationManagerOptions {
  /** Maximum retry attempts for failed mutations (default: 3). */
  maxRetries?: number;
  /** Exponential backoff base delay in ms (default: 1000). */
  retryBackoffBase?: number;
  /** Lifetime cap on OCC-conflict upload attempts for one mutation (default: 50). */
  maxOccAttempts?: number;
  logger?: Logger;
  /** Resolve the auth identity that owns local queue actions. */
  getCurrentUserId?: () => Promise<string | null>;
  /** Resolve a request client pinned to the same auth session as its owner id. */
  getCurrentUploadContext?: () => Promise<MutationUploadAuthContext | null>;
}
