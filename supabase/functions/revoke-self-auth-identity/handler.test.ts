import { describe, expect, it, vi } from 'vitest';

import { handleRevokeSelfAuthIdentity } from './handler';

function dependencies(updateError: { message: string } | null = null) {
  const updateUserById = vi.fn().mockResolvedValue({ error: updateError });
  const insert = vi.fn().mockResolvedValue({ error: null });

  return {
    updateUserById,
    insert,
    supabase: {
      auth: { admin: { updateUserById } },
      from: vi.fn((table: string) => {
        expect(table).toBe('operator_alerts');
        return { insert };
      }),
    },
  };
}

describe('handleRevokeSelfAuthIdentity', () => {
  it('derives the revocation target from the verified JWT user', async () => {
    const deps = dependencies();

    const result = await handleRevokeSelfAuthIdentity({
      user: { id: 'verified-auth-user' },
      supabase: deps.supabase,
    });

    expect(deps.updateUserById).toHaveBeenCalledWith('verified-auth-user', {
      ban_duration: '876000h',
    });
    expect(result).toEqual({ revoked: true });
  });

  it('rejects a request without a verified JWT user', async () => {
    const deps = dependencies();

    await expect(
      handleRevokeSelfAuthIdentity({ user: undefined, supabase: deps.supabase })
    ).rejects.toMatchObject({ status: 401, message: 'Authentication failed' });
    expect(deps.updateUserById).not.toHaveBeenCalled();
  });

  it('writes the operator alert through the service-role client', async () => {
    const deps = dependencies({ message: 'auth service unavailable' });

    const result = await handleRevokeSelfAuthIdentity({
      user: { id: 'verified-auth-user' },
      supabase: deps.supabase,
    });

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'revoke-self-auth-identity',
        dedupe_key: 'auth-identity-revocation:verified-auth-user',
      })
    );
    expect(result).toEqual({ revoked: false });
  });
});
