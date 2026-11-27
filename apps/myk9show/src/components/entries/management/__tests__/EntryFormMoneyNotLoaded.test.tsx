import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';
import { EntryFocusedRegistration } from '../EntryFocusedRegistration';

vi.mock('@/features/messages/hooks/useCanSendTargetedShowMessages', () => ({
  useCanSendTargetedShowMessages: () => false,
}));

/**
 * MYK9-1968: a mail-in form of two $25 entries with $30 taken at the desk. The $30 lives only on
 * the enrollment row, which is an online-only read: offline (or when the read fails) the row is
 * missing and the entries alone say $50 is due.
 */
function entry(id: string, overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id,
    registrationId: 'enrollment-1',
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName: `Dog ${id}`,
    ownerId: 'owner-1',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    classes: [
      {
        id: `class-entry-${id}`,
        classId: `class-${id}`,
        name: 'Container Novice A',
        number: id,
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-07-12T13:42:00Z'),
    lastUpdated: new Date('2026-07-12T13:42:00Z'),
    armbandNumber: `1${id.slice(-1)}`,
    ...overrides,
  };
}

/** What the enrollments read adds to each entry when it loads: $50 total, $30 paid at the desk. */
const enrollmentLoaded: Partial<EntryManagementEntry> = {
  enrollmentTotalAmount: 5000,
  enrollmentPaidAmount: 30,
  enrollmentCardCoveredCents: 0,
  enrollmentPaymentStatus: PaymentStatus.PENDING,
};

function renderForm(entries: EntryManagementEntry[]) {
  const registration = groupEntriesByShowRegistration(entries)[0]!;
  return render(
    <EntryFocusedRegistration
      registration={registration}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      onBulkStatusChange={vi.fn()}
      paymentLedger={{ record: vi.fn(), markPaidOnline: vi.fn(), todayInShowZone: '2026-09-17' }}
    />
  );
}

const footer = () => screen.getByRole('contentinfo');

describe('entry form money when the payment record is not loaded (MYK9-1968)', () => {
  it('quotes the enrollment figures when the row loaded: $20.00 due on a $50 form with $30 paid', () => {
    renderForm([entry('entry-1', enrollmentLoaded), entry('entry-2', enrollmentLoaded)]);

    expect(within(footer()).getByText('$20.00 due')).toBeInTheDocument();
    expect(within(footer()).getByText(/Total \$50\.00 · paid \$30\.00/)).toBeInTheDocument();
  });

  it('says the amount is not available, never "$50.00 due", when the enrollment row did not load', () => {
    renderForm([entry('entry-1'), entry('entry-2')]);

    expect(within(footer()).getByText('Amount not available')).toBeInTheDocument();
    expect(within(footer()).getByText('Payment record not loaded')).toBeInTheDocument();
    expect(screen.queryByText(/\$50\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/due$/)).not.toBeInTheDocument();

    // The checklist says so too, and offers no button that takes money for an unknown due.
    const checklist = screen.getByRole('region', { name: 'To finish this form' });
    expect(within(checklist).getByText('Amount not available')).toBeInTheDocument();
    expect(within(checklist).queryByRole('button', { name: 'Cash…' })).not.toBeInTheDocument();
  });

  it('opens the payment dialog without quoting a balance when the row did not load', async () => {
    const { user } = renderForm([entry('entry-1'), entry('entry-2')]);

    await user.click(screen.getByRole('button', { name: 'Change payment' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Paid in Full: Cash…' }));

    // MYK9-2479: the payment dialog, with nothing filled in for a due that is not known.
    const dialog = await screen.findByRole('dialog', { name: 'Record Partial Payment' });
    expect(within(dialog).getByText('Amount not available')).toBeInTheDocument();
    expect(within(dialog).queryByText(/\$\d+\.\d\d/)).not.toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('Amount of this payment ($)')).toHaveValue(null);
  });

  it('says the amount is not available when a move-up money root is not in the read', () => {
    renderForm([
      entry('entry-1', { ...enrollmentLoaded, moneyRootUnresolved: true }),
      entry('entry-2', enrollmentLoaded),
    ]);

    expect(within(footer()).getByText('Amount not available')).toBeInTheDocument();
    expect(screen.queryByText('$20.00 due')).not.toBeInTheDocument();
    // The entry's own badge fires on this path (EntryListCard reads the same stamp).
    const badges = screen
      .getAllByText('Payment record not loaded')
      .filter(element => !footer().contains(element));
    expect(badges).toHaveLength(1);
  });
});
