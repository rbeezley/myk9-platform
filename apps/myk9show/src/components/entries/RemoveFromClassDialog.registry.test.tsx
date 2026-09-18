/**
 * MYK9-632 round 4: the show's rulebook is learned ASYNCHRONOUSLY, and until it
 * is learned the app must not pretend to know it.
 *
 * The hook used to answer 'AKC' synchronously and again whenever the replicated
 * trials read failed or the show was absent from the replica, so "we do not know
 * yet" and "this is an AKC show" were the same value. ASCA has NO in-season
 * withdrawal — bitches in season may compete — which made both of the cases
 * below record a reason that registry does not have.
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
  mocks.getRemoveFromClassEligibilityForEntries.mockImplementation(async (ids: string[]) =>
    Object.fromEntries(
      ids.map(id => [id, { withdraw: { allowed: true }, pull: { allowed: true } }])
    )
  );
});

/** Open the chooser and hand back its dialog element. */
async function openChooser() {
  render(<EntryEditDialog open entry={entry} onOpenChange={noop} onUpdate={noop} />);
  const leave = await screen.findByRole('button', { name: /withdraw or pull/i });
  await waitFor(() => expect(leave).toBeEnabled());
  await userEvent.click(leave);
  return screen.findByRole('alertdialog');
}

describe('RemoveFromClassDialog — the registry is not guessed', () => {
  // Reproduction 1. The read resolves LATE: the exhibitor opens the chooser
  // while it is in flight, picks a reason from the list they are shown, and the
  // real registry lands underneath them.
  it('never carries an AKC-only reason into an ASCA show when the registry resolves late', async () => {
    let resolveTrials: (value: Array<{ id: string; registryId: string }>) => void = () => {};
    mocks.getTrialsByShow.mockReturnValue(
      new Promise(resolve => {
        resolveTrials = resolve;
      })
    );

    const chooser = await openChooser();

    // While resolving, Withdraw is CLOSED and says so. Pull does not need the
    // rulebook, so it stays open.
    const withdraw = within(chooser).getByRole('button', { name: /^withdraw$/i });
    expect(withdraw).toBeDisabled();
    expect(within(chooser).getByText(/checking the show's rules/i)).toBeInTheDocument();
    expect(within(chooser).getByRole('button', { name: /^pull$/i })).toBeEnabled();

    resolveTrials([{ id: 'trial-1', registryId: 'ASCA' }]);

    // ASCA recognises judge change ONLY. In Season must never appear.
    await waitFor(() =>
      expect(within(chooser).getByRole('button', { name: /^withdraw$/i })).toBeEnabled()
    );
    await userEvent.click(within(chooser).getByRole('button', { name: /^withdraw$/i }));
    expect(
      within(chooser).queryByRole('button', { name: /dog in season/i })
    ).not.toBeInTheDocument();
    expect(within(chooser).getByRole('button', { name: /judge change/i })).toBeInTheDocument();

    await userEvent.click(within(chooser).getByRole('button', { name: /judge change/i }));
    await userEvent.click(within(chooser).getByRole('button', { name: /withdraw entry/i }));

    await waitFor(() =>
      expect(mocks.withdrawEntry).toHaveBeenCalledWith('class-1', {
        asShowManager: false,
        kind: 'withdraw',
        reason: 'judge_change',
      })
    );
    expect(mocks.withdrawEntry).not.toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({ reason: 'in_season' })
    );
  });

  // Reproduction 2. The read NEVER resolves usefully — it throws, or the replica
  // does not hold the show. "Unknown" is not "AKC".
  it.each([
    ['the read throws', () => mocks.getTrialsByShow.mockRejectedValue(new Error('replica cold'))],
    ['the replica holds no trial', () => mocks.getTrialsByShow.mockResolvedValue([])],
    [
      'the trial names no configured registry',
      () => mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1', registryId: '  ' }]),
    ],
  ])('never offers In Season when %s', async (_label, arrange) => {
    arrange();

    const chooser = await openChooser();

    await waitFor(() =>
      expect(
        within(chooser).getByText(/can't confirm the show's rules right now/i)
      ).toBeInTheDocument()
    );
    expect(within(chooser).getByRole('button', { name: /^withdraw$/i })).toBeDisabled();
    expect(
      within(chooser).queryByRole('button', { name: /dog in season/i })
    ).not.toBeInTheDocument();

    // Pull is still available, and still says whose call the refund is.
    const pull = within(chooser).getByRole('button', { name: /^pull$/i });
    expect(pull).toBeEnabled();
    await userEvent.click(pull);
    await userEvent.click(within(chooser).getByRole('button', { name: /pull entry/i }));

    await waitFor(() =>
      expect(mocks.withdrawEntry).toHaveBeenCalledWith('class-1', {
        asShowManager: false,
        kind: 'pull',
        reason: null,
      })
    );
  });

  it('offers exactly the resolved registry’s reasons, and says which registry', async () => {
    mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1', registryId: 'UKC' }]);

    const chooser = await openChooser();

    await waitFor(() =>
      expect(within(chooser).getByRole('button', { name: /^withdraw$/i })).toBeEnabled()
    );
    await userEvent.click(within(chooser).getByRole('button', { name: /^withdraw$/i }));

    expect(within(chooser).getByText(/UKC recognises/)).toBeInTheDocument();
    expect(within(chooser).getByRole('button', { name: /dog in season/i })).toBeInTheDocument();
    expect(within(chooser).getByRole('button', { name: /judge change/i })).toBeInTheDocument();
    // UKC's own documentation requirement, not AKC's.
    expect(within(chooser).getByText(/veterinary certificate/i)).toBeInTheDocument();
  });

  // The confirm sentence used to fall back to a bare full stop when the reason
  // went missing, so a withdrawal could be confirmed with no reason on screen.
  // Round 4 made Back from ANY confirm go to the reason step, so Back from a
  // PULL confirm landed on "Why are you withdrawing?" with the reason list — and
  // with the registry resolving or unavailable, `policy` is null, so that step
  // rendered "undefined recognises these reasons" with no buttons at all.
  it('takes Back from a PULL confirm to the chooser, not the reason list', async () => {
    mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1', registryId: 'AKC' }]);

    const chooser = await openChooser();
    await userEvent.click(within(chooser).getByRole('button', { name: /^pull$/i }));
    expect(within(chooser).getByRole('button', { name: /pull entry/i })).toBeInTheDocument();

    await userEvent.click(within(chooser).getByRole('button', { name: /^back$/i }));

    expect(within(chooser).getByRole('button', { name: /^withdraw$/i })).toBeInTheDocument();
    expect(within(chooser).getByRole('button', { name: /^pull$/i })).toBeInTheDocument();
    expect(within(chooser).queryByText(/why are you withdrawing/i)).not.toBeInTheDocument();
    expect(within(chooser).queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it('takes Back from a WITHDRAW confirm to the reason list', async () => {
    mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1', registryId: 'AKC' }]);

    const chooser = await openChooser();
    await waitFor(() =>
      expect(within(chooser).getByRole('button', { name: /^withdraw$/i })).toBeEnabled()
    );
    await userEvent.click(within(chooser).getByRole('button', { name: /^withdraw$/i }));
    await userEvent.click(within(chooser).getByRole('button', { name: /dog in season/i }));
    expect(within(chooser).getByRole('button', { name: /withdraw entry/i })).toBeInTheDocument();

    await userEvent.click(within(chooser).getByRole('button', { name: /^back$/i }));

    expect(within(chooser).getByRole('button', { name: /dog in season/i })).toBeInTheDocument();
    expect(within(chooser).getByRole('button', { name: /judge change/i })).toBeInTheDocument();
  });

  it.each([
    ['resolving', () => mocks.getTrialsByShow.mockReturnValue(new Promise(() => {}))],
    ['unavailable', () => mocks.getTrialsByShow.mockRejectedValue(new Error('cold'))],
  ])('never renders a reason step while %s, even via Back', async (_label, arrange) => {
    arrange();

    const chooser = await openChooser();
    await userEvent.click(within(chooser).getByRole('button', { name: /^pull$/i }));
    await userEvent.click(within(chooser).getByRole('button', { name: /^back$/i }));

    // The chooser, never the dead-end reason step. (The chooser's own Withdraw
    // blurb says "a reason this show's registry recognises", so the absence is
    // asserted on the reason step's TITLE and its buttons, not on that word.)
    expect(within(chooser).getByRole('button', { name: /^pull$/i })).toBeEnabled();
    expect(within(chooser).getByRole('button', { name: /^withdraw$/i })).toBeInTheDocument();
    expect(within(chooser).queryByText(/why are you withdrawing/i)).not.toBeInTheDocument();
    expect(
      within(chooser).queryByRole('button', { name: /judge change/i })
    ).not.toBeInTheDocument();
    expect(chooser.textContent ?? '').not.toMatch(/undefined/i);
  });

  it('always names the chosen reason on the confirm step', async () => {
    mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1', registryId: 'AKC' }]);

    const chooser = await openChooser();
    await waitFor(() =>
      expect(within(chooser).getByRole('button', { name: /^withdraw$/i })).toBeEnabled()
    );
    await userEvent.click(within(chooser).getByRole('button', { name: /^withdraw$/i }));
    await userEvent.click(within(chooser).getByRole('button', { name: /dog in season/i }));

    expect(within(chooser).getByText(/because of: Dog in season/i)).toBeInTheDocument();
    expect(within(chooser).getByRole('button', { name: /withdraw entry/i })).toBeEnabled();
  });
});
