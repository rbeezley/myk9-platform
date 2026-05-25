import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import { approveRoleRequest, denyRoleRequest, getAllRoleRequests, mapDbRoleRequest } from './index';

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
