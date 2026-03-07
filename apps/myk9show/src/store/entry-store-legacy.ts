/**
 * Legacy store action creators for the entry store.
 *
 * These are synchronous, local-only methods preserved for backward compatibility.
 * New code should use the async, replication-backed methods on the store directly.
 */

import type { StoreApi } from 'zustand';
import { generateEntryId } from './entry-store-helpers';
import type {
  EntryStatus,
  CompetitionData,
  RegistrationData,
  ShowEntry,
  SyncableShowEntry,
  EntryStoreState,
} from './entry-store-types';

type SetFn = StoreApi<EntryStoreState>['setState'];
type GetFn = StoreApi<EntryStoreState>['getState'];

/** Build the legacy slice of the entry store. */
export function createLegacyActions(set: SetFn, _get: GetFn) {
  return {
    createEntryLegacy: (
      data: Omit<ShowEntry, 'id' | 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>
    ): string => {
      const id = generateEntryId();
      const now = new Date().toISOString();

      const newEntry: SyncableShowEntry = {
        ...data,
        id,
        status: 'draft',
        statusHistory: [
          {
            status: 'draft',
            timestamp: now,
            userId: 'legacy-system',
            reason: 'Entry created',
          },
        ],
        createdAt: now,
        updatedAt: now,
        // Sync metadata
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'legacy-system',
        _syncStatus: 'synced',
        _localOnly: false,
      };

      set(state => ({
        entries: [...state.entries, newEntry],
      }));

      return id;
    },

    updateRegistrationLegacy: (entryId: string, updates: Partial<RegistrationData>): void => {
      const now = new Date().toISOString();

      set(state => ({
        entries: state.entries.map(entry => {
          if (entry.id === entryId) {
            return {
              ...entry,
              registrationData: { ...entry.registrationData, ...updates },
              updatedAt: now,
              _version: (entry._version || 1) + 1,
              _lastModified: new Date(),
              _lastModifiedBy: 'legacy-system',
              _syncStatus: 'pending' as const,
            };
          }
          return entry;
        }),
      }));
    },

    updateStatusLegacy: (
      entryId: string,
      status: EntryStatus,
      userId: string,
      reason?: string
    ): void => {
      const now = new Date().toISOString();

      set(state => ({
        entries: state.entries.map(entry => {
          if (entry.id === entryId) {
            return {
              ...entry,
              status,
              statusHistory: [
                ...entry.statusHistory,
                {
                  status,
                  timestamp: now,
                  userId,
                  reason,
                },
              ],
              updatedAt: now,
              _version: (entry._version || 1) + 1,
              _lastModified: new Date(),
              _lastModifiedBy: userId,
              _syncStatus: 'pending' as const,
            };
          }
          return entry;
        }),
      }));
    },

    recordResultLegacy: (entryId: string, result: CompetitionData): void => {
      const now = new Date().toISOString();

      set(state => ({
        entries: state.entries.map(entry => {
          if (entry.id === entryId) {
            return {
              ...entry,
              status: 'completed' as const,
              competitionData: {
                ...result,
                recordedAt: now,
              },
              statusHistory: [
                ...entry.statusHistory,
                {
                  status: 'completed' as const,
                  timestamp: now,
                  userId: result.recordedBy,
                  reason: 'Results recorded',
                },
              ],
              updatedAt: now,
              _version: (entry._version || 1) + 1,
              _lastModified: new Date(),
              _lastModifiedBy: result.recordedBy,
              _syncStatus: 'pending' as const,
            };
          }
          return entry;
        }),
      }));
    },

    updateResultLegacy: (entryId: string, updates: Partial<CompetitionData>): void => {
      const now = new Date().toISOString();

      set(state => ({
        entries: state.entries.map(entry => {
          if (entry.id === entryId) {
            return {
              ...entry,
              competitionData: entry.competitionData
                ? { ...entry.competitionData, ...updates }
                : { ...updates, recordedAt: now, recordedBy: updates.recordedBy || 'Secretary' },
              updatedAt: now,
              _version: (entry._version || 1) + 1,
              _lastModified: new Date(),
              _lastModifiedBy: updates.recordedBy || 'legacy-system',
              _syncStatus: 'pending' as const,
            };
          }
          return entry;
        }),
      }));
    },
  };
}
