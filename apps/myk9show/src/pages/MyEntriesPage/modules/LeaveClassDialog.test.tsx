/**
 * MYK9-631 AC3: the card row's chooser writes against THAT class row.
 *
 * Assertion-first on the value that matters — `withdrawEntry` must be called
 * with the `entries.id` of the class whose row was clicked, and with the kind
 * and reason MYK9-632 defined. A dialog that opened on the right class but
 * wrote the wrong id would look correct on screen and be wrong in the database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { render } from '@/test/utils/testUtils';
import { LeaveClassDialog } from './LeaveClassDialog';

const mocks = vi.hoisted(() => ({
  withdrawEntry: vi.fn(),
  getRemoveFromClassEligibilityForEntries: vi.fn(),
  getTrialsByShow: vi.fn(),
  useEntryReceiptOrders: vi.fn(),
}));

vi.mock('@/features/payments/entryReceiptOrder', () => ({
  useEntryReceiptOrders: mocks.useEntryReceiptOrders,
}));

vi.mock('@/services/database/entries', () => ({
  withdrawEntry: mocks.withdrawEntry,
}));

vi.mock('@/services/database/entries/withdrawOwnEntry', () => ({
  getRemoveFromClassEligibilityForEntries: mocks.getRemoveFromClassEligibilityForEntries,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: mocks.getTrialsByShow },
}));

const ALLOWED = { allowed: true as const, code: undefined, reason: undefined };

/** The open chooser, scoped — it renders in a portal, as an alertdialog. */
const chooser = () => screen.findByRole('alertdialog');

const target = {
  classId: 'entry-exterior-excellent',
  className: 'Exterior Excellent',
  classWhen: 'Sat, Nov 14 · Trial 2',
  dogName: 'Juni',
  dogId: 'dog-juni',
  dogCardId: 'e-juni',
  showId: 'show-flint',
  entryFee: 0,
  paidAs: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withdrawEntry.mockResolvedValue({ data: null, error: null });
  mocks.getRemoveFromClassEligibilityForEntries.mockResolvedValue({
    [target.classId]: { withdraw: ALLOWED, pull: ALLOWED },
  });
  mocks.getTrialsByShow.mockResolvedValue([{ registryId: 'AKC' }]);
  mocks.useEntryReceiptOrders.mockReturnValue({ data: undefined });
});

function renderDialog(onUpdate = vi.fn(), onClose = vi.fn()) {
  render(
    <LeaveClassDialog dialog={{ open: true, target }} onClose={onClose} onUpdate={onUpdate} />
  );
  return { onUpdate, onClose };
}

