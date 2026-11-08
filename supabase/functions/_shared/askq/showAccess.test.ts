// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { callerHasShowAccess, type ShowAccessClient } from './showAccess.ts';

const SHOW = 'dededede-0000-0000-0000-000000000010';

function clientReturning(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as ShowAccessClient, rpc };
}

describe('callerHasShowAccess', () => {
  it('grants a club-appointed secretary (the RPC proves "not no access")', async () => {
    const { client, rpc } = clientReturning({ data: false, error: null });

    await expect(callerHasShowAccess(client, SHOW)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('entry_results_caller_has_no_show_access', {
      p_show_id: SHOW,
    });
  });

  it('denies a user with no relationship to the show', async () => {
    const { client } = clientReturning({ data: true, error: null });

    await expect(callerHasShowAccess(client, SHOW)).resolves.toBe(false);
  });

  it('denies on RPC error or an unexpected shape', async () => {
    await expect(
      callerHasShowAccess(clientReturning({ data: null, error: { message: 'boom' } }).client, SHOW)
    ).resolves.toBe(false);
    await expect(
      callerHasShowAccess(clientReturning({ data: null, error: null }).client, SHOW)
    ).resolves.toBe(false);
  });
});
