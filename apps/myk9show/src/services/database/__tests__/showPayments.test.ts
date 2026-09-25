import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listShowPayments, recordEnrollmentPayment } from '../show-payments';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

function selectChain(pages: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
  const range = vi.fn();
  pages.forEach(page => range.mockResolvedValueOnce(page));
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range,
  };
  mocks.from.mockReturnValue(chain);
  return chain;
}

describe('record_enrollment_payment arguments (MYK9-677)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { id: 'enr-1' }, error: null });
  });

  it('sends a partial check as THIS payment with its received day and check number', async () => {
    await recordEnrollmentPayment('enr-1', {
      kind: 'payment',
      method: 'check',
      amount: 35,
      receivedOn: '2026-08-27',
      reference: ' 1042 ',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('record_enrollment_payment', {
      p_enrollment_id: 'enr-1',
      p_kind: 'payment',
      p_amount: 35,
      p_method: 'check',
      p_received_on: '2026-08-27',
      p_reference: '1042',
    });
  });

  it('sends Paid in Full as a NULL amount, so the server pays the balance', async () => {
    await recordEnrollmentPayment('enr-1', {
      kind: 'payment',
      method: 'cash',
      amount: null,
      receivedOn: '2026-09-17',
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_enrollment_payment',
      expect.objectContaining({ p_amount: null, p_method: 'cash', p_reference: null })
    );
  });

  it('sends a refund with its method (NULL = not desk money) and notes', async () => {
    await recordEnrollmentPayment('enr-1', {
      kind: 'refund',
      method: null,
      amount: 20,
      receivedOn: '2026-09-17',
      notes: 'Stripe (manual)',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('record_enrollment_payment', {
      p_enrollment_id: 'enr-1',
      p_kind: 'refund',
      p_amount: 20,
      p_method: null,
      p_received_on: '2026-09-17',
      p_note: 'Stripe (manual)',
    });
  });

  it('sends a Payment Due reset as a bare reversal', async () => {
    await recordEnrollmentPayment('enr-1', { kind: 'reversal' });

    expect(mocks.rpc).toHaveBeenCalledWith('record_enrollment_payment', {
      p_enrollment_id: 'enr-1',
      p_kind: 'reversal',
    });
  });

  it("throws the server's message", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });

    await expect(recordEnrollmentPayment('enr-1', { kind: 'reversal' })).rejects.toThrow(
      'not authorized'
    );
  });
});

describe('listShowPayments', () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads every page of a show's ledger, never a truncated first page", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    const chain = selectChain([
      { data: fullPage, error: null },
      { data: [{ id: 'last' }], error: null },
    ]);

    const rows = await listShowPayments('show-1');

    expect(mocks.from).toHaveBeenCalledWith('show_payments');
    expect(chain.eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(chain.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(chain.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(rows).toHaveLength(1001);
  });

  it('throws on a read error instead of reporting an empty ledger', async () => {
    selectChain([{ data: null, error: { message: 'permission denied' } }]);

    await expect(listShowPayments('show-1')).rejects.toThrow('permission denied');
  });
});
