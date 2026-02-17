import { describe, it, expect, vi } from 'vitest';
import { ConflictResolver, conflictResolver } from './ConflictResolver';
import type { ConflictStrategy, FieldAuthority } from '../types';

interface TestEntity {
  id: string;
  name: string;
  updated_at?: string;
  score?: number;
  status?: string;
}

describe('ConflictResolver', () => {
  describe('resolveLWW', () => {
    it('should pick remote when both timestamps are missing', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      const result = resolver.resolveLWW(local, remote);

      expect(result.resolvedEntity).toBe(remote);
      expect(result.strategy).toBe('last-write-wins');
      expect(result.hadConflict).toBe(false);
      expect(result.automatic).toBe(true);
    });

    it('should pick local when local is newer', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-02T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

      const result = resolver.resolveLWW(local, remote);

      expect(result.resolvedEntity).toBe(local);
      expect(result.hadConflict).toBe(true);
    });

    it('should pick remote when remote is newer', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-01T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-02T10:00:00Z' };

      const result = resolver.resolveLWW(local, remote);

      expect(result.resolvedEntity).toBe(remote);
      expect(result.hadConflict).toBe(true);
    });

    it('should use string comparison when Date.getTime() produces same value', () => {
      const resolver = new ConflictResolver();
      // Same second but different microseconds
      const local: TestEntity = {
        id: '1',
        name: 'local',
        updated_at: '2025-06-01T10:00:00.000100Z',
      };
      const remote: TestEntity = {
        id: '1',
        name: 'remote',
        updated_at: '2025-06-01T10:00:00.000200Z',
      };

      const result = resolver.resolveLWW(local, remote);

      expect(result.resolvedEntity).toBe(remote);
      expect(result.hadConflict).toBe(true);
    });

    it('should use ID tiebreaker when timestamps are identical', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: 'b-id', name: 'local', updated_at: '2025-06-01T10:00:00Z' };
      const remote: TestEntity = { id: 'a-id', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

      const result = resolver.resolveLWW(local, remote);

      // 'b-id' > 'a-id' so local wins
      expect(result.resolvedEntity).toBe(local);
      expect(result.hadConflict).toBe(true);
    });

    it('should pick remote as fallback when timestamps and IDs are identical', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-01T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

      const result = resolver.resolveLWW(local, remote);

      expect(result.resolvedEntity).toBe(remote);
      expect(result.hadConflict).toBe(false);
    });

    it('should pick remote when only local timestamp is missing', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

      const result = resolver.resolveLWW(local, remote);

      expect(result.resolvedEntity).toBe(remote);
      expect(result.hadConflict).toBe(true);
    });

    it('should pick local when only remote timestamp is missing', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-01T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      const result = resolver.resolveLWW(local, remote);

      expect(result.resolvedEntity).toBe(local);
      expect(result.hadConflict).toBe(true);
    });
  });

  describe('resolveServerAuthoritative', () => {
    it('should always return remote entity', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      const result = resolver.resolveServerAuthoritative(local, remote);

      expect(result.resolvedEntity).toBe(remote);
      expect(result.strategy).toBe('server-authoritative');
      expect(result.hadConflict).toBe(true);
      expect(result.automatic).toBe(true);
    });
  });

  describe('resolveClientAuthoritative', () => {
    it('should always return local entity', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      const result = resolver.resolveClientAuthoritative(local, remote);

      expect(result.resolvedEntity).toBe(local);
      expect(result.strategy).toBe('client-authoritative');
      expect(result.hadConflict).toBe(true);
      expect(result.automatic).toBe(true);
    });
  });

  describe('resolveFieldLevel', () => {
    it('should merge using field authority', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local-name', score: 95, status: 'checked-in' };
      const remote: TestEntity = { id: '1', name: 'remote-name', score: 90, status: 'registered' };

      const authority: FieldAuthority = {
        serverFields: ['score'],
        clientFields: ['status'],
      };

      const result = resolver.resolveFieldLevel(local, remote, authority);

      expect(result.strategy).toBe('field-level-merge');
      // Remote is the base, client fields overwritten
      expect(result.resolvedEntity.status).toBe('checked-in');
      // Server fields kept from remote (base)
      expect(result.resolvedEntity.score).toBe(90);
      // name is not in clientFields, so remote value is kept
      expect(result.resolvedEntity.name).toBe('remote-name');
    });

    it('should report conflicting fields when values differ', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', status: 'checked-in' };
      const remote: TestEntity = { id: '1', name: 'remote', status: 'registered' };

      const authority: FieldAuthority = {
        serverFields: [],
        clientFields: ['status'],
      };

      const result = resolver.resolveFieldLevel(local, remote, authority);

      expect(result.hadConflict).toBe(true);
      expect(result.conflictingFields).toContain('status');
    });

    it('should not report conflict when client field values are identical', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', status: 'checked-in' };
      const remote: TestEntity = { id: '1', name: 'remote', status: 'checked-in' };

      const authority: FieldAuthority = {
        serverFields: [],
        clientFields: ['status'],
      };

      const result = resolver.resolveFieldLevel(local, remote, authority);

      expect(result.hadConflict).toBe(false);
      expect(result.conflictingFields).toBeUndefined();
    });

    it('should not report conflict when local client field is null', () => {
      const resolver = new ConflictResolver();
      const local = { id: '1', name: 'local', status: null } as unknown as TestEntity;
      const remote: TestEntity = { id: '1', name: 'remote', status: 'registered' };

      const authority: FieldAuthority = {
        serverFields: [],
        clientFields: ['status'],
      };

      const result = resolver.resolveFieldLevel(local, remote, authority);

      expect(result.hadConflict).toBe(false);
    });
  });

  describe('resolve', () => {
    it('should delegate to resolveLWW for last-write-wins strategy', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-02T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

      const result = resolver.resolve(local, remote, 'last-write-wins');

      expect(result.strategy).toBe('last-write-wins');
      expect(result.resolvedEntity).toBe(local);
    });

    it('should delegate to resolveServerAuthoritative', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      const result = resolver.resolve(local, remote, 'server-authoritative');

      expect(result.resolvedEntity).toBe(remote);
    });

    it('should delegate to resolveClientAuthoritative', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      const result = resolver.resolve(local, remote, 'client-authoritative');

      expect(result.resolvedEntity).toBe(local);
    });

    it('should delegate to resolveFieldLevel with authority', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', status: 'checked-in' };
      const remote: TestEntity = { id: '1', name: 'remote', status: 'registered' };
      const authority: FieldAuthority = { serverFields: [], clientFields: ['status'] };

      const result = resolver.resolve(local, remote, 'field-level-merge', authority);

      expect(result.strategy).toBe('field-level-merge');
      expect(result.resolvedEntity.status).toBe('checked-in');
    });

    it('should throw when field-level-merge is used without authority', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      expect(() => resolver.resolve(local, remote, 'field-level-merge')).toThrow(
        'Field-level merge requires authority configuration'
      );
    });

    it('should fall back to LWW for unknown strategy', () => {
      const resolver = new ConflictResolver();
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-02T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

      // Intentionally passing an invalid strategy to test fallback behavior
      const result = resolver.resolve(
        local,
        remote,
        'unknown-strategy' as unknown as ConflictStrategy
      );

      expect(result.strategy).toBe('last-write-wins');
      expect(result.resolvedEntity).toBe(local);
    });
  });

  describe('findConflictingFields', () => {
    it('should find fields with different values', () => {
      const resolver = new ConflictResolver();
      const local = { id: '1', name: 'Alice', score: 95 };
      const remote = { id: '1', name: 'Bob', score: 95 };

      const conflicts = resolver.findConflictingFields(local, remote);

      expect(conflicts).toContain('name');
      expect(conflicts).not.toContain('score');
      expect(conflicts).not.toContain('id');
    });

    it('should ignore specified fields (updated_at, created_at by default)', () => {
      const resolver = new ConflictResolver();
      const local = { id: '1', name: 'Alice', updated_at: '2025-01-01', created_at: '2025-01-01' };
      const remote = { id: '1', name: 'Alice', updated_at: '2025-02-01', created_at: '2025-02-01' };

      const conflicts = resolver.findConflictingFields(local, remote);

      expect(conflicts).toHaveLength(0);
    });

    it('should allow custom ignore fields', () => {
      const resolver = new ConflictResolver();
      const local = { id: '1', name: 'Alice', score: 95 };
      const remote = { id: '1', name: 'Bob', score: 90 };

      const conflicts = resolver.findConflictingFields(local, remote, ['name']);

      expect(conflicts).not.toContain('name');
      expect(conflicts).toContain('score');
    });

    it('should detect nested object conflicts via JSON comparison', () => {
      const resolver = new ConflictResolver();
      const local = { id: '1', meta: { a: 1 } };
      const remote = { id: '1', meta: { a: 2 } };

      const conflicts = resolver.findConflictingFields(local, remote);

      expect(conflicts).toContain('meta');
    });

    it('should not report conflict for identical nested objects', () => {
      const resolver = new ConflictResolver();
      const local = { id: '1', meta: { a: 1, b: 2 } };
      const remote = { id: '1', meta: { a: 1, b: 2 } };

      const conflicts = resolver.findConflictingFields(local, remote);

      expect(conflicts).not.toContain('meta');
    });

    it('should not report conflict when one value is null', () => {
      const resolver = new ConflictResolver();
      const local = { id: '1', name: 'Alice', score: null as number | null };
      const remote = { id: '1', name: 'Alice', score: 95 as number | null };

      const conflicts = resolver.findConflictingFields(local, remote);

      expect(conflicts).not.toContain('score');
    });
  });

  describe('logConflict', () => {
    it('should call logger with conflict details', () => {
      const mockLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const resolver = new ConflictResolver(mockLogger);
      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      resolver.logConflict('entries', '1', local, remote, {
        resolvedEntity: remote,
        strategy: 'server-authoritative',
        hadConflict: true,
        automatic: true,
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        '[ConflictResolver] Conflict resolved:',
        expect.objectContaining({
          tableName: 'entries',
          rowId: '1',
          strategy: 'server-authoritative',
        })
      );
    });
  });

  describe('singleton export', () => {
    it('should export a default conflictResolver instance', () => {
      expect(conflictResolver).toBeInstanceOf(ConflictResolver);
    });
  });
});
