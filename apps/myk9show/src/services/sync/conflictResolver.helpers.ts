import type { ResolutionStrategy, SyncConflict } from '../../types/sync-types';
import type { FieldConflict } from './conflictResolver.types';

/**
 * Deep equality check for two values.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (a == null || b == null) return a === b;

  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!bKeys.includes(key) || !deepEqual(aObj[key], bObj[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Parse timestamp from various formats (number, string, Date).
 */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return isNaN(timestamp) ? null : timestamp;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return null;
}

/**
 * Parse version number from various formats.
 */
export function parseVersion(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const version = parseFloat(value);
    return isNaN(version) ? null : version;
  }
  return null;
}

/**
 * Categorize the type of conflict based on local, remote, and base data.
 */
export function categorizeConflict(
  localData: Record<string, unknown>,
  remoteData: Record<string, unknown>,
  baseData?: Record<string, unknown>
): SyncConflict['conflictType'] {
  if (!baseData) {
    return 'concurrent_edit';
  }

  if (Object.keys(localData).length === 0 || Object.keys(remoteData).length === 0) {
    return 'version_mismatch';
  }

  const localChanged = !deepEqual(localData, baseData);
  const remoteChanged = !deepEqual(remoteData, baseData);

  if (localChanged && remoteChanged) {
    return 'sync_conflict';
  }

  return 'sync_conflict'; // Default
}

/**
 * Analyze an individual field conflict to determine the best resolution strategy.
 */
export function analyzeFieldConflict(
  fieldName: string,
  localValue: unknown,
  remoteValue: unknown,
  baseValue?: unknown
): FieldConflict {
  const conflict: FieldConflict = {
    fieldName,
    localValue,
    remoteValue,
    baseValue,
    suggestion: 'newest_wins',
    confidence: 0.5,
    reason: 'Default resolution',
  };

  // Special handling for common field patterns
  if (fieldName.includes('timestamp') || fieldName.includes('_at')) {
    const localTime = parseTimestamp(localValue);
    const remoteTime = parseTimestamp(remoteValue);

    if (localTime && remoteTime) {
      if (localTime > remoteTime) {
        conflict.suggestion = 'local_wins';
        conflict.reason = 'Local timestamp is more recent';
      } else {
        conflict.suggestion = 'newest_wins';
        conflict.reason = 'Remote timestamp is more recent';
      }
      conflict.confidence = 0.9;
    }
  } else if (fieldName.includes('version') || fieldName === 'v') {
    const localVersion = parseVersion(localValue);
    const remoteVersion = parseVersion(remoteValue);

    if (localVersion !== null && remoteVersion !== null) {
      if (localVersion > remoteVersion) {
        conflict.suggestion = 'local_wins';
        conflict.reason = 'Local version is higher';
      } else {
        conflict.suggestion = 'newest_wins';
        conflict.reason = 'Remote version is higher';
      }
      conflict.confidence = 0.85;
    }
  } else if (typeof localValue === 'string' && typeof remoteValue === 'string') {
    const localLength = localValue.length;
    const remoteLength = remoteValue.length;

    if (Math.abs(localLength - remoteLength) > localLength * 0.5) {
      if (localLength > remoteLength) {
        conflict.suggestion = 'local_wins';
        conflict.reason = 'Local value has more content';
      } else {
        conflict.suggestion = 'newest_wins';
        conflict.reason = 'Remote value has more content';
      }
      conflict.confidence = 0.7;
    }
  } else if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
    conflict.suggestion = 'merge_automatic';
    conflict.reason = 'Arrays can be merged';
    conflict.confidence = 0.8;
  }

  // Three-way merge analysis if base value is available
  if (baseValue !== undefined) {
    if (deepEqual(localValue, baseValue)) {
      conflict.suggestion = 'newest_wins';
      conflict.reason = 'Local unchanged, using remote changes';
      conflict.confidence = 0.95;
    } else if (deepEqual(remoteValue, baseValue)) {
      conflict.suggestion = 'local_wins';
      conflict.reason = 'Remote unchanged, using local changes';
      conflict.confidence = 0.95;
    }
  }

  return conflict;
}

/**
 * Resolve an individual field conflict and return the chosen value with confidence.
 */
export function resolveFieldConflict(conflict: FieldConflict): {
  value: unknown;
  confidence: number;
} {
  switch (conflict.suggestion) {
    case 'local_wins':
      return {
        value: conflict.localValue,
        confidence: conflict.confidence,
      };

    case 'newest_wins':
      return {
        value: conflict.remoteValue,
        confidence: conflict.confidence,
      };

    case 'merge_automatic':
      if (Array.isArray(conflict.localValue) && Array.isArray(conflict.remoteValue)) {
        return {
          value: [...new Set([...conflict.localValue, ...conflict.remoteValue])],
          confidence: conflict.confidence,
        };
      }
      return {
        value: conflict.remoteValue,
        confidence: conflict.confidence * 0.8,
      };

    default:
      return {
        value: conflict.remoteValue,
        confidence: 0.5,
      };
  }
}

/**
 * Select a default field value when resolution fails, using user preferences if available.
 */
export function selectDefaultFieldValue(
  fieldName: string,
  localValue: unknown,
  remoteValue: unknown,
  userPreferences: Map<string, ResolutionStrategy>
): unknown {
  const userPreference = userPreferences.get(fieldName);
  if (userPreference) {
    switch (userPreference) {
      case 'local_wins':
        return localValue;
      case 'newest_wins':
        return remoteValue;
    }
  }

  // Default to remote value (last write wins)
  return remoteValue;
}
