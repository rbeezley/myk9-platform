import { describe, expect, it } from 'vitest';
import type { PendingMutation } from '@myk9/replication';
import { RINGSIDE_RPC_FUNCTION } from '@/services/replication/ringsideEntryRpc';
import { countQueuedScoresByClass, queuedScoreEntryIds } from './useQueuedScoresByClass';

function mutation(rowId: string, rpc: PendingMutation['rpc']): PendingMutation {
  return {
    id: `m-${rowId}`,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId,
    data: {},
    timestamp: 1,
    retries: 0,
    status: 'pending',
    ...(rpc ? { rpc } : {}),
  };
}

const score = (rowId: string) =>
  mutation(rowId, {
    name: RINGSIDE_RPC_FUNCTION,
    fields: { is_scored: true, result_status: 'qualified' },
  });

describe('queuedScoreEntryIds', () => {
  it('counts a queued score', () => {
    expect([...queuedScoreEntryIds([score('e1')])]).toEqual(['e1']);
  });

  it('counts an entry once however many times its score was re-queued', () => {
    expect(queuedScoreEntryIds([score('e1'), score('e1')]).size).toBe(1);
  });

  it('ignores queued writes that are not scores', () => {
    const checkIn = mutation('e2', {
      name: RINGSIDE_RPC_FUNCTION,
      fields: { check_in_status: 'checked_in' },
    });
    const reset = mutation('e3', { name: RINGSIDE_RPC_FUNCTION, fields: { is_scored: false } });
    const direct = mutation('e4', undefined);
    const otherRpc = mutation('e5', { name: 'ringside_update_class', fields: { is_scored: true } });
    expect(queuedScoreEntryIds([checkIn, reset, direct, otherRpc]).size).toBe(0);
  });
});

describe('countQueuedScoresByClass', () => {
  it('rolls entries up to their class', () => {
    const classByEntry = new Map([
      ['e1', 'class-a'],
      ['e2', 'class-a'],
      ['e3', 'class-b'],
    ]);
    const counts = countQueuedScoresByClass(new Set(['e1', 'e2', 'e3']), classByEntry);
    expect(Object.fromEntries(counts)).toEqual({ 'class-a': 2, 'class-b': 1 });
  });

  it('leaves out classes with nothing queued and entries the replica does not know', () => {
    const counts = countQueuedScoresByClass(new Set(['ghost']), new Map([['e1', 'class-a']]));
    expect(counts.size).toBe(0);
  });
});
