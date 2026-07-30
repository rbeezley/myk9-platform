import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { setClubShowManagerAccess } from './show-managers';

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

const rpcMock = vi.mocked(supabase.rpc);

describe('setClubShowManagerAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null } as never);
  });

  it('grants club-scoped secretary access through the authorized RPC', async () => {
    await setClubShowManagerAccess({
      clubId: 'club-1',
      personId: 'person-1',
      grant: true,
    });

    expect(rpcMock).toHaveBeenCalledWith('grant_club_secretary', {
      p_club_id: 'club-1',
      p_person_id: 'person-1',
    });
  });

  it('revokes club-scoped secretary access through the authorized RPC', async () => {
    await setClubShowManagerAccess({
      clubId: 'club-1',
      personId: 'person-1',
      grant: false,
    });

    expect(rpcMock).toHaveBeenCalledWith('revoke_club_secretary', {
      p_club_id: 'club-1',
      p_person_id: 'person-1',
    });
  });

  it('surfaces an authorization failure instead of reporting success', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Only this club admin can grant access' },
    } as never);

    await expect(
      setClubShowManagerAccess({
        clubId: 'club-1',
        personId: 'person-1',
        grant: true,
      })
    ).rejects.toMatchObject({
      message: 'Only this club admin can grant access',
    });
  });
});
