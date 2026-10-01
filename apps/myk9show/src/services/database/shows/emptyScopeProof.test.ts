import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../supabaseClient', () => ({ supabase: { rpc } }));

import { verifyShowsAllDeleted } from './emptyScopeProof';

describe('verifyShowsAllDeleted', () => {
  beforeEach(() => {
    rpc.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('proves deletion only when every show is reported soft-deleted', async () => {
    rpc.mockResolvedValue({ data: [{ show_id: 'a', is_live: false }], error: null });
    await expect(verifyShowsAllDeleted(['a'])).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('get_manageable_show_liveness', { p_show_ids: ['a'] });
  });

  it('does not prove deletion for a live, unreported or errored show', async () => {
    rpc.mockResolvedValueOnce({ data: [{ show_id: 'a', is_live: true }], error: null });
    await expect(verifyShowsAllDeleted(['a'])).resolves.toBe(false);
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(verifyShowsAllDeleted(['a'])).resolves.toBe(false);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(verifyShowsAllDeleted(['a'])).resolves.toBe(false);
  });

  it('does not prove deletion offline, and asks nothing for an empty list', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(verifyShowsAllDeleted(['a'])).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await expect(verifyShowsAllDeleted([])).resolves.toBe(true);
  });
});
