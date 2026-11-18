import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRefundEntryForms } from './refundEntryForms';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  inFilter: vi.fn(),
  is: vi.fn(),
}));

vi.mock('../supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../supabaseClient')>();
  return { ...actual, supabase: { from: mocks.from }, logQuery: vi.fn() };
});

const ROW = {
  id: 'e1',
  registration_id: 'enr-1',
  stripe_payment_intent_id: null,
  registration: { confirmation_number: 'MK9-000001', payer: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: mocks.select, in: mocks.inFilter, is: mocks.is };
  mocks.from.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.inFilter.mockResolvedValue({ data: [ROW], error: null });
});

describe('getRefundEntryForms (MYK9-1862)', () => {
  it('reads the form and its own payer for exactly the given entry ids, soft-deleted rows included', async () => {
    const rows = await getRefundEntryForms(['e1', 'e2', 'e1']);

    expect(mocks.from).toHaveBeenCalledWith('entries');
    expect(mocks.select).toHaveBeenCalledWith(
      'id, registration_id, stripe_payment_intent_id, ' +
        'registration:registration_id ( confirmation_number, payer:handler_id ( first_name, last_name ) )'
    );
    expect(mocks.inFilter).toHaveBeenCalledWith('id', ['e1', 'e2']);
    expect(mocks.is).not.toHaveBeenCalled();
    expect(rows).toEqual([ROW]);
  });

  it('throws on a failed read, so the page can offer Try again', async () => {
    mocks.inFilter.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(getRefundEntryForms(['e1'])).rejects.toMatchObject({
      name: 'DatabaseError',
      message: expect.stringContaining('offline'),
    });
  });
});
