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
import { render } from '@/test/utils/testUtils';
import { LeaveClassDialog } from './LeaveClassDialog';

const mocks = vi.hoisted(() => ({
  withdrawEntry: vi.fn(),
  getRemoveFromClassEligibilityForEntries: vi.fn(),
  getTrialsByShow: vi.fn(),
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
  dogName: 'Juni',
  showId: 'show-flint',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withdrawEntry.mockResolvedValue({ data: null, error: null });
  mocks.getRemoveFromClassEligibilityForEntries.mockResolvedValue({
    [target.classId]: { withdraw: ALLOWED, pull: ALLOWED },
  });
  mocks.getTrialsByShow.mockResolvedValue([{ registryId: 'AKC' }]);
});

function renderDialog(onUpdate = vi.fn(), onClose = vi.fn()) {
  render(
    <LeaveClassDialog dialog={{ open: true, target }} onClose={onClose} onUpdate={onUpdate} />
  );
  return { onUpdate, onClose };
}

describe('LeaveClassDialog', () => {
  it('names the class the row owns', async () => {
    renderDialog();

    const dialog = within(await chooser());
    expect(dialog.getByText('Leave this class?')).toBeInTheDocument();
    expect(dialog.getByText('Exterior Excellent')).toBeInTheDocument();
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
