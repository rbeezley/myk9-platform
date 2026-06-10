import React from 'react';
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
    enrollmentId: 'enroll-1',
    confirmationNumber: 'CONF-123',
    handlerName: 'Jane Smith',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    totalAmount: 5000,
    totalAmountUnit: 'cents',
    paymentReference: null,
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
  onBulkCheckIn: vi.fn(),
  onPaymentStatusChange: vi.fn(),
};

describe('EnrollmentCard', () => {
  it('renders handler name', () => {
    render(<EnrollmentCard {...defaultProps} />);
    expect(screen.getByText('Jane Smith')).toBeTruthy();
  });

  it('renders confirmation number', () => {
    render(<EnrollmentCard {...defaultProps} />);
    expect(screen.getByText('#CONF-123')).toBeTruthy();
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
    expect(screen.getByText('Paid in Full — Cash')).toBeTruthy();
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
    expect(screen.queryByText('Paid in Full — Cash')).toBeNull();
    expect(badge.closest('button')).toBeNull();
  });

  it('collapses entries on toggle and expands again', () => {
    render(<EnrollmentCard {...defaultProps} />);

    // Dog name visible while expanded
    expect(screen.getByText('Bravo')).toBeTruthy();

    // Click collapse
    const collapseBtn = screen.getByRole('button', { name: 'Collapse' });
    fireEvent.click(collapseBtn);

    // Dog name gone after collapse
    expect(screen.queryByText('Bravo')).toBeNull();

    // Click expand
    const expandBtn = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(expandBtn);

    // Dog name visible again
    expect(screen.getByText('Bravo')).toBeTruthy();
  });
});
