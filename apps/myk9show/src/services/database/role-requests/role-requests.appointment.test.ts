import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import { getMyClubSecretaryRequestStatus } from './index';

/**
 * MYK9-750 (#2271 review): an APPROVED request outlives the appointment it
 * produced. After a club admin revokes that appointment, the latest request
 * still reads 'approved', and the Request button stayed hidden for good. The
 * status read now says whether the appointment is still in force.
 */
describe('getMyClubSecretaryRequestStatus appointment check', () => {
  function tables(request: unknown, grants: { data: unknown; error: unknown }) {
    const grantQuery = createChainableQuery(grants);
    mockSupabase.from.mockImplementation((table: string) =>
      table === 'role_requests' ? createChainableQuery({ data: request, error: null }) : grantQuery
    );
    return grantQuery as unknown as Record<string, ReturnType<typeof vi.fn>>;
  }

  beforeEach(() => {
    resetMockSupabase();
    vi.clearAllMocks();
  });

  it('reports an approved request whose appointment was revoked', async () => {
    const grantQuery = tables(
      { status: 'approved', reviewer_note: null },
      { data: [], error: null }
    );

    await expect(getMyClubSecretaryRequestStatus('club-1', 'auth-1')).resolves.toEqual({
      status: 'approved',
      reviewerNote: null,
      appointmentActive: false,
    });
    expect(mockSupabase.from).toHaveBeenCalledWith('user_roles');
    expect(grantQuery.eq).toHaveBeenCalledWith('auth_user_id', 'auth-1');
    expect(grantQuery.eq).toHaveBeenCalledWith('club_id', 'club-1');
    expect(grantQuery.eq).toHaveBeenCalledWith('is_active', true);
    expect(grantQuery.is).toHaveBeenCalledWith('show_id', null);
  });

  it('reports an approved request whose appointment is still active', async () => {
    tables(
      { status: 'approved', reviewer_note: null },
      { data: [{ expires_at: null, role: { name: 'secretary' } }], error: null }
    );

    await expect(getMyClubSecretaryRequestStatus('club-1', 'auth-1')).resolves.toMatchObject({
      appointmentActive: true,
    });
  });

  it('does not count an expired grant or another role as the appointment', async () => {
    tables(
      { status: 'approved', reviewer_note: null },
      {
        data: [
          { expires_at: '2020-01-01T00:00:00Z', role: { name: 'secretary' } },
          { expires_at: null, role: { name: 'club_admin' } },
        ],
        error: null,
      }
    );

    await expect(getMyClubSecretaryRequestStatus('club-1', 'auth-1')).resolves.toMatchObject({
      appointmentActive: false,
    });
  });

  it('makes no claim about the appointment when the grant read fails', async () => {
    tables({ status: 'approved', reviewer_note: null }, { data: null, error: { code: '500' } });

    const status = await getMyClubSecretaryRequestStatus('club-1', 'auth-1');
    expect(status).toEqual({ status: 'approved', reviewerNote: null });
  });

  it('does not read grants for a request that is not approved', async () => {
    tables({ status: 'pending', reviewer_note: null }, { data: [], error: null });

    await getMyClubSecretaryRequestStatus('club-1', 'auth-1');
    expect(mockSupabase.from).not.toHaveBeenCalledWith('user_roles');
  });
});
