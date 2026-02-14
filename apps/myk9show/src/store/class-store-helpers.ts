import type { ReplicatedClass, ReplicatedEntry } from '@/services/replication';
import { shouldUseMockData } from '@/config/dataSource';
import type { SyncableClassData, SyncableEntryData } from './class-store-types';

export const shouldUseMockClasses = () => {
  return shouldUseMockData('USE_MOCK_SHOWS'); // Classes are part of shows
};

/**
 * Convert ReplicatedClass (database schema) to SyncableClassData (app schema)
 */
export function replicatedToClass(replicated: ReplicatedClass): SyncableClassData {
  return {
    id: replicated.id,
    trialId: replicated.trialId || '',
    trial: '', // Local-only: derived
    trialDate: '', // Local-only: derived
    trialNumber: '', // Local-only
    classOrder: '', // Local-only
    status: 'Scheduled',
    judge: '', // Local-only
    className: replicated.name,
    element: '', // Local-only
    level: replicated.level || '',
    section: '', // Local-only
    entryFee: replicated.entryFee || 25,
    maxEntries: replicated.maxEntries || 40,
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/**
 * Merge replicated class with existing local data
 */
export function mergeClassData(replicated: ReplicatedClass, existing: SyncableClassData | undefined): SyncableClassData {
  const base = replicatedToClass(replicated);
  if (!existing) return base;

  return {
    ...base,
    // Preserve local-only fields
    trial: existing.trial || '',
    trialDate: existing.trialDate || '',
    trialNumber: existing.trialNumber || '',
    classOrder: existing.classOrder || '',
    status: existing.status || 'Scheduled',
    judge: existing.judge || '',
    element: existing.element || '',
    section: existing.section || '',
    hidesUsed: existing.hidesUsed || '',
    distractionsUsed: existing.distractionsUsed || '',
    itemsUsed: existing.itemsUsed || '',
    timeLimit1: existing.timeLimit1 || '',
    timeLimit2: existing.timeLimit2 || '',
    timeLimit3: existing.timeLimit3 || '',
    photoUrl: existing.photoUrl || '',
  };
}

/**
 * Convert ReplicatedEntry (database schema) to SyncableEntryData (app schema)
 */
export function replicatedToEntry(replicated: ReplicatedEntry): SyncableEntryData {
  return {
    id: replicated.id,
    armband: replicated.armband || '',
    handler: replicated.handler || '',
    dog: '', // Local-only: need to lookup
    status: (replicated.status || 'Pending') as SyncableEntryData['status'],
    score: '', // Local-only
    time: '', // Local-only
    placement: '', // Local-only
    classId: replicated.classId || '',
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/**
 * Merge replicated entry with existing local data
 */
export function mergeEntryData(replicated: ReplicatedEntry, existing: SyncableEntryData | undefined): SyncableEntryData {
  const base = replicatedToEntry(replicated);
  if (!existing) return base;

  return {
    ...base,
    dog: existing.dog || '',
    score: existing.score || '',
    time: existing.time || '',
    placement: existing.placement || '',
  };
}

// Mock data with sync metadata
export const mockClasses: SyncableClassData[] = [
  {
    id: '1',
    trialId: '1',
    trial: "Scent Work Interior Search",
    trialDate: "2025-07-20",
    trialNumber: "T-2025-001",
    classOrder: "2",
    status: "Scheduled",
    judge: "Sarah Johnson",
    element: "Interior",
    level: "Advanced",
    section: "A",
    hidesUsed: "2",
    distractionsUsed: "2",
    itemsUsed: "Furniture, Cabinets",
    timeLimit1: "3:00",
    timeLimit2: "",
    timeLimit3: "",
    photoUrl: "",
    className: "Interior Advanced",
    entryFee: 30,
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  },
  {
    id: '2',
    trialId: '1',
    trial: "Scent Work Interior Search",
    trialDate: "2025-07-20",
    trialNumber: "T-2025-001",
    classOrder: "1",
    status: "Scheduled",
    judge: "Sarah Johnson",
    element: "Interior",
    level: "Novice",
    section: "A",
    hidesUsed: "1",
    distractionsUsed: "0",
    itemsUsed: "Furniture",
    timeLimit1: "4:00",
    timeLimit2: "",
    timeLimit3: "",
    photoUrl: "",
    className: "Interior Novice",
    entryFee: 25,
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  }
];

export const mockEntries: SyncableEntryData[] = [
  {
    id: '1',
    armband: "A101",
    handler: "John Smith",
    dog: "Max",
    status: "Qualified",
    score: "95.5",
    time: "2:15",
    placement: "1st",
    classId: "1",
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  }
];
