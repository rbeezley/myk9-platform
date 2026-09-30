import { beforeEach, describe, expect, it, vi } from 'vitest';

// MYK9-878 (last hop): the secretary's junior-fee request must survive the hand-picked
// projection from the wizard's entry objects to the `submit_show_entries` payload.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: rpcMock },
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

import { submitShowEntries } from './writes';

function submit(juniorFeeOverride?: boolean) {
  return submitShowEntries({
    showId: 'show-1',
    registrationId: 'reg-1',
    entries: [
      {
        dogId: 'dog-1',
        classId: 'class-1',
        handlerName: 'Pat Handler',
        paymentMethod: 'check',
        clientFeeCents: 1500,
        ...(juniorFeeOverride !== undefined ? { juniorFeeOverride } : {}),
      },
    ],
    submissionId: 'sub-1',
    paymentMethod: 'check',
    submissionSource: 'organizer',
  });
}

describe('submitShowEntries junior fee override (MYK9-878)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({
      data: {
        entries: [{ entry_id: 'entry-1', dog_id: 'dog-1' }],
        registration_id: 'reg-1',
        submission_id: 'sub-1',
      },
      error: null,
    });
  });

  it('sends junior_fee_override on the entry when requested', async () => {
    await submit(true);

    const payload = rpcMock.mock.calls[0]?.[1] as { p_entries: Array<Record<string, unknown>> };
    expect(rpcMock.mock.calls[0]?.[0]).toBe('submit_show_entries');
    expect(payload.p_entries[0]).toMatchObject({
      junior_fee_override: true,
      client_fee_cents: 1500,
    });
  });

  it('sends no junior_fee_override key otherwise, so older servers see the old payload', async () => {
    await submit();
    await submit(false);

    for (const call of rpcMock.mock.calls) {
      const payload = call[1] as { p_entries: Array<Record<string, unknown>> };
      expect('junior_fee_override' in (payload.p_entries[0] ?? {})).toBe(false);
    }
  });
});
