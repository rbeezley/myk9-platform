/**
 * MYK9-632 follow-up: a row stored `entry_status='withdrawn'` must READ as a
 * withdrawal on a FRESH LOAD, not only in the session that performed it.
 *
 * The defect these pin: `mapClassEntryStatus` folded 'withdrawn' onto
 * 'scratched', so the class row on a reloaded Edit Entry sheet said "Pulled"
 * while the database, My Shows and Entry Management all said withdrawn. Pull
 * and Withdraw are different acts (they differ on refund) — the word "Pulled"
 * may only ever render for a stored 'scratched'.
 *
 * Rendered from the REAL prop shape the two producers build: a class row whose
 * `status` is exactly what `mapClassEntryStatus` returns for the stored value,
 * with the stored `withdrawal_reason_code` reaching the dialog the same way the
 * eligibility verdicts do.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';

const mocks = vi.hoisted(() => ({
  canModifyEntry: vi.fn(),
  updateEntryDetails: vi.fn(),
  updateEntryHandler: vi.fn(),
  withdrawEntry: vi.fn(),
  getRemoveFromClassEligibilityForEntries: vi.fn(),
  getWithdrawalReasonCodesForEntries: vi.fn(),
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

vi.mock('@/services/database/entries/withdrawalReasonCodes', () => ({
  getWithdrawalReasonCodesForEntries: mocks.getWithdrawalReasonCodesForEntries,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: mocks.getTrialsByShow },
}));

const noop = () => {};

/** One class row exactly as the two producers build it from a stored row. */
function rowFromStoredStatus(storedStatus: string, id = 'class-1') {
  return {
    id,
    name: 'Container Novice A',
    number: '101',
    fee: 30,
    trialType: 'Scent Work',
    status: mapClassEntryStatus(storedStatus),
  };
}

function entryWith(...classes: ReturnType<typeof rowFromStoredStatus>[]) {
  return {
    id: 'entry-1',
    showId: 'show-1',
    showName: 'Spring Trial',
    dogName: 'Ace',
    classes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canModifyEntry.mockResolvedValue({ canModify: true });
  mocks.updateEntryDetails.mockResolvedValue({ error: null });
  mocks.updateEntryHandler.mockResolvedValue({ error: null });
  mocks.withdrawEntry.mockResolvedValue({ error: null });
  mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1', registryId: 'AKC' }]);
  mocks.getRemoveFromClassEligibilityForEntries.mockImplementation(async (ids: string[]) =>
    Object.fromEntries(ids.map(id => [id, { withdraw: { allowed: true }, pull: { allowed: true } }]))
  );
  mocks.getWithdrawalReasonCodesForEntries.mockResolvedValue({});
});

describe('EntryEditDialog — a stored withdrawal survives a fresh load (MYK9-632)', () => {
  it('labels a stored withdrawal "Withdrawn", never "Pulled"', async () => {
    render(
      <EntryEditDialog
        open
        entry={entryWith(rowFromStoredStatus('withdrawn'))}
        onOpenChange={noop}
        onUpdate={noop}
      />
    );

    expect(await screen.findByText('Withdrawn')).toBeInTheDocument();
    expect(screen.queryByText('Pulled')).not.toBeInTheDocument();
  });

  it('shows the stored withdrawal reason beside the badge', async () => {
    mocks.getWithdrawalReasonCodesForEntries.mockResolvedValue({ 'class-1': 'in_season' });

    render(
      <EntryEditDialog
        open
        entry={entryWith(rowFromStoredStatus('withdrawn'))}
        onOpenChange={noop}
        onUpdate={noop}
      />
    );

    expect(await screen.findByText('Withdrawn · Dog in season')).toBeInTheDocument();
  });

  it('still labels a stored pull "Pulled"', async () => {
    render(
      <EntryEditDialog
        open
        entry={entryWith(rowFromStoredStatus('scratched'))}
        onOpenChange={noop}
        onUpdate={noop}
      />
    );

    expect(await screen.findByText('Pulled')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn')).not.toBeInTheDocument();
  });

  it('keeps the two acts apart on the same card', async () => {
    mocks.getWithdrawalReasonCodesForEntries.mockResolvedValue({ 'class-1': 'in_season' });

    render(
      <EntryEditDialog
        open
        entry={entryWith(
          rowFromStoredStatus('withdrawn'),
          rowFromStoredStatus('scratched', 'class-2')
        )}
        onOpenChange={noop}
        onUpdate={noop}
      />
    );

    expect(await screen.findByText('Withdrawn · Dog in season')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
  });

  it('asks for the whole card in ONE reason-code call', async () => {
    render(
      <EntryEditDialog
        open
        entry={entryWith(
          rowFromStoredStatus('withdrawn'),
          rowFromStoredStatus('scratched', 'class-2')
        )}
        onOpenChange={noop}
        onUpdate={noop}
      />
    );

    await waitFor(() => expect(mocks.getWithdrawalReasonCodesForEntries).toHaveBeenCalledTimes(1));
    expect(mocks.getWithdrawalReasonCodesForEntries).toHaveBeenCalledWith(['class-1', 'class-2']);
  });
});
