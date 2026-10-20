import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LOAD_GENERATED_ENTRY_COUNT, LOAD_SHOW_ENTRY_COUNT, LOAD_SHOW_ID } from './loadFixture';
import {
  assertCanonicalFixtureWith,
  LOAD_FIXTURE_ENTRY_ID_END,
  LOAD_FIXTURE_ENTRY_ID_MIN,
  NON_FIXTURE_ROW_LIMIT,
  type NonFixtureEntryRow,
} from './loadFixturePreflight';

interface Call {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface Answer {
  readonly count?: number;
  readonly data?: unknown;
  readonly error?: { message: string };
}

/**
 * A PostgREST builder stand-in: every query records its chain, and `answer`
 * decides the result from that chain, the way the real filter would.
 */
function fakeClient(answer: (calls: readonly Call[]) => Answer) {
  const queries: Call[][] = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [{ method: 'from', args: [table] }];
      queries.push(calls);
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'lt', 'or', 'order', 'limit']) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: Answer) => unknown) =>
        resolve({ count: undefined, data: null, error: undefined, ...answer(calls) });
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const isGeneratedCount = (calls: readonly Call[]) => calls.some(c => c.method === 'gte');
const isRowListing = (calls: readonly Call[]) => calls.some(c => c.method === 'or');

const stray: NonFixtureEntryRow = {
  id: 'dededede-0000-0000-0000-000000000099',
  created_at: '2026-10-20T16:30:01Z',
  entry_status: 'submitted',
  entry_source: 'online',
  class_id: 'class-1',
  dog_id: 'dog-1',
};

describe('assertCanonicalFixtureWith', () => {
  it('passes on the canonical count with a single count query', async () => {
    const { client, queries } = fakeClient(() => ({ count: LOAD_SHOW_ENTRY_COUNT }));
    await expect(assertCanonicalFixtureWith(client)).resolves.toBeUndefined();
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContainEqual({ method: 'eq', args: ['show_id', LOAD_SHOW_ID] });
  });

  it('names the stray entry when the show holds one extra row', async () => {
    const { client, queries } = fakeClient(calls => {
      if (isRowListing(calls)) return { data: [stray] };
      if (isGeneratedCount(calls)) return { count: LOAD_GENERATED_ENTRY_COUNT };
      return { count: LOAD_SHOW_ENTRY_COUNT + 1 };
    });
    const failure = assertCanonicalFixtureWith(client);
    await expect(failure).rejects.toThrow(
      `Load fixture requires exactly ${LOAD_SHOW_ENTRY_COUNT} demo-show entries; found ${LOAD_SHOW_ENTRY_COUNT + 1}.`
    );
    await expect(failure).rejects.toThrow(
      `${stray.id} created_at=2026-10-20T16:30:01Z status=submitted source=online class=class-1 dog=dog-1`
    );
    await expect(failure).rejects.toThrow(
      `Non-fixture entries: ${LOAD_SHOW_ENTRY_COUNT + 1 - LOAD_GENERATED_ENTRY_COUNT} (expected ${LOAD_SHOW_ENTRY_COUNT - LOAD_GENERATED_ENTRY_COUNT} hand-authored).`
    );

    const listing = queries.find(isRowListing)!;
    expect(listing).toContainEqual({ method: 'eq', args: ['show_id', LOAD_SHOW_ID] });
    expect(listing).toContainEqual({
      method: 'or',
      args: [`id.lt.${LOAD_FIXTURE_ENTRY_ID_MIN},id.gte.${LOAD_FIXTURE_ENTRY_ID_END}`],
    });
    expect(listing).toContainEqual({
      method: 'order',
      args: ['created_at', { ascending: false, nullsFirst: true }],
    });
    expect(listing).toContainEqual({ method: 'limit', args: [NON_FIXTURE_ROW_LIMIT] });
    const generated = queries.find(isGeneratedCount)!;
    expect(generated).toContainEqual({ method: 'gte', args: ['id', LOAD_FIXTURE_ENTRY_ID_MIN] });
    expect(generated).toContainEqual({ method: 'lt', args: ['id', LOAD_FIXTURE_ENTRY_ID_END] });
  });

  it('reports a short generated fixture separately from strays', async () => {
    const { client } = fakeClient(calls => {
      if (isRowListing(calls)) return { data: [] };
      if (isGeneratedCount(calls)) return { count: LOAD_GENERATED_ENTRY_COUNT - 4 };
      return { count: LOAD_SHOW_ENTRY_COUNT - 4 };
    });
    await expect(assertCanonicalFixtureWith(client)).rejects.toThrow(
      `Generated fixture entries: ${LOAD_GENERATED_ENTRY_COUNT - 4} (expected ${LOAD_GENERATED_ENTRY_COUNT}).`
    );
  });

  it('still fails on the count when the row listing errors', async () => {
    const { client } = fakeClient(calls => {
      if (isRowListing(calls)) return { error: { message: 'permission denied' } };
      if (isGeneratedCount(calls)) return { count: LOAD_GENERATED_ENTRY_COUNT };
      return { count: LOAD_SHOW_ENTRY_COUNT + 1 };
    });
    const failure = assertCanonicalFixtureWith(client);
    await expect(failure).rejects.toThrow(`found ${LOAD_SHOW_ENTRY_COUNT + 1}.`);
    await expect(failure).rejects.toThrow('Could not list non-fixture entries: permission denied');
  });

  it('fails closed when the count query errors', async () => {
    const { client } = fakeClient(() => ({ error: { message: 'timeout' } }));
    await expect(assertCanonicalFixtureWith(client)).rejects.toThrow(
      'Could not preflight the load fixture: timeout'
    );
  });
});
