import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invokeAdminInvite: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/components/users/UserDetails/useSendUserInvitation', () => ({
  invokeAdminInvite: mocks.invokeAdminInvite,
}));

import { addClubAdminByEmail, getClubAdmins, removeClubAdmin } from './club-admins';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('club admins service', () => {
  it('lists admins through get_club_admins', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ person_id: 'p1', person_name: 'Ada', person_email: 'a@x.test', has_account: false }],
      error: null,
    });

    await expect(getClubAdmins('club-1')).resolves.toEqual([
      { personId: 'p1', personName: 'Ada', personEmail: 'a@x.test', hasAccount: false },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith('get_club_admins', { p_club_id: 'club-1' });
  });

  it('adds an existing account with no invitation', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ person_id: 'p1', has_account: true }], error: null });

    await expect(addClubAdminByEmail('club-1', 'a@x.test')).resolves.toEqual({
      personId: 'p1',
      hasAccount: true,
      invited: false,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('add_club_admin_by_email', {
      p_club_id: 'club-1',
      p_email: 'a@x.test',
    });
    expect(mocks.invokeAdminInvite).not.toHaveBeenCalled();
  });

  it('invites an address with no account, scoped to this club and person', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ person_id: 'p2', has_account: false }], error: null });
    mocks.invokeAdminInvite.mockResolvedValue({ data: { outcome: 'invited' } });

    await expect(addClubAdminByEmail('club-1', 'new@x.test')).resolves.toMatchObject({
      invited: true,
    });
    expect(mocks.invokeAdminInvite).toHaveBeenCalledWith({
      personId: 'p2',
      email: 'new@x.test',
      roleNames: ['club_admin'],
      clubId: 'club-1',
    });
  });

  it('keeps the grant and reports the error when only the invitation fails', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ person_id: 'p2', has_account: false }], error: null });
    mocks.invokeAdminInvite.mockRejectedValue(new Error('mail down'));

    const result = await addClubAdminByEmail('club-1', 'new@x.test');
    expect(result.invited).toBe(false);
    expect(result.inviteError?.message).toBe('mail down');
  });

  it('removes through revoke_club_admin and throws its refusal', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await removeClubAdmin('club-1', 'p1');
    expect(mocks.rpc).toHaveBeenCalledWith('revoke_club_admin', {
      p_club_id: 'club-1',
      p_person_id: 'p1',
    });

    const refusal = { message: 'A club needs at least one admin. Add another admin first.' };
    mocks.rpc.mockResolvedValue({ data: null, error: refusal });
    await expect(removeClubAdmin('club-1', 'p1')).rejects.toBe(refusal);
  });
});
