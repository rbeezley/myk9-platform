import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitShowEntries } from '../entry-query-mutations';

// Mock the supabase client used by entry-query-mutations
const mockRpc = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  logQuery: vi.fn(),
  createDatabaseError: (_err: unknown, _table: string, _op: string) => {
    const msg =
      _err instanceof Error
        ? _err.message
        : typeof _err === 'object' && _err !== null && 'message' in _err
          ? String((_err as { message: unknown }).message)
          : String(_err);
    const e = new Error(msg);
    (e as Error & { table: string; operation: string }).table = _table;
    (e as Error & { table: string; operation: string }).operation = _op;
    return e;
  },
}));

const baseParams = {
  showId: 'show-uuid-1',
  registrationId: 'enrollment-uuid-1',
  entries: [
    {
      dogId: 'dog-uuid-1',
      classId: 'class-uuid-1',
      handlerName: 'Jane Doe',
      paymentMethod: 'credit_card',
      clientFeeCents: 2500,
    },
    {
      dogId: 'dog-uuid-2',
      classId: 'class-uuid-2',
      handlerName: 'John Doe',
      paymentMethod: 'credit_card',
      clientFeeCents: 2500,
    },
  ],
  submissionId: 'sub-uuid-1',
  paymentMethod: 'credit_card',
};

const rpcSuccess = {
  data: {
    entry_ids: ['e1', 'e2'],
    registration_id: 'enrollment-uuid-1',
    submission_id: 'sub-uuid-1',
  },
  error: null,
};

describe('submitShowEntries', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('happy path — returns mapped result on success', async () => {
    mockRpc.mockResolvedValue(rpcSuccess);

    const result = await submitShowEntries(baseParams);

    expect(mockRpc).toHaveBeenCalledWith('submit_show_entries', {
      p_show_id: 'show-uuid-1',
      p_registration_id: 'enrollment-uuid-1',
      p_entries: JSON.stringify([
        {
          dog_id: 'dog-uuid-1',
          class_id: 'class-uuid-1',
          handler_name: 'Jane Doe',
          payment_method: 'credit_card',
          client_fee_cents: 2500,
        },
        {
          dog_id: 'dog-uuid-2',
          class_id: 'class-uuid-2',
          handler_name: 'John Doe',
          payment_method: 'credit_card',
          client_fee_cents: 2500,
        },
      ]),
      p_submission_id: 'sub-uuid-1',
      p_payment_method: 'credit_card',
    });

    expect(result).toEqual({
      entryIds: ['e1', 'e2'],
      registrationId: 'enrollment-uuid-1',
      submissionId: 'sub-uuid-1',
    });
  });

  it('idempotent retry — same submissionId returns the same result on second call', async () => {
    // Both calls return the same data (RPC handles idempotency internally)
    mockRpc.mockResolvedValue(rpcSuccess);

    const first = await submitShowEntries(baseParams);
    const second = await submitShowEntries(baseParams);

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second);
    expect(first.entryIds).toEqual(['e1', 'e2']);
  });

  it('RPC error — throws when supabase returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'fee mismatch', code: '22023' },
    });

    await expect(submitShowEntries(baseParams)).rejects.toThrow('fee mismatch');
  });
});
