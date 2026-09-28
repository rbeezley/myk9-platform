import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { getPendingClubAuthorizations, setClubAuthorization } from './authorization';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: mocks.from,
  },
}));

const rpcMock = vi.mocked(supabase.rpc);

describe('setClubAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null } as never);
  });

  it('authorizes a club through the site-admin-only RPC with exact args', async () => {
    await setClubAuthorization('club-1', true);

    expect(rpcMock).toHaveBeenCalledWith('set_club_authorization', {
      p_club_id: 'club-1',
      p_authorized: true,
    });
  });

  it('revokes a club through the same RPC with exact args', async () => {
    await setClubAuthorization('club-1', false);

    expect(rpcMock).toHaveBeenCalledWith('set_club_authorization', {
      p_club_id: 'club-1',
      p_authorized: false,
    });
  });

  it('surfaces a 42501 authorization failure instead of reporting success', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Only site admins can authorize or revoke a club', code: '42501' },
    } as never);

    await expect(setClubAuthorization('club-1', true)).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('getPendingClubAuthorizations', () => {
  const order = vi.fn();
  const deleted = vi.fn(() => ({ order }));
  const unauthorized = vi.fn(() => ({ is: deleted }));
  const select = vi.fn(() => ({ is: unauthorized }));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select });
    order.mockResolvedValue({ data: [], error: null });
  });

  it('reads only live unauthorized clubs with named review columns', async () => {
    order.mockResolvedValue({
      data: [
        {
          id: 'club-1',
          name: 'Darboshea',
          website: null,
          city: 'Tulsa',
          state: 'OK',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
      error: null,
    });

    await expect(getPendingClubAuthorizations()).resolves.toEqual([
      {
        id: 'club-1',
        name: 'Darboshea',
        website: null,
        city: 'Tulsa',
        state: 'OK',
        createdAt: '2026-09-01T00:00:00Z',
      },
    ]);
    expect(mocks.from).toHaveBeenCalledWith('clubs');
    expect(select).toHaveBeenCalledWith('id, name, website, city, state, created_at');
    expect(unauthorized).toHaveBeenCalledWith('authorized_at', null);
    expect(deleted).toHaveBeenCalledWith('deleted_at', null);
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('throws on a read error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'offline' } });

    await expect(getPendingClubAuthorizations()).rejects.toMatchObject({ message: 'offline' });
  });
});
