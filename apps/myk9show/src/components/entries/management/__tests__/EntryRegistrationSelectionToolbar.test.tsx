import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryRegistrationSelectionToolbar } from '../EntryRegistrationSelectionToolbar';

const selectedEntry: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'registration-1',
  entryNumber: '101',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Poppy',
  ownerName: 'Alice Martin',
  ownerEmail: 'alice@example.com',
  handlerName: 'Alice Martin',
  classes: [],
  totalFee: 25,
  paidAmount: 0,
  entryStatus: EntryStatus.PENDING,
  paymentStatus: PaymentStatus.PENDING,
  submittedAt: new Date('2026-07-12T13:42:00Z'),
  lastUpdated: new Date('2026-07-12T13:42:00Z'),
};

describe('EntryRegistrationSelectionToolbar', () => {
  it('appears on first selection and keeps count, actions, and clear together', async () => {
    const onClear = vi.fn();
    const { user } = render(
      <EntryRegistrationSelectionToolbar
        registrations={1}
        selectedEntries={[selectedEntry]}
        onBulkStatusChange={vi.fn()}
        onBulkCheckIn={vi.fn()}
        onClear={onClear}
      />
    );

    expect(screen.getByText('1 registration · 1 Entry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bulk actions' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear registration selection' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('does not reserve footer space without a selection', () => {
    render(
      <EntryRegistrationSelectionToolbar
        registrations={0}
        selectedEntries={[]}
        onBulkStatusChange={vi.fn()}
        onBulkCheckIn={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Selected registration actions')).not.toBeInTheDocument();
  });
});
