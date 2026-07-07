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
        payment_status: 'pending',
        payment_method: null,
        payment_reference: null,
        total_amount: 3000,
        paid_amount: 0,
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

  it('updates an existing enrollment with secretary-paid add-on totals', async () => {
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
        payment_status: 'paid',
        payment_method: 'secretary_paid',
        payment_reference: 'receipt-200',
        payment_date: '2026-07-07',
        total_amount: 10000,
        paid_amount: 100,
      })
    );
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'enrollment-existing');
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
