/**
 * MYK9-535: the Pull affordance must not offer a withdrawal the server will
 * refuse, and a refusal must be visible.
 *
 * The withdrawal itself is online-only (see ReplicatedEntriesTable), so the
 * dialog's error IS the server's answer. These pin the affordance: Pull is
 * disabled with the reason for a refusal, and — because an unchecked row must
 * never offer a withdrawal — also while the check is in flight or after it
 * fails.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';

const mocks = vi.hoisted(() => ({
  canModifyEntry: vi.fn(),
  updateEntryDetails: vi.fn(),
  updateEntryHandler: vi.fn(),
  withdrawEntry: vi.fn(),
  getWithdrawEligibility: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  canModifyEntry: mocks.canModifyEntry,
  updateEntryDetails: mocks.updateEntryDetails,
  updateEntryHandler: mocks.updateEntryHandler,
  withdrawEntry: mocks.withdrawEntry,
}));

vi.mock('@/services/database/entries/withdrawOwnEntry', () => ({
  getWithdrawEligibility: mocks.getWithdrawEligibility,
}));

const noop = () => {};

const entry = {
  id: 'entry-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  dogName: 'Ace',
  classes: [
    {
      id: 'class-1',
      name: 'Container Novice A',
      number: '101',
      fee: 30,
      trialType: 'Scent Work',
      status: 'entered' as const,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canModifyEntry.mockResolvedValue({ canModify: true });
  mocks.updateEntryDetails.mockResolvedValue({ error: null });
  mocks.updateEntryHandler.mockResolvedValue({ error: null });
  mocks.withdrawEntry.mockResolvedValue({ error: null });
  mocks.getWithdrawEligibility.mockResolvedValue({ allowed: true });
});

describe('EntryEditDialog — MYK9-535 withdraw guard', () => {
  it('leaves Pull enabled for an unpaid, pre-show entry', async () => {
    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    expect(await screen.findByRole('button', { name: /pull/i })).toBeEnabled();
  });

  it('disables Pull for a PAID entry and names the refund path', async () => {
    mocks.getWithdrawEligibility.mockResolvedValue({
      allowed: false,
      code: 'paid',
      reason: 'This entry is paid — request a refund instead of withdrawing.',
    });

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const pull = await screen.findByRole('button', { name: /pull/i });
    await waitFor(() => expect(pull).toBeDisabled());
    expect(screen.getByText(/request a refund instead of withdrawing/i)).toBeInTheDocument();
  });

  it('never calls the withdraw path for a refused entry', async () => {
    mocks.getWithdrawEligibility.mockResolvedValue({
      allowed: false,
      code: 'at-show',
      reason: 'This entry is checked in at the show — ask the secretary to pull it.',
    });

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const pull = await screen.findByRole('button', { name: /pull/i });
    await waitFor(() => expect(pull).toBeDisabled());
    await userEvent.click(pull);

    expect(mocks.withdrawEntry).not.toHaveBeenCalled();
  });

  async function confirmPull() {
    await userEvent.click(await screen.findByRole('button', { name: /pull/i }));
    const confirm = await screen.findByRole('alertdialog');
    await userEvent.click(within(confirm).getByRole('button', { name: /pull entry/i }));
  }

  it('never shows the raw Postgres text or the row UUID on a server refusal', async () => {
    // The race the pre-check cannot close: a secretary marks the entry paid
    // between render and click, so the RPC refuses with its own message — which
    // names the row and is not a sentence for a person.
    mocks.withdrawEntry.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message:
          'Entry 22eb47a9-ce86-4906-8053-a224d37d1602 is paid; request a refund instead of withdrawing',
      },
    });

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
    await confirmPull();

    expect(await screen.findByText(/ask the secretary to pull it/i)).toBeInTheDocument();
    expect(screen.queryByText(/22eb47a9/)).not.toBeInTheDocument();
  });

  it('tells the exhibitor to reopen the entry after a version conflict', async () => {
    mocks.withdrawEntry.mockResolvedValue({
      data: null,
      error: {
        code: '40001',
        message: 'Version conflict withdrawing entry 22eb47a9-ce86-4906-8053-a224d37d1602',
      },
    });

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
    await confirmPull();

    expect(await screen.findByText(/reopen it and try again/i)).toBeInTheDocument();
    expect(screen.queryByText(/22eb47a9/)).not.toBeInTheDocument();
  });

  it('passes a typed pre-check refusal straight through', async () => {
    mocks.withdrawEntry.mockResolvedValue({
      data: null,
      error: {
        code: 'unavailable',
        message: "We couldn't reach the server — try withdrawing again when you're connected.",
      },
    });

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
    await confirmPull();

    expect(await screen.findByText(/when you're connected/i)).toBeInTheDocument();
  });

  it('does not bind a show manager to the exhibitor-only guards', async () => {
    render(
      <EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} asShowManager />
    );

    expect(await screen.findByRole('button', { name: /pull/i })).toBeEnabled();
    expect(mocks.getWithdrawEligibility).not.toHaveBeenCalled();
  });

  it('disables Pull while the eligibility check is still in flight', async () => {
    let resolveCheck: (value: { allowed: boolean }) => void = () => {};
    mocks.getWithdrawEligibility.mockReturnValue(
      new Promise(resolve => {
        resolveCheck = resolve;
      })
    );

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const pull = await screen.findByRole('button', { name: /pull/i });
    expect(pull).toBeDisabled();
    expect(screen.getByText(/checking whether this entry can be withdrawn/i)).toBeInTheDocument();

    resolveCheck({ allowed: true });
    await waitFor(() => expect(pull).toBeEnabled());
  });

  it('refuses rather than re-enabling Pull when the check itself fails', async () => {
    mocks.getWithdrawEligibility.mockRejectedValue(new Error('replica unavailable'));

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const pull = await screen.findByRole('button', { name: /pull/i });
    await waitFor(() =>
      expect(screen.getByText(/couldn't check this entry right now/i)).toBeInTheDocument()
    );
    expect(pull).toBeDisabled();
  });

  it('routes a manager pull through the manager tier', async () => {
    render(
      <EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} asShowManager />
    );

    await confirmPull();

    await waitFor(() =>
      expect(mocks.withdrawEntry).toHaveBeenCalledWith('class-1', { asShowManager: true })
    );
  });
});
