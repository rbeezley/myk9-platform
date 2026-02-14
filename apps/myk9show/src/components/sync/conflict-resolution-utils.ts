import { logger } from '@/services/LoggingService';
import { formatDistanceToNow } from 'date-fns';
import type { Conflict } from '@/types/conflict-types';
import type {
  ConflictData,
  ExtendedConflict,
  ResolutionStrategy,
  NormalizedConflict,
  ConflictResolutionDialogProps,
} from './conflict-resolution-types';

export function isExtendedConflict(c: unknown): c is ExtendedConflict {
  return Boolean(c && typeof c === 'object' && 'id' in c && 'localData' in c && 'remoteData' in c);
}

export function isStandardConflict(c: unknown): c is { localEntity: unknown; remoteEntity: unknown; details: unknown } {
  return Boolean(c && typeof c === 'object' && 'localEntity' in c && 'remoteEntity' in c && 'details' in c);
}

export function normalizeConflict(
  conflict: ConflictData | ExtendedConflict | Conflict | null
): NormalizedConflict | null {
  if (!conflict) return null;

  if (isStandardConflict(conflict)) {
    const standardConflict = (conflict as unknown) as {
      entityType: string;
      entityId: string;
      localEntity: Record<string, unknown>;
      remoteEntity: Record<string, unknown>;
      details: Array<{ field: string }>;
      detectedAt: string;
    };
    return {
      entityType: standardConflict.entityType,
      entityId: standardConflict.entityId,
      entityName: `${standardConflict.entityType} ${standardConflict.entityId}`,
      local: standardConflict.localEntity,
      remote: standardConflict.remoteEntity,
      conflictFields: standardConflict.details.map((d: { field: string }) => d.field),
      lastModified: {
        local: new Date((standardConflict.localEntity._lastModified as string | number | Date) || standardConflict.detectedAt),
        remote: new Date((standardConflict.remoteEntity._lastModified as string | number | Date) || standardConflict.detectedAt),
      },
      lastModifiedBy: {
        local: (standardConflict.localEntity._lastModifiedBy as string) || 'Unknown',
        remote: (standardConflict.remoteEntity._lastModifiedBy as string) || 'Unknown',
      },
    };
  }

  if (isExtendedConflict(conflict)) {
    const extendedConflict = conflict as ExtendedConflict;
    return {
      ...extendedConflict,
      entityName: extendedConflict.entityName || `${extendedConflict.entityType} ${extendedConflict.entityId}`,
      local: extendedConflict.localData,
      remote: extendedConflict.remoteData,
      conflictFields: extendedConflict.conflictFields || Object.keys({ ...extendedConflict.localData, ...extendedConflict.remoteData }),
    };
  }

  return conflict as ConflictData;
}

export function getConfidenceScore(
  strategy: ResolutionStrategy,
  conflictResolver: ConflictResolutionDialogProps['conflictResolver'],
  conflict: ConflictResolutionDialogProps['conflict']
): number {
  if (conflictResolver && isExtendedConflict(conflict) && typeof conflictResolver.suggestResolution === 'function') {
    try {
      const suggestion = conflictResolver.suggestResolution(conflict);
      if (suggestion?.strategy === strategy) {
        return suggestion.confidence || 50;
      }
    } catch (error) {
      logger.warn('Failed to get confidence score:', 'sync', {}, error as Error);
    }
  }
  return 50 + Math.random() * 30;
}

export function isRecommended(
  strategy: ResolutionStrategy,
  conflictResolver: ConflictResolutionDialogProps['conflictResolver'],
  conflict: ConflictResolutionDialogProps['conflict']
): boolean {
  if (conflictResolver && isExtendedConflict(conflict) && typeof conflictResolver.suggestResolution === 'function') {
    try {
      const suggestion = conflictResolver.suggestResolution(conflict);
      return suggestion?.strategy === strategy && (suggestion?.confidence || 0) > 80;
    } catch (error) {
      logger.warn('Failed to check recommendation:', 'sync', {}, error as Error);
    }
  }
  return false;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not set';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical':
      return 'text-destructive';
    case 'high':
      return 'text-warning';
    case 'medium':
      return 'text-primary';
    default:
      return 'text-muted-foreground';
  }
}

export function formatDate(date: string | Date): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return formatDistanceToNow(dateObj, { addSuffix: true });
  } catch {
    return 'Unknown time';
  }
}
