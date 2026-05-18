import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';
import { createDayOfEntry } from '../entries';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

describe('createDayOfEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
  });

  it('marks created entries as day-of and preserves desk payment method', async () => {
    const insertMock = vi.fn((rows: unknown[]) => ({
      select: vi.fn().mockResolvedValue({
        data: rows.map((row, index) => ({
          ...(row as Record<string, unknown>),
          id: `entry-${index}`,
        })),
        error: null,
      }),
    }));

    mockSupabase.from
      .mockReturnValueOnce(createChainableQuery({ data: [{ armband: '12' }], error: null }))
      .mockReturnValueOnce(
        createChainableQuery({
          data: [{ id: 'class-1', trial_id: 'trial-1', entry_fee: 45 }],
          error: null,
        })
      )
      .mockReturnValueOnce({ insert: insertMock });

    const result = await createDayOfEntry(
      {
        dogId: 'dog-1',
        showId: 'show-1',
        classIds: ['class-1'],
        handler: 'Jamie Walker',
        paymentMethod: 'check',
      },
      'user-1'
    );

    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        dog_id: 'dog-1',
        show_id: 'show-1',
        class_id: 'class-1',
        is_day_of_show: true,
        payment_method: 'check',
        payment_status: 'paid',
        entry_fee: 45,
        armband: '13',
      }),
    ]);
    expect(result.data?.totalFees).toBe(45);
  });
});
