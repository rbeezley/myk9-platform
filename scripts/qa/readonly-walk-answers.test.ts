import type { BrowserContext, Route } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { formatWalkLog, type WalkLog } from './readonly-walk';
import { answerLocally } from './readonly-walk-answers';

const API = 'https://x.supabase.co';
type Real = (url: string) => { ok: boolean; body: unknown };

/** A context whose only reads are the fake `real`, and a way to fire one refused write. */
async function setup(real: Real, tables = ['entry_carts']) {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const get = vi.fn(async (url: string) => {
    const answer = real(url);
    return { ok: () => answer.ok, json: async () => answer.body };
  });
  const context = {
    route: async (_pattern: RegExp, fn: (route: Route) => Promise<void>) => {
      handler = fn;
    },
    request: { get },
  } as unknown as BrowserContext;
  const log: WalkLog = { refused: [], readRpcs: new Set(), simulated: [] };
  await answerLocally(context, tables, log);

  const fire = async (
    method: string,
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ) => {
    const fulfill = vi.fn<(options: unknown) => Promise<void>>(async () => {});
    const fallback = vi.fn(async () => {});
    const request = {
      method: () => method,
      url: () => `${API}${path}`,
      headers: () => ({ apikey: 'k', authorization: 'Bearer t', ...headers }),
      postData: () => JSON.stringify(body),
      frame: () => ({ page: () => ({ url: () => 'http://localhost:5173/cart' }) }),
    };
    await handler?.({ request: () => request, fulfill, fallback } as unknown as Route);
    return { fulfill, fallback };
  };
  return { fire, get, log };
}

const answered = (fulfill: { mock: { calls: unknown[][] } }) => {
  const call = fulfill.mock.calls[0]?.[0] as { status: number; body: string };
  return { status: call.status, json: call.body ? JSON.parse(call.body) : null };
};
const REP = { prefer: 'return=representation' };

