import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictResolver } from './ConflictResolver';
import type { FieldAuthority } from '../types';

interface Row {
  id?: string;
  updated_at?: string;
  name: string;
}

const resolver = new ConflictResolver();

describe('ConflictResolver.resolveLWW ladder', () => {
  it('missing timestamps on both sides: remote, no conflict, even when the ids differ', () => {
    const local: Row = { id: 'b', name: 'local' };
    const remote: Row = { id: 'a', name: 'remote' };

    const result = resolver.resolveLWW(local, remote);

    expect(result).toEqual({
      resolvedEntity: remote,
      strategy: 'last-write-wins',
      hadConflict: false,
      automatic: true,
    });
    expect(result.resolvedEntity).toBe(remote);
  });

  it('local has a timestamp and remote has none: local wins as a conflict', () => {
    const local: Row = { id: '1', name: 'local', updated_at: '2025-06-01T10:00:00Z' };
    const remote: Row = { id: '1', name: 'remote' };

    const result = resolver.resolveLWW(local, remote);

    expect(result).toEqual({
      resolvedEntity: local,
      strategy: 'last-write-wins',
      hadConflict: true,
      automatic: true,
    });
    expect(result.resolvedEntity).toBe(local);
  });

  it('remote has a timestamp and local has none: remote wins as a conflict', () => {
    const local: Row = { id: '1', name: 'local' };
    const remote: Row = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

    const result = resolver.resolveLWW(local, remote);

    expect(result).toEqual({
      resolvedEntity: remote,
      strategy: 'last-write-wins',
      hadConflict: true,
      automatic: true,
    });
    expect(result.resolvedEntity).toBe(remote);
  });

  it('later local timestamp wins over a remote that sorts later as text', () => {
    const local: Row = { id: '1', name: 'local', updated_at: '2025-06-01T09:00:00-05:00' };
    const remote: Row = { id: '9', name: 'remote', updated_at: '2025-06-01T11:00:00Z' };

    const result = resolver.resolveLWW(local, remote);

    expect(result.resolvedEntity).toBe(local);
    expect(result).toMatchObject({
      strategy: 'last-write-wins',
      hadConflict: true,
      automatic: true,
    });
  });

  it('later remote timestamp wins over a local that sorts later as text', () => {
    const local: Row = { id: '9', name: 'local', updated_at: '2025-06-01T11:00:00Z' };
    const remote: Row = { id: '1', name: 'remote', updated_at: '2025-06-01T09:00:00-05:00' };

    const result = resolver.resolveLWW(local, remote);

    expect(result.resolvedEntity).toBe(remote);
    expect(result).toMatchObject({
      strategy: 'last-write-wins',
      hadConflict: true,
      automatic: true,
    });
  });

  it('same millisecond, local microseconds later: local wins as a conflict', () => {
    const local: Row = { id: '1', name: 'local', updated_at: '2025-06-01T10:00:00.000002Z' };
    const remote: Row = { id: '9', name: 'remote', updated_at: '2025-06-01T10:00:00.000001Z' };

    const result = resolver.resolveLWW(local, remote);

    expect(result).toEqual({
      resolvedEntity: local,
      strategy: 'last-write-wins',
      hadConflict: true,
      automatic: true,
    });
    expect(result.resolvedEntity).toBe(local);
  });

  it('same millisecond, remote microseconds later: remote wins as a conflict', () => {
    const local: Row = { id: '9', name: 'local', updated_at: '2025-06-01T10:00:00.000001Z' };
    const remote: Row = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00.000002Z' };

    const result = resolver.resolveLWW(local, remote);

    expect(result).toEqual({
      resolvedEntity: remote,
      strategy: 'last-write-wins',
      hadConflict: true,
      automatic: true,
    });
    expect(result.resolvedEntity).toBe(remote);
  });

  describe('identical timestamps: id tie-break', () => {
    const updated_at = '2025-06-01T10:00:00Z';

    it('higher local id wins as a conflict', () => {
      const local: Row = { id: 'b', name: 'local', updated_at };
      const remote: Row = { id: 'a', name: 'remote', updated_at };

      const result = resolver.resolveLWW(local, remote);

      expect(result).toEqual({
        resolvedEntity: local,
        strategy: 'last-write-wins',
        hadConflict: true,
        automatic: true,
      });
      expect(result.resolvedEntity).toBe(local);
    });

    it('higher remote id wins as a conflict', () => {
      const local: Row = { id: 'a', name: 'local', updated_at };
      const remote: Row = { id: 'b', name: 'remote', updated_at };

      const result = resolver.resolveLWW(local, remote);

      expect(result).toEqual({
        resolvedEntity: remote,
        strategy: 'last-write-wins',
        hadConflict: true,
        automatic: true,
      });
      expect(result.resolvedEntity).toBe(remote);
    });

    it('same id: remote, no conflict', () => {
      const local: Row = { id: 'a', name: 'local', updated_at };
      const remote: Row = { id: 'a', name: 'remote', updated_at };

      expect(resolver.resolveLWW(local, remote)).toEqual({
        resolvedEntity: remote,
        strategy: 'last-write-wins',
        hadConflict: false,
        automatic: true,
      });
    });

    it('only the local row has an id: remote, no conflict', () => {
      const local: Row = { id: 'zzz', name: 'local', updated_at };
      const remote: Row = { name: 'remote', updated_at };

      expect(resolver.resolveLWW(local, remote)).toEqual({
        resolvedEntity: remote,
        strategy: 'last-write-wins',
        hadConflict: false,
        automatic: true,
      });
    });

    it('only the remote row has an id: remote, no conflict', () => {
      const local: Row = { name: 'local', updated_at };
      const remote: Row = { id: 'zzz', name: 'remote', updated_at };

      expect(resolver.resolveLWW(local, remote)).toEqual({
        resolvedEntity: remote,
        strategy: 'last-write-wins',
        hadConflict: false,
        automatic: true,
      });
    });
  });
});

