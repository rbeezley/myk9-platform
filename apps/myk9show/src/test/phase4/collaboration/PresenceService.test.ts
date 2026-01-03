import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PresenceService, UserPresence } from '../../../services/collaboration/PresenceService';

// Mock Supabase
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  track: vi.fn(),
  untrack: vi.fn(),
  presenceState: vi.fn().mockReturnValue({})
};

const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel)
};

vi.mock('../supabaseClient', () => ({
  supabase: mockSupabase
}));

// Mock window events
Object.defineProperty(window, 'location', {
  value: { pathname: '/test-page' },
  writable: true
});

describe('PresenceService - Phase 4 Tests', () => {
  let service: PresenceService;
  let mockUser: Omit<UserPresence, 'lastSeen'>;
  let presenceSyncCallback: ((presences: Record<string, UserPresence[]>) => void) | undefined;
  let presenceJoinCallback: ((key: string, newPresences: UserPresence[], currentPresences: UserPresence[]) => void) | undefined;
  let presenceLeaveCallback: ((key: string, leftPresences: UserPresence[], currentPresences: UserPresence[]) => void) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    service = PresenceService.getInstance();
    
    mockUser = {
      id: 'user-1',
      name: 'John Smith',
      email: 'john@example.com',
      role: 'judge',
      status: 'online'
    };

    // Capture presence event handlers
    mockChannel.on.mockImplementation((event: string, filter: { event: string } | ((payload: unknown) => void), callback?: (payload: unknown) => void) => {
      if (event === 'presence') {
        if (typeof filter === 'object' && 'event' in filter) {
          if (filter.event === 'sync') {
            presenceSyncCallback = callback as typeof presenceSyncCallback;
          } else if (filter.event === 'join') {
            presenceJoinCallback = callback as typeof presenceJoinCallback;
          } else if (filter.event === 'leave') {
            presenceLeaveCallback = callback as typeof presenceLeaveCallback;
          }
        } else if (typeof filter === 'function') {
          presenceSyncCallback = filter as typeof presenceSyncCallback;
        }
      }
      return mockChannel;
    });

    mockChannel.subscribe.mockResolvedValue(undefined);
    mockChannel.track.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe('Initialization and Basic Presence', () => {
    it('should initialize with user presence correctly', async () => {
      await service.initialize(mockUser);

      expect(mockSupabase.channel).toHaveBeenCalledWith('presence:global', {
        config: {
          presence: {
            key: 'user-1'
          }
        }
      });

      expect(mockChannel.subscribe).toHaveBeenCalled();
      expect(mockChannel.track).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          name: 'John Smith',
          email: 'john@example.com',
          role: 'judge',
          status: 'online',
          currentLocation: {
            page: '/test-page'
          }
        })
      );
    });

    it('should update presence information correctly', async () => {
      await service.initialize(mockUser);

      await service.updatePresence({
        status: 'busy',
        currentLocation: {
          page: '/scoring',
          entityId: 'class-123',
          entityType: 'show'
        }
      });

      expect(mockChannel.track).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'busy',
          currentLocation: {
            page: '/scoring',
            entityId: 'class-123',
            entityType: 'show'
          },
          lastSeen: expect.any(Date)
        })
      );
    });

    it('should update location tracking', async () => {
      await service.initialize(mockUser);

      await service.updateLocation('/dogs/details', 'dog-123', 'dog');

      expect(mockChannel.track).toHaveBeenLastCalledWith(
        expect.objectContaining({
          currentLocation: {
            page: '/dogs/details',
            entityId: 'dog-123',
            entityType: 'dog'
          }
        })
      );
    });

    it('should update activity tracking', async () => {
      await service.initialize(mockUser);

      await service.updateActivity('scoring', 'Evaluating entry #42');

      expect(mockChannel.track).toHaveBeenLastCalledWith(
        expect.objectContaining({
          activity: {
            type: 'scoring',
            details: 'Evaluating entry #42',
            startedAt: expect.any(Date)
          }
        })
      );
    });
  });

  describe('Multi-User Presence Management', () => {
    it('should track multiple users joining', async () => {
      await service.initialize(mockUser);

      const updateCallback = vi.fn();
      service.subscribe(updateCallback);

      // Simulate multiple users joining
      const users = [
        {
          id: 'judge-1',
          name: 'Judge Smith',
          role: 'judge',
          status: 'online',
          currentLocation: { page: '/scoring', entityId: 'class-1' }
        },
        {
          id: 'secretary-1',
          name: 'Secretary Jane',
          role: 'secretary',
          status: 'online',
          currentLocation: { page: '/entries', entityId: 'show-1' }
        },
        {
          id: 'exhibitor-1',
          name: 'Exhibitor Bob',
          role: 'exhibitor',
          status: 'online',
          currentLocation: { page: '/dogs', entityId: 'dog-1' }
        }
      ];

      for (const user of users) {
        presenceJoinCallback(user.id, [user]);
      }

      expect(updateCallback).toHaveBeenCalledTimes(users.length);
      expect(service.getActiveUsers()).toHaveLength(users.length);
    });

    it('should handle users leaving correctly', async () => {
      await service.initialize(mockUser);

      const updateCallback = vi.fn();
      service.subscribe(updateCallback);

      // Add users first
      const users = [
        { id: 'user-1', name: 'User 1', role: 'judge' },
        { id: 'user-2', name: 'User 2', role: 'secretary' }
      ];

      users.forEach(user => {
        service['presenceMap'].set(user.id, {
          ...user,
          email: `${user.id}@example.com`,
          status: 'online' as const,
          lastSeen: new Date()
        });
      });

      // Simulate user leaving
      presenceLeaveCallback('user-2', [{ 
        id: 'user-2', 
        name: 'User 2' 
      }]);

      expect(updateCallback).toHaveBeenLastCalledWith({
        userId: 'user-2',
        presence: { status: 'offline' },
        timestamp: expect.any(Date)
      });

      expect(service.getActiveUsers()).toHaveLength(1);
      expect(service.getActiveUsers()[0].id).toBe('user-1');
    });

    it('should sync presence state from server', async () => {
      await service.initialize(mockUser);

      const serverState = {
        'judge-1': [{
          id: 'judge-1',
          name: 'Judge Smith',
          role: 'judge',
          status: 'active',
          currentLocation: { page: '/scoring' }
        }],
        'secretary-1': [{
          id: 'secretary-1',
          name: 'Secretary Jane',
          role: 'secretary',
          status: 'online',
          currentLocation: { page: '/entries' }
        }]
      };

      mockChannel.presenceState.mockReturnValue(serverState);

      // Trigger presence sync
      presenceSyncCallback();

      expect(service.getActiveUsers()).toHaveLength(2);
      expect(service.getActiveUsers().map(u => u.id)).toEqual(['judge-1', 'secretary-1']);
    });
  });

  describe('Entity-Specific Presence Filtering', () => {
    beforeEach(async () => {
      await service.initialize(mockUser);

      // Set up multiple users in different locations
      const users = [
        {
          id: 'judge-1',
          name: 'Judge Smith',
          role: 'judge',
          status: 'online',
          currentLocation: { 
            page: '/scoring', 
            entityId: 'show-123',
            entityType: 'show' 
          }
        },
        {
          id: 'judge-2',
          name: 'Judge Wilson',
          role: 'judge',
          status: 'online',
          currentLocation: { 
            page: '/scoring', 
            entityId: 'show-123',
            entityType: 'show' 
          }
        },
        {
          id: 'secretary-1',
          name: 'Secretary Jane',
          role: 'secretary',
          status: 'online',
          currentLocation: { 
            page: '/entries', 
            entityId: 'show-456',
            entityType: 'show' 
          }
        },
        {
          id: 'exhibitor-1',
          name: 'Exhibitor Bob',
          role: 'exhibitor',
          status: 'online',
          currentLocation: { 
            page: '/dogs', 
            entityId: 'dog-789',
            entityType: 'dog' 
          }
        }
      ];

      users.forEach(user => {
        service['presenceMap'].set(user.id, {
          ...user,
          email: `${user.id}@example.com`,
          lastSeen: new Date()
        } as UserPresence);
      });
    });

    it('should filter users by entity correctly', async () => {
      const show123Users = service.getActiveUsersForEntity('show', 'show-123');
      expect(show123Users).toHaveLength(2);
      expect(show123Users.map(u => u.id)).toEqual(['judge-1', 'judge-2']);

      const dogUsers = service.getActiveUsersForEntity('dog', 'dog-789');
      expect(dogUsers).toHaveLength(1);
      expect(dogUsers[0].id).toBe('exhibitor-1');

      const nonExistentUsers = service.getActiveUsersForEntity('show', 'nonexistent');
      expect(nonExistentUsers).toHaveLength(0);
    });

    it('should filter users by page correctly', async () => {
      const scoringUsers = service.getActiveUsersOnPage('/scoring');
      expect(scoringUsers).toHaveLength(2);
      expect(scoringUsers.map(u => u.id)).toEqual(['judge-1', 'judge-2']);

      const entriesUsers = service.getActiveUsersOnPage('/entries');
      expect(entriesUsers).toHaveLength(1);
      expect(entriesUsers[0].id).toBe('secretary-1');
    });

    it('should identify editing users correctly', async () => {
      // Set up editing activity
      service['presenceMap'].set('editor-1', {
        id: 'editor-1',
        name: 'Editor User',
        email: 'editor@example.com',
        role: 'secretary',
        status: 'online',
        lastSeen: new Date(),
        currentLocation: {
          page: '/dogs',
          entityId: 'dog-123',
          entityType: 'dog'
        },
        activity: {
          type: 'editing',
          details: 'Updating dog profile',
          startedAt: new Date()
        }
      });

      const editingUser = service.isUserEditing('dog', 'dog-123');
      expect(editingUser).toBeTruthy();
      expect(editingUser!.id).toBe('editor-1');

      const noEditor = service.isUserEditing('dog', 'dog-456');
      expect(noEditor).toBeNull();
    });

    it('should filter users by role correctly', async () => {
      const judges = service.getUsersWithRole('judge');
      expect(judges).toHaveLength(2);
      expect(judges.map(u => u.id)).toEqual(['judge-1', 'judge-2']);

      const secretaries = service.getUsersWithRole('secretary');
      expect(secretaries).toHaveLength(1);
      expect(secretaries[0].id).toBe('secretary-1');

      const admins = service.getUsersWithRole('admin');
      expect(admins).toHaveLength(0);
    });
  });

  describe('Real-time Collaboration Scenarios', () => {
    it('should handle concurrent editing conflicts', async () => {
      await service.initialize(mockUser);

      const conflictCallback = vi.fn();
      service.subscribe(conflictCallback);

      // Two users start editing the same entity
      service['presenceMap'].set('user-1', {
        id: 'user-1',
        name: 'User 1',
        email: 'user1@example.com',
        role: 'secretary',
        status: 'online',
        lastSeen: new Date(),
        currentLocation: {
          page: '/dogs/edit',
          entityId: 'dog-123',
          entityType: 'dog'
        },
        activity: {
          type: 'editing',
          details: 'Editing dog profile',
          startedAt: new Date(Date.now() - 1000)
        }
      });

      // Second user tries to edit the same entity
      await service.updateActivity('editing', 'Also editing dog profile');
      await service.updateLocation('/dogs/edit', 'dog-123', 'dog');

      const editingUser = service.isUserEditing('dog', 'dog-123');
      expect(editingUser).toBeTruthy(); // Should detect existing editor
    });

    it('should track judge scoring activities in real-time', async () => {
      await service.initialize(mockUser);

      // Judge starts scoring
      await service.updateActivity('scoring', 'Evaluating Novice A class');
      await service.updateLocation('/scoring/class', 'class-123', 'show');

      expect(mockChannel.track).toHaveBeenLastCalledWith(
        expect.objectContaining({
          activity: {
            type: 'scoring',
            details: 'Evaluating Novice A class',
            startedAt: expect.any(Date)
          },
          currentLocation: {
            page: '/scoring/class',
            entityId: 'class-123',
            entityType: 'show'
          }
        })
      );

      // Verify scoring activity is tracked
      const scoringJudges = service.getActiveUsers().filter(user =>
        user.activity?.type === 'scoring'
      );
      expect(scoringJudges).toHaveLength(0); // Not in presence map yet
    });

    it('should handle judge handoff scenarios', async () => {
      await service.initialize(mockUser);

      const updateCallback = vi.fn();
      service.subscribe(updateCallback);

      // First judge scores
      service['presenceMap'].set('judge-1', {
        id: 'judge-1',
        name: 'Judge Smith',
        email: 'judge1@example.com',
        role: 'judge',
        status: 'online',
        lastSeen: new Date(),
        currentLocation: {
          page: '/scoring',
          entityId: 'class-123',
          entityType: 'show'
        },
        activity: {
          type: 'scoring',
          details: 'Scoring run 1-10',
          startedAt: new Date(Date.now() - 5000)
        }
      });

      // Second judge takes over
      service['presenceMap'].set('judge-2', {
        id: 'judge-2',
        name: 'Judge Wilson',
        email: 'judge2@example.com',
        role: 'judge',
        status: 'online',
        lastSeen: new Date(),
        currentLocation: {
          page: '/scoring',
          entityId: 'class-123',
          entityType: 'show'
        },
        activity: {
          type: 'scoring',
          details: 'Scoring run 11-20',
          startedAt: new Date()
        }
      });

      const activeJudges = service.getActiveUsersForEntity('show', 'class-123')
        .filter(user => user.activity?.type === 'scoring');

      expect(activeJudges).toHaveLength(2);
    });
  });

  describe('Connection Management', () => {
    it('should handle heartbeat updates', async () => {
      await service.initialize(mockUser);

      // Mock heartbeat interval
      const heartbeatSpy = vi.spyOn(service, 'updatePresence');

      // Manually trigger heartbeat (simulating interval)
      await service.updatePresence({ lastSeen: new Date() });

      expect(heartbeatSpy).toHaveBeenCalled();
    });

    it('should handle page visibility changes', async () => {
      await service.initialize(mockUser);

      const statusSpy = vi.spyOn(service, 'updateStatus');

      // Simulate page becoming hidden
      Object.defineProperty(document, 'hidden', { value: true, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(statusSpy).toHaveBeenCalledWith('away');

      // Simulate page becoming visible
      Object.defineProperty(document, 'hidden', { value: false, writable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(statusSpy).toHaveBeenCalledWith('online');
    });

    it('should handle reconnection scenarios', async () => {
      await service.initialize(mockUser);

      const cleanupSpy = vi.spyOn(service, 'cleanup');
      const initializeSpy = vi.spyOn(service, 'initialize');

      // Simulate connection failure and reconnection
      await service.reconnect();

      expect(cleanupSpy).toHaveBeenCalled();
      expect(initializeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          name: 'John Smith'
        })
      );
    });

    it('should handle max reconnection attempts', async () => {
      await service.initialize(mockUser);

      // Mock cleanup to fail
      vi.spyOn(service, 'cleanup').mockRejectedValue(new Error('Cleanup failed'));

      // Simulate multiple reconnection attempts
      for (let i = 0; i < 6; i++) {
        await service.reconnect();
      }

      // Should stop trying after max attempts
      expect(service['reconnectAttempts']).toBe(5);
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should handle many concurrent users efficiently', async () => {
      await service.initialize(mockUser);

      const startTime = Date.now();

      // Simulate 100 users joining
      const users = Array.from({ length: 100 }, (_, i) => ({
        id: `user-${i}`,
        name: `User ${i}`,
        role: 'exhibitor' as const,
        status: 'online' as const,
        currentLocation: {
          page: '/shows',
          entityId: `show-${i % 10}`,
          entityType: 'show' as const
        }
      }));

      users.forEach(user => {
        presenceJoinCallback(user.id, [user]);
      });

      const endTime = Date.now();

      expect(service.getActiveUsers()).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should handle efficiently
    });

    it('should manage memory with frequent presence updates', async () => {
      await service.initialize(mockUser);

      // Simulate rapid presence updates
      for (let i = 0; i < 50; i++) {
        await service.updatePresence({
          lastSeen: new Date(),
          activity: {
            type: 'viewing',
            details: `Update ${i}`,
            startedAt: new Date()
          }
        });
      }

      // Should not accumulate unnecessary data
      expect(service['presenceMap'].size).toBeLessThan(100);
    });

    it('should handle rapid join/leave events', async () => {
      await service.initialize(mockUser);

      const startTime = Date.now();

      // Rapid join/leave cycles
      for (let i = 0; i < 25; i++) {
        const user = {
          id: `temp-user-${i}`,
          name: `Temp User ${i}`,
          role: 'exhibitor' as const,
          status: 'online' as const
        };

        presenceJoinCallback(user.id, [user]);
        presenceLeaveCallback(user.id, [user]);
      }

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500);
      expect(service.getActiveUsers()).toHaveLength(0); // All should be gone
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed presence data', async () => {
      await service.initialize(mockUser);

      // Send malformed presence data
      presenceJoinCallback('malformed', [null]);
      presenceJoinCallback('incomplete', [{ id: 'incomplete' }]); // Missing required fields

      // Should not crash
      expect(() => service.getActiveUsers()).not.toThrow();
    });

    it('should handle channel subscription failures', async () => {
      mockChannel.subscribe.mockRejectedValue(new Error('Subscription failed'));

      await expect(service.initialize(mockUser)).rejects.toThrow('Subscription failed');
    });

    it('should handle tracking failures gracefully', async () => {
      await service.initialize(mockUser);

      mockChannel.track.mockRejectedValue(new Error('Track failed'));

      // Should not throw
      await expect(service.updatePresence({ status: 'busy' })).resolves.toBeUndefined();
    });

    it('should cleanup properly on page unload', async () => {
      await service.initialize(mockUser);

      const cleanupSpy = vi.spyOn(service, 'cleanup');

      // Simulate page unload
      window.dispatchEvent(new Event('beforeunload'));

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });
});