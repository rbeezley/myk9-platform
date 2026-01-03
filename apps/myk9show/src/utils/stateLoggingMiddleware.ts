/**
 * State Logging Middleware for Zustand stores
 * Provides comprehensive state change tracking and debugging capabilities
 */

import { logger } from '../services/LoggingService';
import { StateCreator, StoreMutatorIdentifier } from 'zustand';

/**
 * Configuration for state logging
 */
export interface StateLoggingConfig {
  /** Whether to enable state change logging */
  enabled?: boolean;
  /** Store name for identification in logs */
  storeName?: string;
  /** Whether to log full state or just changes */
  logFullState?: boolean;
  /** Maximum depth for object serialization */
  maxDepth?: number;
  /** Fields to exclude from logging (for sensitive data) */
  excludeFields?: string[];
  /** Whether to log state differences */
  logDifferences?: boolean;
  /** Throttle logging (ms) to prevent spam */
  throttleMs?: number;
}

/**
 * State change event details
 */
export interface StateChangeEvent {
  storeName: string;
  timestamp: number;
  action: string;
  previousState: unknown;
  nextState: unknown;
  changes: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
}

/**
 * State logging middleware for Zustand
 */
export interface StateLogging {
  <
    T,
    Mps extends [StoreMutatorIdentifier, unknown][] = [],
    Mcs extends [StoreMutatorIdentifier, unknown][] = []
  >(
    f: StateCreator<T, Mps, Mcs>,
    config?: StateLoggingConfig
  ): StateCreator<T, Mps, Mcs>;
}

/**
 * Create state logging middleware with configuration
 */
export const createStateLoggingMiddleware = (defaultConfig?: StateLoggingConfig): StateLogging => {
  const lastLogTime = new Map<string, number>();
  const stateHistory = new Map<string, unknown[]>();

  return (f, config) => {
    const finalConfig: Required<StateLoggingConfig> = {
      enabled: true,
      storeName: 'unknown',
      logFullState: false,
      maxDepth: 3,
      excludeFields: ['password', 'token', 'secret'],
      logDifferences: true,
      throttleMs: 100,
      ...defaultConfig,
      ...config,
    };

    return (set, get, api) => {
      const originalSet = set;
      let previousState = get();

      // Store initial state
      if (finalConfig.enabled) {
        if (!stateHistory.has(finalConfig.storeName)) {
          stateHistory.set(finalConfig.storeName, []);
        }
        
        const sanitizedState = sanitizeState(previousState, finalConfig);
        stateHistory.get(finalConfig.storeName)!.push({
          timestamp: Date.now(),
          state: sanitizedState,
          action: 'INITIAL_STATE'
        });

        logger.debug(`Store initialized: ${finalConfig.storeName}`, 'state-change', {
          storeName: finalConfig.storeName,
          initialState: sanitizedState
        });
      }

      const wrappedSet = (partial: unknown, replace?: boolean) => {
        if (!finalConfig.enabled) {
          (originalSet as (partial: unknown, replace?: boolean) => void)(partial, replace);
          return;
        }

        // Check throttling
        const now = Date.now();
        const lastLog = lastLogTime.get(finalConfig.storeName) || 0;
        const shouldLog = now - lastLog >= finalConfig.throttleMs;

        if (!shouldLog) {
          (originalSet as (partial: unknown, replace?: boolean) => void)(partial, replace);
          return;
        }

        const prevState = get();
        (originalSet as (partial: unknown, replace?: boolean) => void)(partial, replace);
        const nextState = get();

        lastLogTime.set(finalConfig.storeName, now);

        // Log state change
        logStateChange(
          finalConfig.storeName,
          prevState,
          nextState,
          finalConfig,
          detectAction(partial)
        );

        // Update state history
        const history = stateHistory.get(finalConfig.storeName)!;
        history.push({
          timestamp: now,
          state: sanitizeState(nextState, finalConfig),
          action: detectAction(partial)
        });

        // Keep only last 50 entries
        if (history.length > 50) {
          history.splice(0, history.length - 50);
        }

        previousState = nextState;
      };

      return f(wrappedSet as Parameters<typeof f>[0], get, api);
    };
  };
};

/**
 * Detect the action being performed based on the partial update
 */
function detectAction(partial: unknown): string {
  if (typeof partial === 'function') {
    return 'FUNCTION_UPDATE';
  }

  if (typeof partial === 'object' && partial !== null) {
    const keys = Object.keys(partial);
    
    // Common action patterns
    if (keys.includes('isLoading')) {
      return (partial as { isLoading: boolean }).isLoading ? 'START_LOADING' : 'STOP_LOADING';
    }
    
    if (keys.includes('error')) {
      return (partial as { error: unknown }).error ? 'SET_ERROR' : 'CLEAR_ERROR';
    }

    if (keys.length === 1) {
      const key = keys[0];
      const value = (partial as Record<string, unknown>)[key];

      // Array operations
      if (Array.isArray(value)) {
        return `UPDATE_${key.toUpperCase()}`;
      }

      // Object operations
      if (typeof value === 'object' && value !== null) {
        return `SET_${key.toUpperCase()}`;
      }

      // Simple value updates
      return `UPDATE_${key.toUpperCase()}`;
    }

    if (keys.length > 1) {
      return 'BATCH_UPDATE';
    }
  }

  return 'UNKNOWN_ACTION';
}

/**
 * Sanitize state by removing sensitive fields and limiting depth
 */
