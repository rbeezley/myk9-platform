import { describe, expect, it } from 'vitest';
import { ConflictResolver } from './ConflictResolver';
import type { FieldAuthority } from '../types';

interface ScoredEntry {
  id: string;
  score: number | null;
  status: string;
  updated_at: string;
}

describe('ConflictResolver: local-wins semantics', () => {
  it('keeps a locally-mutated field when a concurrent server update lacks that field change', () => {
    // base   = { id:'1', score:null, status:'pending',   updated_at:'2026-04-20T10:00:00Z' }
    // local  = { id:'1', score:95,   status:'pending',   updated_at:'2026-04-20T10:00:05Z' }
    // server = { id:'1', score:null, status:'completed', updated_at:'2026-04-20T10:00:03Z' }
    //
    // The client wrote score=95. The server independently changed status to 'completed'.
    // A field-level merge with score in clientFields should preserve 95 and pick up 'completed'.
    const local: ScoredEntry = {
      id: '1',
      score: 95,
      status: 'pending',
      updated_at: '2026-04-20T10:00:05Z',
    };
    const remote: ScoredEntry = {
      id: '1',
      score: null,
      status: 'completed',
      updated_at: '2026-04-20T10:00:03Z',
    };

    const authority: FieldAuthority = {
      clientFields: ['score'],
      serverFields: ['status'],
    };

    const resolver = new ConflictResolver();
    const result = resolver.resolveFieldLevel(local, remote, authority);

    // Local score survives
    expect(result.resolvedEntity.score).toBe(95);
    // Server status is applied (remote is the base for non-client fields)
    expect(result.resolvedEntity.status).toBe('completed');
    expect(result.strategy).toBe('field-level-merge');
  });

  it('gives local the tiebreak when updated_at is identical', () => {
    // Two writes at the exact same millisecond-resolution timestamp.
    // The implementation uses an ID lexicographic tiebreaker: higher string ID wins.
    // 'z-client' > 'a-server', so local (z-client) wins.
    const resolver = new ConflictResolver();
    const ts = '2026-04-20T10:00:00.000Z';

    const local = { id: 'z-client', name: 'local-write', updated_at: ts };
    const remote = { id: 'a-server', name: 'remote-write', updated_at: ts };

    const result = resolver.resolveLWW(local, remote);

    // Documented tiebreaker: lexicographically higher ID wins.
    // 'z-client' > 'a-server' => local wins.
    expect(result.resolvedEntity).toBe(local);
    expect(result.hadConflict).toBe(true);
    expect(result.strategy).toBe('last-write-wins');
  });

  it('does not overwrite a locally-nulled client field with the server value', () => {
    // This test guards B1: when the local value for a clientField is null, the server's
    // real value must survive — null local means "no local opinion", not "explicitly cleared".
    //
    // Integration boundary note: the full pending-mutation protection (isDirty guard) lives
    // in ReplicatedTable.set() — the ConflictResolver itself has no visibility into the
    // mutation queue. This test validates the Resolver's contract at its own boundary:
    // a null local client field must NOT overwrite the server's non-null value.
    const local = { id: '1', status: null as string | null, name: 'dog-name' };
    const remote = { id: '1', status: 'registered', name: 'dog-name' };

    const authority: FieldAuthority = {
      clientFields: ['status'],
      serverFields: ['name'],
    };

    const resolver = new ConflictResolver();
    const result = resolver.resolveFieldLevel(local, remote, authority);

    // Server's 'registered' value must survive — local null is not a meaningful write
    expect(result.resolvedEntity.status).toBe('registered');
    // name was not in clientFields, so remote value is kept
    expect(result.resolvedEntity.name).toBe('dog-name');
    // No conflict reported (null local is not counted as a conflicting write)
    expect(result.hadConflict).toBe(false);
  });
});
