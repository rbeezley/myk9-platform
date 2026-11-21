/**
 * MYK9-2137: each My Shows class row links to the same read-only Requirements view Ringside's
 * class card opens, with the time limit and when it was set. It reads the class from this
 * device's replica, so it works before show day when Ringside is closed to exhibitors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { makeClass, day, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList } from './MyShowsList';
import type { EntryClass, MyEntry } from './my-entries-types';

const replica = vi.hoisted(() => ({
  getClassById: vi.fn(),
  getTrialById: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById: replica.getClassById, subscribe: vi.fn(() => vi.fn()) },
  replicatedTrialsTable: { getTrialById: replica.getTrialById },
}));

const LIVE_CLASS = {
  id: 'class-1',
  trialId: 'trial-1',
  element: 'Container',
  level: 'Novice',
  areaCount: 1,
  timeLimitSeconds: 120,
  timeLimitSetAt: '2024-10-20T18:14:00Z',
};

function renderRow(classes: EntryClass[]) {
  const rows: MyEntry[] = [makeRow({ classes })];
  return render(
    <MyShowsList
      filteredEntries={toOrders(rows)}
      source="confirmed"
      seenResultReleaseKeys={new Set<string>()}
      now={NOW}
      onCheckInDay={vi.fn()}
      onOpenCheckIn={vi.fn()}
      onOpenEdit={vi.fn()}
      onOpenReceipts={vi.fn()}
      onLeaveClass={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  replica.getClassById.mockResolvedValue(LIVE_CLASS);
  replica.getTrialById.mockResolvedValue({ id: 'trial-1', registryId: 'AKC' });
});

describe('My Shows class row Requirements link (MYK9-2137)', () => {
  it('opens the read-only Requirements view with the time limit and when it was set', async () => {
    renderRow([makeClass()]);
    await userEvent.click(
      screen.getByRole('button', { name: 'Requirements for Container Novice A' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(replica.getClassById).toHaveBeenCalledWith('class-1');
    expect(await within(dialog).findByText(/^2:00/)).toBeInTheDocument();
    expect(within(dialog).getByText(/set Oct 20, 2024/)).toBeInTheDocument();
    // Read-only: nothing here sets the time.
    expect(within(dialog).queryByRole('button', { name: /set max time/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Tap to set/)).not.toBeInTheDocument();
    // The entry count is unknown here, so it is not claimed.
    expect(within(dialog).queryByText(/entr(y|ies)/)).not.toBeInTheDocument();
  });

  it('offers no link on a row whose class has not replicated yet', () => {
    renderRow([makeClass({ unresolved: true })]);
    expect(screen.queryByRole('button', { name: /^Requirements for/ })).not.toBeInTheDocument();
  });

  it('reads "Requirements", capitalized like the other row verbs', () => {
    renderRow([makeClass()]);
    expect(
      screen.getByRole('button', { name: 'Requirements for Container Novice A' })
    ).toHaveTextContent(/^Requirements$/);
  });

  it('puts no separator glyph in the actions line, so no wrapped line starts or ends on one', () => {
    renderRow([makeClass({ trialDate: day('2026-10-24') })]);
    const link = screen.getByRole('button', { name: 'Requirements for Container Novice A' });
    const state = link.closest('.myk9-entries-class-state') as HTMLElement;
    expect(state).not.toBeNull();
    expect(state.textContent).not.toContain('·');
  });
});
