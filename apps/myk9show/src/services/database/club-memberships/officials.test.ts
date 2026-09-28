import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { getClubOfficials } from './officials';

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

const rpcMock = vi.mocked(supabase.rpc);

describe('getClubOfficials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads through get_club_officials and splits admins from secretaries', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { role: 'club_admin', person_id: 'p1', person_name: 'Jane Doe' },
        { role: 'club_admin', person_id: 'p2', person_name: 'John Smith' },
        { role: 'secretary', person_id: 'p3', person_name: 'Pat Lee' },
      ],
      error: null,
    } as never);

    await expect(getClubOfficials('club-1')).resolves.toEqual({
      adminNames: ['Jane Doe', 'John Smith'],
      secretaryNames: ['Pat Lee'],
    });
    expect(rpcMock).toHaveBeenCalledWith('get_club_officials', { p_club_id: 'club-1' });
  });

  it('drops people with no name rather than rendering a blank', async () => {
    rpcMock.mockResolvedValue({
      data: [{ role: 'club_admin', person_id: 'p1', person_name: null }],
      error: null,
    } as never);

    await expect(getClubOfficials('club-1')).resolves.toEqual({
      adminNames: [],
      secretaryNames: [],
    });
  });

  it('throws on an RPC error instead of reporting no officials', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function public.get_club_officials(uuid) does not exist' },
    } as never);

    await expect(getClubOfficials('club-1')).rejects.toMatchObject({
      message: 'function public.get_club_officials(uuid) does not exist',
    });
  });
});
