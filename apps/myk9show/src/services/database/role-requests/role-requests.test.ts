import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import {
  approveClubRoleRequest,
  approveRoleRequest,
  denyClubRoleRequest,
  denyRoleRequest,
  getAllRoleRequests,
  getMyClubSecretaryRequestStatus,
  listClubRoleRequests,
  mapDbRoleRequest,
  submitClubSecretaryRequest,
  RoleRequestAlreadyPendingError,
  RoleRequestStandingDenialError,
} from './index';

describe('role request database service', () => {
  beforeEach(() => {
    resetMockSupabase();
    vi.clearAllMocks();
  });

  it('maps database rows into admin-friendly role request records', () => {
    expect(
      mapDbRoleRequest({
        id: 'request-1',
        auth_user_id: 'auth-1',
        person_id: 'person-1',
        requested_role: 'club_admin',
        requested_scope: 'club',
        club_id: 'club-1',
        show_id: null,
        status: 'pending',
        requester_note: 'I run the club.',
        reviewer_note: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
        person: {
          first_name: 'Pat',
          last_name: 'Morgan',
          email: 'pat@example.com',
        },
        club: {
          name: 'Best Club',
        },
      })
    ).toEqual({
      id: 'request-1',
      authUserId: 'auth-1',
      personId: 'person-1',
      requestedRole: 'club_admin',
      requestedScope: 'club',
      clubId: 'club-1',
      clubName: 'Best Club',
      showId: null,
      status: 'pending',
      requesterNote: 'I run the club.',
      reviewerNote: null,
      reviewedBy: null,
      reviewerName: null,
      reviewerEmail: null,
      reviewedAt: null,
      createdAt: '2026-05-24T12:00:00Z',
      updatedAt: '2026-05-24T12:00:00Z',
      requesterName: 'Pat Morgan',
      requesterEmail: 'pat@example.com',
    });
  });

  it('throws when requested_scope is outside the RequestedScope union', () => {
    expect(() =>
      mapDbRoleRequest({
        id: 'request-bad',
        auth_user_id: 'auth-1',
        person_id: 'person-1',
        requested_role: 'club_admin',
        // Intentionally bad value: simulates pre-CHECK drift or a future schema diverge.
        requested_scope: 'platform' as unknown as 'club',
        club_id: null,
        show_id: null,
        status: 'pending',
        requester_note: null,
        reviewer_note: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
        person: null,
        club: null,
      })
    ).toThrow(/requested_scope.*platform/);
  });

  it('throws when requested_role is outside the RequestedRole union', () => {
    expect(() =>
      mapDbRoleRequest({
        id: 'request-bad',
        auth_user_id: 'auth-1',
        person_id: 'person-1',
        // Intentionally bad value: simulates pre-CHECK drift or a future schema diverge.
        requested_role: 'judge' as unknown as 'club_admin',
        requested_scope: 'club',
        club_id: null,
        show_id: null,
        status: 'pending',
        requester_note: null,
        reviewer_note: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
        person: null,
        club: null,
      })
    ).toThrow(/requested_role.*judge/);
  });

  it('throws when status is outside the RoleRequestStatus union', () => {
    expect(() =>
      mapDbRoleRequest({
        id: 'request-bad',
        auth_user_id: 'auth-1',
        person_id: 'person-1',
        requested_role: 'club_admin',
        requested_scope: 'club',
        club_id: null,
        show_id: null,
        // Intentionally bad value: simulates pre-CHECK drift or a future schema diverge.
        status: 'rejected' as unknown as 'denied',
        requester_note: null,
        reviewer_note: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: '2026-05-24T12:00:00Z',
        updated_at: '2026-05-24T12:00:00Z',
        person: null,
        club: null,
      })
    ).toThrow(/status.*rejected/);
  });

  it('maps reviewer profile details for completed requests', () => {
    const request = mapDbRoleRequest({
      id: 'request-reviewed',
      auth_user_id: 'auth-1',
      person_id: 'person-1',
      requested_role: 'secretary',
      requested_scope: 'club',
      club_id: 'club-1',
      show_id: null,
      status: 'approved',
      requester_note: null,
      reviewer_note: 'Confirmed by phone.',
      reviewed_by: 'reviewer-1',
      reviewed_at: '2026-05-25T12:00:00Z',
      created_at: '2026-05-24T12:00:00Z',
      updated_at: '2026-05-25T12:00:00Z',
      person: null,
      reviewer: {
        first_name: 'Alex',
        last_name: 'Rivera',
        email: 'alex@example.com',
      },
      club: { name: 'Best Club' },
    });

    expect(request.reviewerName).toBe('Alex Rivera');
    expect(request.reviewerEmail).toBe('alex@example.com');
  });

  it('reads all role requests newest first for site admins', async () => {
    mockSupabase.from.mockReturnValue(
      createChainableQuery({
        data: [
          {
            id: 'request-1',
            auth_user_id: 'auth-1',
            person_id: 'person-1',
            requested_role: 'secretary',
            requested_scope: 'club',
            club_id: null,
            show_id: null,
            status: 'pending',
            requester_note: null,
            reviewer_note: null,
            reviewed_by: null,
            reviewed_at: null,
            created_at: '2026-05-24T12:00:00Z',
            updated_at: '2026-05-24T12:00:00Z',
            person: null,
            club: null,
          },
        ],
        error: null,
      })
    );

    const requests = await getAllRoleRequests();

    expect(mockSupabase.from).toHaveBeenCalledWith('role_requests');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.requestedRole).toBe('secretary');
  });

  it('approves through the database RPC so role grants stay server-authorized', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

    await approveRoleRequest('request-1', {
      clubId: 'club-1',
      reviewerNote: 'Verified with club.',
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('approve_role_request', {
      p_request_id: 'request-1',
      p_club_id: 'club-1',
      p_reviewer_note: 'Verified with club.',
    });
  });

  it('denies through a scoped update with an admin note', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

    await denyRoleRequest('request-1', 'Not enough information.');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('deny_role_request', {
      p_request_id: 'request-1',
      p_reviewer_note: 'Not enough information.',
    });
  });
});

