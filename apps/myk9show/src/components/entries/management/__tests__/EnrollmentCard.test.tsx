import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCard } from '../EnrollmentCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: ({ status }: { status: string }) => (
    <span data-testid="checkin-status">{status}</span>
  ),
}));

vi.mock('@/components/entries/EmailStatusIcon', () => ({
  EmailStatusIcon: () => null,
}));

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'cls-1',
    name: 'Novice A',
    number: '101',
    fee: 25,
    status: 'entered',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Bravo',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@test.com',
    handlerName: 'Jane Smith',
    classes: [makeClass()],
    totalFee: 50,
    paidAmount: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeGroup(overrides: Partial<EnrollmentGroup> = {}): EnrollmentGroup {
  return {
    groupKey: 'enroll-1',
    enrollmentId: 'enroll-1',
    confirmationNumber: 'MK9-000123',
    handlerName: 'Jane Smith',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    totalAmount: 5000,
    totalAmountUnit: 'cents',
    paidAmount: 50,
    paymentReference: null,
    paymentMethod: null,
    rawPaymentStatus: null,
    refundAmount: null,
    refundNotes: null,
    refundedAt: null,
    entries: [makeEntry()],
    ...overrides,
  };
}

const defaultProps = {
  group: makeGroup(),
  onStatusChange: vi.fn(),
  onCheckInStatusChange: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  onRemoveEntry: vi.fn(),
  onBulkStatusChange: vi.fn(),
  onPaymentStatusChange: vi.fn(),
  paymentLedger: { record: vi.fn().mockResolvedValue(true), todayInShowZone: '2026-09-17' },
};

