import { getStatusDescriptor } from '@/components/status';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Custom render wraps QueryClient/Auth/Router — EntryListCard always mounts
// RefundEntryDialog, which now reads the policy snapshot via React Query.
import { render } from '@/test/utils/testUtils';
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

// The shared delete dialog's server and device halves (features/delete).
const deleteMocks = vi.hoisted(() => ({
  preview: vi.fn(),
  remove: vi.fn(),
  purge: vi.fn(),
  offerUndo: vi.fn(),
}));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
}));
vi.mock('@/features/delete/deleteUndoToast', () => ({ offerUndoToast: deleteMocks.offerUndo }));

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
    dogId: 'dog-1',
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
  onStatusChange: vi.fn(),
  onCheckInStatusChange: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  onEntryRemoved: vi.fn(),
};

describe('EntryListCard - Edit entry lives in the row menu (MYK9-928)', () => {
  it('has no pencil button; Edit entry is the first item of the row menu', async () => {
    const user = userEvent.setup();
    const onOpenEditEntry = vi.fn();
    const entry = makeEntry();
    render(<EntryListCard {...defaultProps} entries={[entry]} onOpenEditEntry={onOpenEditEntry} />);

    expect(screen.queryByRole('button', { name: /edit entry for Fido/i })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /change entry status for Fido in Novice A/i })
    );
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Edit entry');

    await user.click(items[0] as HTMLElement);
    expect(onOpenEditEntry).toHaveBeenCalledWith(entry);
  });
});

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

  // Each chip control still names its own action distinctly. The names now also
  // LEAD with the control's visible text, which WCAG 2.5.3 (Label in Name)
  // requires: an aria-label that replaces the visible text leaves a speech-input
  // user unable to activate the control by saying what they can see.
  it('names chip-style armband, entry status, and check-in controls by visible label and action', () => {
    render(
      <EntryListCard
        {...defaultProps}
        entries={[makeEntry({ armbandNumber: '42', classes: [makeClass({ name: 'Novice A' })] })]}
      />
    );

    const armband = screen.getByRole('button', { name: /change armband for Fido/i });
    const status = screen.getByRole('button', {
      name: /change entry status for Fido in Novice A/i,
    });
    const checkIn = screen.getByRole('button', {
      name: /change check-in status for Fido in Novice A/i,
    });

    // The visible text of each control must appear in its accessible name.
    // The status and check-in chips render their label from
    // `getStatusDescriptor`, so assert against that same source rather than
    // against `textContent` -- CheckInStatusIndicator is mocked here, and
    // comparing to the mock's output would only test the mock.
    expect(armband).toHaveAccessibleName(/^42,/);
    expect(status.getAttribute('aria-label')).toContain(
      getStatusDescriptor('entry', 'accepted').label
    );
    expect(checkIn.getAttribute('aria-label')).toContain(
      getStatusDescriptor('entry', 'no-status').label
    );
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

  it('omits "Waitlisted" from the per-entry status menu', () => {
    // The inline status write maps WAITLIST → 'submitted', so it never creates
    // `waitlist_entries` membership and leaves the entry Pending. Real
    // waitlisting is the dedicated per-class workflow (WaitlistManagementPage).
    render(<EntryListCard {...defaultProps} />);

    // The status dropdown trigger shows the entry's current status badge.
    fireEvent.click(screen.getByText('Accepted'));

    // Valid status transitions remain reachable…
    expect(screen.getByText('Reject')).toBeTruthy();
    // …but the broken no-op "Waitlisted" option is gone.
    expect(screen.queryByText('Waitlisted')).toBeNull();
  });

  it('keeps a pending entry marked Payment Due under a paid order (MYK9-495)', () => {
    // `enrollments` is one row per (show, handler), reused by every later
    // submission, so its `paid` cannot vouch for this entry. Letting it badge
    // "Paid" is how $30 of live debt read as settled on every money surface.
    render(
      <EntryListCard
        {...defaultProps}
        entries={[
          makeEntry({
            paymentStatus: PaymentStatus.PENDING,
            enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
          }),
        ]}
      />
    );

    expect(screen.getByText('Payment Due')).toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
  });

  it('still renders the order-level payment method once the entry row is settled', () => {
    render(
      <EntryListCard
        {...defaultProps}
        entries={[
          makeEntry({
            paymentStatus: PaymentStatus.PAID_ONLINE,
            enrollmentPaymentStatus: PaymentStatus.PAID_BY_CHECK,
          }),
        ]}
      />
    );

    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByText('Payment Due')).not.toBeInTheDocument();
  });

  it('groups payment actions under a "Payment" header in the status menu', () => {
    // Phase B de-overloads the 9-item status menu: money actions now sit under
    // their own quiet "Payment" header, distinct from the lifecycle items above
    // and the destructive Remove below. An entry that still owes money
    // (active + payment pending) surfaces "Request payment…".
    render(
      <EntryListCard
        {...defaultProps}
        entries={[makeEntry({ paymentStatus: PaymentStatus.PENDING, paidAmount: 0 })]}
      />
    );

    // Open the status menu via the entry's status badge (ACCEPTED → "Accepted").
    fireEvent.click(screen.getByText('Accepted'));

    expect(screen.getByText('Payment')).toBeInTheDocument();
    expect(screen.getByText('Request payment…')).toBeInTheDocument();
  });

  it('asks through the shared delete dialog before removing an entry', async () => {
    deleteMocks.preview.mockResolvedValue({
      trials: 0,
      classes: 0,
      entries: 0,
      shows: 0,
      dogs: 0,
      paid: 0,
      scored: 0,
      blocking: 0,
    });
    deleteMocks.remove.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const onEntryRemoved = vi.fn();
    render(<EntryListCard {...defaultProps} onEntryRemoved={onEntryRemoved} />);

    await user.click(screen.getByRole('button', { name: /remove entry for fido/i }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the entry for Fido?' });
    expect(deleteMocks.remove).not.toHaveBeenCalled();

    const confirm = within(dialog).getByRole('button', { name: 'Delete entry' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(onEntryRemoved).toHaveBeenCalledWith('entry-1'));
    expect(deleteMocks.remove).toHaveBeenCalledWith('entry', 'entry-1', { override: false });
  });
  it('reloads the entries when Undo brings a deleted entry back', async () => {
    deleteMocks.preview.mockResolvedValue({
      trials: 0,
      classes: 0,
      entries: 0,
      shows: 0,
      dogs: 0,
      paid: 0,
      scored: 0,
      blocking: 0,
    });
    deleteMocks.remove.mockResolvedValue(undefined);
    deleteMocks.offerUndo.mockReset();
    const user = userEvent.setup();
    const onEntryRestored = vi.fn();
    render(<EntryListCard {...defaultProps} onEntryRestored={onEntryRestored} />);

    await user.click(screen.getByRole('button', { name: /remove entry for fido/i }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the entry for Fido?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete entry' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(deleteMocks.offerUndo).toHaveBeenCalled());
    expect(onEntryRestored).not.toHaveBeenCalled();
    deleteMocks.offerUndo.mock.calls[0]?.[0].onRestored([{ id: 'entry-1', name: 'Fido' }]);
    expect(onEntryRestored).toHaveBeenCalledTimes(1);
  });

  /**
   * MYK9-639: a destination whose paying source did not come back in the read
   * shows its own $0 fee. Without this the number reads as a settled figure.
   */
  it("says so when the entry holding this run's money is not loaded", () => {
    render(
      <EntryListCard {...defaultProps} entries={[makeEntry({ moneyRootUnresolved: true })]} />
    );

    expect(screen.getByText('Payment record not loaded')).toBeInTheDocument();
  });

  it('shows no such warning for an ordinary entry', () => {
    render(<EntryListCard {...defaultProps} />);

    expect(screen.queryByText('Payment record not loaded')).not.toBeInTheDocument();
  });
});