describe('answerLocally', () => {
  it('answers a cart insert with its show, read by GET from the foreign key', async () => {
    const { fire, get, log } = await setup(url =>
      url.includes('/shows?')
        ? { ok: true, body: [{ id: 'show-9', name: 'Fall Specialty' }] }
        : { ok: true, body: [] }
    );
    const { fulfill } = await fire(
      'POST',
      '/rest/v1/entry_carts?select=*%2Cshow%3Ashows%28*%29',
      { show_id: 'show-9', status: 'draft' },
      REP
    );
    expect(get).toHaveBeenCalledWith(
      `${API}/rest/v1/shows?select=*&id=eq.show-9&limit=1`,
      expect.anything()
    );
    const { status, json } = answered(fulfill);
    expect(status).toBe(201);
    expect(json[0]).toMatchObject({ show_id: 'show-9', show: { name: 'Fall Specialty' } });
    expect(log.simulated).toEqual([
      {
        page: 'http://localhost:5173/cart',
        method: 'POST',
        table: 'entry_carts',
        kind: 'synthesized',
        gaps: [],
      },
    ]);
  });

  it('sends an optimistic PATCH timestamp filter to the GET unchanged and overlays the body', async () => {
    const path =
      '/rest/v1/entry_carts?id=eq.c1&updated_at=eq.2026-11-14T10%3A00%3A00.123456%2B00%3A00&select=*%2Cshow%3Ashows%28*%29';
    const { fire, get, log } = await setup(() => ({
      ok: true,
      body: [{ id: 'c1', status: 'draft', show: { name: 'Fall' } }],
    }));
    const { fulfill } = await fire('PATCH', path, { status: 'paid' }, REP);
    expect(get).toHaveBeenCalledWith(`${API}${path}`, expect.anything());
    expect(answered(fulfill).json).toEqual([{ id: 'c1', status: 'paid', show: { name: 'Fall' } }]);
    expect(log.simulated[0]).toMatchObject({ method: 'PATCH', kind: 'exact' });
  });

  it('answers a PATCH that matches no row with an empty list, or 406 for a single object', async () => {
    const { fire } = await setup(() => ({ ok: true, body: [] }));
    const list = await fire(
      'PATCH',
      '/rest/v1/entry_carts?id=eq.c1&updated_at=eq.old',
      { status: 'x' },
      REP
    );
    expect(answered(list.fulfill)).toEqual({ status: 200, json: [] });
    const single = await fire(
      'PATCH',
      '/rest/v1/entry_carts?id=eq.c1',
      { status: 'x' },
      {
        ...REP,
        accept: 'application/vnd.pgrst.object+json',
      }
    );
    expect(answered(single.fulfill)).toMatchObject({ status: 406, json: { code: 'PGRST116' } });
  });

  it('merges an upsert into the existing row, and builds a row when none matches', async () => {
    const existing = { id: 'c1', show_id: 's1', status: 'draft', created_at: 'then' };
    const { fire, get } = await setup(url =>
      url.includes('show_id=eq.s1') ? { ok: true, body: [existing] } : { ok: true, body: [] }
    );
    const upsert = { prefer: 'resolution=merge-duplicates,return=representation' };
    const merged = await fire(
      'POST',
      '/rest/v1/entry_carts?on_conflict=show_id&select=*',
      { show_id: 's1', status: 'paid' },
      upsert
    );
    expect(get).toHaveBeenCalledWith(
      `${API}/rest/v1/entry_carts?select=*&show_id=eq.s1`,
      expect.anything()
    );
    expect(answered(merged.fulfill).json).toEqual([{ ...existing, status: 'paid' }]);

    const fresh = await fire(
      'POST',
      '/rest/v1/entry_carts?on_conflict=show_id&select=*',
      { show_id: 's2', status: 'draft' },
      upsert
    );
    expect(answered(fresh.fulfill).json[0]).toMatchObject({ show_id: 's2', status: 'draft' });
  });

  it('answers DELETE with the rows a real read found, and never sends a write', async () => {
    const { fire, get, log } = await setup(() => ({ ok: true, body: [{ id: 'c1' }] }));
    const { fulfill } = await fire('DELETE', '/rest/v1/entry_carts?id=eq.c1', {}, REP);
    expect(answered(fulfill).json).toEqual([{ id: 'c1' }]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(log.simulated).toHaveLength(1);
  });

  it('answers return=minimal with no body, and passes other tables and reads through', async () => {
    const { fire } = await setup(() => ({ ok: true, body: [{ id: 'c1' }] }), ['entry_carts']);
    expect(
      answered((await fire('PATCH', '/rest/v1/entry_carts?id=eq.c1', {})).fulfill).status
    ).toBe(204);
    expect((await fire('PATCH', '/rest/v1/dogs?id=eq.d1', {})).fallback).toHaveBeenCalled();
    expect((await fire('GET', '/rest/v1/entry_carts?id=eq.c1', {})).fallback).toHaveBeenCalled();
  });

  it('passes a failed real read back to the page and records nothing', async () => {
    const { fire, log } = await setup(() => ({ ok: false, body: {} }));
    const { fulfill } = await fire('PATCH', '/rest/v1/entry_carts?id=eq.c1', {}, REP);
    expect(fulfill.mock.calls[0]?.[0]).toHaveProperty('response');
    expect(log.simulated).toEqual([]);
  });

  it('records a gap when an embed cannot be read', async () => {
    const { fire, log } = await setup(url =>
      url.includes('/shows?') ? { ok: false, body: {} } : { ok: true, body: [] }
    );
    const { fulfill } = await fire(
      'POST',
      '/rest/v1/entry_carts?select=id,show:shows(*)',
      { show_id: 's' },
      REP
    );
    expect(answered(fulfill).status).toBe(201);
    expect(log.simulated[0]).toMatchObject({ kind: 'synthesized with gaps', gaps: ['embed show'] });
  });
});

describe('formatWalkLog: Simulated', () => {
  it('lists every screen reached through a simulated write', () => {
    const text = formatWalkLog({
      refused: [],
      readRpcs: new Set(),
      simulated: [
        {
          page: 'http://localhost:5173/cart',
          method: 'POST',
          table: 'entry_carts',
          kind: 'synthesized',
          gaps: [],
        },
        {
          page: 'http://localhost:5173/cart',
          method: 'POST',
          table: 'entry_carts',
          kind: 'synthesized',
          gaps: [],
        },
      ],
    });
    expect(text).toContain('Simulated (answered in the browser, never sent): 2');
    expect(
      text.match(/http:\/\/localhost:5173\/cart {2}POST entry_carts: synthesized/g)
    ).toHaveLength(1);
  });
  it('says none when nothing was simulated', () => {
    const text = formatWalkLog({ refused: [], readRpcs: new Set(), simulated: [] });
    expect(text).toContain('Simulated (answered in the browser, never sent): 0');
  });
});
