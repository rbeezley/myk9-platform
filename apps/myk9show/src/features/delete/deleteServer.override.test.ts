/**
 * MYK9-1596: the override and its reason reach the soft_delete_* RPC arguments
 * (p_override, p_reason) for show, trial and class, and an ordinary delete sends
 * neither.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  hasUnsyncedWork: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/supabaseClient')>()),
  supabase: { rpc: mocks.rpc },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/ReplicatedShowsTable')>()),
  replicatedShowsTable: { hasUnsyncedWork: mocks.hasUnsyncedWork },
}));

import { softDeleteOnServer } from './deleteServer';
import { overrideRpcArgs } from '@/services/database/overrideRpcArgs';

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.hasUnsyncedWork.mockReset();
  mocks.hasUnsyncedWork.mockResolvedValue(false);
  // `.single()` for the trial RPC; a plain promise for the others.
  mocks.rpc.mockImplementation(() => {
    const result = Promise.resolve({ data: null, error: null });
    return Object.assign(result, { single: () => result });
  });
});

describe('overrideRpcArgs', () => {
  it('sends nothing unless the override is on', () => {
    expect(overrideRpcArgs({})).toEqual({});
    expect(overrideRpcArgs({ override: false, reason: 'ignored' })).toEqual({});
  });

  it('sends p_override and the reason when overriding', () => {
    expect(overrideRpcArgs({ override: true, reason: 'Duplicate show' })).toEqual({
      p_override: true,
      p_reason: 'Duplicate show',
    });
  });
});

describe('softDeleteOnServer override', () => {
  const cases = [
    ['show', 'soft_delete_show', 'p_show_id'],
    ['trial', 'soft_delete_trial', 'p_trial_id'],
    ['class', 'soft_delete_class', 'p_class_id'],
  ] as const;

  for (const [kind, rpc, idArg] of cases) {
    it(`${kind}: override=true carries p_override and p_reason to ${rpc}`, async () => {
      await softDeleteOnServer(kind, 'id-1', { override: true, reason: 'Wrong club entered it' });
      expect(mocks.rpc).toHaveBeenCalledWith(rpc, {
        [idArg]: 'id-1',
        p_override: true,
        p_reason: 'Wrong club entered it',
      });
    });

    it(`${kind}: an ordinary delete sends neither`, async () => {
      await softDeleteOnServer(kind, 'id-1', { override: false });
      expect(mocks.rpc).toHaveBeenCalledWith(rpc, { [idArg]: 'id-1' });
    });

    it(`${kind}: a reason without the override is dropped`, async () => {
      await softDeleteOnServer(kind, 'id-1', { override: false, reason: 'stray' });
      expect(mocks.rpc).toHaveBeenCalledWith(rpc, { [idArg]: 'id-1' });
    });
  }
});
