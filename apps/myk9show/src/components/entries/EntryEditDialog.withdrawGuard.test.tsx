/**
 * MYK9-535: the leave-this-class affordance must not offer an act the server
 * will refuse, and a refusal must be visible.
 *
 * MYK9-632 widened it: the row now opens a CHOOSER (Withdraw vs Pull) and the
 * eligibility batch answers both. The row-level affordance is offered while
 * EITHER act is available — a paid entry may be pulled but not withdrawn, and
 * hiding the row button would take away the pull the exhibitor is entitled to.
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
  getRemoveFromClassEligibilityForEntries: vi.fn(),
  getTrialsByShow: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  canModifyEntry: mocks.canModifyEntry,
  updateEntryDetails: mocks.updateEntryDetails,
  updateEntryHandler: mocks.updateEntryHandler,
  withdrawEntry: mocks.withdrawEntry,
}));

vi.mock('@/services/database/entries/withdrawOwnEntry', () => ({
  getRemoveFromClassEligibilityForEntries: mocks.getRemoveFromClassEligibilityForEntries,
}));

// The chooser reads the show's registry to know which withdrawal reasons exist.
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: mocks.getTrialsByShow },
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
  mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1', registryId: 'AKC' }]);
  // The hook now asks for the whole card in one call; answer every id it asks
  // for, with BOTH verdicts (MYK9-632).
  mocks.getRemoveFromClassEligibilityForEntries.mockImplementation(async (ids: string[]) =>
    Object.fromEntries(
      ids.map(id => [id, { withdraw: { allowed: true }, pull: { allowed: true } }])
    )
  );
});

/** Both verdicts set to the same refusal — the pre-MYK9-632 "nothing is possible" case. */
const bothRefused =
  (verdict: { allowed: boolean; code?: string; reason?: string }) => async (ids: string[]) =>
    Object.fromEntries(ids.map(id => [id, { withdraw: verdict, pull: verdict }]));

