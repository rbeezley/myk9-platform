import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import { fetchGrantHistory, grantEntitlement, revokeEntitlement } from './admin';
import type { AdminGrantHistoryRow } from './types';

describe('grantEntitlement', () => {
  beforeEach(() => {
    resetMockSupabase();
    vi.clearAllMocks();
  });

  it('calls admin_grant_entitlement with mapped args and defaults replace_active to false', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 'grant-1', error: null });

    const id = await grantEntitlement({
      personId: 'person-1',
      grantType: 'founding',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      reason: 'legacy backfill',
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('admin_grant_entitlement', {
      p_person_id: 'person-1',
      p_grant_type: 'founding',
      p_starts_at: '2026-01-01T00:00:00Z',
      p_ends_at: '2027-01-01T00:00:00Z',
      p_reason: 'legacy backfill',
      p_replace_active: false,
    });
    expect(id).toBe('grant-1');
  });

  it('passes replaceActive through when explicitly true', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 'grant-2', error: null });

    await grantEntitlement({
      personId: 'person-1',
      grantType: 'complimentary',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2026-06-01T00:00:00Z',
      reason: 'support gesture',
      replaceActive: true,
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'admin_grant_entitlement',
      expect.objectContaining({ p_replace_active: true })
    );
  });

  it('throws on rpc error', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'not a site admin' } });

    await expect(
      grantEntitlement({
        personId: 'person-1',
        grantType: 'founding',
        startsAt: '2026-01-01T00:00:00Z',
        endsAt: '2027-01-01T00:00:00Z',
        reason: 'x',
      })
    ).rejects.toThrow('not a site admin');
  });
});

describe('revokeEntitlement', () => {
  beforeEach(() => {
    resetMockSupabase();
    vi.clearAllMocks();
  });

  it('calls admin_revoke_entitlement with grant id and reason', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    await revokeEntitlement('grant-1', 'no longer eligible');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('admin_revoke_entitlement', {
      p_grant_id: 'grant-1',
      p_reason: 'no longer eligible',
    });
  });

  it('throws client-side on a blank reason without calling the rpc', async () => {
    await expect(revokeEntitlement('grant-1', '   ')).rejects.toThrow('reason is required');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('throws on rpc error', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'grant not found' } });

    await expect(revokeEntitlement('grant-1', 'reason')).rejects.toThrow('grant not found');
  });
});

describe('fetchGrantHistory', () => {
  beforeEach(() => {
    resetMockSupabase();
    vi.clearAllMocks();
  });

  const ROW: AdminGrantHistoryRow = {
    id: 'grant-1',
    person_id: 'person-1',
    grant_type: 'founding',
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: '2027-01-01T00:00:00Z',
    reason: 'legacy backfill',
    granted_by_person_id: null,
    created_at: '2026-01-01T00:00:00Z',
    revoked_at: null,
    revoked_by_person_id: null,
    revoke_reason: null,
    superseded_at: null,
    superseded_by_grant_id: null,
  };

  it('selects from subscription_entitlement_grants, filters by person, orders by created_at desc', async () => {
    mockSupabase.from.mockReturnValue(createChainableQuery({ data: [ROW], error: null }));

    const rows = await fetchGrantHistory('person-1');

    expect(mockSupabase.from).toHaveBeenCalledWith('subscription_entitlement_grants');
    expect(rows).toEqual([ROW]);
  });

  it('throws on read error', async () => {
    mockSupabase.from.mockReturnValue(
      createChainableQuery({ data: null, error: { message: 'permission denied' } })
    );

    await expect(fetchGrantHistory('person-1')).rejects.toThrow('permission denied');
  });

  it('returns an empty array (not an error) when RLS silently denies a non-admin read', async () => {
    mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

    const rows = await fetchGrantHistory('person-1');

    expect(rows).toEqual([]);
  });
});
