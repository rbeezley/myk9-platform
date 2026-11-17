import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc } }));

import { verifyPaperworkPrintsEmpty } from '../paperworkPrintsScopeProof';

describe('verifyPaperworkPrintsEmpty', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: 0, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks count_paperwork_prints for the show and proves a zero count', async () => {
    expect(await verifyPaperworkPrintsEmpty('show-1')).toBe(true);

    expect(rpc).toHaveBeenCalledWith('count_paperwork_prints', { p_show_id: 'show-1' });
  });

  it('does not prove a scope that still holds rows for the caller', async () => {
    rpc.mockResolvedValue({ data: 3, error: null });

    expect(await verifyPaperworkPrintsEmpty('show-1')).toBe(false);
  });

  it('treats an error, a non-numeric answer or a thrown call as unproven', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    expect(await verifyPaperworkPrintsEmpty('show-1')).toBe(false);

    rpc.mockResolvedValue({ data: null, error: null });
    expect(await verifyPaperworkPrintsEmpty('show-1')).toBe(false);

    rpc.mockResolvedValue({ data: '0', error: null });
    expect(await verifyPaperworkPrintsEmpty('show-1')).toBe(false);

    rpc.mockRejectedValue(new Error('network'));
    expect(await verifyPaperworkPrintsEmpty('show-1')).toBe(false);
  });

  it('never proves emptiness while offline, without calling the server', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    expect(await verifyPaperworkPrintsEmpty('show-1')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