describe('EnrollmentCard', () => {
  it('renders handler name', () => {
    render(<EnrollmentCard {...defaultProps} />);
    expect(screen.getByText('Jane Smith')).toBeTruthy();
  });

  // MYK9-495 round 2: an order with three paid entries and one pending rendered
  // "Paid" and the full total with no unpaid indicator whenever the pending
  // entry happened to sort last.
  it('surfaces the unpaid remainder when one entry of a paid order is pending', () => {
    const paid = (id: string) =>
      makeEntry({ id, paymentStatus: PaymentStatus.PAID_ONLINE, totalFee: 30, paidAmount: 30 });
    render(
      <EnrollmentCard
        {...defaultProps}
        group={makeGroup({
          paymentStatus: PaymentStatus.PENDING,
          totalAmount: 12000,
          totalAmountUnit: 'cents',
          paidAmount: 90,
          entries: [
            paid('e1'),
            paid('e2'),
            paid('e3'),
            makeEntry({
              id: 'e4',
              paymentStatus: PaymentStatus.PENDING,
              totalFee: 30,
              paidAmount: 0,
            }),
          ],
        })}
      />
    );

    expect(screen.getByText('Payment Due')).toBeInTheDocument();
    expect(screen.getByText('($90.00 paid · $30.00 due)')).toBeInTheDocument();
  });

  it('shows the partial-payment split even while the headline status reads paid', () => {
    // `isPartiallyPaid` was gated on the headline label, so a group whose status
    // still said "Paid" hid the fact that only part of the money had arrived.
    render(
      <EnrollmentCard
        {...defaultProps}
        group={makeGroup({
          paymentStatus: PaymentStatus.PAID_BY_CHECK,
          totalAmount: 12000,
          totalAmountUnit: 'cents',
          paidAmount: 90,
        })}
      />
    );

    expect(screen.getByText('($90.00 paid · $30.00 due)')).toBeInTheDocument();
  });

  it('renders confirmation number', () => {
    render(<EnrollmentCard {...defaultProps} />);
    expect(screen.getByText('Confirmation # MK9-000123')).toBeTruthy();
    expect(screen.queryByText(/Entry #/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Registration #/)).not.toBeInTheDocument();
  });

  it('formats cents total as dollars (5000 cents → $50.00)', () => {
    render(
      <EnrollmentCard
        {...defaultProps}
        group={makeGroup({ totalAmount: 5000, totalAmountUnit: 'cents' })}
      />
    );
    expect(screen.getByText('$50.00')).toBeTruthy();
  });

  it('formats dollars total correctly (35 dollars → $35.00)', () => {
    render(
      <EnrollmentCard
        {...defaultProps}
        group={makeGroup({ totalAmount: 35, totalAmountUnit: 'dollars' })}
      />
    );
    expect(screen.getByText('$35.00')).toBeTruthy();
  });

  it('shows truncated Stripe payment reference', () => {
    const ref = 'pi_3Nxxxxxxxxxxxxxxxx_secret_yyy';
    render(<EnrollmentCard {...defaultProps} group={makeGroup({ paymentReference: ref })} />);
    // First 16 chars + ellipsis
    expect(screen.getByText(`${ref.slice(0, 16)}…`)).toBeTruthy();
  });

  it('renders payment status badge', () => {
    render(
      <EnrollmentCard
        {...defaultProps}
        group={makeGroup({ paymentStatus: PaymentStatus.PAID_ONLINE })}
      />
    );
    expect(screen.getByText('Paid')).toBeTruthy();
  });

  it('payment badge is a manual-edit dropdown for enrollment (mail-in) groups', () => {
    render(<EnrollmentCard {...defaultProps} group={makeGroup({ enrollmentId: 'enroll-1' })} />);
    fireEvent.click(screen.getByText('Paid'));
    expect(screen.getByText('Paid in Full: Cash…')).toBeTruthy();
  });

  it('payment badge is NOT editable for online-checkout groups (no enrollment record)', () => {
    // Stripe-paid groups have no enrollment row: the manual options would
    // silently no-op (or worse, convince a secretary they refunded a card).
    // Status must follow Stripe via the per-entry refund flow only.
    render(
      <EnrollmentCard
        {...defaultProps}
        group={makeGroup({ enrollmentId: null, confirmationNumber: null })}
      />
    );
    const badge = screen.getByText('Paid');
    fireEvent.click(badge);
    expect(screen.queryByText('Paid in Full: Cash…')).toBeNull();
    expect(badge.closest('button')).toBeNull();
  });

  it('groups the payment menu into Mark paid / Adjust / Reset sections', () => {
    // Phase B de-overloads the 7-action money menu into three labeled concerns
    // so it reads as sections rather than one flat list.
    render(<EnrollmentCard {...defaultProps} group={makeGroup({ enrollmentId: 'enroll-1' })} />);
    fireEvent.click(screen.getByText('Paid'));

    expect(screen.getByText('Mark paid')).toBeTruthy();
    expect(screen.getByText('Adjust')).toBeTruthy();
    expect(screen.getByText('Reset')).toBeTruthy();
  });

  it('still fires onPaymentStatusChange for Paid in Full: Online', () => {
    // Online money is not the desk's, so it keeps the plain status write.
    const onPaymentStatusChange = vi.fn();
    render(
      <EnrollmentCard
        {...defaultProps}
        group={makeGroup({ enrollmentId: 'enroll-1' })}
        onPaymentStatusChange={onPaymentStatusChange}
      />
    );
    fireEvent.click(screen.getByText('Paid'));
    fireEvent.click(screen.getByText('Paid in Full: Online'));

    expect(onPaymentStatusChange).toHaveBeenCalledTimes(1);
    const [enrollmentId, status] = onPaymentStatusChange.mock.calls[0];
    expect(enrollmentId).toBe('enroll-1');
    expect(status).toBe(PaymentStatus.PAID_ONLINE);
  });

  describe('cash and check money goes through the payments ledger (MYK9-677)', () => {
    function renderPending(record = vi.fn().mockResolvedValue(true), paidAmount = 0) {
      const onPaymentStatusChange = vi.fn();
      render(
        <EnrollmentCard
          {...defaultProps}
          onPaymentStatusChange={onPaymentStatusChange}
          paymentLedger={{ record, todayInShowZone: '2026-09-17' }}
          group={makeGroup({
            enrollmentId: 'enroll-1',
            paymentStatus: PaymentStatus.PENDING,
            paidAmount,
          })}
        />
      );
      fireEvent.click(screen.getByText('Payment Due'));
      return { record, onPaymentStatusChange };
    }

    it('Paid in Full: Cash records the balance, received today on the show calendar', () => {
      const { record, onPaymentStatusChange } = renderPending();
      fireEvent.click(screen.getByText('Paid in Full: Cash…'));
      expect((screen.getByLabelText('Received on') as HTMLInputElement).value).toBe('2026-09-17');
      fireEvent.click(screen.getByText('Confirm'));

      expect(record).toHaveBeenCalledWith('enroll-1', {
        kind: 'payment',
        method: 'cash',
        amount: null,
        receivedOn: '2026-09-17',
        reference: null,
      });
      expect(onPaymentStatusChange).not.toHaveBeenCalled();
    });

    it('Paid in Full: Check keeps the day a check was actually received', () => {
      const { record } = renderPending();
      fireEvent.click(screen.getByText('Paid in Full: Check…'));
      fireEvent.change(screen.getByPlaceholderText('Check number (optional)'), {
        target: { value: '1042' },
      });
      fireEvent.change(screen.getByLabelText('Received on'), { target: { value: '2026-08-27' } });
      fireEvent.click(screen.getByText('Confirm'));

      expect(record).toHaveBeenCalledWith('enroll-1', {
        kind: 'payment',
        method: 'check',
        amount: null,
        receivedOn: '2026-08-27',
        reference: '1042',
      });
    });

    it('a partial payment records its own method and amount', () => {
      const { record } = renderPending();
      fireEvent.click(screen.getByText('Partial Payment…'));
      fireEvent.change(screen.getByPlaceholderText('Amount of this payment ($)'), {
        target: { value: '35' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Check' }));
      fireEvent.click(screen.getByText('Record Payment'));

      expect(record).toHaveBeenCalledWith('enroll-1', {
        kind: 'payment',
        method: 'check',
        amount: 35,
        receivedOn: '2026-09-17',
        reference: null,
      });
    });

    it('offers a refund of what is still held after an earlier refund, not the gross paid', () => {
      const record = vi.fn().mockResolvedValue(true);
      render(
        <EnrollmentCard
          {...defaultProps}
          paymentLedger={{ record, todayInShowZone: '2026-09-17' }}
          group={makeGroup({
            enrollmentId: 'enroll-1',
            paymentStatus: PaymentStatus.PARTIAL_REFUND,
            paidAmount: 50,
            entries: [makeEntry({ enrollmentRefundAmount: 30 })],
          })}
        />
      );
      fireEvent.click(screen.getByText('Partial Refund'));
      fireEvent.click(screen.getByText('Refunded…'));

      expect((screen.getByLabelText(/Refund Amount/i) as HTMLInputElement).value).toBe('20.00');
    });

    it('Payment Due records a reversal, not a blind zero', () => {
      const { record, onPaymentStatusChange } = renderPending(vi.fn().mockResolvedValue(true), 35);
      fireEvent.click(screen.getAllByText('Payment Due').at(-1)!);

      expect(record).toHaveBeenCalledWith('enroll-1', { kind: 'reversal' });
      expect(onPaymentStatusChange).not.toHaveBeenCalled();
    });
  });

  it('omits show-day check-in and waitlist actions from the registration menu', () => {
    // Real waitlisting is per-class with position/capacity tracked in
    // `waitlist_entries` (WaitlistManagementPage). The bulk status write maps
    // WAITLIST → 'submitted', so it never creates membership and leaves the
    // entry Pending — same reason Lane 2.2 (#827) omitted bulk Waitlist from
    // the table multi-select bar.
    render(<EnrollmentCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /actions/i }));

    // Registration decisions remain reachable here…
    expect(screen.getByText('Accept all')).toBeTruthy();
    expect(screen.getByText('Reject all')).toBeTruthy();
    // …but show-day check-in belongs to the canonical Check-in desk, and real
    // waitlisting belongs to Waitlist Management.
    expect(screen.queryByText('Check In All')).toBeNull();
    expect(screen.queryByText('Waitlist All')).toBeNull();
  });

  it('groups entries by dog inside an enrollment card', () => {
    render(
      <EnrollmentCard
        {...defaultProps}
        group={makeGroup({
          entries: [
            makeEntry({
              id: 'entry-1',
              dogId: 'dog-1',
              dogName: 'Bravo',
              entryNumber: '#1',
            }),
            makeEntry({
              id: 'entry-2',
              dogId: 'dog-2',
              dogName: 'Delta',
              entryNumber: '#2',
            }),
            makeEntry({
              id: 'entry-3',
              dogId: 'dog-1',
              dogName: 'Bravo',
              entryNumber: '#3',
            }),
          ],
        })}
      />
    );

    expect(screen.getByRole('heading', { name: 'Bravo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Delta' })).toBeTruthy();
    expect(screen.getByText('2 entries')).toBeTruthy();
    expect(screen.getByText('1 entry')).toBeTruthy();
  });

  it('collapses entries on toggle and expands again', () => {
    render(<EnrollmentCard {...defaultProps} />);

    // Dog name visible while expanded
    expect(screen.getAllByText('Bravo').length).toBeGreaterThan(0);

    // Click collapse
    const collapseBtn = screen.getByRole('button', { name: 'Collapse' });
    fireEvent.click(collapseBtn);

    // Dog name gone after collapse
    expect(screen.queryByText('Bravo')).toBeNull();

    // Click expand
    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    // Dog name visible again
    expect(screen.getAllByText('Bravo').length).toBeGreaterThan(0);
  });
});
