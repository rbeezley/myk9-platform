import type { SyncableTrial, SyncableTrialClass } from './trial-store-types';
import type { ReplicatedTrial, ReplicatedClass } from '@/services/replication';
import { shouldUseMockData } from '@/config/dataSource';

/** Map a SyncableTrialClass to ReplicatedClass for offline persistence */
export function trialClassToReplicated(tc: SyncableTrialClass, trialId: string): ReplicatedClass {
  return {
    id: tc.id,
    trialId,
    name: [tc.element, tc.level, tc.section].filter(Boolean).join(' ').trim() || tc.id,
    element: tc.element,
    level: tc.level,
    section: tc.section,
    judgeName: tc.judgeName,
    startTime: tc.startTime,
    classStatus: tc.status,
    _version: tc._version,
    _lastModified: tc._lastModified,
    _lastModifiedBy: tc._lastModifiedBy,
    _syncStatus: tc._syncStatus,
    _localOnly: tc._localOnly,
  };
}

/** Convert a ReplicatedClass (from IndexedDB) to SyncableTrialClass */
export function replicatedToTrialClass(replicated: ReplicatedClass): SyncableTrialClass {
  return {
    id: replicated.id,
    element: replicated.element || '',
    level: replicated.level || '',
    section: replicated.section || '',
    judgeId: '', // Local-only field (not stored in ReplicatedClass)
    judgeName: replicated.judgeName || '',
    startTime: replicated.startTime || '',
    status: (replicated.classStatus as SyncableTrialClass['status']) || 'Scheduled',
    entries: 0, // Computed field (derived from entry data, not stored on class)
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/** Merge replicated class data with existing local class data, preserving local-only fields */
export function mergeTrialClassData(
  replicated: ReplicatedClass,
  existing: SyncableTrialClass | undefined
): SyncableTrialClass {
  const base = replicatedToTrialClass(replicated);
  if (!existing) return base;

  return {
    ...base,
    // Preserve local-only fields from existing
    judgeId: existing.judgeId || '',
    entries: existing.entries || 0,
  };
}

/**
 * Convert ReplicatedTrial (database schema) to SyncableTrial (app schema)
 */
export function replicatedToTrial(replicated: ReplicatedTrial): SyncableTrial {
  return {
    id: replicated.id,
    showId: replicated.showId || '',
    showName: '', // Derived from show join, not stored on trials table
    name: replicated.name,
    trialDate: replicated.date,
    trialNumber: replicated.trialNumber || '',
    status: (replicated.status as SyncableTrial['status']) || 'Upcoming',
    eventNumber: replicated.eventNumber || '',
    type: replicated.category || '',
    trialType: replicated.trialType || '',
    plannedStartTime: replicated.plannedStartTime || '',
    timeStarted: replicated.actualStartTime || '',
    timeEnded: replicated.actualEndTime || '',
    order: replicated.displayOrder !== undefined ? String(replicated.displayOrder) : '',
    image: replicated.imageUrl || '',
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/**
 * Merge replicated trial data with existing local trial data
 */
export function mergeTrialData(
  replicated: ReplicatedTrial,
  existing: SyncableTrial | undefined
): SyncableTrial {
  const base = replicatedToTrial(replicated);
  if (!existing) return base;

  return {
    ...base,
    // showName is derived from a join, not stored on the trials table
    showName: existing.showName || '',
  };
}

export const shouldUseMockTrials = () => {
  return shouldUseMockData('USE_MOCK_SHOWS'); // Trials are part of shows
};

// Mock data for initial state
export const mockTrials: SyncableTrial[] = [
  {
    id: '1',
    showId: '1',
    showName: 'Summer Specialty Show',
    name: 'Scent Work Interior Search',
    trialDate: '2025-07-20',
    trialNumber: 'T-2025-001',
    status: 'Upcoming',
    eventNumber: 'EV-2025-001',
    type: 'Interior Search',
    trialType: 'Scent Work',
    plannedStartTime: '09:00 AM',
    order: '1',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
  {
    id: '2',
    showId: '1',
    showName: 'Summer Specialty Show',
    name: 'Scent Work Exterior Search',
    trialDate: '2025-07-21',
    trialNumber: 'T-2025-002',
    status: 'Upcoming',
    eventNumber: 'EV-2025-045',
    type: 'Exterior Search',
    trialType: 'Scent Work',
    plannedStartTime: '10:30 AM',
    order: '2',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
  {
    id: '3',
    showId: '2',
    showName: 'Fall Agility Championship',
    name: 'Standard Agility',
    trialDate: '2025-10-15',
    trialNumber: 'TR-2025-003',
    status: 'Upcoming',
    eventNumber: 'EV-2025-003',
    type: 'Standard',
    trialType: 'Agility',
    plannedStartTime: '11:00 AM',
    order: '3',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
  {
    id: '4',
    showId: '4',
    showName: 'Summer Nosework Trial',
    name: 'Nosework Elements Trial',
    trialDate: '2025-08-10',
    trialNumber: 'TR-2025-004',
    status: 'Upcoming',
    eventNumber: 'EV-2025-004',
    type: 'Element Search',
    trialType: 'Nosework',
    plannedStartTime: '09:00 AM',
    order: '1',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
  {
    id: '5',
    showId: '5',
    showName: 'Fall Obedience & Rally Championship',
    name: 'Obedience & Rally Combined Trial',
    trialDate: '2025-09-25',
    trialNumber: 'TR-2025-005',
    status: 'Upcoming',
    eventNumber: 'EV-2025-005',
    type: 'Combined Trial',
    trialType: 'Obedience & Rally',
    plannedStartTime: '08:30 AM',
    order: '1',
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  },
];
