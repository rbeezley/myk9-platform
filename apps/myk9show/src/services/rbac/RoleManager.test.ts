import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { AuditLogger } from './AuditLogger';
import { RoleManager } from './RoleManager';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

const rpcMock = vi.mocked(supabase.rpc);
const fromMock = vi.mocked(supabase.from);

describe('RoleManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes show-scoped official grants through the hardened RPC', async () => {
    const clearUserCache = vi.fn();
    const manager = new RoleManager(new AuditLogger(), clearUserCache, vi.fn());
    rpcMock.mockResolvedValue({ data: 'assignment-1', error: null });

    await expect(
      manager.ensureUserHasRole('person-1', 'secretary', { showId: 'show-1' })
    ).resolves.toBe(true);

    expect(rpcMock).toHaveBeenCalledWith('grant_show_official', {
      p_person_id: 'person-1',
      p_role_name: 'secretary',
      p_show_id: 'show-1',
    });
    expect(fromMock).not.toHaveBeenCalledWith('user_roles');
    expect(clearUserCache).toHaveBeenCalledWith('person-1');
  });
});
