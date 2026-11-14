// @vitest-environment node
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { describe, expect, it } from 'vitest';

import { DEFAULT_CLASS_NAME, fetchQueueAndClassName, isClassOnPaper } from './proximityQueue.ts';

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

  it('reports a paper class so the alert is not sent (MYK9-1970)', async () => {
    const { client, resolvers } = deferredSupabase();

    const pending = fetchQueueAndClassName(client, 'class-1');
    resolvers.get('classes')?.({
      data: { name: 'Novice Interior', scores_on_paper: true, trial: null },
      error: null,
    });
    resolvers.get('entries')?.({ data: [{ id: 'e1' }], error: null });

    expect((await pending).onPaper).toBe(true);
  });
});

describe('isClassOnPaper', () => {
  it('follows the class flag, else the show switch turned off', () => {
    const showOff = { trial: { show: { uses_device_scoring: false } } };
    const showOn = { trial: { show: { uses_device_scoring: true } } };
    expect(isClassOnPaper({ scores_on_paper: true, ...showOn })).toBe(true);
    expect(isClassOnPaper({ scores_on_paper: false, ...showOff })).toBe(false);
    expect(isClassOnPaper({ scores_on_paper: null, ...showOff })).toBe(true);
    expect(isClassOnPaper({ scores_on_paper: null, ...showOn })).toBe(false);
    expect(isClassOnPaper({ name: 'x' } as never)).toBe(false);
    expect(isClassOnPaper(null)).toBe(false);
  });
});
