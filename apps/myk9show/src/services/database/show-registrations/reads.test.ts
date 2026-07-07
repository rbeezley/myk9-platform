import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { createShowRegistration, updateEnrollmentPaymentStatus } from './reads';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((error: unknown, table: string, operation: string) => ({
    message: error instanceof Error ? error.message : String(error),
    table,
    operation,
  })),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mocks.from,
  },
  logQuery: mocks.logQuery,
  createDatabaseError: mocks.createDatabaseError,
}));

function makeEnrollmentUpdateQuery() {
  const query = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'enrollment-1',
        payment_status: PaymentStatus.PAID_BY_CHECK,
        payment_reference: 'check-100',
        paid_amount: 70,
      },
      error: null,
    }),
  };
  return query;
}

function makeEntriesUpdateQuery(result = { data: null, error: null as Error | null }) {
  const query = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    then: vi.fn(resolve => Promise.resolve(resolve(result))),
  };
  return query;
}

function makeExistingEnrollmentQuery(
  overrides: Partial<{
    payment_status: string;
    payment_method: string | null;
    total_amount: number | null;
    paid_amount: number | null;
  }> = {}
) {
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
        payment_status: overrides.payment_status ?? 'pending',
        payment_method: overrides.payment_method ?? null,
        payment_reference: null,
        total_amount: Object.prototype.hasOwnProperty.call(overrides, 'total_amount')
          ? overrides.total_amount
          : 3000,
        paid_amount: Object.prototype.hasOwnProperty.call(overrides, 'paid_amount')
          ? overrides.paid_amount
          : 0,
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

  it('persists secretary-paid enrollment payment state on initial insert', async () => {
    const query = makeNewEnrollmentQuery();
    mocks.from.mockReturnValue(query);

    const result = await createShowRegistration(
      'show-1',
      'handler-1',
      'receipt-100',
      { paymentReference: 'receipt-100', paymentDate: '2026-07-07' },
      'secretary_paid',
      7000
    );

    expect(result.error).toBeNull();
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        show_id: 'show-1',
        handler_id: 'handler-1',
        payment_status: 'paid',
        payment_method: 'secretary_paid',
        payment_reference: 'receipt-100',
        payment_date: '2026-07-07',
        total_amount: 7000,
        paid_amount: 70,
      })
    );
  });

  it('keeps check submissions pending because they are pay-at-show', async () => {
    const query = makeNewEnrollmentQuery();
    mocks.from.mockReturnValue(query);

    const result = await createShowRegistration(
      'show-1',
      'handler-1',
      undefined,
      { checkNumber: '1001' },
      'check',
      7000
    );

    expect(result.error).toBeNull();
    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: PaymentStatus.PENDING,
        payment_method: 'check',
        check_number: '1001',
        total_amount: 7000,
        paid_amount: 0,
      })
    );
  });

  it('keeps a partially paid existing enrollment pending after a secretary-paid add-on', async () => {
    const existingQuery = makeExistingEnrollmentQuery();
    const updateQuery = makeExistingEnrollmentPaymentUpdateQuery();
    mocks.from.mockReturnValueOnce(existingQuery).mockReturnValueOnce(updateQuery);

    const result = await createShowRegistration(
      'show-1',
      'handler-1',
      'receipt-200',
      { paymentReference: 'receipt-200', paymentDate: '2026-07-07' },
      'secretary_paid',
      7000
    );

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('enrollment-existing');
    expect(existingQuery.insert).not.toHaveBeenCalled();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: PaymentStatus.PENDING,
        payment_method: 'secretary_paid',
        payment_reference: 'receipt-200',
        payment_date: '2026-07-07',
        total_amount: 10000,
        paid_amount: 70,
      })
    );
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'enrollment-existing');
  });

  it('marks an existing enrollment paid when secretary-paid add-ons cover the full total', async () => {
    const existingQuery = makeExistingEnrollmentQuery({
      payment_status: 'paid',
      payment_method: 'secretary_paid',
      total_amount: 3000,
      paid_amount: 30,
    });
    const updateQuery = makeExistingEnrollmentPaymentUpdateQuery();
    mocks.from.mockReturnValueOnce(existingQuery).mockReturnValueOnce(updateQuery);

    const result = await createShowRegistration(
      'show-1',
      'handler-1',
      'receipt-200',
      { paymentReference: 'receipt-200', paymentDate: '2026-07-07' },
      'secretary_paid',
      7000
    );

    expect(result.error).toBeNull();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: 'paid',
        total_amount: 10000,
        paid_amount: 100,
      })
    );
  });

  it('preserves existing paid amount when a pay-later add-on updates total', async () => {
    const existingQuery = makeExistingEnrollmentQuery({
      payment_status: 'paid',
      payment_method: 'secretary_paid',
      total_amount: 7000,
      paid_amount: 70,
    });
    const updateQuery = makeExistingEnrollmentPaymentUpdateQuery();
    mocks.from.mockReturnValueOnce(existingQuery).mockReturnValueOnce(updateQuery);

    const result = await createShowRegistration(
      'show-1',
      'handler-1',
      undefined,
      { checkNumber: '1001' },
      'check',
      3000
    );

    expect(result.error).toBeNull();
    const updatePayload = updateQuery.update.mock.calls[0]?.[0];
    expect(updatePayload).toEqual(
      expect.objectContaining({
        payment_status: PaymentStatus.PENDING,
        payment_method: 'check',
        check_number: '1001',
        total_amount: 10000,
      })
    );
    expect(updatePayload).not.toHaveProperty('paid_amount');
  });

  it('clears stale payment detail fields when an existing enrollment changes method', async () => {
    const existingQuery = makeExistingEnrollmentQuery({
      payment_status: 'paid',
      payment_method: 'group_payment',
      total_amount: 7000,
      paid_amount: 70,
    });
    const updateQuery = makeExistingEnrollmentPaymentUpdateQuery();
    mocks.from.mockReturnValueOnce(existingQuery).mockReturnValueOnce(updateQuery);

    const result = await createShowRegistration(
      'show-1',
      'handler-1',
      undefined,
      { checkNumber: '1001' },
      'check',
      3000
    );

    expect(result.error).toBeNull();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method: 'check',
        payment_reference: null,
        check_number: '1001',
        payment_date: null,
        group_reference: null,
        payment_notes: null,
      })
    );
  });

  it('does not rewrite existing enrollment financials for a waived add-on', async () => {
    const existingQuery = makeExistingEnrollmentQuery({
      payment_status: 'paid',
      payment_method: 'secretary_paid',
      total_amount: 7000,
      paid_amount: 70,
    });
    mocks.from.mockReturnValueOnce(existingQuery);

    const result = await createShowRegistration(
      'show-1',
      'handler-1',
      undefined,
      undefined,
      'waived',
      3000
    );

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('enrollment-existing');
    expect(existingQuery.insert).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('marks a first waived submission as waived after the blank enrollment is created', async () => {
    const existingQuery = makeExistingEnrollmentQuery({
      payment_status: PaymentStatus.PENDING,
      payment_method: null,
      total_amount: null,
      paid_amount: 0,
    });
    const updateQuery = makeExistingEnrollmentPaymentUpdateQuery();
    mocks.from.mockReturnValueOnce(existingQuery).mockReturnValueOnce(updateQuery);

    const result = await createShowRegistration(
      'show-1',
      'handler-1',
      undefined,
      undefined,
      'waived',
      3000
    );

    expect(result.error).toBeNull();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: PaymentStatus.WAIVED,
        payment_method: 'waived',
        total_amount: 3000,
        paid_amount: 0,
      })
    );
  });
});

