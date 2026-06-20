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

function makeEntriesUpdateQuery() {
  const query = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
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
  });
});
