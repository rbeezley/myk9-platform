import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitShowEntries, updateEntryHandler } from '../../entries';

// Mock the supabase client used by the entries module
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
      handlerId: 'handler-uuid-1',
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
  submissionSource: 'self_service' as const,
};

const rpcSuccess = {
  data: {
    entries: [
      { entry_id: 'e1', dog_id: 'dog-uuid-1' },
      { entry_id: 'e2', dog_id: 'dog-uuid-2' },
    ],
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
      p_entries: [
        {
          dog_id: 'dog-uuid-1',
          class_id: 'class-uuid-1',
          handler_id: 'handler-uuid-1',
          handler_name: 'Jane Doe',
          payment_method: 'credit_card',
          client_fee_cents: 2500,
          submission_source: 'self_service',
        },
        {
          dog_id: 'dog-uuid-2',
          class_id: 'class-uuid-2',
          handler_id: null,
          handler_name: 'John Doe',
          payment_method: 'credit_card',
          client_fee_cents: 2500,
          submission_source: 'self_service',
        },
      ],
      p_submission_id: 'sub-uuid-1',
      p_payment_method: 'credit_card',
    });

    expect(result).toEqual({
      entries: [
        { entryId: 'e1', dogId: 'dog-uuid-1' },
        { entryId: 'e2', dogId: 'dog-uuid-2' },
      ],
      registrationId: 'enrollment-uuid-1',
      submissionId: 'sub-uuid-1',
      outcomes: [
        {
          dogId: 'dog-uuid-1',
          classId: 'class-uuid-1',
          outcome: 'created',
          entryId: 'e1',
          waitlistEntryId: null,
          waitlistPosition: null,
          feeCents: 2500,
          capacityOverride: false,
        },
        {
          dogId: 'dog-uuid-2',
          classId: 'class-uuid-2',
          outcome: 'created',
          entryId: 'e2',
          waitlistEntryId: null,
          waitlistPosition: null,
          feeCents: 2500,
          capacityOverride: false,
        },
      ],
    });
  });

  it('idempotent retry — same submissionId returns the same result on second call', async () => {
    // Both calls return the same data (RPC handles idempotency internally)
    mockRpc.mockResolvedValue(rpcSuccess);

    const first = await submitShowEntries(baseParams);
    const second = await submitShowEntries(baseParams);

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second);
    expect(first.entries).toEqual([
      { entryId: 'e1', dogId: 'dog-uuid-1' },
      { entryId: 'e2', dogId: 'dog-uuid-2' },
    ]);
  });

  it('RPC error — throws when supabase returns an error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'fee mismatch', code: '22023' },
    });

    await expect(submitShowEntries(baseParams)).rejects.toThrow('fee mismatch');
  });

  it('sends the verified source and maps mixed capacity outcomes', async () => {
    mockRpc.mockResolvedValue({
      data: {
        entries: [{ entry_id: 'e1', dog_id: 'dog-uuid-1' }],
        outcomes: [
          {
            dog_id: 'dog-uuid-1',
            class_id: 'class-uuid-1',
            outcome: 'created',
            entry_id: 'e1',
            waitlist_entry_id: null,
            fee_cents: 2500,
            capacity_override: false,
          },
          {
            dog_id: 'dog-uuid-2',
            class_id: 'class-uuid-2',
            outcome: 'waitlisted',
            entry_id: null,
            waitlist_entry_id: 'wait-2',
            fee_cents: 0,
            capacity_override: false,
          },
        ],
        registration_id: 'enrollment-uuid-1',
        submission_id: 'sub-uuid-1',
      },
      error: null,
    });

    const result = await submitShowEntries({
      ...baseParams,
      submissionSource: 'organizer',
    } as Parameters<typeof submitShowEntries>[0]);

    expect(mockRpc).toHaveBeenCalledWith(
      'submit_show_entries',
      expect.objectContaining({
        p_entries: expect.arrayContaining([
          expect.objectContaining({ submission_source: 'organizer' }),
        ]),
      })
    );
    expect(result.outcomes).toEqual([
      {
        dogId: 'dog-uuid-1',
        classId: 'class-uuid-1',
        outcome: 'created',
        entryId: 'e1',
        waitlistEntryId: null,
        waitlistPosition: null,
        feeCents: 2500,
        capacityOverride: false,
      },
      {
        dogId: 'dog-uuid-2',
        classId: 'class-uuid-2',
        outcome: 'waitlisted',
        entryId: null,
        waitlistEntryId: 'wait-2',
        waitlistPosition: null,
        feeCents: 0,
        capacityOverride: false,
      },
    ]);
  });

  it('synthesizes created outcomes for a legacy server response', async () => {
    mockRpc.mockResolvedValue(rpcSuccess);

    const result = await submitShowEntries({
      ...baseParams,
      submissionSource: 'self_service',
    } as Parameters<typeof submitShowEntries>[0]);

    expect(result.outcomes).toEqual([
      expect.objectContaining({ dogId: 'dog-uuid-1', outcome: 'created', entryId: 'e1' }),
      expect.objectContaining({ dogId: 'dog-uuid-2', outcome: 'created', entryId: 'e2' }),
    ]);
  });

  it('updates handler corrections through the entry-management RPC with handler_id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await updateEntryHandler({
      entryId: 'entry-uuid-1',
      handler: 'Grace Hollis',
      handlerId: 'person-uuid-1',
    });

    expect(mockRpc).toHaveBeenCalledWith('update_entry_handler_for_entry_management', {
      p_entry_id: 'entry-uuid-1',
      p_handler: 'Grace Hollis',
      p_handler_id: 'person-uuid-1',
      p_clear_handler_id: false,
    });
  });

  it('can request handler person clearing for secretary text corrections', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await updateEntryHandler({
      entryId: 'entry-uuid-1',
      handler: 'Grace Hollis',
      handlerId: null,
      clearHandlerId: true,
    });

    expect(mockRpc).toHaveBeenCalledWith('update_entry_handler_for_entry_management', {
      p_entry_id: 'entry-uuid-1',
      p_handler: 'Grace Hollis',
      p_handler_id: null,
      p_clear_handler_id: true,
    });
  });
});
