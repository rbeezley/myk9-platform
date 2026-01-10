/**
 * Conflict Resolution Service
 *
 * Handles conflicts when local changes collide with remote changes.
 * 
 * Strategy:
 * - Delegates to shared ConflictManager for lifecycle
 * - Prompts user to choose: local, remote, or merge
 * - Log all conflicts for audit trail
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';
import { conflictManager } from '@myk9/replication';
import type {
  Conflict as SharedConflict,
  ConflictStrategy
} from '@myk9/replication';

/** Base entry data that may be involved in conflicts */
export interface ConflictEntryData {
  updated_at?: string;
  check_in_status?: number;
  running_order?: number;
  time?: number;
  faults?: number;
  placement?: number;
  score?: number;
  qualifying?: boolean;
  [key: string]: unknown; // Allow additional fields
}

export type ConflictType = 'score' | 'status' | 'entry_data';

// Wrap the shared Conflict type to maintain backward compatibility if needed
export type Conflict = SharedConflict<ConflictEntryData> & {
  type?: ConflictType; // Q specifics
};

export interface ConflictResolution {
  action: 'local' | 'remote' | 'merge';
  mergedData?: ConflictEntryData;
}

/**
 * Detect if there's a conflict between local and remote data
 * Refactored to use shared ConflictManager
 */
export async function detectConflict(
  entryId: string,
  localData: ConflictEntryData,
  remoteData: ConflictEntryData,
  type: ConflictType
): Promise<Conflict | null> {
  const result = await conflictManager.handleSyncConflict(
    { ...localData, id: entryId },
    { ...remoteData, id: entryId },
    undefined,
    { timestamp: new Date() }
  );

  if (!result.automatic) {
    // Shared manager will have already emitted events and added to pendingConflicts
    const pending = conflictManager.getPendingConflicts();
    const lastConflict = pending[pending.length - 1];
    return {
      ...lastConflict,
      type
    } as Conflict;
  }

  return null;
}

/**
 * Try to auto-resolve simple conflicts
 */
export function autoResolveConflict(_conflict: Conflict): ConflictResolution | null {
  // Shared manager already tries to auto-resolve during handleSyncConflict
  return null;
}

/**
 * Resolve a conflict with user's choice
 */
export async function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution
): Promise<void> {
  const strategy: ConflictStrategy =
    resolution.action === 'local' ? 'client-authoritative' :
      resolution.action === 'remote' ? 'server-authoritative' : 'field-level-merge';

  const conflict = conflictManager.getConflictById(conflictId);
  if (!conflict) throw new Error('Conflict not found');

  const resolvedEntity = resolution.action === 'local' ? conflict.localData :
    resolution.action === 'remote' ? conflict.remoteData :
      resolution.mergedData;

  const success = await conflictManager.resolveConflictManually(conflictId, {
    strategy,
    resolvedEntity
  });

  if (!success) throw new Error('Failed to resolve conflict in shared manager');

  // Apply resolution to database (specific to @myk9/q entries table)
  try {
    await supabase.from('entries').update(resolvedEntity).eq('id', conflict.entityId);
  } catch (error) {
    logger.error('❌ Failed to apply conflict resolution:', error);
    throw error;
  }
}

/**
 * Ignore a conflict (keep remote data)
 */
export function ignoreConflict(conflictId: string): void {
  const conflict = conflictManager.getConflictById(conflictId);
  if (conflict) {
    conflictManager.resolveConflictManually(conflictId, {
      strategy: 'server-authoritative',
      resolvedEntity: conflict.remoteData
    });
  }
}

/**
 * Get all pending conflicts
 */
export function getPendingConflicts(): Conflict[] {
  return conflictManager.getPendingConflicts().map(c => ({
    ...c,
    type: 'entry_data' // default for now
  })) as Conflict[];
}

/**
 * Get conflict by ID
 */
export function getConflict(conflictId: string): Conflict | undefined {
  return conflictManager.getConflictById(conflictId);
}

/**
 * Clear all resolved/ignored conflicts
 */
export function clearResolvedConflicts(): void {
  // Not implemented in shared manager yet, but can be added if needed
}

/**
 * Get conflict summary for display
 */
export function getConflictSummary(conflict: Conflict): {
  title: string;
  description: string;
  localLabel: string;
  remoteLabel: string;
} {
  const type = conflict.type || 'entry_data';

  switch (type) {
    case 'score':
      return {
        title: 'Score Conflict',
        description: 'This entry was scored both locally and remotely',
        localLabel: `Your score: ${formatScore(conflict.localData)}`,
        remoteLabel: `Remote score: ${formatScore(conflict.remoteData)}`,
      };
    case 'status':
      return {
        title: 'Status Conflict',
        description: 'This entry status changed both locally and remotely',
        localLabel: `Your status: ${formatStatus(conflict.localData.check_in_status ?? 0)}`,
        remoteLabel: `Remote status: ${formatStatus(conflict.remoteData.check_in_status ?? 0)}`,
      };
    default:
      return {
        title: 'Conflict',
        description: 'Data changed both locally and remotely',
        localLabel: 'Your version',
        remoteLabel: 'Remote version',
      };
  }
}

function formatScore(data: ConflictEntryData): string {
  if (data.time && data.faults !== undefined) {
    return `${data.time}s, ${data.faults} faults`;
  }
  if (data.score !== undefined) {
    return `Score: ${data.score}`;
  }
  return 'Unknown';
}

function formatStatus(status: number): string {
  const labels = ['Not Checked In', 'Checked In', 'In Ring', 'Complete'];
  return labels[status] || 'Unknown';
}
