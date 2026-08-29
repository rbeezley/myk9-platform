/**
 * The offline case here is the one that mattered: it used to destroy the
 * secretary's work. Validation REQUIRES a chairman and a secretary, so an
 * offline save always had at least two grants, every one of those RPCs
 * rejected, and the caller's catch block then compensating-deleted the show
 * that had just been entered.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { grantShowOfficials } from '../grantShowOfficials';
import { OfficialsNotAssignedError } from '../showSaveErrors';

const rpcMock = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const officials = {
  secretary: ['person-secretary'],
  chairman: ['person-chairman'],
  steward: [],
};

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ error: null });
});

describe('grantShowOfficials', () => {
  it('grants one role per official when online', async () => {
    const result = await grantShowOfficials({ showId: 'show-1', officials, isOnline: true });

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(result.deferredOffline).toBe(0);
  });

  it('attempts NOTHING offline, and reports how many were deferred', async () => {
    const result = await grantShowOfficials({ showId: 'show-1', officials, isOnline: false });

    // The critical assertion: no RPC is fired, so nothing throws, so the caller
    // never reaches the compensating delete that destroyed the show.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.deferredOffline).toBe(2);
  });

  it('throws a partial-success error naming the show when a grant fails online', async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: 'forbidden' } });

    await expect(
      grantShowOfficials({ showId: 'show-1', officials, isOnline: true })
    ).rejects.toBeInstanceOf(OfficialsNotAssignedError);
  });

  it('counts every failure, not just the first', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'forbidden' } });

    await expect(
      grantShowOfficials({ showId: 'show-1', officials, isOnline: true })
    ).rejects.toMatchObject({ showId: 'show-1', failedCount: 2 });
  });

  it('is a no-op offline when there are no officials to grant', async () => {
    const result = await grantShowOfficials({
      showId: 'show-1',
      officials: { secretary: [], chairman: [], steward: [] },
      isOnline: false,
    });

    expect(result.deferredOffline).toBe(0);
  });
});
