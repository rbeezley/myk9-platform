import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { buildRegistrationIndexes } from '@/store/buildRegistrationIndexes';
import * as queries from '@/services/database/queries/showRegistrationQueries';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';

vi.mock('@/services/database/queries/showRegistrationQueries', () => ({
  getRegistrationByShowAndHandler: vi.fn(),
  createShowRegistration: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  },
}));

describe('confirmRegistration — handlerId path + legacy fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShowRegistrationStore.setState({ registrations: [], currentRegistration: null });
  });

  it('uses reg.handlerId when present (mail-in: secretary creates under exhibitor)', async () => {
    (queries.getRegistrationByShowAndHandler as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });
    (queries.createShowRegistration as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'db-1', confirmationNumber: 'MK9-000001' },
      error: null,
    });

    const reg = useShowRegistrationStore
      .getState()
      .createRegistration('show-1', 'auth-uid-secretary', 'people-id-exhibitor');

    await useShowRegistrationStore.getState().confirmRegistration(reg.id, 'PAY-REF');

    // Both the lookup and the insert must key on the dog owner's people.id,
    // not the wizard user's auth.user.id.
    expect(queries.getRegistrationByShowAndHandler).toHaveBeenCalledWith(
      'show-1',
      'people-id-exhibitor'
    );
    expect(queries.createShowRegistration).toHaveBeenCalledWith(
      'show-1',
      'people-id-exhibitor',
      'PAY-REF',
      undefined
    );
  });

  it('falls back to reg.userId when handlerId is undefined (legacy persisted draft)', async () => {
    (queries.getRegistrationByShowAndHandler as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: null,
    });
    (queries.createShowRegistration as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'db-2', confirmationNumber: 'MK9-000002' },
      error: null,
    });

    // Inject a registration as if it was rehydrated from localStorage WITHOUT
    // the handlerId field. The store action must not crash, and must use
    // userId for the DB write.
    const legacyRegs = [
      {
        id: 'legacy-reg',
        showId: 'show-1',
        userId: 'legacy-people-id',
        status: 'draft' as const,
        entryStatus: EntryStatus.PENDING,
        totalFees: 0,
        paymentStatus: PaymentStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        entries: [],
        statusHistory: [],
      },
    ];
    useShowRegistrationStore.setState({
      registrations: legacyRegs,
      currentRegistration: null,
      ...buildRegistrationIndexes(legacyRegs),
    });

    await useShowRegistrationStore.getState().confirmRegistration('legacy-reg', 'PAY-REF');

    expect(queries.getRegistrationByShowAndHandler).toHaveBeenCalledWith(
      'show-1',
      'legacy-people-id'
    );
    expect(queries.createShowRegistration).toHaveBeenCalledWith(
      'show-1',
      'legacy-people-id',
      'PAY-REF',
      undefined
    );
  });
});
