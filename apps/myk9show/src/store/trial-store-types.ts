import type { Trial, TrialClass } from '@/components/trials/types/trial.types';
import type { ClassStatusValue } from '@myk9/core';

// Re-export types for external usage
export type { Trial, TrialClass };

// Extend Trial interface with sync metadata
export interface SyncableTrial extends Trial {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean | undefined;
}

export interface SyncableTrialClass extends TrialClass {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean | undefined;
}

// Input types for creating/updating trials
export interface TrialInput {
  // Allow id for update scenarios where full Trial object is passed
  id?: string | undefined;
  showId: string;
  showName: string;
  name: string;
  trialDate: string;
  trialNumber: string;
  status: ClassStatusValue;
  eventNumber?: string | undefined;
  type?: string | undefined;
  trialType?: string | undefined;
  plannedStartTime?: string | undefined;
  order?: string | undefined;
  // Additional fields from Trial interface for updates
  image?: string | undefined;
  timeStarted?: string | undefined;
  timeEnded?: string | undefined;
  // Classes associated with this trial
  classes?:
    | Array<{
        id: string;
        element: string;
        level: string;
        section: string;
        judgeId: string;
        judgeName?: string | undefined;
        startTime: string;
        status: ClassStatusValue;
        entries: number;
      }>
    | undefined;
}

export interface TrialClassInput {
  element: string;
  level: string;
  section: string;
  judgeId: string;
  judgeName?: string | undefined;
  startTime: string;
  status: ClassStatusValue;
  entries: number;
}

export interface TrialStore {
  // Trials
  trials: SyncableTrial[];
  selectedTrialId: string | null;
  isLoading: boolean;
  error: string | null;

  // Local-First Trial Actions
  addTrial: (trialData: TrialInput, userId: string) => Promise<SyncableTrial>;
  updateTrial: (
    id: string,
    updates: Partial<TrialInput>,
    userId: string
  ) => Promise<SyncableTrial | null>;
  deleteTrial: (id: string) => Promise<void>;
  getTrialById: (id: string) => SyncableTrial | null;
  getTrialsByShow: (showId: string) => SyncableTrial[];

  // Data Management
  setTrials: (trials: SyncableTrial[]) => void;
  loadTrials: () => Promise<void>;

  // Sync Status
  getSyncStatus: (id: string) => 'synced' | 'pending' | 'error' | 'conflict';

  // Legacy methods for compatibility
  addTrialLegacy: (trial: Omit<Trial, 'id'>) => void;
  updateTrialLegacy: (trial: Partial<Trial> & { id: string }) => void;
  removeTrial: (id: string) => void;
  selectTrial: (id: string | null) => void;

  // Trial Classes
  trialClasses: Record<string, SyncableTrialClass[]>; // Maps trialId to its classes
  addTrialClass: (
    trialId: string,
    trialClassData: TrialClassInput,
    userId: string
  ) => Promise<SyncableTrialClass>;
  updateTrialClass: (
    trialId: string,
    classId: string,
    updates: Partial<TrialClassInput>,
    userId: string
  ) => Promise<SyncableTrialClass | null>;
  deleteTrialClass: (trialId: string, classId: string) => Promise<void>;
  getTrialClassesByTrial: (trialId: string) => SyncableTrialClass[];

  // Legacy Trial Class methods
  addTrialClassLegacy: (trialId: string, trialClass: Omit<TrialClass, 'id'>) => void;
  updateTrialClassLegacy: (trialId: string, trialClass: TrialClass) => void;
  removeTrialClass: (trialId: string, classId: string) => void;

  // Data Management (classes)
  loadTrialClasses: () => Promise<void>;

  // Subscription Management (for replicated table sync)
  _unsubscribe: (() => void) | null;
  _unsubscribeClasses: (() => void) | null;
  initializeSubscription: () => void;
  cleanup: () => void;
}
