import { describe, expect, it, vi } from 'vitest';
import {
  BulkItemSkippedError,
  dispatchBulk,
  retryFailedItems,
  summarizeBulkOutcome,
  errorReason,
} from './bulkDispatch';

interface Item {
  id: string;
  eligible: boolean;
}

function item(id: string, eligible = true): Item {
  return { id, eligible };
}

describe('dispatchBulk', () => {
  it('folds all-succeeded results', async () => {
    const outcome = await dispatchBulk([item('a'), item('b')], async () => undefined);
    expect(outcome.succeeded.map(i => i.id)).toEqual(['a', 'b']);
    expect(outcome.failed).toEqual([]);
  });

  it('does not let one rejection abort the others (allSettled, not all)', async () => {
    const outcome = await dispatchBulk([item('a'), item('b'), item('c')], async i => {
      if (i.id === 'b') throw new Error('boom');
      return undefined;
    });
    expect(outcome.succeeded.map(i => i.id)).toEqual(['a', 'c']);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]?.item.id).toBe('b');
    expect(outcome.failed[0]?.error).toBeInstanceOf(Error);
  });

  it('returns empty outcome for an empty item list', async () => {
    const runItem = vi.fn(async () => undefined);
    const outcome = await dispatchBulk([], runItem);
    expect(outcome).toEqual({ succeeded: [], failed: [] });
    expect(runItem).not.toHaveBeenCalled();
  });
});

describe('retryFailedItems', () => {
  it('retries only eligible items and reports the rest as skipped, not errored', async () => {
    const failed = [item('a', true), item('b', false), item('c', true)];
    const runItem = vi.fn(async () => undefined);

    const outcome = await retryFailedItems(failed, i => i.eligible, runItem);

    expect(runItem).toHaveBeenCalledTimes(2);
    expect(outcome.succeeded.map(i => i.id).sort()).toEqual(['a', 'c']);
    expect(outcome.skipped.map(i => i.id)).toEqual(['b']);
    expect(outcome.failed).toEqual([]);
  });

  it('still folds failures among the retried (eligible) items', async () => {
    const failed = [item('a', true), item('b', true)];
    const outcome = await retryFailedItems(
      failed,
      i => i.eligible,
      async i => {
        if (i.id === 'b') throw new Error('still broken');
      }
    );
    expect(outcome.succeeded.map(i => i.id)).toEqual(['a']);
    expect(outcome.failed.map(f => f.item.id)).toEqual(['b']);
    expect(outcome.skipped).toEqual([]);
  });
});

describe('summarizeBulkOutcome', () => {
  it('reports full success without detail lines', () => {
    const summary = summarizeBulkOutcome(
      2,
      { succeeded: [item('a'), item('b')], failed: [] },
      i => i.id
    );
    expect(summary.fullSuccess).toBe(true);
    expect(summary.details).toBeUndefined();
  });

  it('reports partial failure with a per-item reason line', () => {
    const summary = summarizeBulkOutcome(
      2,
      { succeeded: [item('a')], failed: [{ item: item('b'), error: new Error('nope') }] },
      i => i.id
    );
    expect(summary.fullSuccess).toBe(false);
    expect(summary.title).toContain('1 of 2');
    expect(summary.details).toEqual(['b: nope']);
  });
});

describe('errorReason', () => {
  it('unwraps an Error message', () => {
    expect(errorReason(new Error('bad'))).toBe('bad');
  });

  it('passes through a non-empty string', () => {
    expect(errorReason('bad string')).toBe('bad string');
  });

  it('reads the message off a plain error-like object (repository DatabaseError)', () => {
    // createDatabaseError returns an object literal, not an Error instance.
    const dbError = { name: 'DatabaseError', message: 'duplicate key value', code: '23505' };
    expect(errorReason(dbError)).toBe('duplicate key value');
  });

  it('falls back for unknown shapes', () => {
    expect(errorReason(undefined)).toBe('Unknown error');
    expect(errorReason({})).toBe('Unknown error');
    expect(errorReason({ message: '   ' })).toBe('Unknown error');
  });
});

describe('server-declined items (BulkItemSkippedError)', () => {
  it('folds a declined item into `declined`, neither succeeded nor failed', async () => {
    const outcome = await dispatchBulk([item('a'), item('b'), item('c')], async i => {
      if (i.id === 'b') throw new BulkItemSkippedError('already signed in');
      if (i.id === 'c') throw new Error('boom');
    });
    expect(outcome.succeeded.map(i => i.id)).toEqual(['a']);
    expect(outcome.failed.map(f => f.item.id)).toEqual(['c']);
    expect(outcome.declined).toEqual([{ item: item('b'), reason: 'already signed in' }]);
  });

  it('leaves `declined` absent when the server declined nothing', async () => {
    const outcome = await dispatchBulk([item('a')], async () => undefined);
    expect(outcome.declined).toBeUndefined();
  });

  it('summarises declines honestly, without counting them as attempted', () => {
    const declined = [{ item: item('b'), reason: 'already signed in' }];
    expect(
      summarizeBulkOutcome(2, { succeeded: [item('a')], failed: [], declined }, i => i.id).title
    ).toBe('Updated 1 — 1 already signed in');
    expect(summarizeBulkOutcome(1, { succeeded: [], failed: [], declined }, i => i.id).title).toBe(
      '1 already signed in'
    );
    expect(
      summarizeBulkOutcome(
        3,
        { succeeded: [item('a')], failed: [{ item: item('c'), error: new Error('x') }], declined },
        i => i.id
      ).title
    ).toBe('1 of 2 succeeded — 1 failed; 1 already signed in');
  });
});
