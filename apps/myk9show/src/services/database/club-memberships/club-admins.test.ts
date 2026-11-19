import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

import { addClubAdminByEmail, getClubAdmins, removeClubAdmin } from './club-admins';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('club admins service', () => {
  it('lists admins through get_club_admins', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ person_id: 'p1', person_name: 'Ada', person_email: 'a@x.test' }],
      error: null,
    });

    await expect(getClubAdmins('club-1')).resolves.toEqual([
      { personId: 'p1', personName: 'Ada', personEmail: 'a@x.test' },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith('get_club_admins', { p_club_id: 'club-1' });
  });

  it('adds an existing account through add_club_admin_by_email', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ outcome: 'added', person_id: 'p1' }], error: null });

    await expect(addClubAdminByEmail('club-1', 'a@x.test')).resolves.toBe('added');
    expect(mocks.rpc).toHaveBeenCalledWith('add_club_admin_by_email', {
      p_club_id: 'club-1',
      p_email: 'a@x.test',
    });
  });

  it('reports no_account when nobody with that email has signed in', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ outcome: 'no_account', person_id: null }],
      error: null,
    });

    await expect(addClubAdminByEmail('club-1', 'new@x.test')).resolves.toBe('no_account');
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
