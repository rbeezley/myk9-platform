import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShowRegistration } from './reads';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  logQuery: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mocks.from,
  },
  logQuery: mocks.logQuery,
  createDatabaseError,
}));

function makeExistingEnrollmentQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: 'enrollment-existing',
        show_id: 'show-1',
        handler_id: 'handler-1',
        confirmation_number: 'MK9-000123',
        status: 'draft',
        total_fees: 0,
        payment_status: 'paid_by_check',
        payment_method: 'check',
        payment_reference: 'receipt-100',
        total_amount: 3000,
        paid_amount: 30,
        created_at: '2026-07-05T00:00:00Z',
        updated_at: '2026-07-05T00:00:00Z',
      },
      error: null,
    }),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'enrollment-new',
        show_id: 'show-1',
        handler_id: 'handler-1',
        confirmation_number: 'MK9-999999',
        status: 'draft',
        total_fees: 0,
        payment_status: 'pending',
        payment_method: null,
        payment_reference: null,
        created_at: '2026-07-05T00:00:00Z',
        updated_at: '2026-07-05T00:00:00Z',
      },
      error: null,
    }),
  };
}

function makeExistingEnrollmentPaymentUpdateQuery() {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'enrollment-existing',
        show_id: 'show-1',
        handler_id: 'handler-1',
        confirmation_number: 'MK9-000123',
        status: 'draft',
        total_fees: 0,
        payment_status: 'paid',
        payment_method: 'secretary_paid',
        payment_reference: 'receipt-200',
        total_amount: 10000,
        paid_amount: 100,
        created_at: '2026-07-05T00:00:00Z',
        updated_at: '2026-07-05T00:00:00Z',
      },
      error: null,
    }),
  };
}

function makeNewEnrollmentQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'enrollment-new',
        show_id: 'show-1',
        handler_id: 'handler-1',
        confirmation_number: 'MK9-999999',
        status: 'draft',
        total_fees: 0,
        payment_status: 'paid',
        payment_method: 'secretary_paid',
        payment_reference: 'receipt-100',
        total_amount: 7000,
        paid_amount: 70,
        created_at: '2026-07-05T00:00:00Z',
        updated_at: '2026-07-05T00:00:00Z',
      },
      error: null,
    }),
  };
}

describe('createShowRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an existing enrollment before insert to avoid the handled 409 path', async () => {
    const query = makeExistingEnrollmentQuery();
    mocks.from.mockReturnValue(query);

    const result = await createShowRegistration('show-1', 'handler-1');

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('enrollment-existing');
    expect(query.insert).not.toHaveBeenCalled();
    expect(query.select).toHaveBeenCalledWith('*');
    expect(query.eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(query.eq).toHaveBeenCalledWith('handler_id', 'handler-1');
  });

  // MYK9-1634: the total, status, paid amount and method are the database's.
  // The client writes the payment details it was given, and nothing else.
  it('writes only the given payment details on insert, never money or status', async () => {
    const query = makeNewEnrollmentQuery();
    mocks.from.mockReturnValue(query);

    const result = await createShowRegistration('show-1', 'handler-1', {
      paymentReference: 'receipt-100',
      paymentDate: '2026-07-07',
    });

    expect(result.error).toBeNull();
    expect(query.insert).toHaveBeenCalledWith({
      show_id: 'show-1',
      handler_id: 'handler-1',
      payment_reference: 'receipt-100',
      payment_date: '2026-07-07',
    });
  });

  it('writes only the given details onto an existing enrollment and never blanks the rest', async () => {
    const existingQuery = makeExistingEnrollmentQuery();
    const updateQuery = makeExistingEnrollmentPaymentUpdateQuery();
    mocks.from.mockReturnValueOnce(existingQuery).mockReturnValueOnce(updateQuery);

    const result = await createShowRegistration('show-1', 'handler-1', { checkNumber: '1001' });

    expect(result.error).toBeNull();
    expect(existingQuery.insert).not.toHaveBeenCalled();
    expect(updateQuery.update).toHaveBeenCalledWith({ check_number: '1001' });
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'enrollment-existing');
  });

  it('makes no write onto an existing enrollment when no details are given', async () => {
    const existingQuery = makeExistingEnrollmentQuery();
    mocks.from.mockReturnValueOnce(existingQuery);

    const result = await createShowRegistration('show-1', 'handler-1', {});

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('enrollment-existing');
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});
