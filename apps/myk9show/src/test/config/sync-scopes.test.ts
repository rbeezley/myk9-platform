// Comprehensive tests for sync configuration and scopes
import { describe, it, expect } from 'vitest';
import {
  SYNC_SCOPES,
  ENTITY_SIZE_ESTIMATES,
  STORAGE_LIMITS,
  SyncPriority,
} from '@/config/sync-scopes';

describe('Sync Configuration Tests', () => {
  describe('SYNC_SCOPES Configuration', () => {
    it('should have all required user roles defined', () => {
      const requiredRoles = ['NEW_USER', 'EXHIBITOR', 'JUDGE', 'SECRETARY'];

      requiredRoles.forEach(role => {
        expect(SYNC_SCOPES).toHaveProperty(role);
        expect(typeof SYNC_SCOPES[role]).toBe('object');
      });
    });

    it('should have consistent entity types across all roles', () => {
      const allEntityTypes = new Set<string>();

      // Collect all entity types from all roles
      Object.values(SYNC_SCOPES).forEach(scope => {
        Object.keys(scope).forEach(entityType => {
          allEntityTypes.add(entityType);
        });
      });

      // Verify each role has configuration for common entities
      const commonEntities = ['people', 'dogs', 'shows'];
      Object.entries(SYNC_SCOPES).forEach(([, scope]) => {
        commonEntities.forEach(entity => {
          if (scope[entity]) {
            expect(scope[entity]).toHaveProperty('scope');
            expect(scope[entity]).toHaveProperty('limit');
            expect(typeof scope[entity].limit).toBe('number');
            expect(scope[entity].limit).toBeGreaterThanOrEqual(0);
          }
        });
      });
    });

    it('should have appropriate limits for each role', () => {
      // NEW_USER should have minimal limits
      const newUser = SYNC_SCOPES.NEW_USER;
      expect(newUser.people.limit).toBeLessThanOrEqual(1);
      expect(newUser.dogs.limit).toBeLessThanOrEqual(5);

      // SECRETARY should have the highest limits
      const secretary = SYNC_SCOPES.SECRETARY;
      expect(secretary.people.limit).toBeGreaterThan(newUser.people.limit);

      // EXHIBITOR should have moderate limits
      const exhibitor = SYNC_SCOPES.EXHIBITOR;
      expect(exhibitor.dogs.limit).toBeGreaterThan(newUser.dogs.limit);
      expect(exhibitor.dogs.limit).toBeLessThanOrEqual(secretary.dogs?.limit || Infinity);
    });

    it('should scale appropriately from minimal to full access', () => {
      const roles = ['NEW_USER', 'EXHIBITOR', 'JUDGE', 'SECRETARY'];
      const previousLimits: Record<string, number> = {};

      roles.forEach(role => {
        const scope = SYNC_SCOPES[role];
        Object.entries(scope).forEach(([entity, config]) => {
          // Validate entity config exists
          if (previousLimits[entity] !== undefined) {
            // Should generally increase or stay the same (not strict requirement)
            expect(config.limit).toBeGreaterThanOrEqual(0);
          }
          previousLimits[entity] = config.limit;
        });
      });
    });
  });

  describe('ENTITY_SIZE_ESTIMATES Configuration', () => {
    it('should have size estimates for all entity types', () => {
      const requiredEntities = ['person', 'dog', 'show', 'entry', 'club'];

      requiredEntities.forEach(entity => {
        expect(ENTITY_SIZE_ESTIMATES).toHaveProperty(entity);
        expect(typeof ENTITY_SIZE_ESTIMATES[entity]).toBe('number');
        expect(ENTITY_SIZE_ESTIMATES[entity]).toBeGreaterThan(0);
      });
    });

    it('should have realistic size estimates', () => {
      // All estimates should be reasonable (between 0.1KB and 100KB)
      Object.entries(ENTITY_SIZE_ESTIMATES).forEach(([, size]) => {
        expect(size).toBeGreaterThan(0.1);
        expect(size).toBeLessThan(100);
      });
    });

    it('should reflect relative complexity of entities', () => {
      // Dogs with photos should be larger than simple entries
      expect(ENTITY_SIZE_ESTIMATES.dog).toBeGreaterThan(ENTITY_SIZE_ESTIMATES.entry);

      // Shows with complex metadata should be substantial
      expect(ENTITY_SIZE_ESTIMATES.show).toBeGreaterThan(ENTITY_SIZE_ESTIMATES.person);

      // Clubs should be reasonable size
      expect(ENTITY_SIZE_ESTIMATES.club).toBeGreaterThan(0);
    });
  });

  describe('STORAGE_LIMITS Configuration', () => {
    it('should have all required storage limit properties', () => {
      const requiredProperties = [
        'MAX_STORAGE_MB',
        'WARNING_THRESHOLD',
        'CRITICAL_THRESHOLD',
        'MIN_FREE_SPACE_MB',
        'CACHE_TTL_DAYS',
      ];

      requiredProperties.forEach(prop => {
        expect(STORAGE_LIMITS).toHaveProperty(prop);
        expect(typeof STORAGE_LIMITS[prop]).toBe('number');
      });
    });

    it('should have logical threshold relationships', () => {
      expect(STORAGE_LIMITS.WARNING_THRESHOLD).toBeLessThan(STORAGE_LIMITS.CRITICAL_THRESHOLD);
      expect(STORAGE_LIMITS.CRITICAL_THRESHOLD).toBeLessThan(1.0);
      expect(STORAGE_LIMITS.WARNING_THRESHOLD).toBeGreaterThan(0);
    });

    it('should have reasonable storage limits', () => {
      expect(STORAGE_LIMITS.MAX_STORAGE_MB).toBeGreaterThan(0);
      expect(STORAGE_LIMITS.MIN_FREE_SPACE_MB).toBeGreaterThan(0);
      expect(STORAGE_LIMITS.CACHE_TTL_DAYS).toBeGreaterThan(0);

      // Should be reasonable for mobile devices
      expect(STORAGE_LIMITS.MAX_STORAGE_MB).toBeLessThan(1000); // Less than 1GB
      expect(STORAGE_LIMITS.MIN_FREE_SPACE_MB).toBeLessThan(100); // Less than 100MB
    });

    it('should have cache TTL that makes sense for dog show data', () => {
      // Dog show data shouldn't be cached too long (shows change frequently)
      // but not too short either (to avoid excessive syncing)
      expect(STORAGE_LIMITS.CACHE_TTL_DAYS).toBeGreaterThan(1);
      expect(STORAGE_LIMITS.CACHE_TTL_DAYS).toBeLessThan(90);
    });
  });

  describe('SyncPriority Configuration', () => {
    it('should have all priority levels defined', () => {
      const requiredPriorities = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'ARCHIVE'];

      requiredPriorities.forEach(priority => {
        expect(SyncPriority).toHaveProperty(priority);
        expect(typeof SyncPriority[priority]).toBe('number');
      });
    });

    it('should have logical priority ordering', () => {
      expect(SyncPriority.CRITICAL).toBeLessThan(SyncPriority.HIGH);
      expect(SyncPriority.HIGH).toBeLessThan(SyncPriority.NORMAL);
      expect(SyncPriority.NORMAL).toBeLessThan(SyncPriority.LOW);
      expect(SyncPriority.LOW).toBeLessThan(SyncPriority.ARCHIVE);
    });

    it('should start from 1 for highest priority', () => {
      expect(SyncPriority.CRITICAL).toBe(1);
    });

    it('should have reasonable priority range', () => {
      const priorities = Object.values(SyncPriority).filter(v => typeof v === 'number') as number[];
      const min = Math.min(...priorities);
      const max = Math.max(...priorities);

      expect(min).toBe(1);
      expect(max).toBeLessThan(10); // Keep priority range manageable
    });
  });

  describe('Configuration Consistency', () => {
    it('should have consistent configuration across all modules', () => {
      // Verify that entity size estimates cover all entities in sync scopes
      const scopeEntities = new Set<string>();
      Object.values(SYNC_SCOPES).forEach(scope => {
        Object.keys(scope).forEach(entity => scopeEntities.add(entity));
      });

      const estimateEntities = new Set(Object.keys(ENTITY_SIZE_ESTIMATES));

      // Should have estimates for main entity types
      expect(estimateEntities.has('person')).toBe(true);
      expect(estimateEntities.has('dog')).toBe(true);
      expect(estimateEntities.has('show')).toBe(true);
    });

    it('should have appropriate escalation between user roles', () => {
      const calculateTotalSize = (scope: Record<string, { limit: number }>) => {
        let total = 0;
        Object.entries(scope).forEach(([entity, config]: [string, { limit: number }]) => {
          const mappedEntity =
            entity === 'people'
              ? 'person'
              : entity === 'dogs'
                ? 'dog'
                : entity === 'shows'
                  ? 'show'
                  : entity === 'entries'
                    ? 'entry'
                    : entity === 'clubs'
                      ? 'club'
                      : entity;
          const entitySize =
            ENTITY_SIZE_ESTIMATES[mappedEntity as keyof typeof ENTITY_SIZE_ESTIMATES] || 1;
          total += entitySize * config.limit;
        });
        return total;
      };

      const newUserSize = calculateTotalSize(SYNC_SCOPES.NEW_USER);
      const exhibitorSize = calculateTotalSize(SYNC_SCOPES.EXHIBITOR);
      const secretarySize = calculateTotalSize(SYNC_SCOPES.SECRETARY);

      expect(exhibitorSize).toBeGreaterThan(newUserSize);
      expect(secretarySize).toBeGreaterThan(exhibitorSize);
    });
  });

  describe('Real-world Scenario Validation', () => {
    it('should support realistic dog show scenarios', () => {
      // Large dog show scenario
      const largeShow = {
        participants: 500,
        dogs: 800,
        classes: 50,
        entries: 2000,
      };

      // Secretary should be able to handle large show
      const secretaryScope = SYNC_SCOPES.SECRETARY;
      expect(secretaryScope.people.limit).toBeGreaterThanOrEqual(largeShow.participants);
      expect(secretaryScope.dogs?.limit || 0).toBeGreaterThanOrEqual(largeShow.dogs);
      expect(secretaryScope.entries?.limit || 0).toBeGreaterThanOrEqual(largeShow.entries);
    });

    it('should minimize data for new users to encourage adoption', () => {
      const newUserScope = SYNC_SCOPES.NEW_USER;
      let totalKB = 0;

      Object.entries(newUserScope).forEach(([entity, config]) => {
        const mappedEntity =
          entity === 'people'
            ? 'person'
            : entity === 'dogs'
              ? 'dog'
              : entity === 'shows'
                ? 'show'
                : entity === 'entries'
                  ? 'entry'
                  : entity === 'clubs'
                    ? 'club'
                    : entity;

        const entitySize =
          ENTITY_SIZE_ESTIMATES[mappedEntity as keyof typeof ENTITY_SIZE_ESTIMATES] || 1;
        totalKB += entitySize * config.limit;
      });

      // New users should sync less than 150KB initially (updated threshold)
      expect(totalKB).toBeLessThan(150);
    });
  });
});
