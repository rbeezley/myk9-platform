import { RoleSyncScopes } from '@/types/sync-types';

/**
 * Selective sync scopes by user role
 * Prevents downloading thousands of records to every new user
 */
export const SYNC_SCOPES: RoleSyncScopes = {
  NEW_USER: {
    people: { scope: 'own', limit: 1 },
    dogs: { scope: 'none', limit: 0 },
    shows: { scope: 'upcoming-nearby', limit: 10 },
    trials: { scope: 'none', limit: 0 },
    classes: { scope: 'none', limit: 0 },
    entries: { scope: 'none', limit: 0 }
  },
  EXHIBITOR: {
    people: { scope: 'own', limit: 1 },
    dogs: { scope: 'own', limit: 50 },
    shows: { scope: 'upcoming-entered', limit: 20 },
    trials: { scope: 'show-specific', limit: 100 },
    classes: { scope: 'trial-specific', limit: 500 },
    entries: { scope: 'own-active', limit: 100 }
  },
  JUDGE: {
    people: { scope: 'own', limit: 1 },
    dogs: { scope: 'by-assignment', limit: 500 },
    shows: { scope: 'assigned', limit: 10 },
    trials: { scope: 'assigned', limit: 50 },
    classes: { scope: 'assigned', limit: 200 },
    entries: { scope: 'assigned-classes', limit: 1000 }
  },
  SECRETARY: {
    people: { scope: 'show-participants', limit: 2000 },
    dogs: { scope: 'show-entered', limit: 2000 },
    shows: { scope: 'managing', limit: 5 },
    trials: { scope: 'show-specific', limit: 50 },
    classes: { scope: 'trial-specific', limit: 500 },
    entries: { scope: 'show-all', limit: 5000 }
  },
  ADMIN: {
    people: { scope: 'all', limit: 10000 },
    dogs: { scope: 'all', limit: 10000 },
    shows: { scope: 'all', limit: 100 },
    trials: { scope: 'all', limit: 500 },
    classes: { scope: 'all', limit: 2000 },
    entries: { scope: 'all', limit: 20000 }
  }
};

/**
 * Storage size estimates per entity type (in KB)
 */
export const ENTITY_SIZE_ESTIMATES = {
  person: 2, // 2KB average
  dog: 5,    // 5KB with photo reference
  show: 10,  // 10KB with all metadata
  entry: 1,  // 1KB per entry
  class: 3,  // 3KB per class
  club: 8    // 8KB with all metadata
} as const;

/**
 * Sync priority levels
 */
export enum SyncPriority {
  CRITICAL = 1,  // User-initiated actions
  HIGH = 2,      // Real-time updates (scoring, check-in)
  NORMAL = 3,    // Regular updates
  LOW = 4,       // Background sync
  ARCHIVE = 5    // Historical data
}

/**
 * Sync timing configuration
 */
export const SYNC_TIMING = {
  IMMEDIATE: 0,           // Process immediately when online
  QUICK: 5000,           // 5 seconds
  PERIODIC: 300000,      // 5 minutes
  BACKGROUND: 1800000,   // 30 minutes
  DAILY: 86400000        // 24 hours
} as const;

/**
 * Storage quotas and limits
 */
export const STORAGE_LIMITS = {
  MAX_STORAGE_MB: 50,           // 50MB per user
  WARNING_THRESHOLD: 0.8,       // Warn at 80% usage
  CRITICAL_THRESHOLD: 0.95,     // Start aggressive cleanup at 95%
  MIN_FREE_SPACE_MB: 2,         // Always keep 2MB free
  CACHE_TTL_DAYS: 30,           // Cache entries expire after 30 days
  ARCHIVE_AFTER_DAYS: 90        // Archive old shows after 90 days
} as const;