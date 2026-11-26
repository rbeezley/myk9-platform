// @vitest-environment node
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CLASS_NAME,
  EXCLUDED_QUEUE_STATUSES,
  fetchQueueAndClassName,
  isPaperClass,
} from './proximityQueue.ts';

type Result = { data: unknown; error: { message: string } | null };

/**
 * A fake whose reads resolve only when the test says so, recording the order
 * each table was queried in.
 */
function deferredSupabase() {
  const issued: string[] = [];
  const resolvers = new Map<string, (result: Result) => void>();

  function query(table: string) {
    const pending = new Promise<Result>(resolve => resolvers.set(table, resolve));
    const builder: Record<string, unknown> = {
      then: (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
        pending.then(onFulfilled, onRejected),
    };
    for (const method of ['select', 'eq', 'is', 'not', 'single']) {
      builder[method] = () => builder;
    }
    return builder;
  }

  const client = {
    from(table: string) {
      issued.push(table);
      return query(table);
    },
  };
  return { client: client as unknown as SupabaseClient, issued, resolvers };
}

describe('fetchQueueAndClassName', () => {
  it('issues the entries and class-name reads before either resolves', async () => {
    const { client, issued, resolvers } = deferredSupabase();

    const pending = fetchQueueAndClassName(client, 'class-1');

    // Neither read has resolved yet, yet both have been sent.
    expect(issued).toEqual(['entries', 'classes']);

    resolvers.get('classes')?.({ data: { name: 'Novice Interior' }, error: null });
    resolvers.get('entries')?.({ data: [{ id: 'e1' }], error: null });

    expect(await pending).toEqual({
      entryRows: [{ id: 'e1' }],
      entriesError: null,
      className: 'Novice Interior',
      onPaper: false,
    });
  });

  it('returns the entries error untouched and falls back when the class name is missing', async () => {
    const { client, resolvers } = deferredSupabase();

    const pending = fetchQueueAndClassName(client, 'class-1');
    resolvers.get('classes')?.({ data: null, error: { message: 'no rows' } });
    resolvers.get('entries')?.({ data: null, error: { message: 'down' } });

    expect(await pending).toEqual({
      entryRows: null,
      entriesError: { message: 'down' },
      className: DEFAULT_CLASS_NAME,
      onPaper: false,
    });
  });

  it('says a class is on paper by its own flag, else the show switch (MYK9-1970)', () => {
    expect(isPaperClass({ scores_on_paper: true })).toBe(true);
    expect(
      isPaperClass({ scores_on_paper: false, trial: { show: { uses_device_scoring: false } } })
    ).toBe(false);
    expect(
      isPaperClass({ scores_on_paper: null, trial: { show: { uses_device_scoring: false } } })
    ).toBe(true);
    expect(
      isPaperClass({ scores_on_paper: null, trial: { show: { uses_device_scoring: true } } })
    ).toBe(false);
    expect(isPaperClass(null)).toBe(false);
  });
});

describe('queue exclusions (MYK9-2412)', () => {
  it('leaves a Pending dog between two running dogs out of the queue', async () => {
    const calls: unknown[][] = [];
    const rows = [
      { id: 'a', entry_status: 'confirmed' },
      { id: 'pending-dog', entry_status: 'submitted' },
      { id: 'b', entry_status: 'checked-in' },
    ];
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'single']) builder[method] = () => builder;
    builder.not = (...args: unknown[]) => {
      calls.push(args);
      return builder;
    };
    // Apply the recorded NOT IN to the rows, as PostgREST would.
    builder.then = (onFulfilled: (value: Result) => unknown) => {
      const list = String(calls[0]?.[2]);
      const kept = rows.filter(row => !list.includes(`"${row.entry_status}"`));
      return Promise.resolve({ data: kept, error: null }).then(onFulfilled);
    };
    const client = { from: () => builder } as unknown as SupabaseClient;

    const result = await fetchQueueAndClassName(client, 'class-1');

    expect(calls[0]?.slice(0, 2)).toEqual(['entry_status', 'in']);
    for (const status of [
      'withdrawn',
      'scratched',
      'absent',
      'submitted',
      'pending',
      'draft',
      'pending-payment',
      'paid',
      'promotion-expired',
    ]) {
      expect(EXCLUDED_QUEUE_STATUSES).toContain(status);
      expect(calls[0]?.[2]).toContain(`"${status}"`);
    }
    expect((result.entryRows as { id: string }[]).map(row => row.id)).toEqual(['a', 'b']);
  });
});
