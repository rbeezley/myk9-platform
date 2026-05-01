// apps/myk9show/src/hooks/conflictResolutionUtils.ts
import type { Conflict, ConflictStrategy } from '@myk9/replication';
import type {
  ConflictStatus,
  ResolutionStrategy,
  BaseConflict,
  BaseConflictResolution,
} from '../types/conflict-types';

// Replication status → hook status
export const STATUS_MAP: Record<string, ConflictStatus> = {
  pending: 'pending',
  resolved: 'resolved',
  ignored: 'dismissed',
};

// Replication strategy → hook strategy (for reading resolved conflicts)
export const STRATEGY_FROM_REPLICATION: Record<ConflictStrategy, ResolutionStrategy> = {
  'last-write-wins': 'newest_wins',
  'server-authoritative': 'remote_wins',
  'client-authoritative': 'local_wins',
  'field-level-merge': 'merge_automatic',
};

// Hook strategy → replication strategy (for resolveConflict writes)
export const STRATEGY_TO_REPLICATION: Record<string, ConflictStrategy> = {
  local_wins: 'client-authoritative',
  remote_wins: 'server-authoritative',
  merge_automatic: 'field-level-merge',
  merge_manual: 'field-level-merge',
  newest_wins: 'last-write-wins',
};

export function mapConflict(c: Conflict): BaseConflict<Record<string, unknown>> {
  return {
    id: c.id,
    detectedAt: c.detectedAt,
    createdAt: c.detectedAt,
    priority: 'medium',
    status: STATUS_MAP[c.status] ?? 'pending',
    conflictType: 'sync_conflict',
    entityType: c.entityType ?? 'unknown',
    entityId: c.entityId,
    localData: c.localData as Record<string, unknown>,
    remoteData: c.remoteData as Record<string, unknown>,
    ...(c.baseData !== undefined && { baseData: c.baseData as Record<string, unknown> }),
    conflictFields: [],
    lastModified: { local: c.detectedAt, remote: c.detectedAt },
    lastModifiedBy: { local: 'local', remote: 'remote' },
  };
}

export function mapResolution(c: Conflict): BaseConflictResolution<unknown> {
  return {
    conflictId: c.id,
    strategy: c.resolution
      ? (STRATEGY_FROM_REPLICATION[c.resolution.strategy] ?? 'merge_automatic')
      : 'merge_automatic',
    resolvedAt: c.resolution?.resolvedAt ?? new Date(),
    resolvedBy: c.resolution?.resolvedBy ?? 'system',
    automatic: !c.resolution || c.resolution.strategy !== 'field-level-merge',
    resolvedEntity: c.resolution?.resolvedEntity,
  };
}

export function filterByEntityType<T extends { entityType?: string }>(
  items: T[],
  entityType: string | undefined
): T[] {
  if (entityType === undefined) return items;
  return items.filter(item => item.entityType === entityType);
}
