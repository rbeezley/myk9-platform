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
 * carrying `withdrawalReasonCode` the way both producers now put it there —
 * straight off the replicated/view row, no read of its own.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';

const mocks = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
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

// The sheet must reach `entries` for the reason NOT AT ALL — the row carries it.
// A spy on the shared client is the only way to assert the absence of a read
// that no longer has a module of its own to mock.
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mocks.supabaseFrom },
  createDatabaseError: (error: unknown) => error,
  logQuery: () => {},
}));

const noop = () => {};

/** One class row exactly as the two producers build it from a stored row. */
function rowFromStoredStatus(
  storedStatus: string,
  id = 'class-1',
  withdrawalReasonCode: string | null | undefined = undefined
) {
  return {
    id,
    name: 'Container Novice A',
    number: '101',
    fee: 30,
    trialType: 'Scent Work',
    status: mapClassEntryStatus(storedStatus),
    withdrawalReasonCode,
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
    Object.fromEntries(
      ids.map(id => [id, { withdraw: { allowed: true }, pull: { allowed: true } }])
    )
  );
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
    render(
      <EntryEditDialog
        open
        entry={entryWith(rowFromStoredStatus('withdrawn', 'class-1', 'in_season'))}
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
    render(
      <EntryEditDialog
        open
        entry={entryWith(
          rowFromStoredStatus('withdrawn', 'class-1', 'in_season'),
          rowFromStoredStatus('scratched', 'class-2')
        )}
        onOpenChange={noop}
        onUpdate={noop}
      />
    );

    expect(await screen.findByText('Withdrawn · Dog in season')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
  });

  // The reason arrives ON THE ROW. A withdrawal whose code has not reached the
  // client (a replica cached before migration 20260918041700, or a secretary
  // Decline, which records no reason at all) must still read "Withdrawn" — the
  // bare word is the honest answer, and it is never "Pulled".
  it('renders the bare word when the row carries no reason code', async () => {
    render(
      <EntryEditDialog
        open
        entry={entryWith(rowFromStoredStatus('withdrawn'))}
        onOpenChange={noop}
        onUpdate={noop}
      />
    );

    expect(await screen.findByText('Withdrawn')).toBeInTheDocument();
    expect(screen.queryByText(/Withdrawn ·/)).not.toBeInTheDocument();
    expect(screen.queryByText('Pulled')).not.toBeInTheDocument();
  });

  // The whole point of reading the reason off the row: the sheet adds no read of
  // its own. `entries` is where the code lives, and the ONLY thing that may
  // touch it here is the eligibility batch the sheet already made.
  it('issues no read of its own for the reason', async () => {
    render(
      <EntryEditDialog
        open
        entry={entryWith(rowFromStoredStatus('withdrawn', 'class-1', 'in_season'))}
        onOpenChange={noop}
        onUpdate={noop}
      />
    );

    expect(await screen.findByText('Withdrawn · Dog in season')).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.getRemoveFromClassEligibilityForEntries).toHaveBeenCalledTimes(1)
    );
    // Positive control for the negative assertion: prove the spy IS the `from`
    // the app code would have reached for, so "never called" means "never read",
    // not "never wired".
    const { supabase } = await import('@/services/database/supabaseClient');
    expect(supabase.from).toBe(mocks.supabaseFrom);
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
  });
});
