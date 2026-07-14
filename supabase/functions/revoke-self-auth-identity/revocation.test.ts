import { describe, expect, it, vi } from 'vitest';

import { revokeAuthIdentity } from './revocation';

describe('revokeAuthIdentity', () => {
  it('bans the verified auth identity with the long-duration recovery window', async () => {
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const persistAlert = vi.fn().mockResolvedValue(undefined);

    const result = await revokeAuthIdentity({
      authUserId: 'auth-user-42',
      updateUserById,
      persistAlert,
    });

    expect(updateUserById).toHaveBeenCalledWith('auth-user-42', {
      ban_duration: '876000h',
    });
    expect(persistAlert).not.toHaveBeenCalled();
    expect(result).toEqual({ revoked: true });
  });

  it('persists a deduplicated operator alert when the auth ban fails', async () => {
    const updateUserById = vi.fn().mockResolvedValue({
      error: { message: 'auth service unavailable' },
    });
    const persistAlert = vi.fn().mockResolvedValue(undefined);

    const result = await revokeAuthIdentity({
      authUserId: 'auth-user-42',
      updateUserById,
      persistAlert,
    });

    expect(persistAlert).toHaveBeenCalledWith({
      source: 'revoke-self-auth-identity',
      severity: 'error',
      title: 'Self-service auth identity revocation failed',
      detail: {
        auth_user_id: 'auth-user-42',
        error: 'auth service unavailable',
      },
      dedupe_key: 'auth-identity-revocation:auth-user-42',
    });
    expect(result).toEqual({ revoked: false });
  });

  it('persists the operator alert when the auth ban throws', async () => {
    const updateUserById = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const persistAlert = vi.fn().mockResolvedValue(undefined);

    const result = await revokeAuthIdentity({
      authUserId: 'auth-user-42',
      updateUserById,
      persistAlert,
    });

    expect(persistAlert).toHaveBeenCalledWith({
      source: 'revoke-self-auth-identity',
      severity: 'error',
      title: 'Self-service auth identity revocation failed',
      detail: {
        auth_user_id: 'auth-user-42',
        error: 'network unavailable',
      },
      dedupe_key: 'auth-identity-revocation:auth-user-42',
    });
    expect(result).toEqual({ revoked: false });
  });
});
