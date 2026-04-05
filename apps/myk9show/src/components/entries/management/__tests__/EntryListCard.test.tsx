import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryListCard } from '../EntryListCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
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
    checkInStatus: 'no-status' as EntryClass['checkInStatus'],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogName: 'Fido',
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

const defaultProps = {
  entries: [makeEntry()],
  selectedEntries: new Set<string>(),
  onSelectEntry: vi.fn(),
  onSelectAll: vi.fn(),
  onStatusChange: vi.fn(),
  onOpenCheckInDialog: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
};

describe('EntryListCard - check-in button affordance', () => {
  it('renders check-in status button with cursor-pointer class', () => {
    render(<EntryListCard {...defaultProps} />);

    const statusIndicator = screen.getByTestId('checkin-status');
    const button = statusIndicator.closest('button');
    expect(button).toHaveClass('cursor-pointer');
  });

  it('renders check-in status button with border for visual affordance', () => {
    render(<EntryListCard {...defaultProps} />);

    const statusIndicator = screen.getByTestId('checkin-status');
    const button = statusIndicator.closest('button');
    expect(button).toHaveClass('border');
  });

  it('renders check-in buttons for all classes in an entry', () => {
    const entry = makeEntry({
      classes: [
        makeClass({ id: 'cls-1', name: 'Novice A' }),
        makeClass({ id: 'cls-2', name: 'Open B' }),
      ],
    });
    render(<EntryListCard {...defaultProps} entries={[entry]} />);

    const indicators = screen.getAllByTestId('checkin-status');
    expect(indicators).toHaveLength(2);
    indicators.forEach(indicator => {
      const button = indicator.closest('button');
      expect(button).toHaveClass('cursor-pointer');
    });
  });
});
