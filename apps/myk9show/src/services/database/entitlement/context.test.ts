import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import { fetchOwnEntitlementContext } from './context';
import type { OwnEntitlementContext } from './types';

const ROW: OwnEntitlementContext = {
  evaluated_at: '2026-07-23T00:00:00Z',
  paid_tier: 'premium',
  paid_expires_at: null,
  grant_type: 'founding',
  grant_status: 'active',
  grant_starts_at: '2026-01-01T00:00:00Z',
  grant_ends_at: '2027-01-01T00:00:00Z',
  scored_show_count: 3,
};

describe('fetchOwnEntitlementContext', () => {
  beforeEach(() => {
    resetMockSupabase();
    vi.clearAllMocks();
  });

  it('calls get_own_entitlement_context with no args and unwraps the single row', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [ROW], error: null });

    const result = await fetchOwnEntitlementContext();

    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_own_entitlement_context');
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(result).toEqual(ROW);
  });

  it('throws on rpc error instead of returning silently', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(fetchOwnEntitlementContext()).rejects.toThrow('boom');
  });

  it('throws when the rpc returns no row', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

    await expect(fetchOwnEntitlementContext()).rejects.toThrow('no row');
  });
});
