/**
 * Conflict Resolution Service
 *
 * Handles conflicts when local changes collide with remote changes.
 * This can happen when:
 * - Multiple judges score the same entry offline
 * - Entry is modified while offline, then modified remotely
 * - Network issues cause out-of-order updates
 *
 * Strategy:
 * - Detect conflicts by comparing timestamps
 * - Prompt user to choose: local, remote, or merge
 * - Auto-resolve simple conflicts (e.g., different fields changed)
 * - Log all conflicts for audit trail
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

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

export interface Conflict {
  id: string;
  entryId: string;
  type: ConflictType;
  localData: ConflictEntryData;
  remoteData: ConflictEntryData;
  localTimestamp: number;
  remoteTimestamp: number;
  detected: number;
  status: 'pending' | 'resolved' | 'ignored';
  resolution?: 'local' | 'remote' | 'merge';
  mergedData?: ConflictEntryData;
}

export interface ConflictResolution {
  action: 'local' | 'remote' | 'merge';
  mergedData?: ConflictEntryData;
}

// In-memory conflict store
const conflicts: Map<string, Conflict> = new Map();

/**
 * Detect if there's a conflict between local and remote data
 */
export function detectConflict(
  entryId: string,
  localData: ConflictEntryData,
  remoteData: ConflictEntryData,
  type: ConflictType
): Conflict | null {
  // No conflict if data is the same
  if (JSON.stringify(localData) === JSON.stringify(remoteData)) {
    return null;
  }

  // Check timestamps
  const localTime = localData.updated_at ? new Date(localData.updated_at).getTime() : 0;
  const remoteTime = remoteData.updated_at ? new Date(remoteData.updated_at).getTime() : 0;

  // If local is newer, no conflict (local wins)
  if (localTime > remoteTime + 1000) {
    // 1s tolerance for clock skew
    return null;
  }

  // If remote is much newer, no conflict (remote wins automatically)
  if (remoteTime > localTime + 60000) {
    // 1 minute threshold
    return null;
  }

  // We have a conflict
  const conflict: Conflict = {
    id: crypto.randomUUID(),
    entryId,
    type,
    localData,
    remoteData,
    localTimestamp: localTime,
    remoteTimestamp: remoteTime,
    detected: Date.now(),
    status: 'pending',
  };

  conflicts.set(conflict.id, conflict);
  logger.warn('⚠️ Conflict detected:', conflict);

  return conflict;
}

/**
 * Try to auto-resolve simple conflicts
 */
export function autoResolveConflict(conflict: Conflict): ConflictResolution | null {
  // Auto-resolve: different fields changed
  if (conflict.type === 'entry_data') {
    const merged = tryMergeEntryData(conflict.localData, conflict.remoteData);
    if (merged) {
      return {
        action: 'merge',
        mergedData: merged,
      };
    }
  }

  // Auto-resolve: status conflicts (use local if it's more "advanced")
  if (conflict.type === 'status') {
    const localStatus = conflict.localData.check_in_status || 0;
    const remoteStatus = conflict.remoteData.check_in_status || 0;

    // Status progression: 0 (not checked in) -> 1 (checked in) -> 2 (in ring) -> 3 (complete)
    if (localStatus > remoteStatus) {
      return { action: 'local' };
    } else if (remoteStatus > localStatus) {
      return { action: 'remote' };
    }
  }

  // Auto-resolve: score conflicts (use most recent by timestamp)
  if (conflict.type === 'score') {
    if (conflict.localTimestamp > conflict.remoteTimestamp) {
      return { action: 'local' };
    } else {
      return { action: 'remote' };
    }
  }

  // Can't auto-resolve
  return null;
}

/**
 * Try to merge entry data by combining non-conflicting changes
 */
function tryMergeEntryData(
  local: ConflictEntryData,
  remote: ConflictEntryData
): ConflictEntryData | null {
  const merged: ConflictEntryData = { ...remote }; // Start with remote as base
  let hasConflict = false;

  // List of fields to check for conflicts
  const scoreFields = ['time', 'faults', 'placement', 'score', 'qualifying'];
  const statusFields = ['check_in_status', 'running_order'];

  // Check for conflicts in critical fields
  for (const field of [...scoreFields, ...statusFields]) {
    if (local[field] !== undefined && remote[field] !== undefined) {
      if (local[field] !== remote[field]) {
        hasConflict = true;
        break;
      }
    }
  }

  if (hasConflict) {
    return null; // Can't auto-merge
  }

  // Merge: take local values for fields that changed locally
  for (const key in local) {
    if (local[key] !== remote[key] && local[key] !== undefined) {
      merged[key] = local[key];
    }
  }

  return merged;
}

/**
 * Resolve a conflict with user's choice
 */
export async function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution
): Promise<void> {
  const conflict = conflicts.get(conflictId);
  if (!conflict) {
    throw new Error('Conflict not found');
  }

  conflict.status = 'resolved';
  conflict.resolution = resolution.action;
  conflict.mergedData = resolution.mergedData;

  // Apply resolution to database
  let dataToSave: ConflictEntryData;

  switch (resolution.action) {
    case 'local':
      dataToSave = conflict.localData;
      break;
    case 'remote':
      dataToSave = conflict.remoteData;
      break;
    case 'merge':
      dataToSave = resolution.mergedData ?? conflict.remoteData;
      break;
  }

  // Update database based on conflict type
  try {
    // All conflict types now update entries table (results table merged into entries)
    await supabase.from('entries').update(dataToSave).eq('id', conflict.entryId);

} catch (error) {
    logger.error('❌ Failed to apply conflict resolution:', error);
    conflict.status = 'pending';
    throw error;
  }
}

/**
 * Ignore a conflict (keep remote data)
 */
export function ignoreConflict(conflictId: string): void {
  const conflict = conflicts.get(conflictId);
  if (conflict) {
    conflict.status = 'ignored';
}
}

/**
 * Get all pending conflicts
 */
export function getPendingConflicts(): Conflict[] {
  return Array.from(conflicts.values()).filter((c) => c.status === 'pending');
}

/**
 * Get conflict by ID
 */
export function getConflict(conflictId: string): Conflict | undefined {
  return conflicts.get(conflictId);
}

/**
 * Clear all resolved/ignored conflicts
 */
export function clearResolvedConflicts(): void {
  for (const [id, conflict] of conflicts.entries()) {
    if (conflict.status !== 'pending') {
      conflicts.delete(id);
    }
  }
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
  switch (conflict.type) {
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

    case 'entry_data':
      return {
        title: 'Entry Data Conflict',
        description: 'This entry was modified both locally and remotely',
        localLabel: 'Your changes',
        remoteLabel: 'Remote changes',
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
