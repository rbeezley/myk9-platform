/**
 * Replication Configuration and Control
 *
 * This module provides centralized control over the replication system,
 * allowing it to be disabled when database corruption is detected.
 */

import { logger } from '@/utils/logger';

const REPLICATION_DISABLED_KEY = 'myK9Q_replication_disabled';
const REPLICATION_DISABLED_UNTIL_KEY = 'myK9Q_replication_disabled_until';

export interface ReplicationStatus {
  enabled: boolean;
  reason?: string;
  disabledUntil?: number;
}

/**
 * Check if replication is currently enabled
 */
export function isReplicationEnabled(): boolean {
  // Check if permanently disabled
  const disabled = localStorage.getItem(REPLICATION_DISABLED_KEY);
  if (disabled === 'true') {
    logger.warn('[ReplicationConfig] Replication is permanently disabled');
    return false;
  }

  // Check if temporarily disabled
  const disabledUntil = localStorage.getItem(REPLICATION_DISABLED_UNTIL_KEY);
  if (disabledUntil) {
    const until = parseInt(disabledUntil, 10);
    const now = Date.now();

    // Check if the timeout has expired
    if (now >= until) {
      // Timeout expired, re-enable
localStorage.removeItem(REPLICATION_DISABLED_UNTIL_KEY);
      return true;
    }

    // Still disabled - calculate remaining time
    const remainingMs = until - now;
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    // Sanity check: if disabled for more than 24 hours from when it was set, it's likely invalid
    // But we can't know when it was set, so just check if it's more than 24 hours in total
    if (remainingMs > (24 * 60 * 60 * 1000)) {
      logger.warn(`[ReplicationConfig] Disable time seems excessive (${remainingMinutes} minutes remaining), clearing...`);
      localStorage.removeItem(REPLICATION_DISABLED_UNTIL_KEY);
      return true;
    }

    logger.warn(`[ReplicationConfig] Replication disabled for ${remainingMinutes} more minute(s) until ${new Date(until).toLocaleString()}`);
    return false;
  }

  return true;
}

/**
 * Disable replication permanently (until manually re-enabled)
 */
export function disableReplication(reason: string = 'Manual disable'): void {
  localStorage.setItem(REPLICATION_DISABLED_KEY, 'true');
  logger.error(`[ReplicationConfig] ❌ Replication DISABLED: ${reason}`);
}

/**
 * Disable replication temporarily
 */
export function disableReplicationTemporarily(minutes: number = 5, reason: string = 'Temporary disable'): void {
  const until = Date.now() + (minutes * 60 * 1000);
  localStorage.setItem(REPLICATION_DISABLED_UNTIL_KEY, until.toString());
  logger.warn(`[ReplicationConfig] ⏸️ Replication disabled for ${minutes} minutes: ${reason}`);
}

/**
 * Enable replication
 */
export function enableReplication(): void {
  localStorage.removeItem(REPLICATION_DISABLED_KEY);
  localStorage.removeItem(REPLICATION_DISABLED_UNTIL_KEY);
}

/**
 * Clear any expired temporary disable
 */
export function clearExpiredDisable(): boolean {
  const disabledUntil = localStorage.getItem(REPLICATION_DISABLED_UNTIL_KEY);
  if (disabledUntil) {
    const until = parseInt(disabledUntil, 10);
    if (Date.now() >= until) {
      localStorage.removeItem(REPLICATION_DISABLED_UNTIL_KEY);
return true;
    }
  }
  return false;
}

/**
 * Auto-clear replication disabled flags in development mode
 * This prevents HMR/reload false positives from blocking development
 */
export function clearDevelopmentDisableFlags(): void {
  if (process.env.NODE_ENV === 'development') {
    const wasDisabled = localStorage.getItem(REPLICATION_DISABLED_KEY);
    const wasTemporarilyDisabled = localStorage.getItem(REPLICATION_DISABLED_UNTIL_KEY);

    if (wasDisabled || wasTemporarilyDisabled) {
      localStorage.removeItem(REPLICATION_DISABLED_KEY);
      localStorage.removeItem(REPLICATION_DISABLED_UNTIL_KEY);
}
  }
}

/**
 * Get current replication status
 */
export function getReplicationStatus(): ReplicationStatus {
  if (!isReplicationEnabled()) {
    const disabled = localStorage.getItem(REPLICATION_DISABLED_KEY);
    const disabledUntil = localStorage.getItem(REPLICATION_DISABLED_UNTIL_KEY);

    return {
      enabled: false,
      reason: disabled === 'true' ? 'Permanently disabled' : 'Temporarily disabled',
      disabledUntil: disabledUntil ? parseInt(disabledUntil, 10) : undefined
    };
  }

  return { enabled: true };
}

/**
 * Handle database corruption by disabling replication
 */
export function handleDatabaseCorruption(): void {
  // Allow recovery in both development and production
  // Note: Previously disabled in dev to prevent HMR false positives, but we need
  // the recovery mechanism to work. The init() race condition fixes should prevent
  // false corruption detection.
  logger.error('[ReplicationConfig] 🚨 Database corruption detected - disabling replication');

  // Disable for 5 minutes to allow recovery
  disableReplicationTemporarily(5, 'Database corruption detected - allowing recovery time');

  // Clear all IndexedDB databases
  if (typeof indexedDB !== 'undefined') {
    indexedDB.databases?.().then(dbs => {
      dbs.forEach(db => {
        if (db.name?.startsWith('myK9Q')) {
          indexedDB.deleteDatabase(db.name);
}
      });
    }).catch(err => {
      logger.error('[ReplicationConfig] Failed to clear databases:', err);
    });
  }
}