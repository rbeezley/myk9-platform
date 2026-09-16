import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { setClubAuthorization } from './authorization';

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
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
