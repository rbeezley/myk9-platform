/**
 * MYK9-879: the secretary sees which entries paid the junior handler fee on the
 * exhibitor's own declaration, in the EXISTING entry list card (no new page), so
 * misuse can be called out after the fact. Rendered on the real prop shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryListCard } from '../EntryListCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));
vi.mock('@/components/entries/EmailStatusIcon', () => ({
  EmailStatusIcon: () => null,
}));

const cls: EntryClass = {
  id: 'cls-1',
  name: 'Novice A',
  number: '101',
  fee: 15,
  status: 'entered',
  checkInStatus: 'no-status' as EntryClass['checkInStatus'],
};

function makeEntry(id: string, dogName: string): EntryManagementEntry {
  return {
    id,
    registrationId: 'reg-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName,
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@test.com',
    handlerName: 'Kid Handler',
    classes: [cls],
    totalFee: 15,
    paidAmount: 15,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
  };
}

const baseProps = {
  entries: [makeEntry('entry-declared', 'Rocket'), makeEntry('entry-adult', 'Juno')],
  onStatusChange: vi.fn(),
  onCheckInStatusChange: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  onRemoveEntry: vi.fn(),
};

describe('EntryListCard junior fee marker', () => {
  it('marks only the entries whose junior fee was charged on a declaration', () => {
    render(<EntryListCard {...baseProps} juniorDeclaredEntryIds={new Set(['entry-declared'])} />);
    const badges = screen.getAllByText('Junior fee (declared)');
    expect(badges).toHaveLength(1);
    // It sits in the same row as the dog it describes.
    const row = badges[0].closest('[class*="mb-2"]')?.parentElement;
    expect(row).toHaveTextContent('Rocket');
    expect(row).not.toHaveTextContent('Juno');
  });

  it('shows no marker when nothing was declared or the list is not loaded', () => {
    const { rerender } = render(
      <EntryListCard {...baseProps} juniorDeclaredEntryIds={new Set()} />
    );
    expect(screen.queryByText('Junior fee (declared)')).toBeNull();
    rerender(<EntryListCard {...baseProps} />);
    expect(screen.queryByText('Junior fee (declared)')).toBeNull();
  });
});
