import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('../supabaseClient', () => ({
  supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));

import {
  cancelClubAdminInvite,
  getClubAdminInvites,
  inviteClubAdmin,
  sendClubAdminInviteEmail,
} from './club-admin-invites';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('club admin invites service', () => {
  it('lists pending invites through list_club_admin_invites', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          invite_id: 'i1',
          invite_email: 'new@x.test',
          invited_by_name: 'Ada',
          created_at: '2026-11-20T00:00:00Z',
          expires_at: '2026-12-04T00:00:00Z',
          last_sent_at: null,
          is_expired: false,
        },
      ],
      error: null,
    });

    await expect(getClubAdminInvites('club-1')).resolves.toEqual([
      {
        inviteId: 'i1',
        email: 'new@x.test',
        invitedByName: 'Ada',
        createdAt: '2026-11-20T00:00:00Z',
        expiresAt: '2026-12-04T00:00:00Z',
        lastSentAt: null,
        isExpired: false,
      },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith('list_club_admin_invites', { p_club_id: 'club-1' });
  });

  it('invites through invite_club_admin and returns the outcome and id', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ outcome: 'invited', invite_id: 'i1', invite_email: 'new@x.test' }],
      error: null,
    });

    await expect(inviteClubAdmin('club-1', 'new@x.test')).resolves.toEqual({
      outcome: 'invited',
      inviteId: 'i1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('invite_club_admin', {
      p_club_id: 'club-1',
      p_email: 'new@x.test',
    });
  });

  it('reports has_account with no invite id', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ outcome: 'has_account', invite_id: null, invite_email: 'a@x.test' }],
      error: null,
    });
    await expect(inviteClubAdmin('club-1', 'a@x.test')).resolves.toEqual({
      outcome: 'has_account',
      inviteId: null,
    });
  });

  it('throws the RPC refusal', async () => {
    const refusal = { message: 'Confirm your password to continue.', code: 'MKAUT' };
    mocks.rpc.mockResolvedValue({ data: null, error: refusal });
    await expect(inviteClubAdmin('club-1', 'a@x.test')).rejects.toBe(refusal);
  });

  it('sends the email through the edge function with the invite id', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await sendClubAdminInviteEmail('i1');
    expect(mocks.invoke).toHaveBeenCalledWith('send-club-admin-invite-email', {
      body: { inviteId: 'i1' },
    });
  });

  it('turns an edge refusal into a send error carrying its status and reason', async () => {
    const body = { error: 'This invite has expired.', code: 'expired' };
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify(body), { status: 409 }) },
    });
    await expect(sendClubAdminInviteEmail('i1')).rejects.toMatchObject({
      name: 'ClubAdminInviteSendError',
      message: 'This invite has expired.',
      status: 409,
      reason: 'expired',
    });
  });

  it('cancels through cancel_club_admin_invite', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await cancelClubAdminInvite('i1');
    expect(mocks.rpc).toHaveBeenCalledWith('cancel_club_admin_invite', { p_invite_id: 'i1' });
  });
});
