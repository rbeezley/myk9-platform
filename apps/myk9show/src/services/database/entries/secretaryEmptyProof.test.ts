/**
 * MYK9-1476: the proofs the entries replica accepts before a zero-row answer may
 * evict a warm show. Anything but a confirmed result is "not proven".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../supabaseClient', () => ({ supabase: { rpc } }));

import {
  verifyCallerHasNoShowAccess,
  verifyEntriesScopeEmpty,
  verifySecretaryEmptyShow,
} from './secretaryEmptyProof';

function rpcByName(answers: Record<string, { data: unknown; error: unknown }>) {
  rpc.mockImplementation(async (name: string) => answers[name] ?? { data: null, error: null });
}

describe('verifyCallerHasNoShowAccess', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is true only when the server answers true, and names the show', async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(verifyCallerHasNoShowAccess('show-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('entry_results_caller_has_no_show_access', {
      p_show_id: 'show-1',
    });
  });

  it('is false when the caller still has access', async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    await expect(verifyCallerHasNoShowAccess('show-1')).resolves.toBe(false);
  });

  it('is false on an RPC error', async () => {
    rpc.mockResolvedValue({ data: true, error: { code: '42501', message: 'nope' } });

    await expect(verifyCallerHasNoShowAccess('show-1')).resolves.toBe(false);
  });

  it('is false for a non-boolean answer', async () => {
    rpc.mockResolvedValue({ data: 'true', error: null });

    await expect(verifyCallerHasNoShowAccess('show-1')).resolves.toBe(false);
  });

  it('is false offline without asking the server', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    await expect(verifyCallerHasNoShowAccess('show-1')).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('verifyEntriesScopeEmpty', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('is true when only the no-access proof is true', async () => {
    rpcByName({
      get_secretary_live_entry_count: { data: null, error: { code: '42501', message: 'nope' } },
      entry_results_caller_has_no_show_access: { data: true, error: null },
    });

    await expect(verifyEntriesScopeEmpty('show-1')).resolves.toBe(true);
  });

  it('is true when only the manager count proves it', async () => {
    rpcByName({
      get_secretary_live_entry_count: { data: 0, error: null },
      entry_results_caller_has_no_show_access: { data: false, error: null },
    });

    await expect(verifySecretaryEmptyShow('show-1')).resolves.toBe(true);
    await expect(verifyEntriesScopeEmpty('show-1')).resolves.toBe(true);
  });

  it('is false when neither proves it', async () => {
    rpcByName({
      get_secretary_live_entry_count: { data: 14, error: null },
      entry_results_caller_has_no_show_access: { data: false, error: null },
    });

    await expect(verifyEntriesScopeEmpty('show-1')).resolves.toBe(false);
  });
});
