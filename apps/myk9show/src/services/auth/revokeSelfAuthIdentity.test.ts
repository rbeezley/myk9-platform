import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

import { revokeSelfAuthIdentity } from './revokeSelfAuthIdentity';

describe('revokeSelfAuthIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the self-revocation function without accepting a client-supplied identity', async () => {
    mockInvoke.mockResolvedValue({ data: { revoked: true }, error: null });

    const result = await revokeSelfAuthIdentity();

    expect(mockInvoke).toHaveBeenCalledWith('revoke-self-auth-identity', {
      body: {},
    });
    expect(result).toEqual({ revoked: true, error: null });
  });

  it('returns the transport error when the function cannot be reached', async () => {
    const error = new Error('network unavailable');
    mockInvoke.mockResolvedValue({ data: null, error });

    const result = await revokeSelfAuthIdentity();

    expect(result).toEqual({ revoked: false, error });
  });

  it('returns an error when the function reports that revocation failed', async () => {
    mockInvoke.mockResolvedValue({ data: { revoked: false }, error: null });

    const result = await revokeSelfAuthIdentity();

    expect(result.revoked).toBe(false);
    expect(result.error).toEqual(new Error('Auth identity was not revoked'));
  });
});
