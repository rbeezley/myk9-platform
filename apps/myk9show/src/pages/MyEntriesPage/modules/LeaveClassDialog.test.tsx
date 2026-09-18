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
  classWhen: 'Sat, Nov 14 · Trial 2',
  dogName: 'Juni',
  dogId: 'dog-juni',
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

  it('closes and hands focus to the dog card on success', async () => {
    const user = userEvent.setup();
    // The node the card renders, present throughout, exactly as MyShowDogCard
    // renders it — the row's own button unmounts with the row, which is why
    // the AlertDialog's restore cannot be relied on.
    const heading = document.createElement('span');
    heading.id = 'my-show-dog-dog-juni';
    heading.tabIndex = -1;
    document.body.appendChild(heading);

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
    await waitFor(() => expect(document.activeElement).toBe(heading));

    heading.remove();
  });
});