describe('club-routed secretary requests (MYK9-571)', () => {
  beforeEach(() => {
    resetMockSupabase();
    vi.clearAllMocks();
  });

  it('submits a club-scoped secretary request with the exact RPC args', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: 'request-99', error: null }));

    const id = await submitClubSecretaryRequest({ clubId: 'club-1', note: 'I run entries.' });

    expect(mockSupabase.rpc).toHaveBeenCalledWith('submit_role_request', {
      p_requested_role: 'secretary',
      p_requested_scope: 'club',
      p_club_id: 'club-1',
      p_requester_note: 'I run entries.',
    });
    expect(id).toBe('request-99');
  });

  it('throws RoleRequestAlreadyPendingError when the RPC returns a NULL id', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

    await expect(
      submitClubSecretaryRequest({ clubId: 'club-1', note: 'Again.' })
    ).rejects.toBeInstanceOf(RoleRequestAlreadyPendingError);
  });

  it('throws RoleRequestStandingDenialError when the RPC raises the MK571 error code', async () => {
    mockSupabase.rpc.mockReturnValue(
      createChainableQuery({
        data: null,
        error: { code: 'MK571', message: 'A previous request for this role was denied.' },
      })
    );

    await expect(
      submitClubSecretaryRequest({ clubId: 'club-1', note: 'Please reconsider.' })
    ).rejects.toBeInstanceOf(RoleRequestStandingDenialError);
  });

  it('propagates any other RPC error unchanged', async () => {
    mockSupabase.rpc.mockReturnValue(
      createChainableQuery({ data: null, error: { code: '42501', message: 'nope' } })
    );

    await expect(submitClubSecretaryRequest({ clubId: 'club-1', note: 'x' })).rejects.toMatchObject(
      { code: '42501' }
    );
  });

  it('reads the caller\u2019s own latest club-scoped secretary request status, filtered to the given auth id', async () => {
    const chain = createChainableQuery({
      data: { status: 'pending', reviewer_note: null },
      error: null,
    });
    mockSupabase.from.mockReturnValue(chain);

    const status = await getMyClubSecretaryRequestStatus('club-1', 'auth-1');

    expect(mockSupabase.from).toHaveBeenCalledWith('role_requests');
    expect(chain.eq).toHaveBeenCalledWith('auth_user_id', 'auth-1');
    expect(chain.eq).toHaveBeenCalledWith('club_id', 'club-1');
    expect(chain.eq).toHaveBeenCalledWith('requested_role', 'secretary');
    expect(chain.eq).toHaveBeenCalledWith('requested_scope', 'club');
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(status).toEqual({ status: 'pending', reviewerNote: null });
  });

  it('throws without querying when no auth user id is given (MYK9-571 round 2, P2-1)', async () => {
    await expect(getMyClubSecretaryRequestStatus('club-1', '')).rejects.toThrow(
      /requires an authenticated user id/
    );
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('returns null when there is no prior request', async () => {
    mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

    expect(await getMyClubSecretaryRequestStatus('club-1', 'auth-1')).toBeNull();
  });

  it('surfaces the reviewer note on a denied request', async () => {
    mockSupabase.from.mockReturnValue(
      createChainableQuery({
        data: { status: 'denied', reviewer_note: 'Not enough context yet.' },
        error: null,
      })
    );

    expect(await getMyClubSecretaryRequestStatus('club-1', 'auth-1')).toEqual({
      status: 'denied',
      reviewerNote: 'Not enough context yet.',
    });
  });

  it('lists a club\u2019s pending club-scoped secretary requests through the list_club_role_requests RPC', async () => {
    // A REALISTIC 18-column RPC row (MYK9-571 round 3, P2-3) — the RPC does
    // not return auth_user_id (no club-admin consumer reads it), and
    // created_at/updated_at are real ISO strings, not undefined:
    // ClubShowAccessRequests.tsx calls
    // formatDistanceToNow(new Date(request.createdAt)), which THROWS on
    // `new Date(undefined)`, so a fixture that omits it would pass this
    // unit test while crashing the component it feeds.
    mockSupabase.rpc.mockReturnValue(
      createChainableQuery({
        data: [
          {
            id: 'request-1',
            person_id: 'person-1',
            requested_role: 'secretary',
            requested_scope: 'club',
            club_id: 'club-1',
            club_name: 'Best Club',
            show_id: null,
            status: 'pending',
            requester_note: 'Please.',
            reviewer_note: null,
            reviewed_by: null,
            reviewer_name: null,
            reviewer_email: null,
            reviewed_at: null,
            created_at: '2026-09-15T12:00:00Z',
            updated_at: '2026-09-15T12:00:00Z',
            requester_name: 'Pat Morgan',
            requester_email: 'pat@example.com',
          },
        ],
        error: null,
      })
    );

    const requests = await listClubRoleRequests('club-1');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('list_club_role_requests', {
      p_club_id: 'club-1',
    });
    expect(requests).toEqual([
      {
        id: 'request-1',
        authUserId: '',
        personId: 'person-1',
        requestedRole: 'secretary',
        requestedScope: 'club',
        clubId: 'club-1',
        clubName: 'Best Club',
        showId: null,
        status: 'pending',
        requesterNote: 'Please.',
        reviewerNote: null,
        reviewedBy: null,
        reviewerName: null,
        reviewerEmail: null,
        reviewedAt: null,
        createdAt: '2026-09-15T12:00:00Z',
        updatedAt: '2026-09-15T12:00:00Z',
        requesterName: 'Pat Morgan',
        requesterEmail: 'pat@example.com',
      },
    ]);
  });

  it('propagates a 42501 from list_club_role_requests unchanged (non-admin caller)', async () => {
    mockSupabase.rpc.mockReturnValue(
      createChainableQuery({ data: null, error: { code: '42501', message: 'nope' } })
    );

    await expect(listClubRoleRequests('club-1')).rejects.toMatchObject({ code: '42501' });
  });

  it('approves a club-scoped secretary request through approve_club_role_request', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

    await approveClubRoleRequest('request-1', 'Confirmed with the club.');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('approve_club_role_request', {
      p_request_id: 'request-1',
      p_note: 'Confirmed with the club.',
    });
  });

  it('approves without a note when none is given', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

    await approveClubRoleRequest('request-1');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('approve_club_role_request', {
      p_request_id: 'request-1',
    });
  });

  it('denies a club-scoped secretary request through deny_club_role_request', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

    await denyClubRoleRequest('request-1', 'Not enough context.');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('deny_club_role_request', {
      p_request_id: 'request-1',
      p_note: 'Not enough context.',
    });
  });
});
