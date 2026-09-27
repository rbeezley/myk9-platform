/**
 * `useMyEntriesData` must surface a class row's RAW payment status
 * (`EntryClass.rawPaymentStatus`) alongside its folded display status
 * (`paymentStatus`) — the paid confirmation strip reads the raw fact so a
 * genuinely paid class does not disappear from the banner just because a
 * sibling entry on the same registration still owes money (MYK9-804).
 *
 * @module MyEntriesPage/modules/useMyEntriesData.paidBanner.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMyEntriesData } from './useMyEntriesData';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PaymentStatus } from '@/types/show-registration-types';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { READ: 'READ', UPDATE: 'UPDATE' },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  LoggingService: { getInstance: () => ({ error: vi.fn(), log: vi.fn(), info: vi.fn() }) },
}));

const entryRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  registration_id: 'reg-1',
  show_id: 'show-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  trial_id: 'trial-1',
  handler_id: 'person-1',
  entry_status: 'accepted',
  payment_status: 'paid_online',
  entry_fee: 30,
  check_in_status: 'no-status',
  is_scored: false,
  result_status: null,
  search_time_seconds: null,
  total_faults: null,
  final_placement: null,
  submitted_at: '2026-06-01T12:00:00.000Z',
  created_at: '2026-06-01T12:00:00.000Z',
  updated_at: '2026-06-01T12:00:00.000Z',
  dog: { id: 'dog-1', name: 'Ranger', call_name: 'Ranger' },
  show: {
    id: 'show-1',
    name: 'Heartland Scent Work Classic',
    start_date: '2026-06-15',
    end_date: '2026-06-16',
    entry_close_date: '2026-06-01',
    venue: 'Test Venue',
    city: 'Portland',
    state: 'OR',
  },
  class: { id: 'class-1', name: 'Interior Advanced Preliminary', class_number: '101' },
  trial: { id: 'trial-1', trial_type: 'Scent Work' },
  registration: { id: 'reg-1', confirmation_number: 'ABC123' },
  ...overrides,
});

const renderData = () =>
  renderHook(() =>
    useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
  );

describe('useMyEntriesData — rawPaymentStatus is the row-level ground truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'exhibitor@test.com' },
      userWithRoles: { databaseUserId: 'person-1' },
      personId: 'person-1',
      personIdentityState: 'resolved',
      hasUsablePersonId: true,
      isAuthenticated: true,
    });
  });

  // The exact MYK9-804 defect: Ranger's OWN entry is paid, but the
  // registration is still `pending` because a sibling entry under it has not
  // been paid. `resolveEffectivePaymentStatus` correctly folds the display
  // status down to PENDING for the badge — but `rawPaymentStatus` must keep
  // the row's own recorded fact, or the paid banner cannot see it.
  it('keeps the raw paid fact when the registration is pending (mixed-payment registration)', async () => {
    const row = entryRow({
      payment_status: 'paid_online',
      registration: { id: 'reg-1', confirmation_number: 'ABC123', payment_status: 'pending' },
    });
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [row],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    const cls = result.current.entries[0]?.classes[0];
    // Folded display status: downgraded to PENDING by the pending registration.
    expect(cls?.paymentStatus).toBe(PaymentStatus.PENDING);
    // Raw ground truth: this row's own column, untouched by the fold.
    expect(cls?.rawPaymentStatus).toBe(PaymentStatus.PAID_ONLINE);
  });

  it('keeps the raw pending fact when the registration is paid (never invents a payment)', async () => {
    const row = entryRow({
      payment_status: 'pending',
      registration: { id: 'reg-1', confirmation_number: 'ABC123', payment_status: 'paid' },
    });
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [row],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    const cls = result.current.entries[0]?.classes[0];
    expect(cls?.rawPaymentStatus).toBe(PaymentStatus.PENDING);
  });

  it('agrees with the display status when the registration is fully paid too', async () => {
    const row = entryRow({
      payment_status: 'paid_online',
      registration: { id: 'reg-1', confirmation_number: 'ABC123', payment_status: 'paid' },
    });
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      source: 'confirmed',
      data: [row],
      error: null,
    });

    const { result } = renderData();
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    const cls = result.current.entries[0]?.classes[0];
    expect(cls?.paymentStatus).toBe(PaymentStatus.PAID_ONLINE);
    expect(cls?.rawPaymentStatus).toBe(PaymentStatus.PAID_ONLINE);
  });
});
