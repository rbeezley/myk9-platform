import { describe, expect, it } from 'vitest';
import {
  conflictQuery,
  contentRange,
  describeSimulated,
  embedForeignKey,
  kindOf,
  overlayBody,
  parseSelect,
  readHeaders,
  resolutionOf,
  singleRowError,
  synthesizeRow,
  type Row,
} from './readonly-walk-local';

const NOW = '2026-11-14T12:00:00.000Z';
const defaults = { id: 'local-1', now: NOW };

describe('parseSelect', () => {
  it('reads columns, aliases and embeds at the top level only', () => {
    expect(
      parseSelect('id,label:name,show:shows(*,club:clubs(name)),items:entry_cart_items!fk(id)')
    ).toEqual([
      { kind: 'column', name: 'id', column: 'id' },
      { kind: 'column', name: 'label', column: 'name' },
      { kind: 'embed', name: 'show', table: 'shows', hint: null, inner: '*,club:clubs(name)' },
      { kind: 'embed', name: 'items', table: 'entry_cart_items', hint: 'fk', inner: 'id' },
    ]);
  });
  it('treats no select as every column', () => {
    expect(parseSelect(null)).toEqual([{ kind: 'all' }]);
  });
});

describe('overlayBody', () => {
  const real: Row = { id: 'a', status: 'draft', updated_at: 'old', show: { name: 'Fall' } };
  it('overlays body columns on every column when select is *', () => {
    expect(overlayBody(real, { status: 'paid' }, parseSelect('*,show:shows(*)'))).toEqual({
      ...real,
      status: 'paid',
    });
  });
  it('overlays only the columns the select asked for, under their alias', () => {
    const out = overlayBody(
      { id: 'a', state: 'draft' },
      { status: 'paid', secret: 1 },
      parseSelect('id,state:status')
    );
    expect(out).toEqual({ id: 'a', state: 'paid' });
  });
});

describe('embedForeignKey', () => {
  const embed = (select: string) =>
    parseSelect(select)[0] as Extract<ReturnType<typeof parseSelect>[0], { kind: 'embed' }>;
  it('finds the key by alias, by table, or by the hint', () => {
    expect(embedForeignKey(embed('show:shows(*)'), { show_id: 1 })).toBe('show_id');
    expect(embedForeignKey(embed('shows(*)'), { show_id: 1 })).toBe('show_id');
    expect(
      embedForeignKey(embed('host:clubs!entry_carts_host_club_id_fkey(*)'), { host_club_id: 1 })
    ).toBe('host_club_id');
    expect(embedForeignKey(embed('entry_cart_items(*)'), { show_id: 1 })).toBeNull();
  });
});

describe('synthesizeRow', () => {
  it('builds the cart row and resolves the show embed with a GET by foreign key', async () => {
    const reads: Array<[string, string]> = [];
    const { row, gaps } = await synthesizeRow(
      { show_id: 'show-9', user_id: 'u' },
      parseSelect('*,show:shows(*)'),
      defaults,
      async (table, query) => {
        reads.push([table, query.toString()]);
        return [{ id: 'show-9', name: 'Fall Specialty' }];
      }
    );
    expect(reads).toEqual([['shows', 'select=*&id=eq.show-9&limit=1']]);
    expect(row).toEqual({
      id: 'local-1',
      created_at: NOW,
      updated_at: NOW,
      show_id: 'show-9',
      user_id: 'u',
      show: { id: 'show-9', name: 'Fall Specialty' },
    });
    expect(gaps).toEqual([]);
  });

  it('names a gap when an embed cannot be read or a column is unknown', async () => {
    const { row, gaps } = await synthesizeRow(
      { show_id: 's' },
      parseSelect('id,total,show:shows(*),items:entry_cart_items(*)'),
      defaults,
      async () => null
    );
    expect(row).toEqual({ id: 'local-1', total: null, show: null });
    expect(gaps).toEqual(['column total', 'embed show', 'embed items']);
  });

  it('gives a null embed when the foreign key is null, without a read', async () => {
    const { row, gaps } = await synthesizeRow(
      { show_id: null },
      parseSelect('show:shows(*)'),
      defaults,
      async () => {
        throw new Error('no read expected');
      }
    );
    expect(row).toEqual({ show: null });
    expect(gaps).toEqual([]);
  });
});

describe('conflictQuery', () => {
  it('keeps the select and filters on the conflict columns', () => {
    expect(conflictQuery({ a: 1, b: 'x' }, ['a', 'b'], 'id,show:shows(*)')?.toString()).toBe(
      'select=id%2Cshow%3Ashows%28*%29&a=eq.1&b=eq.x'
    );
  });
  it('defaults to id and gives up when the key is missing', () => {
    expect(conflictQuery({ id: 'z' }, [], null)?.toString()).toBe('select=*&id=eq.z');
    expect(conflictQuery({ name: 'z' }, [], null)).toBeNull();
  });
});

describe('small PostgREST shapes', () => {
  it('replays only auth headers as a read', () => {
    expect(
      readHeaders({ apikey: 'k', authorization: 'Bearer t', prefer: 'x', 'content-type': 'json' })
    ).toEqual({
      apikey: 'k',
      authorization: 'Bearer t',
      accept: 'application/json',
    });
  });
  it('reads Prefer resolution', () => {
    expect(resolutionOf('resolution=merge-duplicates,return=representation')).toBe(
      'merge-duplicates'
    );
    expect(resolutionOf('resolution=ignore-duplicates')).toBe('ignore-duplicates');
    expect(resolutionOf('return=minimal')).toBeUndefined();
  });
  it('formats Content-Range and the single-row error', () => {
    expect(contentRange(0, false)).toBe('*/*');
    expect(contentRange(3, true)).toBe('0-2/3');
    expect(singleRowError(0).code).toBe('PGRST116');
  });
  it('describes a simulated write with its gaps', () => {
    expect(kindOf([], false)).toBe('exact');
    expect(kindOf([], true)).toBe('synthesized');
    expect(kindOf(['embed show'], true)).toBe('synthesized with gaps');
    expect(
      describeSimulated({
        page: 'http://x/cart',
        method: 'POST',
        table: 'entry_carts',
        kind: 'synthesized with gaps',
        gaps: ['embed show'],
      })
    ).toBe('http://x/cart  POST entry_carts: synthesized with gaps (could not read: embed show)');
  });
});