describe('ConflictResolver.resolve strategy dispatch', () => {
  const local: Row = { id: '1', name: 'local', updated_at: '2025-06-02T10:00:00Z' };
  const remote: Row = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

  it('server-authoritative takes the remote even when the local row is newer', () => {
    const result = resolver.resolve(local, remote, 'server-authoritative');

    expect(result.resolvedEntity).toBe(remote);
    expect(result.strategy).toBe('server-authoritative');
  });

  it('client-authoritative takes the local even when the remote row is newer', () => {
    const olderLocal: Row = { id: '1', name: 'local', updated_at: '2025-06-01T10:00:00Z' };
    const newerRemote: Row = { id: '1', name: 'remote', updated_at: '2025-06-02T10:00:00Z' };

    const result = resolver.resolve(olderLocal, newerRemote, 'client-authoritative');

    expect(result.resolvedEntity).toBe(olderLocal);
    expect(result.strategy).toBe('client-authoritative');
  });

  it('last-write-wins takes the newer row', () => {
    const result = resolver.resolve(local, remote, 'last-write-wins');

    expect(result.resolvedEntity).toBe(local);
    expect(result.strategy).toBe('last-write-wins');
  });
});

describe('ConflictResolver.resolveFieldLevel null handling', () => {
  const authority: FieldAuthority = { clientFields: ['notes'], serverFields: [] };

  it('a local null keeps the server value and is not a conflict', () => {
    const result = resolver.resolveFieldLevel(
      { notes: null } as Record<string, unknown>,
      { notes: 'server' },
      authority
    );

    expect(result.resolvedEntity).toEqual({ notes: 'server' });
    expect(result.hadConflict).toBe(false);
    expect(result.conflictingFields).toBeUndefined();
  });

  it('a local value over a remote null takes the local value and is not a conflict', () => {
    const result = resolver.resolveFieldLevel(
      { notes: 'mine' },
      { notes: null } as Record<string, unknown>,
      authority
    );

    expect(result.resolvedEntity).toEqual({ notes: 'mine' });
    expect(result.hadConflict).toBe(false);
  });

  it('a local value over a different remote value is a conflict that names the field', () => {
    const result = resolver.resolveFieldLevel({ notes: 'mine' }, { notes: 'theirs' }, authority);

    expect(result.resolvedEntity).toEqual({ notes: 'mine' });
    expect(result.hadConflict).toBe(true);
    expect(result.conflictingFields).toEqual(['notes']);
  });
});