describe('updateEnrollmentPaymentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cascades paid enrollment statuses to linked entry rows using the entries constraint value', async () => {
    const enrollmentQuery = makeEnrollmentUpdateQuery();
    const entriesQuery = makeEntriesUpdateQuery();
    mocks.from.mockImplementation((table: string) =>
      table === 'enrollments' ? enrollmentQuery : entriesQuery
    );

    const result = await updateEnrollmentPaymentStatus(
      'enrollment-1',
      PaymentStatus.PAID_BY_CHECK,
      'check-100',
      70
    );

    expect(result.error).toBeNull();
    expect(enrollmentQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: PaymentStatus.PAID_BY_CHECK,
        payment_reference: 'check-100',
        paid_amount: 70,
      })
    );
    expect(entriesQuery.update).toHaveBeenCalledWith({
      payment_status: 'paid',
      updated_at: expect.any(String),
    });
    expect(entriesQuery.eq).toHaveBeenCalledWith('registration_id', 'enrollment-1');
    expect(entriesQuery.neq).toHaveBeenCalledWith('payment_status', 'refunded');
    expect(entriesQuery.neq).toHaveBeenCalledWith('payment_status', 'waived');
  });

  it('returns the saved enrollment data when the entry cascade fails', async () => {
    const enrollmentQuery = makeEnrollmentUpdateQuery();
    const entriesQuery = makeEntriesUpdateQuery({
      data: null,
      error: new Error('cascade failed'),
    });
    mocks.from.mockImplementation((table: string) =>
      table === 'enrollments' ? enrollmentQuery : entriesQuery
    );

    const result = await updateEnrollmentPaymentStatus(
      'enrollment-1',
      PaymentStatus.PAID_BY_CHECK,
      'check-100',
      70
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'enrollment-1',
        payment_status: PaymentStatus.PAID_BY_CHECK,
      })
    );
    expect(result.error).toEqual(
      expect.objectContaining({
        message: 'cascade failed',
        table: 'entries',
        operation: 'cascade_enrollment_payment_status',
      })
    );
  });
});
