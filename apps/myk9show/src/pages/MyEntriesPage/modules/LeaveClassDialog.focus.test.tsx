/**
 * MYK9-658 — where focus goes after leaving a class from the My Shows card.
 *
 * On success the row's "Leave class…" button unmounts with the row state it
 * belonged to, so the AlertDialog's own restore targets a removed node and
 * focus fell to `<body>`. The first fix anchored on `my-show-dog-${dogId}`,
 * which is DUPLICATED when one dog is entered in two shows (dogs merge by
 * `dogId` inside a group, and the page renders every group), so leaving a
 * class in the second show moved focus into the FIRST show's card.
 *
 * Everything here is the real thing: the real `MyShowsList` / `MyShowDogCard`
 * and the real `LeaveClassDialog`, wired the way the page wires them, with one
 * dog in two shows. Only the network edges are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList } from './MyShowsList';
import { LeaveClassDialog } from './LeaveClassDialog';
import type { LeaveClassDialogState, MyEntry } from './my-entries-types';

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

/** Maple, entered in one class at each of two shows. */
function mapleIn(showId: string, showName: string, rowId: string, className: string): MyEntry {
  return makeRow({
    id: rowId,
    registrationId: `reg-${rowId}`,
    showId,
    showName,
    dogId: 'dog-maple',
    dogName: 'Maple',
    entryStatusKind: 'accepted',
    classes: [makeClass({ id: `c-${rowId}`, classId: `class-${rowId}`, name: className })],
  });
}

const HEARTLAND = mapleIn('show-heartland', 'Heartland Scent Work Classic', 'e-a', 'Buried Novice');
const FALL = mapleIn('show-fall', 'Fall Classic', 'e-b', 'Interior Advanced');

/** The row as the refresh returns it once the pull has landed. */
function pulled(row: MyEntry): MyEntry {
  return {
    ...row,
    classes: row.classes.map(cls => ({
      ...cls,
      status: 'scratched' as const,
      entryStatusKind: 'scratched' as const,
    })),
  };
}

/** The page's wiring: the list opens the dialog, a success refreshes the rows. */
function Harness() {
  const [rows, setRows] = useState<MyEntry[]>([HEARTLAND, FALL]);
  const [dialog, setDialog] = useState<LeaveClassDialogState>({ open: false, target: null });
  return (
    <>
      <MyShowsList
        filteredEntries={toOrders(rows)}
        source="confirmed"
        seenResultReleaseKeys={new Set<string>()}
        now={NOW}
        onCheckInDay={vi.fn()}
        onOpenCheckIn={vi.fn()}
        onOpenEdit={vi.fn()}
        onOpenReceipts={vi.fn()}
        onLeaveClass={target => setDialog({ open: true, target })}
      />
      <LeaveClassDialog
        dialog={dialog}
        onClose={() => setDialog({ open: false, target: null })}
        onUpdate={() =>
          setRows(current =>
            current.map(row =>
              row.classes.some(cls => cls.id === dialog.target?.classId) ? pulled(row) : row
            )
          )
        }
      />
    </>
  );
}

/** Every rendered dog-card anchor, found by role in the markup, not by id. */
function anchors(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-dog-card-anchor]'));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.withdrawEntry.mockResolvedValue({ data: null, error: null });
  mocks.getRemoveFromClassEligibilityForEntries.mockImplementation(async (ids: string[]) =>
    Object.fromEntries(ids.map(id => [id, { withdraw: ALLOWED, pull: ALLOWED }]))
  );
  mocks.getTrialsByShow.mockResolvedValue([{ registryId: 'AKC' }]);
});

describe('Leaving a class keeps focus in THAT show (MYK9-658)', () => {
  it('renders one anchor per card, with no duplicate ids for one dog in two shows', () => {
    render(<Harness />);

    const ids = anchors().map(anchor => anchor.id);
    expect(ids).toHaveLength(2);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lands focus on the second show’s card after leaving its class', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const fall = screen.getByRole('region', { name: 'Fall Classic' });
    await user.click(within(fall).getByRole('button', { name: /^Leave class/ }));
    const dialog = within(await screen.findByRole('alertdialog'));
    await user.click(dialog.getByRole('button', { name: /^pull$/i }));
    await user.click(dialog.getByRole('button', { name: /pull entry/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    // The refresh has landed: the row reads pulled and its control is gone.
    await waitFor(() =>
      expect(within(fall).queryByRole('button', { name: /^Leave class/ })).toBeNull()
    );

    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(document.body);
    expect(active).toHaveAttribute('data-dog-card-anchor');
    expect(fall).toContainElement(active);
    expect(
      screen.getByRole('region', { name: 'Heartland Scent Work Classic' })
    ).not.toContainElement(active);
  });

  it('control — "Keep my entry" returns focus to the still-mounted control', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const fall = screen.getByRole('region', { name: 'Fall Classic' });
    const control = within(fall).getByRole('button', { name: /^Leave class/ });
    await user.click(control);
    const dialog = within(await screen.findByRole('alertdialog'));
    await user.click(dialog.getByRole('button', { name: /keep my entry/i }));

    await waitFor(() => expect(control).toHaveFocus());
    expect(mocks.withdrawEntry).not.toHaveBeenCalled();
  });
});
