import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { clubSecretaryService } from './clubSecretaryService';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('clubSecretaryService', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it('grants secretary access for one club through the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'assignment-1', error: null } as never);

    await clubSecretaryService.grantSecretary({ personId: 'person-1', clubId: 'club-1' });

    expect(supabase.rpc).toHaveBeenCalledWith('grant_club_secretary', {
      p_person_id: 'person-1',
      p_club_id: 'club-1',
    });
  });

  it('lists active secretaries for one club', async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'assignment-1',
          user_id: 'person-1',
          club_id: 'club-1',
          people: {
            id: 'person-1',
            first_name: 'Jane',
            last_name: 'Doe',
            email: 'jane@example.com',
          },
        },
      ],
      error: null,
    });
    const eqActive = vi.fn(() => ({ in: inFn }));
    const eqClub = vi.fn(() => ({ eq: eqActive }));
    const select = vi.fn(() => ({ eq: eqClub }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    const result = await clubSecretaryService.listSecretaries('club-1', ['secretary-role-id']);

    expect(supabase.from).toHaveBeenCalledWith('user_roles');
    expect(eqClub).toHaveBeenCalledWith('club_id', 'club-1');
    expect(eqActive).toHaveBeenCalledWith('is_active', true);
    expect(inFn).toHaveBeenCalledWith('role_id', ['secretary-role-id']);
    expect(result).toHaveLength(1);
  });

  it('revokes secretary access for one club through the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

    await clubSecretaryService.revokeSecretary({ personId: 'person-1', clubId: 'club-1' });

    expect(supabase.rpc).toHaveBeenCalledWith('revoke_club_secretary', {
      p_person_id: 'person-1',
      p_club_id: 'club-1',
    });
  });
});
