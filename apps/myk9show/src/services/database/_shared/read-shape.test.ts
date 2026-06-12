import { describe, expect, it, vi } from 'vitest';
import {
  compareNumberAscNullsLast,
  compareStringAscNullsLast,
  loadLookupMap,
  readWithReplicationFallback,
  sortedCopy,
} from './read-shape';

vi.mock('./replication-fallback', () => ({
  withReplicationFallback: vi.fn(async (replication: () => Promise<unknown>) => replication()),
}));

import { withReplicationFallback } from './replication-fallback';

const mockWithReplicationFallback = vi.mocked(withReplicationFallback);

describe('read-shape helpers', () => {
  it('returns successful replication result without PostgREST fallback', async () => {
    const replication = vi.fn().mockResolvedValue({ data: [{ id: 'one' }], error: null });
    const postgrest = vi.fn().mockResolvedValue({ data: [{ id: 'fallback' }], error: null });

    const result = await readWithReplicationFallback({
      replication,
      postgrest,
      table: 'entries',
      operation: 'select_all',
      errorData: [],
    });

    expect(result).toEqual({ data: [{ id: 'one' }], error: null });
    expect(mockWithReplicationFallback).toHaveBeenCalledWith(
      replication,
      postgrest,
      'entries',
      'select_all'
    );
    expect(postgrest).not.toHaveBeenCalled();
  });

  it('returns PostgREST fallback when replication throws', async () => {
    mockWithReplicationFallback.mockImplementationOnce(async (_replication, postgrest) =>
      postgrest()
    );
    const replication = vi.fn().mockRejectedValue(new Error('store unavailable'));
    const postgrest = vi.fn().mockResolvedValue({ data: [{ id: 'fallback' }], error: null });

    const result = await readWithReplicationFallback({
      replication,
      postgrest,
      table: 'dogs',
      operation: 'select_all',
      errorData: [],
    });

    expect(result).toEqual({ data: [{ id: 'fallback' }], error: null });
    expect(replication).not.toHaveBeenCalled();
    expect(postgrest).toHaveBeenCalledTimes(1);
  });

  it('returns error result shape when both read paths fail', async () => {
    const dbError = Object.assign(new Error('db unavailable'), { code: 'UNKNOWN' });
    mockWithReplicationFallback.mockRejectedValueOnce(dbError);

    const result = await readWithReplicationFallback({
      replication: vi.fn(),
      postgrest: vi.fn(),
      table: 'classes',
      operation: 'select_all',
      errorData: [],
    });

    expect(result).toEqual({ data: [], error: dbError });
  });

  it('constructs lookup maps from loaded rows', async () => {
    const map = await loadLookupMap(
      async () => [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
      row => row.id
    );

    expect(map.get('a')).toEqual({ id: 'a', name: 'Alpha' });
    expect(map.get('b')).toEqual({ id: 'b', name: 'Beta' });
  });

  it('sorts immutable copies with run-order nulls last', () => {
    const rows = [
      { id: 'nullish', runOrder: null },
      { id: 'third', runOrder: 3 },
      { id: 'first', runOrder: 1 },
      { id: 'missing' },
    ];

    const sorted = sortedCopy(rows, compareNumberAscNullsLast(row => row.runOrder));

    expect(sorted.map(row => row.id)).toEqual(['first', 'third', 'nullish', 'missing']);
    expect(rows.map(row => row.id)).toEqual(['nullish', 'third', 'first', 'missing']);
  });

  it('sorts strings ascending with nulls last', () => {
    const rows = [
      { id: 'unscheduled', startTime: null },
      { id: 'late', startTime: '13:00:00' },
      { id: 'early', startTime: '08:00:00' },
      { id: 'missing' },
    ];

    const sorted = sortedCopy(rows, compareStringAscNullsLast(row => row.startTime));

    expect(sorted.map(row => row.id)).toEqual(['early', 'late', 'unscheduled', 'missing']);
    expect(rows.map(row => row.id)).toEqual(['unscheduled', 'late', 'early', 'missing']);
  });
});
