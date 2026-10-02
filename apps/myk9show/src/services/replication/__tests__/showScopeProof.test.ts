import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc } }));

import { verifyShowsGone } from '../showScopeProof';

const gone = { data: null, error: { code: 'P0002' } };
const ids = (n: number) => Array.from({ length: n }, (_, i) => `show-${i}`);

describe('verifyShowsGone', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue(gone);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proves nothing is held without calling the server', async () => {
    expect(await verifyShowsGone([])).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('asks delete_preview for the show scope with each id', async () => {
    expect(await verifyShowsGone(['a', 'b'])).toBe(true);

    expect(rpc).toHaveBeenCalledWith('delete_preview', { p_scope: 'show', p_id: 'a' });
    expect(rpc).toHaveBeenCalledWith('delete_preview', { p_scope: 'show', p_id: 'b' });
  });

  it('stops after the batch holding the first live show: later ids are never asked', async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_id: string }) =>
      args.p_id === 'show-1' ? { data: {}, error: null } : gone
    );

    expect(await verifyShowsGone(ids(23))).toBe(false);

    // One batch of 5, not 23.
    expect(rpc).toHaveBeenCalledTimes(5);
    expect(rpc).not.toHaveBeenCalledWith('delete_preview', { p_scope: 'show', p_id: 'show-5' });
  });

  it('proves a replica larger than any single batch, all of it gone', async () => {
    expect(await verifyShowsGone(ids(120))).toBe(true);

    expect(rpc).toHaveBeenCalledTimes(120);
  });

  it('keeps everything when a later batch holds a live show', async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_id: string }) =>
      args.p_id === 'show-57' ? { data: null, error: { code: '42501' } } : gone
    );

    expect(await verifyShowsGone(ids(120))).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(60);
  });

  it('treats a non-P0002 error or a thrown call as unproven', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014' } });
    expect(await verifyShowsGone(['a'])).toBe(false);

    rpc.mockRejectedValue(new Error('network'));
    expect(await verifyShowsGone(['a'])).toBe(false);
  });

  it('does not call the server while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    expect(await verifyShowsGone(['a'])).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
