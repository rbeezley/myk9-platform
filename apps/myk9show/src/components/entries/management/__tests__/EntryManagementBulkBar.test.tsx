import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryManagementBulkBar } from '../EntryManagementBulkBar';

function makeEntry(overrides: Partial<EntryManagementEntry>): EntryManagementEntry {
  return {
    id: overrides.id as string,
    registrationId: (overrides.registrationId ?? overrides.id) as string,
    entryNumber: '#1',
    showId: 'show-1',
    dogId: overrides.id as string,
    dogName: `Dog ${overrides.id}`,
    ownerName: 'Owner',
    ownerEmail: 'owner@example.com',
    handlerName: 'Handler',
    classes: [],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

const noop = () => {};

describe('EntryManagementBulkBar', () => {
  it('renders nothing with an empty selection', () => {
    render(
      <EntryManagementBulkBar
        registrations={0}
        selectedEntries={[]}
        onBulkStatusChange={vi.fn()}
        onClear={vi.fn()}
        isResendDisabled={() => false}
        onBulkResend={vi.fn()}
        onExportSelected={vi.fn()}
      />
    );
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument();
  });

  it('dispatches Accept against the current selection, not a stale one (existing safety)', async () => {
    const user = userEvent.setup();
    const onBulkStatusChange = vi.fn(
      (_ids: string[], _status: EntryStatus, onFullSuccess?: () => void) => {
        onFullSuccess?.();
        return true;
      }
    );
    const entryA = makeEntry({ id: 'a', entryStatus: EntryStatus.PENDING });
    const entryB = makeEntry({ id: 'b', entryStatus: EntryStatus.PENDING });

    const { rerender } = render(
      <EntryManagementBulkBar
        registrations={2}
        selectedEntries={[entryA, entryB]}
        onBulkStatusChange={onBulkStatusChange}
        onClear={noop}
        isResendDisabled={() => false}
        onBulkResend={vi.fn()}
        onExportSelected={vi.fn()}
      />
    );

    // Between selecting and dispatching, another actor scores entry A —
    // COMPLETED is a closed status, so it is no longer accept-eligible. The
    // component must re-resolve eligibility from THIS render's
    // `selectedEntries`, never a captured snapshot from when it first mounted.
    const scoredEntryA: EntryManagementEntry = { ...entryA, entryStatus: EntryStatus.COMPLETED };
    rerender(
      <EntryManagementBulkBar
        registrations={2}
        selectedEntries={[scoredEntryA, entryB]}
        onBulkStatusChange={onBulkStatusChange}
        onClear={noop}
        isResendDisabled={() => false}
        onBulkResend={vi.fn()}
        onExportSelected={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Accept/ }));

    expect(onBulkStatusChange).toHaveBeenCalledTimes(1);
    expect(onBulkStatusChange).toHaveBeenCalledWith(
      ['b'],
      EntryStatus.ACCEPTED,
      expect.any(Function)
    );
  });

  it('dispatches Reject against the current selection, not a stale one (existing safety)', async () => {
    const user = userEvent.setup();
    const onBulkStatusChange = vi.fn(
      (_ids: string[], _status: EntryStatus, onFullSuccess?: () => void) => {
        onFullSuccess?.();
        return true;
      }
    );
    const entryA = makeEntry({ id: 'a', entryStatus: EntryStatus.PENDING });
    const entryB = makeEntry({ id: 'b', entryStatus: EntryStatus.PENDING });

    const { rerender } = render(
      <EntryManagementBulkBar
        registrations={2}
        selectedEntries={[entryA, entryB]}
        onBulkStatusChange={onBulkStatusChange}
        onClear={noop}
        isResendDisabled={() => false}
        onBulkResend={vi.fn()}
        onExportSelected={vi.fn()}
      />
    );

    rerender(
      <EntryManagementBulkBar
        registrations={2}
        selectedEntries={[{ ...entryA, entryStatus: EntryStatus.SCRATCHED }, entryB]}
        onBulkStatusChange={onBulkStatusChange}
        onClear={noop}
        isResendDisabled={() => false}
        onBulkResend={vi.fn()}
        onExportSelected={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Reject/ }));

    expect(onBulkStatusChange).toHaveBeenCalledWith(
      ['b'],
      EntryStatus.REJECTED,
      expect.any(Function)
    );
  });

  it('confirms before resending, and sends only the still-eligible unique registrations (stale selection)', async () => {
    const user = userEvent.setup();
    const onBulkResend = vi.fn().mockResolvedValue(undefined);
    const entryA1 = makeEntry({ id: 'a1', registrationId: 'reg-a' });
    const entryA2 = makeEntry({ id: 'a2', registrationId: 'reg-a' });
    const entryB1 = makeEntry({ id: 'b1', registrationId: 'reg-b' });

    const { rerender } = render(
      <EntryManagementBulkBar
        registrations={2}
        selectedEntries={[entryA1, entryA2, entryB1]}
        onBulkStatusChange={vi.fn()}
        onClear={noop}
        isResendDisabled={() => false}
        onBulkResend={onBulkResend}
        onExportSelected={vi.fn()}
      />
    );

    // Between selecting and dispatching, reg-b's resend cools down (already
    // sent moments ago) — the confirm and the eventual send must reflect that,
    // not the eligibility at selection time.
    rerender(
      <EntryManagementBulkBar
        registrations={2}
        selectedEntries={[entryA1, entryA2, entryB1]}
        onBulkStatusChange={vi.fn()}
        onClear={noop}
        isResendDisabled={registrationId => registrationId === 'reg-b'}
        onBulkResend={onBulkResend}
        onExportSelected={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Resend confirmation/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('1 exhibitor');

    await user.click(screen.getByRole('button', { name: 'Resend' }));

    await waitFor(() => expect(onBulkResend).toHaveBeenCalledWith(['reg-a']));
  });

  it('disables Resend confirmation when every selected registration is disabled', () => {
    const entry = makeEntry({ id: 'a', registrationId: 'reg-a' });
    render(
      <EntryManagementBulkBar
        registrations={1}
        selectedEntries={[entry]}
        onBulkStatusChange={vi.fn()}
        onClear={noop}
        isResendDisabled={() => true}
        onBulkResend={vi.fn()}
        onExportSelected={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Resend confirmation/ })).toBeDisabled();
  });

  it('exports the current selection, not a stale one (stale selection)', async () => {
    const user = userEvent.setup();
    const onExportSelected = vi.fn();
    const entryA = makeEntry({ id: 'a' });
    const entryB = makeEntry({ id: 'b' });

    const { rerender } = render(
      <EntryManagementBulkBar
        registrations={1}
        selectedEntries={[entryA]}
        onBulkStatusChange={vi.fn()}
        onClear={noop}
        isResendDisabled={() => false}
        onBulkResend={vi.fn()}
        onExportSelected={onExportSelected}
      />
    );

    // The selection grows (a second row ticked) before Export is clicked —
    // the export must reflect what's selected NOW.
    rerender(
      <EntryManagementBulkBar
        registrations={2}
        selectedEntries={[entryA, entryB]}
        onBulkStatusChange={vi.fn()}
        onClear={noop}
        isResendDisabled={() => false}
        onBulkResend={vi.fn()}
        onExportSelected={onExportSelected}
      />
    );

    await user.click(screen.getByRole('button', { name: /Export selected/ }));

    expect(onExportSelected).toHaveBeenCalledTimes(1);
    expect(onExportSelected).toHaveBeenCalledWith([entryA, entryB]);
  });

  it('does not show a confirm dialog for Export (non-destructive, no email, no money)', async () => {
    const user = userEvent.setup();
    render(
      <EntryManagementBulkBar
        registrations={1}
        selectedEntries={[makeEntry({ id: 'a' })]}
        onBulkStatusChange={vi.fn()}
        onClear={noop}
        isResendDisabled={() => false}
        onBulkResend={vi.fn()}
        onExportSelected={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Export selected/ }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
