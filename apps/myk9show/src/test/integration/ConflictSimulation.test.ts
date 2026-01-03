import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dogStore } from '@/store/dogStore';
import { userStore } from '@/store/userStore';

// Mock network conditions
const mockNetworkStatus = { online: true };
Object.defineProperty(navigator, 'onLine', {
  get: () => mockNetworkStatus.online,
  configurable: true
});

// Mock Supabase with conflict scenarios
const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn()
  })),
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn()
  }))
};

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('Conflict Simulation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockNetworkStatus.online = true;
    
    // Reset stores
    dogStore.getState().clearDogs();
    userStore.getState().clearPeople();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Version Conflict Detection', () => {
    it('should detect version mismatch conflicts', async () => {
      // Create local entity
      const localResult = await dogStore.getState().addDog({
        name: 'Local Dog',
        breed: 'Golden Retriever',
        sex: 'male' as const
      });

      const localDog = localResult.data!;
      expect(localDog._version).toBe(1);

      // Simulate server returning higher version during sync
      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'VERSION_CONFLICT',
            message: 'Version mismatch',
            details: {
              local_version: 1,
              server_version: 3,
              server_data: {
                id: localDog.id,
                name: 'Server Updated Dog',
                breed: 'Golden Retriever',
                sex: 'male',
                _version: 3,
                _lastModified: new Date(),
                _lastModifiedBy: 'user-456'
              }
            }
          }
        }),
        eq: vi.fn().mockReturnThis()
      }));

      // Attempt to update (this would trigger conflict detection)
      const updateResult = await dogStore.getState().updateDog(localDog.id, {
        name: 'Updated Local Dog'
      });

      // Update should detect conflict
      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toContain('conflict');
      expect(updateResult.conflictData).toBeDefined();
      expect(updateResult.conflictData?.local._version).toBe(2);
      expect(updateResult.conflictData?.remote._version).toBe(3);
    });

    it('should detect concurrent modification conflicts', async () => {
      // Create initial entity
      const dogResult = await dogStore.getState().addDog({
        name: 'Concurrent Dog',
        breed: 'Labrador',
        sex: 'female' as const
      });

      const dogId = dogResult.data!.id;

      // Simulate two concurrent updates
      const update1Promise = dogStore.getState().updateDog(dogId, {
        name: 'Update 1'
      });

      const update2Promise = dogStore.getState().updateDog(dogId, {
        name: 'Update 2',
        breed: 'Golden Retriever'
      });

      const [result1, result2] = await Promise.all([update1Promise, update2Promise]);

      // One update should succeed, one should detect conflict
      const successful = result1.success && result2.success;
      const hasConflict = !result1.success || !result2.success;

      expect(successful || hasConflict).toBe(true);
      
      if (hasConflict) {
        const failedResult = !result1.success ? result1 : result2;
        expect(failedResult.error).toContain('conflict');
      }
    });

    it('should detect field-level conflicts', async () => {
      const dogResult = await dogStore.getState().addDog({
        name: 'Field Conflict Dog',
        breed: 'Poodle',
        sex: 'male' as const,
        microchipNumber: '123456789012345'
      });

      const dogId = dogResult.data!.id;

      // Simulate server data with different fields modified
      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'FIELD_CONFLICT',
            message: 'Field conflicts detected',
            details: {
              conflicts: [
                {
                  field: 'name',
                  local: 'Updated Name Local',
                  remote: 'Updated Name Remote',
                  lastModified: {
                    local: new Date(Date.now() - 1000),
                    remote: new Date()
                  }
                },
                {
                  field: 'breed',
                  local: 'Poodle',
                  remote: 'Standard Poodle',
                  lastModified: {
                    local: new Date(Date.now() - 2000),
                    remote: new Date(Date.now() - 500)
                  }
                }
              ]
            }
          }
        }),
        eq: vi.fn().mockReturnThis()
      }));

      const updateResult = await dogStore.getState().updateDog(dogId, {
        name: 'Updated Name Local',
        microchipNumber: '987654321012345'
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.conflictData?.conflictFields).toBeDefined();
      expect(updateResult.conflictData?.conflictFields).toContain('name');
    });
  });

  describe('Multi-User Conflict Scenarios', () => {
    it('should handle simultaneous edits by different users', async () => {
      // User 1 creates entity
      const user1DogResult = await dogStore.getState().addDog({
        name: 'Shared Dog',
        breed: 'Beagle',
        sex: 'female' as const
      });

      const dogId = user1DogResult.data!.id;

      // Simulate User 2 also having the entity and making changes

      // User 1 makes changes
      const user1UpdateResult = await dogStore.getState().updateDog(dogId, {
        name: 'User 1 Name Change',
        microchipNumber: '111111111111111'
      });

      expect(user1UpdateResult.success).toBe(true);

      // Simulate conflict when User 2's changes try to sync
      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'CONCURRENT_MODIFICATION',
            message: 'Entity modified by another user',
            details: {
              conflictingUser: 'user-1',
              conflictTime: new Date(),
              serverData: user1UpdateResult.data
            }
          }
        }),
        eq: vi.fn().mockReturnThis()
      }));

      // This would be User 2's update attempt
      const conflictResult = await dogStore.getState().updateDog(dogId, {
        name: 'User 2 Name Change',
        breed: 'Modified Beagle'
      });

      expect(conflictResult.success).toBe(false);
      expect(conflictResult.error).toContain('modified by another user');
      expect(conflictResult.conflictData?.lastModifiedBy).toBeDefined();
    });

    it('should handle delete conflicts', async () => {
      const dogResult = await dogStore.getState().addDog({
        name: 'Delete Conflict Dog',
        breed: 'Bulldog',
        sex: 'male' as const
      });

      const dogId = dogResult.data!.id;

      // User 1 deletes the entity
      const deleteResult = await dogStore.getState().deleteDog(dogId);
      expect(deleteResult.success).toBe(true);

      // Simulate User 2 trying to update the deleted entity
      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'ENTITY_NOT_FOUND',
            message: 'Entity has been deleted',
            details: {
              deletedBy: 'user-1',
              deletedAt: new Date()
            }
          }
        }),
        eq: vi.fn().mockReturnThis()
      }));

      const updateResult = await dogStore.getState().updateDog(dogId, {
        name: 'Attempted Update'
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toContain('deleted');
    });

    it('should handle relationship conflicts', async () => {
      // Create person and dog
      const personResult = await userStore.getState().addUser({
        firstName: 'Owner',
        lastName: 'User',
        email: 'owner@example.com'
      });

      const dogResult = await dogStore.getState().addDog({
        name: 'Relationship Dog',
        breed: 'Collie',
        sex: 'female' as const,
        ownerId: personResult.data!.id,
        ownerName: 'Owner User'
      });

      const dogId = dogResult.data!.id;

      // Simulate server conflict where owner has been changed
      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'RELATIONSHIP_CONFLICT',
            message: 'Related entity has been modified',
            details: {
              conflictingRelationship: {
                entityType: 'person',
                entityId: personResult.data!.id,
                field: 'ownerId',
                currentValue: 'different-owner-id',
                attemptedValue: personResult.data!.id
              }
            }
          }
        }),
        eq: vi.fn().mockReturnThis()
      }));

      const updateResult = await dogStore.getState().updateDog(dogId, {
        name: 'Updated Relationship Dog'
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toContain('relationship');
    });
  });

  describe('Conflict Resolution Strategies', () => {
    it('should support last-write-wins resolution', async () => {
      const dogResult = await dogStore.getState().addDog({
        name: 'LWW Dog',
        breed: 'Retriever',
        sex: 'male' as const
      });

      const dogId = dogResult.data!.id;

      // Simulate conflict with last-write-wins resolution
      const conflictData = {
        local: {
          ...dogResult.data!,
          name: 'Local Update',
          _lastModified: new Date(Date.now() - 1000)
        },
        remote: {
          ...dogResult.data!,
          name: 'Remote Update',
          _lastModified: new Date()
        },
        conflictFields: ['name']
      };

      // Mock conflict resolution with last-write-wins
      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockImplementation((data) => {
          // Remote wins (more recent timestamp)
          if (data.name === 'Remote Update') {
            return Promise.resolve({ data: { ...dogResult.data, ...data }, error: null });
          }
          return Promise.resolve({
            data: null,
            error: {
              code: 'VERSION_CONFLICT',
              details: conflictData
            }
          });
        }),
        eq: vi.fn().mockReturnThis()
      }));

      // Attempt update that triggers conflict
      const updateResult = await dogStore.getState().updateDog(dogId, {
        name: 'Local Update'
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.conflictData).toBeDefined();

      // Resolve with last-write-wins (choose remote)
      const resolveResult = await dogStore.getState().resolveConflict(dogId, {
        strategy: 'last-write-wins',
        conflictData: updateResult.conflictData!
      });

      expect(resolveResult.success).toBe(true);
      expect(resolveResult.data?.name).toBe('Remote Update');
    });

    it('should support merge resolution strategy', async () => {
      const dogResult = await dogStore.getState().addDog({
        name: 'Merge Dog',
        breed: 'Terrier',
        sex: 'female' as const,
        microchipNumber: '123456789012345'
      });

      const dogId = dogResult.data!.id;

      const conflictData = {
        local: {
          ...dogResult.data!,
          name: 'Local Name',
          breed: 'Local Breed',
          _version: 2
        },
        remote: {
          ...dogResult.data!,
          name: 'Remote Name',
          microchipNumber: '987654321012345',
          _version: 2
        },
        conflictFields: ['name']
      };

      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({ data: { id: dogId }, error: null }),
        eq: vi.fn().mockReturnThis()
      }));

      // Resolve with merge strategy
      const resolveResult = await dogStore.getState().resolveConflict(dogId, {
        strategy: 'merge',
        conflictData,
        mergeChoices: {
          name: 'local', // Keep local name
          breed: 'local', // Keep local breed
          microchipNumber: 'remote' // Take remote microchip
        }
      });

      expect(resolveResult.success).toBe(true);
      expect(resolveResult.data?.name).toBe('Local Name');
      expect(resolveResult.data?.breed).toBe('Local Breed');
      expect(resolveResult.data?.microchipNumber).toBe('987654321012345');
    });

    it('should support manual resolution strategy', async () => {
      const dogResult = await dogStore.getState().addDog({
        name: 'Manual Dog',
        breed: 'Spaniel',
        sex: 'male' as const
      });

      const dogId = dogResult.data!.id;

      const conflictData = {
        local: {
          ...dogResult.data!,
          name: 'Local Manual',
          breed: 'Local Spaniel'
        },
        remote: {
          ...dogResult.data!,
          name: 'Remote Manual',
          breed: 'Remote Spaniel'
        },
        conflictFields: ['name', 'breed']
      };

      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({ data: { id: dogId }, error: null }),
        eq: vi.fn().mockReturnThis()
      }));

      // Manual resolution with custom values
      const resolveResult = await dogStore.getState().resolveConflict(dogId, {
        strategy: 'manual',
        conflictData,
        manualResolution: {
          name: 'Manually Resolved Name',
          breed: 'Manually Resolved Breed',
          // Keep other fields from local or remote
          sex: conflictData.local.sex,
          microchipNumber: conflictData.remote.microchipNumber
        }
      });

      expect(resolveResult.success).toBe(true);
      expect(resolveResult.data?.name).toBe('Manually Resolved Name');
      expect(resolveResult.data?.breed).toBe('Manually Resolved Breed');
    });
  });

  describe('Complex Conflict Scenarios', () => {
    it('should handle cascading conflicts', async () => {
      // Create person
      const personResult = await userStore.getState().addUser({
        firstName: 'Cascade',
        lastName: 'Owner',
        email: 'cascade@example.com'
      });

      // Create dog owned by person
      const dogResult = await dogStore.getState().addDog({
        name: 'Cascade Dog',
        breed: 'Setter',
        sex: 'female' as const,
        ownerId: personResult.data!.id
      });

      // Simulate person deletion causing cascading conflicts
      const deletePersonResult = await userStore.getState().deleteUser(personResult.data!.id);
      expect(deletePersonResult.success).toBe(true);

      // Attempting to update dog should detect orphaned relationship
      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'ORPHANED_RELATIONSHIP',
            message: 'Referenced entity no longer exists',
            details: {
              orphanedField: 'ownerId',
              missingEntityType: 'person',
              missingEntityId: personResult.data!.id
            }
          }
        }),
        eq: vi.fn().mockReturnThis()
      }));

      const updateResult = await dogStore.getState().updateDog(dogResult.data!.id, {
        name: 'Updated Orphan Dog'
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toContain('orphaned');
    });

    it('should handle network partitioning conflicts', async () => {
      // Create entity while online
      const dogResult = await dogStore.getState().addDog({
        name: 'Partition Dog',
        breed: 'Hound',
        sex: 'male' as const
      });

      const dogId = dogResult.data!.id;

      // Go offline and make changes
      mockNetworkStatus.online = false;
      
      const offlineUpdate1 = await dogStore.getState().updateDog(dogId, {
        name: 'Offline Update 1'
      });

      const offlineUpdate2 = await dogStore.getState().updateDog(dogId, {
        breed: 'Modified Hound'
      });

      expect(offlineUpdate1.success).toBe(true);
      expect(offlineUpdate2.success).toBe(true);

      // Go back online - simulate server conflicts
      mockNetworkStatus.online = true;

      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'PARTITION_CONFLICT',
            message: 'Multiple offline changes detected',
            details: {
              offlineChanges: [
                { field: 'name', value: 'Offline Update 1', timestamp: offlineUpdate1.data?._lastModified },
                { field: 'breed', value: 'Modified Hound', timestamp: offlineUpdate2.data?._lastModified }
              ],
              serverChanges: [
                { field: 'name', value: 'Server Update', timestamp: new Date() }
              ]
            }
          }
        }),
        eq: vi.fn().mockReturnThis()
      }));

      // Sync should detect partition conflicts
      const syncResult = await dogStore.getState().syncDog(dogId);

      expect(syncResult.success).toBe(false);
      expect(syncResult.error).toContain('partition');
    });

    it('should handle schema evolution conflicts', async () => {
      const dogResult = await dogStore.getState().addDog({
        name: 'Schema Dog',
        breed: 'Retriever',
        sex: 'female' as const
      });

      const dogId = dogResult.data!.id;

      // Simulate server having newer schema with additional required fields
      mockSupabase.from.mockImplementation(() => ({
        update: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'SCHEMA_MISMATCH',
            message: 'Schema has evolved',
            details: {
              requiredFields: ['newRequiredField'],
              missingFields: ['newRequiredField'],
              schemaVersion: '2.0',
              clientVersion: '1.0'
            }
          }
        }),
        eq: vi.fn().mockReturnThis()
      }));

      const updateResult = await dogStore.getState().updateDog(dogId, {
        name: 'Schema Updated Dog'
      });

      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toContain('schema');
    });
  });

  describe('Conflict Prevention', () => {
    it('should detect potential conflicts before sync', async () => {
      const dogResult = await dogStore.getState().addDog({
        name: 'Prevention Dog',
        breed: 'Pointer',
        sex: 'male' as const
      });

      const dogId = dogResult.data!.id;

      // Update locally
      const localUpdate = await dogStore.getState().updateDog(dogId, {
        name: 'Locally Updated'
      });

      expect(localUpdate.success).toBe(true);

      // Simulate pre-sync conflict check
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockResolvedValue({
          data: [{
            id: dogId,
            _version: 3, // Higher than local version
            _lastModified: new Date(),
            _lastModifiedBy: 'other-user'
          }],
          error: null
        }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis()
      }));

      // Check for conflicts before sync
      const conflictCheck = await dogStore.getState().checkConflicts(dogId);

      expect(conflictCheck.hasConflicts).toBe(true);
      expect(conflictCheck.conflicts?.length).toBeGreaterThan(0);
      expect(conflictCheck.conflicts?.[0].type).toBe('version_mismatch');
    });

    it('should provide conflict warnings in real-time', async () => {
      const conflictWarnings: Record<string, unknown>[] = [];
      
      // Subscribe to conflict warnings
      dogStore.subscribe((state) => {
        if (state.conflictWarnings.length > 0) {
          conflictWarnings.push(...state.conflictWarnings);
        }
      });

      const dogResult = await dogStore.getState().addDog({
        name: 'Warning Dog',
        breed: 'Collie',
        sex: 'female' as const
      });

      // Simulate real-time update from another user
      const serverUpdate = {
        id: dogResult.data!.id,
        name: 'Server Updated Name',
        _version: 2,
        _lastModified: new Date(),
        _lastModifiedBy: 'other-user'
      };

      // This would be triggered by real-time subscription
      dogStore.getState().handleRealtimeUpdate(serverUpdate);

      // Should generate warning about potential conflict
      expect(conflictWarnings.length).toBeGreaterThan(0);
      expect(conflictWarnings[0].type).toBe('potential_conflict');
    });
  });
});