describe('EntryEditDialog — MYK9-535 withdraw guard', () => {
  it('asks for the whole card in ONE call, not one per class row', async () => {
    // A card groups by registration_id, so a multi-dog order is routinely 20-40
    // rows; per-row reads would be that many round trips on every open.
    const twoClasses = {
      ...entry,
      classes: [
        entry.classes[0]!,
        { ...entry.classes[0]!, id: 'class-2', name: 'Interior Novice A' },
      ],
    };

    render(<EntryEditDialog open entry={twoClasses} onOpenChange={noop} onUpdate={noop} />);

    await waitFor(() =>
      expect(mocks.getRemoveFromClassEligibilityForEntries).toHaveBeenCalledTimes(1)
    );
    expect(mocks.getRemoveFromClassEligibilityForEntries).toHaveBeenCalledWith([
      'class-1',
      'class-2',
    ]);
  });

  it('refuses a row the batch did not answer', async () => {
    // An unanswered id must never fall through to "allowed".
    mocks.getRemoveFromClassEligibilityForEntries.mockResolvedValue({});

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const pull = await screen.findByRole('button', { name: /withdraw or pull/i });
    await waitFor(() => expect(pull).toBeDisabled());
  });

  it('leaves the affordance enabled for an unpaid, pre-show entry', async () => {
    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    expect(await screen.findByRole('button', { name: /withdraw or pull/i })).toBeEnabled();
  });

  // MYK9-632: the chooser greys ONE act when only that one is refused. The money
  // arm no longer does that (a paid entry is both withdrawable and pullable), so
  // this pins the mechanism on a refusal that still splits them.
  it('greys only the act the verdict refuses', async () => {
    mocks.getRemoveFromClassEligibilityForEntries.mockImplementation(async (ids: string[]) =>
      Object.fromEntries(
        ids.map(id => [
          id,
          {
            withdraw: {
              allowed: false,
              code: 'status',
              reason: 'This entry can no longer be withdrawn (status: completed).',
            },
            pull: { allowed: true },
          },
        ])
      )
    );

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const leave = await screen.findByRole('button', { name: /withdraw or pull/i });
    await waitFor(() => expect(leave).toBeEnabled());
    await userEvent.click(leave);

    const chooser = await screen.findByRole('alertdialog');
    expect(within(chooser).getByRole('button', { name: /^withdraw$/i })).toBeDisabled();
    expect(within(chooser).getByRole('button', { name: /^pull$/i })).toBeEnabled();
    expect(
      within(chooser).getByText(/can no longer be withdrawn \(status: completed\)/i)
    ).toBeInTheDocument();
  });

  it('never calls the withdraw path for a refused entry', async () => {
    mocks.getRemoveFromClassEligibilityForEntries.mockImplementation(
      bothRefused({
        allowed: false,
        code: 'at-show',
        reason: 'This entry is checked in at the show — ask the secretary to pull it.',
      })
    );

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const pull = await screen.findByRole('button', { name: /withdraw or pull/i });
    await waitFor(() => expect(pull).toBeDisabled());
    await userEvent.click(pull);

    expect(mocks.withdrawEntry).not.toHaveBeenCalled();
  });

  /** Row affordance -> chooser -> Pull -> confirm. */
  async function confirmPull() {
    await userEvent.click(await screen.findByRole('button', { name: /withdraw or pull/i }));
    const chooser = await screen.findByRole('alertdialog');
    await userEvent.click(within(chooser).getByRole('button', { name: /^pull$/i }));
    await userEvent.click(within(chooser).getByRole('button', { name: /pull entry/i }));
  }

  /** Row affordance -> chooser -> Withdraw -> reason -> confirm. */
  async function confirmWithdraw(reasonLabel: RegExp) {
    await userEvent.click(await screen.findByRole('button', { name: /withdraw or pull/i }));
    const chooser = await screen.findByRole('alertdialog');
    await userEvent.click(within(chooser).getByRole('button', { name: /^withdraw$/i }));
    await userEvent.click(within(chooser).getByRole('button', { name: reasonLabel }));
    await userEvent.click(within(chooser).getByRole('button', { name: /withdraw entry/i }));
  }

  it('never shows the raw Postgres text or the row UUID on a server refusal', async () => {
    // The race the pre-check cannot close: someone checks the dog in between
    // render and click, so the RPC refuses with its own message — which names
    // the row and is not a sentence for a person.
    mocks.withdrawEntry.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message:
          'Entry 22eb47a9-ce86-4906-8053-a224d37d1602 is checked in at the show and cannot be withdrawn',
      },
    });

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
    await confirmPull();

    expect(await screen.findByText(/show secretary/i)).toBeInTheDocument();
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

    expect(await screen.findByRole('button', { name: /withdraw or pull/i })).toBeEnabled();
    expect(mocks.getRemoveFromClassEligibilityForEntries).not.toHaveBeenCalled();
  });

  it('disables the affordance while the eligibility check is still in flight', async () => {
    let resolveCheck: (
      value: Record<string, { withdraw: { allowed: boolean }; pull: { allowed: boolean } }>
    ) => void = () => {};
    mocks.getRemoveFromClassEligibilityForEntries.mockReturnValue(
      new Promise(resolve => {
        resolveCheck = resolve;
      })
    );

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const pull = await screen.findByRole('button', { name: /withdraw or pull/i });
    expect(pull).toBeDisabled();
    expect(screen.getByText(/checking whether this entry can be withdrawn/i)).toBeInTheDocument();

    resolveCheck({ 'class-1': { withdraw: { allowed: true }, pull: { allowed: true } } });
    await waitFor(() => expect(pull).toBeEnabled());
  });

  it('refuses rather than re-enabling the affordance when the check itself fails', async () => {
    mocks.getRemoveFromClassEligibilityForEntries.mockRejectedValue(
      new Error('replica unavailable')
    );

    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);

    const pull = await screen.findByRole('button', { name: /withdraw or pull/i });
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
      expect(mocks.withdrawEntry).toHaveBeenCalledWith('class-1', {
        asShowManager: true,
        kind: 'pull',
        reason: null,
      })
    );
  });

  // MYK9-632, the defect itself: the exhibitor clicked "Pull", was told the fee
  // would not be refunded, and the entry was stored as WITHDRAWN. These pin the
  // exact value each act sends.
  it('sends kind=pull with NO reason when the exhibitor pulls', async () => {
    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
    await confirmPull();

    await waitFor(() =>
      expect(mocks.withdrawEntry).toHaveBeenCalledWith('class-1', {
        asShowManager: false,
        kind: 'pull',
        reason: null,
      })
    );
  });

  it('sends kind=withdraw with the reason the exhibitor picked', async () => {
    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
    await confirmWithdraw(/judge change/i);

    await waitFor(() =>
      expect(mocks.withdrawEntry).toHaveBeenCalledWith('class-1', {
        asShowManager: false,
        kind: 'withdraw',
        reason: 'judge_change',
      })
    );
  });

  it('never promises a pull will not be refunded', async () => {
    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
    await userEvent.click(await screen.findByRole('button', { name: /withdraw or pull/i }));

    const chooser = await screen.findByRole('alertdialog');
    expect(within(chooser).queryByText(/will not be refunded/i)).not.toBeInTheDocument();
    expect(within(chooser).getAllByText(/club's discretion/i).length).toBeGreaterThan(0);
  });

  // MYK9-632 P2: the confirm step used to assert an entitlement nothing checks
  // ("fully refunded", "the club refunds in full"). The app holds neither the
  // premium nor the AKC 30-minute clock, so it says who decides, not what.
  it('never states a refund AMOUNT on any step, and names who confirms it', async () => {
    render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
    await userEvent.click(await screen.findByRole('button', { name: /withdraw or pull/i }));

    const chooser = await screen.findByRole('alertdialog');
    const forbidden = /fully refunded|refunds in full|full refund|50%/i;
    expect(chooser.textContent ?? '').not.toMatch(forbidden);
    expect(
      within(chooser).getAllByText(
        /refund per the premium's rules; the show secretary confirms it/i
      ).length
    ).toBeGreaterThan(0);

    await userEvent.click(within(chooser).getByRole('button', { name: /^withdraw$/i }));
    expect(chooser.textContent ?? '').not.toMatch(forbidden);

    await userEvent.click(within(chooser).getByRole('button', { name: /judge change/i }));
    expect(chooser.textContent ?? '').not.toMatch(forbidden);
    expect(
      within(chooser).getByText(
        /your withdrawal is recorded\. the show secretary confirms the refund under the premium's rules/i
      )
    ).toBeInTheDocument();
  });
});
