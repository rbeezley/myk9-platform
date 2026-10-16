import { describe, expect, it } from 'vitest';
import { rebaseQueuedMutation } from '../mutation-queue-rewrite';
import type { PendingMutation } from '../types';
import { buildQueuedFieldPruner } from './pruneQueuedFields';

interface Row {
  note?: string | null;
  result?: string;
}

const toRemote = (row: Row) => ({ judge_notes: row.note ?? null, result_status: row.result });
const nullIsUndefined = {
  normalizeValue: (_field: string, value: unknown) => (value === null ? undefined : value),
};

describe('buildQueuedFieldPruner (MYK9-1236)', () => {
  const prune = buildQueuedFieldPruner<Row>({
    base: { result: 'qualified' },
    toRemoteFields: toRemote,
    comparePolicy: nullIsUndefined,
    instantFields: new Set(),
  })!;

  it('drops a field equal to the base under the policy and keeps a real change', () => {
    expect(prune({ judge_notes: null, result_status: 'nq' })).toEqual({ result_status: 'nq' });
  });

  it('keeps a field the mapping does not cover', () => {
    expect(prune({ unmapped: null })).toEqual({ unmapped: null });
  });

  it('has nothing to prune without a mapping', () => {
    expect(
      buildQueuedFieldPruner<Row>({
        base: {},
        toRemoteFields: undefined,
        comparePolicy: undefined,
        instantFields: new Set(),
      })
    ).toBeUndefined();
  });
});

describe('rebaseQueuedMutation with a pruner (MYK9-1236)', () => {
  it('prunes an RPC delta to no fields and still advances its token', () => {
    const mutation = {
      id: 'm',
      operation: 'UPDATE',
      rowId: 'r',
      tableName: 't',
      data: {},
      serverVersion: 3,
      rpc: { name: 'rpc', fields: { judge_notes: null } },
    } as unknown as PendingMutation;

    const next = rebaseQueuedMutation(mutation, 8, undefined, [], () => ({}));

    expect(next?.serverVersion).toBe(8);
    expect(next?.rpc?.fields).toEqual({});
  });
});
