import type { BrowserContext, Route } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { formatWalkLog, type WalkLog } from './readonly-walk';
import { answerLocally } from './readonly-walk-answers';

const API = 'https://x.supabase.co';
type Real = (url: string) => { ok: boolean; body: unknown; status?: number; notJson?: boolean };

/** A context whose only reads are the fake `real`, and a way to fire one refused write. */
async function setup(real: Real, tables = ['entry_carts']) {
  let handler: ((route: Route) => Promise<void>) | undefined;
  const get = vi.fn(async (url: string, _options?: unknown) => {
    const answer = real(url);
    return {
      ok: () => answer.ok,
      status: () => answer.status ?? (answer.ok ? 200 : 500),
      json: async () => {
        if (answer.notJson) throw new Error('not json');
        return answer.body;
      },
    };
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
        kind: 'built from the body',
        gaps: ['conflict not checked'],
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
    expect(log.simulated[0]).toMatchObject({
      method: 'PATCH',
      kind: 'overlaid on a real read',
      gaps: ['embed show may be stale'],
    });
  });

  it('re-reads an embed when the body changes the column it joins through', async () => {
    const { fire, get, log } = await setup(url =>
      url.includes('/shows?')
        ? { ok: true, body: [{ id: 's2', name: 'Spring' }] }
        : { ok: true, body: [{ id: 'c1', show_id: 's1', show: { id: 's1', name: 'Fall' } }] }
    );
    const path = '/rest/v1/entry_carts?id=eq.c1&select=*%2Cshow%3Ashows%28*%29';
    const { fulfill } = await fire('PATCH', path, { show_id: 's2' }, REP);
    expect(get).toHaveBeenCalledWith(
      `${API}/rest/v1/shows?select=*&id=eq.s2&limit=1`,
      expect.anything()
    );
    expect(answered(fulfill).json).toEqual([
      { id: 'c1', show_id: 's2', show: { id: 's2', name: 'Spring' } },
    ]);
    expect(log.simulated[0]).toMatchObject({ kind: 'overlaid on a real read', gaps: [] });
  });

  it('nulls the embed and names a gap when the new embed cannot be read', async () => {
    const { fire, log } = await setup(url =>
      url.includes('/shows?')
        ? { ok: false, body: {} }
        : { ok: true, body: [{ id: 'c1', show_id: 's1', show: { name: 'Fall' } }] }
    );
    const { fulfill } = await fire(
      'PATCH',
      '/rest/v1/entry_carts?id=eq.c1&select=*,show:shows(*)',
      { show_id: 's2' },
      REP
    );
    expect(answered(fulfill).json[0].show).toBeNull();
    expect(log.simulated[0]).toMatchObject({
      kind: 'overlaid on a real read',
      gaps: ['embed show'],
    });
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
    expect(log.simulated[0]).toMatchObject({ kind: 'read failed', status: 500, gaps: [] });
  });

  it('answers 502 JSON and records a failure when a 200 is not JSON', async () => {
    const { fire, log } = await setup(() => ({ ok: true, body: null, notJson: true }));
    const { fulfill } = await fire('PATCH', '/rest/v1/entry_carts?id=eq.c1', {}, REP);
    expect(answered(fulfill).status).toBe(502);
    expect(log.simulated[0]).toMatchObject({ kind: 'read failed', status: 200 });
  });

  it('forwards content-profile as accept-profile on the replayed GET', async () => {
    const { fire, get } = await setup(() => ({ ok: true, body: [{ id: 'c1' }] }));
    await fire('PATCH', '/rest/v1/entry_carts?id=eq.c1', {}, { ...REP, 'content-profile': 'app' });
    expect(get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ 'accept-profile': 'app' }) })
    );
  });

  it('says an embed may be stale on a PATCH when no body column ties to it', async () => {
    const { fire, log } = await setup(() => ({
      ok: true,
      body: [{ id: 'c1', status: 'draft', club: { name: 'Old' } }],
    }));
    await fire(
      'PATCH',
      '/rest/v1/entry_carts?id=eq.c1&select=*,club:clubs(*)',
      { status: 'paid' },
      REP
    );
    expect(log.simulated[0]).toMatchObject({ gaps: ['embed club may be stale'] });
    await fire('PATCH', '/rest/v1/entry_carts?id=eq.c1&select=*,club:clubs(*)', {}, REP);
    expect(log.simulated[1]?.gaps).toEqual([]);
  });

  it('marks a spread embed as a gap on insert and as possibly stale on PATCH', async () => {
    const { fire, log } = await setup(() => ({ ok: true, body: [{ id: 'c1' }] }));
    await fire('POST', '/rest/v1/entry_carts?select=*,...shows(name)', { show_id: 's' }, REP);
    expect(log.simulated[0]?.gaps).toContain('embed shows (spread)');
    await fire(
      'PATCH',
      '/rest/v1/entry_carts?id=eq.c1&select=*,...shows(name)',
      { status: 'x' },
      REP
    );
    expect(log.simulated[1]?.gaps).toEqual(['embed shows may be stale']);
  });

  it('records an inner embed that resolves to null on insert', async () => {
    const { fire, log } = await setup(() => ({ ok: true, body: [] }));
    await fire(
      'POST',
      '/rest/v1/entry_carts?select=id,show:shows!inner(*)',
      { show_id: null },
      REP
    );
    expect(log.simulated[0]?.gaps).toContain('embed show (inner) is null');
  });

  it('notes the conflict was not checked when an upsert body lacks the conflict column', async () => {
    const { fire, log } = await setup(() => ({ ok: true, body: [] }));
    await fire(
      'POST',
      '/rest/v1/entry_carts?on_conflict=show_id',
      { status: 'x' },
      { prefer: 'resolution=merge-duplicates,return=representation' }
    );
    expect(log.simulated[0]).toMatchObject({
      kind: 'built from the body',
      gaps: ['conflict not checked'],
    });
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
    expect(log.simulated[0]).toMatchObject({
      kind: 'built from the body',
      gaps: ['conflict not checked', 'embed show'],
    });
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
          kind: 'built from the body',
          gaps: [],
        },
        {
          page: 'http://localhost:5173/cart',
          method: 'POST',
          table: 'entry_carts',
          kind: 'built from the body',
          gaps: [],
        },
      ],
    });
    expect(text).toContain('Simulated (answered in the browser, never sent): 2');
    expect(
      text.match(/http:\/\/localhost:5173\/cart {2}POST entry_carts: built from the body/g)
    ).toHaveLength(1);
  });
  it('says none when nothing was simulated', () => {
    const text = formatWalkLog({ refused: [], readRpcs: new Set(), simulated: [] });
    expect(text).toContain('Simulated (answered in the browser, never sent): 0');
  });
});
