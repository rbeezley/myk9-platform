/**
 * Pure helper functions for the entry store.
 *
 * Handles conversion between `ReplicatedEntry` (persistence layer) and
 * `SyncableShowEntry` (store layer), plus ID generation utilities.
 */

import type { ReplicatedEntry } from '@/services/replication';
import type { EntryStatus, SyncableShowEntry } from './entry-store-types';

export const generateEntryId = () => `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Convert ReplicatedEntry from replicated table to SyncableShowEntry for store
 */
export function replicatedToEntry(replicated: ReplicatedEntry): SyncableShowEntry {
  return {
    id: replicated.id,
    showId: replicated.showId || '',
    classId: replicated.classId || '',
    dogId: replicated.dogId || '',
    status: (replicated.entryStatus as EntryStatus) || 'draft',
    registrationData: {
      submittedAt: replicated.submittedAt || new Date().toISOString(),
      handler: replicated.handler || '',
      handlerId: replicated.handlerId,
      entryFee: replicated.entryFee || 0,
      paymentStatus: (replicated.paymentStatus as 'pending' | 'paid' | 'refunded') || 'pending',
      specialRequests: replicated.specialRequests,
      armband: replicated.armband,
      runOrder: replicated.runOrder,
      jumpHeight: replicated.jumpHeight,
      preferredJudge: replicated.preferredJudge,
      moveUpRequested: replicated.moveUpRequested,
    },
    statusHistory: [],
    createdAt: replicated.submittedAt || new Date().toISOString(),
    updatedAt: replicated._lastModified?.toISOString() || new Date().toISOString(),
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || 'system',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly,
  };
}

/**
 * Merge ReplicatedEntry with existing SyncableShowEntry, preserving local-only fields
 */
export function mergeEntryData(replicated: ReplicatedEntry, existing: SyncableShowEntry | undefined): SyncableShowEntry {
  const base = replicatedToEntry(replicated);
  if (!existing) return base;

  // Preserve local-only fields that aren't in the replicated table
  return {
    ...base,
    statusHistory: existing.statusHistory || base.statusHistory,
    competitionData: existing.competitionData,
  };
}

/**
 * Convert SyncableShowEntry to ReplicatedEntry for storage
 */
export function entryToReplicated(entry: SyncableShowEntry): ReplicatedEntry {
  return {
    id: entry.id,
    showId: entry.showId,
    classId: entry.classId,
    dogId: entry.dogId,
    handlerId: entry.registrationData.handlerId,
    armband: entry.registrationData.armband,
    handler: entry.registrationData.handler,
    entryStatus: entry.status,
    entry_status: entry.status,
    jumpHeight: entry.registrationData.jumpHeight,
    entryFee: entry.registrationData.entryFee,
    paymentStatus: entry.registrationData.paymentStatus,
    runOrder: entry.registrationData.runOrder,
    moveUpRequested: entry.registrationData.moveUpRequested,
    preferredJudge: entry.registrationData.preferredJudge,
    specialRequests: entry.registrationData.specialRequests,
    submittedAt: entry.registrationData.submittedAt,
    _version: entry._version,
    _lastModified: entry._lastModified,
    _lastModifiedBy: entry._lastModifiedBy,
    _syncStatus: entry._syncStatus,
    _localOnly: entry._localOnly,
  };
}
