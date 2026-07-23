import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';
import { EntryFocusedRegistration } from '../EntryFocusedRegistration';

function entry(
  id: string,
  dogName: string,
  handlerName: string,
  dogId: string
): EntryManagementEntry {
  return {
    id,
    registrationId: 'registration-1',
    entryNumber: id,
    showId: 'show-1',
    dogId,
    dogName,
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName,
    classes: [
      {
        id: `class-entry-${id}`,
        classId: `class-${id}`,
        name: id === 'entry-1' ? 'Container Novice A' : 'Interior Advanced',
        number: id,
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-07-12T13:42:00Z'),
    lastUpdated: new Date('2026-07-12T13:42:00Z'),
    confirmationNumber: 'MYK9-1001',
  };
}

describe('EntryFocusedRegistration', () => {
  it('keeps registration context while preserving each child Entry handler', () => {
    const registration = groupEntriesByShowRegistration([
      entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
      entry('entry-2', 'Bean', 'Jamie Lee', 'dog-2'),
    ])[0]!;

    render(
      <EntryFocusedRegistration
        registration={registration}
        onStatusChange={vi.fn()}
        onCheckInStatusChange={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onRemoveEntry={vi.fn()}
        onBulkStatusChange={vi.fn()}
        onBulkCheckIn={vi.fn()}
        onPaymentStatusChange={vi.fn()}
        showCheckInStatus={false}
        matchingEntryIds={new Set(['entry-2'])}
      />
    );

    expect(screen.getByRole('heading', { name: 'Alice Martin' })).toBeInTheDocument();
    expect(screen.getAllByText('Poppy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bean').length).toBeGreaterThan(0);
    expect(screen.getByText('Handler: Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('Handler: Jamie Lee')).toBeInTheDocument();
    expect(screen.getByText('Review registration')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /change check-in status/i })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Search match')).toHaveLength(2);
  });

  it('offers an explicit return action in the compact layout', async () => {
    const registration = groupEntriesByShowRegistration([
      entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
    ])[0]!;
    const onBack = vi.fn();
    const { user } = render(
      <EntryFocusedRegistration
        registration={registration}
        onBack={onBack}
        onStatusChange={vi.fn()}
        onCheckInStatusChange={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onRemoveEntry={vi.fn()}
        onBulkStatusChange={vi.fn()}
        onBulkCheckIn={vi.fn()}
        onPaymentStatusChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Back to registrations' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps Entries, Payment, and Communication and history in stable order', () => {
    const registration = groupEntriesByShowRegistration([
      entry('entry-1', 'Poppy', 'Alice Martin', 'dog-1'),
    ])[0]!;

    render(
      <EntryFocusedRegistration
        registration={{ ...registration, enrollmentId: 'enrollment-1' }}
        onStatusChange={vi.fn()}
        onCheckInStatusChange={vi.fn()}
        onOpenArmbandDialog={vi.fn()}
        onRemoveEntry={vi.fn()}
        onBulkStatusChange={vi.fn()}
        onBulkCheckIn={vi.fn()}
        onPaymentStatusChange={vi.fn()}
        onSendDecisionEmail={vi.fn()}
      />
    );

    const entries = screen.getByRole('heading', { name: 'Entries' });
    const payment = screen.getByRole('heading', { name: 'Payment' });
    const communication = screen.getByRole('heading', { name: 'Communication and history' });

    expect(
      entries.compareDocumentPosition(payment) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      payment.compareDocumentPosition(communication) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Email Exhibitor' })).toBeInTheDocument();
  });
});
