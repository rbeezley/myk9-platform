import { describe, expect, it } from 'vitest';
import {
  applyDelete,
  applyInsert,
  applyPatch,
  contentRange,
  emptyTable,
  isTouched,
  matches,
  overlay,
  parseFilters,
  readHeaders,
  resolutionOf,
  singleRowError,
  type Row,
} from './readonly-walk-local';

const NOW = '2026-11-14T12:00:00.000Z';
const filtersOf = (query: string) => parseFilters(new URLSearchParams(query));
const all = filtersOf('') ?? [];
const counter = () => {
  let n = 0;
  return () => `local-${++n}`;
};

describe('parseFilters', () => {
  it.each([
    ['id=eq.a', { id: 'a' }, true],
    ['id=eq.a', { id: 'b' }, false],
    ['status=neq.paid', { status: 'draft' }, true],
    ['status=neq.paid', { status: null }, false],
    ['id=in.(a,"b")', { id: 'b' }, true],
    ['id=in.(a,b)', { id: 'c' }, false],
    ['deleted_at=is.null', { deleted_at: null }, true],
    ['deleted_at=is.null', {}, true],
    ['active=is.true', { active: true }, true],
    ['fee=gte.10', { fee: 10 }, true],
    ['fee=lt.10', { fee: 10 }, false],
    ['cart_id=eq.c1&id=eq.a', { cart_id: 'c1', id: 'b' }, false],
  ])('%s against %j is %s', (query, row, expected) => {
    const filters = filtersOf(`select=*&order=id.asc&limit=5&${query}`);
    expect(filters).not.toBeNull();
    expect(matches(row as Row, filters ?? [])).toBe(expected);
  });

  it.each(['or=(id.eq.a,id.eq.b)', 'id=not.eq.a', 'name=like.*x*', 'data->>k=eq.v', 'id=a'])(
    'reports %s as unreadable rather than guessing',
    query => {
      expect(filtersOf(query)).toBeNull();
    }
  );
});

describe('overlay', () => {
  const real: Row[] = [
    { id: 'r1', cart_id: 'c1', class: 'A' },
    { id: 'r2', cart_id: 'c1', class: 'B' },
  ];

  it('returns the real rows untouched while the walk has written nothing', () => {
    const state = emptyTable();
    expect(isTouched(state)).toBe(false);
    expect(overlay(real, state, all)).toEqual(real);
  });

  it('keeps real rows beside a local one, and filters the local one', () => {
    const state = emptyTable();
    applyInsert(state, [{ cart_id: 'c2', class: 'C' }], { makeId: counter(), now: NOW });
    expect(overlay(real, state, all).map(row => row.id)).toEqual(['r1', 'r2', 'local-1']);
    expect(overlay(real, state, filtersOf('cart_id=eq.c1') ?? [])).toEqual(real);
  });
});

describe('applyPatch and applyDelete change only the rows the filter addressed', () => {
  it('edits one of two cart items', () => {
    const state = emptyTable();
    const makeId = counter();
    applyInsert(state, [{ class: 'A' }, { class: 'B' }], { makeId, now: NOW });
    const target = overlay([], state, filtersOf('id=eq.local-2') ?? []);
    applyPatch(state, target, { class: 'Z' }, NOW);
    expect(overlay([], state, all).map(row => row.class)).toEqual(['A', 'Z']);
  });

  it('edits a row that exists only in the database, and later reads see the edit', () => {
    const state = emptyTable();
    const real: Row[] = [{ id: 'r1', status: 'draft' }];
    const [edited] = applyPatch(state, overlay(real, state, all), { status: 'ready' }, NOW);
    expect(edited).toMatchObject({ id: 'r1', status: 'ready' });
    expect(overlay(real, state, all)).toEqual([edited]);
    expect(overlay(real, state, filtersOf('status=eq.draft') ?? [])).toEqual([]);
  });

  it('removes one of three items, real or local', () => {
    const state = emptyTable();
    const real: Row[] = [{ id: 'r1' }, { id: 'r2' }];
    applyInsert(state, [{}], { makeId: counter(), now: NOW });
    // The database already applied the filter to its own rows; the overlay filters the walk's.
    const served = real.filter(row => row.id === 'r2');
    applyDelete(state, overlay(served, state, filtersOf('id=eq.r2') ?? []));
    expect(overlay(real, state, all).map(row => row.id)).toEqual(['r1', 'local-1']);
  });
});

describe('applyInsert as upsert', () => {
  it('merges on the primary key instead of adding a copy', () => {
    const state = emptyTable();
    const options = { resolution: 'merge-duplicates' as const, makeId: counter(), now: NOW };
    applyInsert(state, [{ id: 'c1', step: 1 }], options);
    applyInsert(state, [{ id: 'c1', step: 2 }], options);
    expect(overlay([], state, all)).toEqual([expect.objectContaining({ id: 'c1', step: 2 })]);
  });

  it('merges on on_conflict columns', () => {
    const state = emptyTable();
    const options = {
      resolution: 'merge-duplicates' as const,
      onConflict: ['cart_id', 'dog_id'],
      makeId: counter(),
      now: NOW,
    };
    applyInsert(state, [{ cart_id: 'c', dog_id: 'd', class: 'A' }], options);
    applyInsert(state, [{ cart_id: 'c', dog_id: 'd', class: 'B' }], options);
    expect(overlay([], state, all)).toEqual([
      expect.objectContaining({ id: 'local-1', class: 'B' }),
    ]);
  });

  it('keeps the first row on ignore-duplicates', () => {
    const state = emptyTable();
    const options = { resolution: 'ignore-duplicates' as const, makeId: counter(), now: NOW };
    applyInsert(state, [{ id: 'c1', step: 1 }], options);
    expect(applyInsert(state, [{ id: 'c1', step: 2 }], options)).toEqual([]);
    expect(overlay([], state, all)).toEqual([expect.objectContaining({ step: 1 })]);
  });

  it('still adds a copy on a plain insert, as PostgREST would fail it', () => {
    const state = emptyTable();
    applyInsert(state, [{ dog_id: 'd' }, { dog_id: 'd' }], { makeId: counter(), now: NOW });
    expect(overlay([], state, all)).toHaveLength(2);
  });
});

describe('contentRange', () => {
  it.each([
    [3, true, '0-2/3'],
    [3, false, '0-2/*'],
    [0, true, '*/0'],
  ])('%i rows, counted %s, is %s', (count, counted, expected) => {
    expect(contentRange(count, counted)).toBe(expected);
  });
});

describe('resolutionOf', () => {
  it.each([
    ['return=representation,resolution=merge-duplicates', 'merge-duplicates'],
    ['resolution=ignore-duplicates', 'ignore-duplicates'],
    ['return=minimal', undefined],
  ])('%s is %s', (prefer, expected) => {
    expect(resolutionOf(prefer)).toBe(expected);
  });
});

describe('readHeaders', () => {
  it("keeps the caller's auth and drops body and write headers", () => {
    expect(
      readHeaders({
        apikey: 'k',
        authorization: 'Bearer t',
        prefer: 'return=representation',
        'content-type': 'application/json',
        accept: 'application/vnd.pgrst.object+json',
      })
    ).toEqual({ apikey: 'k', authorization: 'Bearer t', accept: 'application/json' });
  });
});

describe('singleRowError', () => {
  it.each([0, 2])("names %i rows with PostgREST's code", count => {
    expect(singleRowError(count)).toMatchObject({
      code: 'PGRST116',
      details: `The result contains ${count} rows`,
    });
  });
});