describe('ConflictResolver.findConflictingFields value edges', () => {
  it('null on either side is no opinion, not a conflict', () => {
    expect(resolver.findConflictingFields({ a: null, b: 'x' }, { a: 'y', b: null })).toEqual([]);
  });

  it('objects with equal content are not a conflict; different content is', () => {
    expect(
      resolver.findConflictingFields(
        { tags: ['a', 'b'], meta: { n: 1 }, other: { n: 1 } },
        { tags: ['a', 'b'], meta: { n: 1 }, other: { n: 2 } }
      )
    ).toEqual(['other']);
  });

  it('an object and a primitive that serializes to the same text still conflict', () => {
    expect(resolver.findConflictingFields({ meta: { a: 1 } }, { meta: '{"a":1}' })).toEqual([
      'meta',
    ]);
  });
});

describe('ConflictResolver value edges (undefined, boxed primitives)', () => {
  it('a field absent on one side is no opinion, not a conflict', () => {
    expect(resolver.findConflictingFields({ a: 'x' }, { b: 'y' })).toEqual([]);
  });

  it('a primitive and a boxed primitive of the same number still conflict, in either order', () => {
    expect(resolver.findConflictingFields({ n: 5 }, { n: new Number(5) })).toEqual(['n']);
    expect(resolver.findConflictingFields({ n: new Number(5) }, { n: 5 })).toEqual(['n']);
  });

  it('field-level merge reports itself as automatic', () => {
    const result = resolver.resolveFieldLevel(
      { notes: 'a' },
      { notes: 'b' },
      { clientFields: ['notes'], serverFields: [] }
    );

    expect(result.automatic).toBe(true);
    expect(result.strategy).toBe('field-level-merge');
  });

  it('an undefined local field keeps the server value and is not a conflict', () => {
    const result = resolver.resolveFieldLevel(
      { notes: undefined } as Record<string, unknown>,
      { notes: 'server' },
      { clientFields: ['notes'], serverFields: [] }
    );

    expect(result.resolvedEntity).toEqual({ notes: 'server' });
    expect(result.hadConflict).toBe(false);
  });
});

describe('ConflictResolver.logConflict browser event', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const resolution = {
    resolvedEntity: { id: '1' },
    strategy: 'field-level-merge' as const,
    hadConflict: true,
    conflictingFields: ['a', 'b'],
    automatic: true,
  };

  it('dispatches replication:conflict-resolved with the exact detail when window exists', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    resolver.logConflict('entries', 'row-1', { id: '1' }, { id: '1' }, resolution);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe('replication:conflict-resolved');
    expect(event.detail).toEqual({
      tableName: 'entries',
      rowId: 'row-1',
      strategy: 'field-level-merge',
      fieldsAffected: 2,
    });
  });

  it('reports zero fields affected when the resolution names none', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });

    resolver.logConflict(
      'entries',
      'row-1',
      { id: '1' },
      { id: '1' },
      {
        resolvedEntity: { id: '1' },
        strategy: 'server-authoritative',
        hadConflict: true,
        automatic: true,
      }
    );

    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail.fieldsAffected).toBe(0);
    expect(event.detail.strategy).toBe('server-authoritative');
  });

  it('does not throw and still logs when there is no window', () => {
    vi.stubGlobal('window', undefined);
    const log = vi.fn();
    const quiet = new ConflictResolver({ log, warn: vi.fn(), error: vi.fn() });

    expect(() =>
      quiet.logConflict('entries', 'row-1', { id: '1' }, { id: '1' }, resolution)
    ).not.toThrow();
    expect(log).toHaveBeenCalled();
  });
});
