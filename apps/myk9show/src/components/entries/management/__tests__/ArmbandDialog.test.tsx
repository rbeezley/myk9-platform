import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ArmbandDialog } from '../ArmbandDialog';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { ArmbandDialogState, EntryManagementEntry } from '@/types/entry-management-types';

const entry: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'reg-1',
  entryNumber: '#1',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Ranger',
  ownerName: 'Jane Smith',
  ownerEmail: 'jane@example.com',
  handlerName: 'Jane Smith',
  classes: [],
  totalFee: 30,
  paidAmount: 30,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-01-01'),
  lastUpdated: new Date('2026-01-01'),
};

function makeState(overrides: Partial<ArmbandDialogState> = {}): ArmbandDialogState {
  return { open: true, entry, value: '', error: null, ...overrides };
}

describe('ArmbandDialog', () => {
  it('explains why Assign is disabled until an armband number is entered', () => {
    render(
      <ArmbandDialog
        dialogState={makeState()}
        setDialogState={vi.fn()}
        onAssign={vi.fn()}
        onNextArmband={vi.fn()}
        isProcessing={false}
      />
    );

    expect(screen.getByRole('button', { name: 'Assign armband' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use next available' })).toBeInTheDocument();
    expect(
      screen.getByText('Enter an armband number to assign it to this entry.')
    ).toBeInTheDocument();
  });
});