describe('LeaveClassDialog: what she paid (MYK9-2001)', () => {
  const paidOnline = { ...target, entryFee: 30, paidAs: 'online' as const };

  it('shows the entry fee and the recorded service fee before she confirms', async () => {
    mocks.useEntryReceiptOrders.mockReturnValue({
      data: [
        { id: 'order-1', status: 'succeeded', entryIds: [target.classId], platformFeeCents: 210 },
      ],
    });
    const user = userEvent.setup();
    render(
      <LeaveClassDialog
        dialog={{ open: true, target: paidOnline }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
        viewerId="user-1"
      />
    );

    const dialog = within(await chooser());
    expect(dialog.getByText('Entry fee $30.00: the secretary decides on a refund.')).toBeVisible();
    expect(dialog.getByText('Service fee $2.10: not refunded.')).toBeVisible();
    // The order read is for THIS class row, scoped to the viewer, and only because it paid online.
    expect(mocks.useEntryReceiptOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedOrderId: null,
        viewerId: 'user-1',
        entryIds: [target.classId],
        enabled: true,
      })
    );

    // Still there on the step where she confirms.
    await user.click(dialog.getByRole('button', { name: /^pull$/i }));
    expect(dialog.getByText('Entry fee $30.00: the secretary decides on a refund.')).toBeVisible();
    expect(dialog.getByText('Service fee $2.10: not refunded.')).toBeVisible();
  });

  it('quotes the settled charge’s service fee, not an earlier attempt that covers the same entry', async () => {
    mocks.useEntryReceiptOrders.mockReturnValue({
      data: [
        { id: 'retry', status: 'pending', entryIds: [target.classId], platformFeeCents: 999 },
        { id: 'paid', status: 'succeeded', entryIds: [target.classId], platformFeeCents: 210 },
      ],
    });
    render(
      <LeaveClassDialog
        dialog={{ open: true, target: paidOnline }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    const dialog = within(await chooser());
    expect(dialog.getByText('Service fee $2.10: not refunded.')).toBeVisible();
    expect(dialog.queryByText(/9\.99/)).not.toBeInTheDocument();
  });

  it('omits the service fee when two settled charges cover the entry', async () => {
    mocks.useEntryReceiptOrders.mockReturnValue({
      data: [
        { id: 'a', status: 'succeeded', entryIds: [target.classId], platformFeeCents: 210 },
        { id: 'b', status: 'succeeded', entryIds: [target.classId], platformFeeCents: 175 },
      ],
    });
    render(
      <LeaveClassDialog
        dialog={{ open: true, target: paidOnline }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    const dialog = within(await chooser());
    expect(dialog.getByText('Entry fee $30.00: the secretary decides on a refund.')).toBeVisible();
    expect(dialog.queryByText(/^Service fee( \$|:)/)).not.toBeInTheDocument();
  });

  it('shows the entry fee alone for a check entry and does not read an order', async () => {
    render(
      <LeaveClassDialog
        dialog={{ open: true, target: { ...target, entryFee: 25, paidAs: 'check' } }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    const dialog = within(await chooser());
    expect(dialog.getByText('Entry fee $25.00: the secretary decides on a refund.')).toBeVisible();
    // (The club's own policy text says service fees are non-refundable; that is not these lines.)
    expect(dialog.queryByText(/^Service fee( \$|:)/)).not.toBeInTheDocument();
    expect(mocks.useEntryReceiptOrders).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it('says nothing about money for an unpaid entry', async () => {
    renderDialog();

    const dialog = within(await chooser());
    expect(dialog.queryByText(/what you paid/i)).not.toBeInTheDocument();
  });
});

describe('LeaveClassDialog', () => {
  it('names the class the row owns', async () => {
    renderDialog();

    const dialog = within(await chooser());
    expect(dialog.getByText('Pull or withdraw?')).toBeInTheDocument();
    expect(dialog.getByText('Exterior Excellent')).toBeInTheDocument();
    // Round 1 (lens L): two trials of one show can run a class with the same
    // display name, so every step carries the row's own discriminator.
    expect(dialog.getByText(/Sat, Nov 14 · Trial 2/)).toBeInTheDocument();
    // No order picker: the whole point of AC3.
    expect(screen.queryByText(/Choose an entry/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/more than once/i)).not.toBeInTheDocument();
  });

  it('pulls THAT class id, with no reason', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderDialog();

    const dialog = within(await chooser());
    await user.click(dialog.getByRole('button', { name: /^pull$/i }));
    await user.click(dialog.getByRole('button', { name: /pull entry/i }));

    await waitFor(() =>
      expect(mocks.withdrawEntry).toHaveBeenCalledWith('entry-exterior-excellent', {
        kind: 'pull',
        reason: null,
      })
    );
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
  });

  it('withdraws THAT class id, carrying the reason the registry offered', async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = within(await chooser());
    await waitFor(() => expect(dialog.getByRole('button', { name: /^withdraw$/i })).toBeEnabled());
    await user.click(dialog.getByRole('button', { name: /^withdraw$/i }));
    await user.click(dialog.getByRole('button', { name: /dog in season/i }));
    await user.click(dialog.getByRole('button', { name: /withdraw entry/i }));

    await waitFor(() =>
      expect(mocks.withdrawEntry).toHaveBeenCalledWith('entry-exterior-excellent', {
        kind: 'withdraw',
        reason: 'in_season',
      })
    );
  });

  it('writes nothing while closed — and reads nothing either', () => {
    render(
      <LeaveClassDialog
        dialog={{ open: false, target: null }}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(mocks.withdrawEntry).not.toHaveBeenCalled();
    expect(mocks.getRemoveFromClassEligibilityForEntries).not.toHaveBeenCalled();
    expect(mocks.getTrialsByShow).not.toHaveBeenCalled();
  });

  it('greys Withdraw out with the server’s own reason, keeping Pull live', async () => {
    mocks.getRemoveFromClassEligibilityForEntries.mockResolvedValue({
      [target.classId]: {
        withdraw: {
          allowed: false,
          code: 'status',
          reason: 'This entry is paid; request a refund instead of withdrawing.',
        },
        pull: ALLOWED,
      },
    });
    renderDialog();

    const dialog = within(await chooser());
    await waitFor(() =>
      expect(
        dialog.getByText('This entry is paid; request a refund instead of withdrawing.')
      ).toBeInTheDocument()
    );
    expect(dialog.getByRole('button', { name: /^withdraw$/i })).toBeDisabled();
    expect(dialog.getByRole('button', { name: /^pull$/i })).toBeEnabled();
  });
});

describe('LeaveClassDialog — round 1 corrections', () => {
  it('stays OPEN on a server refusal, so the exhibitor can retry', async () => {
    const user = userEvent.setup();
    mocks.withdrawEntry.mockResolvedValue({
      data: null,
      error: { code: 'entry-paid', message: 'This entry is paid; request a refund instead.' },
    });
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    render(
      <LeaveClassDialog dialog={{ open: true, target }} onClose={onClose} onUpdate={onUpdate} />
    );

    const dialog = within(await chooser());
    await user.click(dialog.getByRole('button', { name: /^pull$/i }));
    await user.click(dialog.getByRole('button', { name: /pull entry/i }));

    await waitFor(() => expect(mocks.withdrawEntry).toHaveBeenCalled());
    // The chooser it replaced (the Edit sheet) keeps its Alert and stays put.
    // Tearing this one down made the exhibitor re-find the row and re-walk
    // choose → reason → confirm for a failure that is usually transient.
    expect(onClose).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    // And the confirm is live again rather than stuck in its saving state.
    await waitFor(() => expect(dialog.getByRole('button', { name: /pull entry/i })).toBeEnabled());
  });

  it('stays open when the call throws, too', async () => {
    const user = userEvent.setup();
    mocks.withdrawEntry.mockRejectedValue(new Error('offline'));
    const onClose = vi.fn();
    render(
      <LeaveClassDialog dialog={{ open: true, target }} onClose={onClose} onUpdate={vi.fn()} />
    );

    const dialog = within(await chooser());
    await user.click(dialog.getByRole('button', { name: /^pull$/i }));
    await user.click(dialog.getByRole('button', { name: /pull entry/i }));

    await waitFor(() => expect(mocks.withdrawEntry).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  // The round-1 focus restore is GONE (MYK9-658), so what is asserted here is
  // the part that must hold regardless: the dialog closes itself and the caller
  // is told to refresh. Nothing asserts where focus lands, because nothing in
  // the component decides that any more — a test that pinned `document.body`
  // would be pinning the absence of a feature rather than a behaviour.
  it('closes and refreshes on success', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUpdate = vi.fn();
    render(
      <LeaveClassDialog dialog={{ open: true, target }} onClose={onClose} onUpdate={onUpdate} />
    );

    const dialog = within(await chooser());
    await user.click(dialog.getByRole('button', { name: /^pull$/i }));
    await user.click(dialog.getByRole('button', { name: /pull entry/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onUpdate).toHaveBeenCalled();
  });
});

describe('LeaveClassDialog — MYK9-778 finished show', () => {
  // The row control is withheld on a finished show, but a card rendered before
  // the secretary closed the show out can still reach the RPC. Its refusal
  // (SQLSTATE MK006) is a settled fact, so the toast must say so plainly — not
  // the "ask the show secretary" line a 42501 gets, which reads as if the entry
  // might still be removable.
  it('shows a definite sentence when the server says the show has finished', async () => {
    const toastError = vi.spyOn(toast, 'error');
    const user = userEvent.setup();
    mocks.withdrawEntry.mockResolvedValue({
      data: null,
      error: {
        code: 'MK006',
        message: `Entry ${target.classId} cannot be withdrawn: the show has finished`,
      },
    });
    renderDialog();

    const dialog = within(await chooser());
    await waitFor(() => expect(dialog.getByRole('button', { name: /^withdraw$/i })).toBeEnabled());
    await user.click(dialog.getByRole('button', { name: /^withdraw$/i }));
    await user.click(dialog.getByRole('button', { name: /dog in season/i }));
    await user.click(dialog.getByRole('button', { name: /withdraw entry/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'This show has finished, so this entry can no longer be withdrawn.'
      )
    );
    toastError.mockRestore();
  });
});