function sanitizeState(state: unknown, config: StateLoggingConfig, depth = 0): unknown {
  if (depth >= (config.maxDepth || 3)) {
    return '[Max Depth Reached]';
  }

  if (state === null || state === undefined) {
    return state;
  }

  if (typeof state !== 'object') {
    return state;
  }

  if (Array.isArray(state)) {
    return state.slice(0, 10).map(item => sanitizeState(item, config, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  const excludeFields = config.excludeFields || [];

  for (const [key, value] of Object.entries(state)) {
    if (excludeFields.includes(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeState(value, config, depth + 1);
    }
  }

  return sanitized;
}

/**
 * Calculate differences between two states
 */
function calculateStateDifferences(previous: unknown, next: unknown, path = ''): Record<string, { from: unknown; to: unknown }> {
  const differences: Record<string, { from: unknown; to: unknown }> = {};

  if (previous === next) {
    return differences;
  }

  if (typeof previous !== 'object' || typeof next !== 'object' || previous === null || next === null) {
    differences[path || 'root'] = { from: previous, to: next };
    return differences;
  }

  // Handle arrays
  if (Array.isArray(previous) || Array.isArray(next)) {
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      differences[path || 'root'] = { from: previous, to: next };
    }
    return differences;
  }

  // Handle objects
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const prevValue = (previous as Record<string, unknown>)[key];
    const nextValue = (next as Record<string, unknown>)[key];

    if (prevValue !== nextValue) {
      if (typeof prevValue === 'object' && typeof nextValue === 'object' && 
          prevValue !== null && nextValue !== null && 
          !Array.isArray(prevValue) && !Array.isArray(nextValue)) {
        Object.assign(differences, calculateStateDifferences(prevValue, nextValue, currentPath));
      } else {
        differences[currentPath] = { from: prevValue, to: nextValue };
      }
    }
  }

  return differences;
}

/**
 * Log state change with comprehensive details
 */
function logStateChange(
  storeName: string,
  previousState: unknown,
  nextState: unknown,
  config: StateLoggingConfig,
  action: string
): void {
  const sanitizedPrevious = sanitizeState(previousState, config);
  const sanitizedNext = sanitizeState(nextState, config);
  
  const changes = config.logDifferences
    ? calculateStateDifferences(sanitizedPrevious, sanitizedNext)
    : {};

  // StateChangeEvent for potential future use
  // const event: StateChangeEvent = {
  //   storeName,
  //   timestamp: Date.now(),
  //   action,
  //   previousState: config.logFullState ? sanitizedPrevious : undefined,
  //   nextState: config.logFullState ? sanitizedNext : undefined,
  //   changes,
  // };

  const changeCount = Object.keys(changes).length;

  logger.debug(`State changed in ${storeName}: ${action}`, 'state-change', {
    storeName,
    action,
    changeCount,
    changedFields: Object.keys(changes),
    changes: changeCount <= 5 ? changes : '[Too many changes]',
    ...(config.logFullState && { 
      previousState: sanitizedPrevious, 
      nextState: sanitizedNext 
    })
  });

  // Log warnings for large state changes
  if (changeCount > 10) {
    logger.warn(`Large state change detected in ${storeName}`, 'state-performance', {
      storeName,
      action,
      changeCount,
      recommendation: 'Consider batching updates or optimizing state structure'
    });
  }
}

/**
 * Get state history for a specific store
 */
export function getStateHistory(storeName: string): unknown[] {
  const history = stateHistory.get(storeName);
  return history ? [...history] : [];
}

/**
 * Clear state history for a specific store
 */
export function clearStateHistory(storeName: string): void {
  stateHistory.delete(storeName);
  logger.debug(`State history cleared for ${storeName}`, 'state-change');
}

/**
 * Clear all state histories
 */
export function clearAllStateHistories(): void {
  stateHistory.clear();
  lastLogTime.clear();
  logger.debug('All state histories cleared', 'state-change');
}

/**
 * Get summary of all store activities
 */
export function getStateActivitySummary(): Record<string, {
  totalChanges: number;
  lastActivity: number;
  mostRecentAction: string;
}> {
  const summary: Record<string, { totalChanges: number; lastActivity: number; mostRecentAction: string }> = {};

  for (const [storeName, history] of stateHistory.entries()) {
    if (history.length > 0) {
      const lastEntry = history[history.length - 1] as { timestamp: number; action: string };
      summary[storeName] = {
        totalChanges: history.length - 1, // Exclude initial state
        lastActivity: lastEntry.timestamp,
        mostRecentAction: lastEntry.action
      };
    }
  }

  return summary;
}

/**
 * Default state logging middleware with sensible defaults
 */
export const stateLogging = createStateLoggingMiddleware({
  enabled: import.meta.env.DEV, // Only enable in development by default
  logFullState: false,
  logDifferences: true,
  maxDepth: 3,
  throttleMs: 100,
  excludeFields: ['password', 'token', 'secret', 'apiKey']
});

/**
 * Production-safe state logging middleware
 */
export const productionStateLogging = createStateLoggingMiddleware({
  enabled: true,
  logFullState: false,
  logDifferences: false, // Only log action names in production
  maxDepth: 1,
  throttleMs: 1000, // More aggressive throttling
  excludeFields: ['password', 'token', 'secret', 'apiKey', 'email', 'phone']
});

/**
 * Debug state logging middleware with full details
 */
export const debugStateLogging = createStateLoggingMiddleware({
  enabled: true,
  logFullState: true,
  logDifferences: true,
  maxDepth: 5,
  throttleMs: 0, // No throttling for debugging
  excludeFields: ['password', 'token', 'secret']
});

// State history storage
const stateHistory = new Map<string, unknown[]>();
const lastLogTime = new Map<string, number>();