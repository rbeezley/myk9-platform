// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { resolveShowManager, type ManagerAuthzClient } from './managerAuthz';

function clientAnswering(answers: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn((fn: string) => Promise.resolve(answers[fn] ?? { data: false, error: null }));
  return { client: { rpc } as ManagerAuthzClient, rpc };
}

describe('resolveShowManager (MYK9-1999)', () => {
  it("asks the database's own predicates about this show", async () => {
    const { client, rpc } = clientAnswering({});
    await resolveShowManager(client, 'show-1');
    expect(rpc).toHaveBeenCalledWith('can_manage_show', { check_show_id: 'show-1' });
    expect(rpc).toHaveBeenCalledWith('is_show_secretary', { check_show_id: 'show-1' });
  });

  it('admits a show- or club-scoped secretary, and a club manager', async () => {
    expect(
      await resolveShowManager(
        clientAnswering({ is_show_secretary: { data: true, error: null } }).client,
        'show-1'
      )
    ).toBe('manager');
    expect(
      await resolveShowManager(
        clientAnswering({ can_manage_show: { data: true, error: null } }).client,
        'show-1'
      )
    ).toBe('manager');
  });

  it('refuses anyone else, and fails closed when a check errors', async () => {
    expect(await resolveShowManager(clientAnswering({}).client, 'show-1')).toBe('not-a-manager');
    expect(
      await resolveShowManager(
        clientAnswering({
          can_manage_show: { data: true, error: null },
          is_show_secretary: { data: null, error: { message: 'boom' } },
        }).client,
        'show-1'
      )
    ).toBe('check-failed');
  });
});
