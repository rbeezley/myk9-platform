import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { updateEnrollmentPaymentStatus } from './reads';

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
