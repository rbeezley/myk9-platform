/**
 * MYK9-582 — how a dog card renders a class the show will not run.
 *
 * Rows are built from RAW `entry_status` strings through the same three
 * projections `useMyEntriesData` applies, then pushed through the real
 * `groupEntriesByOrder` → `groupEntriesByShow` pipeline. A mixed card arrives
 * as TWO raw rows, because production emits one row per class per dog, and
 * that is the only way the dog-level fold is exercised honestly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { getEntryStatusKindForDisplay } from '@/services/entryDisplay/entryDisplaySelectors';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import { render } from '@/test/utils/testUtils';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import type { EntryClass, MyEntry } from './my-entries-types';

function renderRows(rows: MyEntry[]) {
  const props: MyShowsListProps = {
    filteredEntries: toOrders(rows),
    source: 'confirmed',
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
    onLeaveClass: vi.fn(),
  };
  return render(<MyShowsList {...props} />);
}

/**
 * One raw row for Maple: one class at one raw `entry_status`, projected the way
 * `useMyEntriesData` projects it. The ROW's own status carries the same
 * projection, because in production a row is a single class.
 */
function mapleRow(
  rowId: string,
  className: string,
  rawStatus: string,
  classOverrides: Partial<EntryClass> = {}
): MyEntry {
  const checkInStatus = classOverrides.checkInStatus ?? null;
  const kind = getEntryStatusKindForDisplay(rawStatus, checkInStatus);
  return makeRow({
    id: rowId,
    registrationId: 'r-maple',
    dogId: 'dog-maple',
    dogName: 'Maple',
    armband: '12',
    entryStatus: mapEntryStatus(rawStatus),
    entryStatusKind: kind,
    classes: [
      makeClass({
        id: `c-${rowId}`,
        classId: `class-${rowId}`,
        name: className,
        entryStatus: mapEntryStatus(rawStatus),
        entryStatusKind: kind,
        status: mapClassEntryStatus(rawStatus),
        ...classOverrides,
      }),
    ],
  });
}

/** Container Novice, withdrawn by the exhibitor. */
function withdrawnRow(classOverrides: Partial<EntryClass> = {}): MyEntry {
  return mapleRow('maple-withdrawn', 'Container Novice', 'withdrawn', classOverrides);
}

/** Vehicle Advanced, still awaiting the secretary. */
function liveRow(): MyEntry {
  return mapleRow('maple-live', 'Vehicle Advanced', 'submitted');
}

/** The `.myk9-entries-class-row` that owns the named class. */
function rowFor(className: string): HTMLElement {
  const row = screen.getByText(className).closest('.myk9-entries-class-row');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

beforeEach(() => localStorage.clear());

describe('MyShowDogCard — a withdrawn class beside a live one (MYK9-582)', () => {
  it('marks only the withdrawn row', () => {
    renderRows([withdrawnRow(), liveRow()]);

    expect(rowFor('Container Novice')).toHaveTextContent('withdrawn');
    expect(rowFor('Vehicle Advanced')).not.toHaveTextContent('withdrawn');
  });

  it('reads the dog-level status off the live entry only', () => {
    renderRows([withdrawnRow(), liveRow()]);

    expect(screen.getByText('Pending review')).toBeInTheDocument();
    // The row's lowercase word is there; the chip's capitalised one is not.
    expect(screen.getByText('withdrawn')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn')).not.toBeInTheDocument();
  });

  it('control — every class withdrawn keeps the dog-level withdrawn chip', () => {
    renderRows([withdrawnRow()]);

    // The row's own word and the chip's, in the case each column uses.
    expect(rowFor('Container Novice')).toHaveTextContent('withdrawn');
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
    expect(screen.queryByText('Pending review')).not.toBeInTheDocument();
  });

  // MYK9-632: a stored 'scratched' is a PULL, and the rendered word is Pull —
  // never "Scratched", anywhere an exhibitor can read it.
  it('renders a stored scratched class as a pull, and never as "scratched"', () => {
    renderRows([mapleRow('maple-scratched', 'Container Novice', 'scratched'), liveRow()]);

    const row = rowFor('Container Novice');
    expect(row).toHaveTextContent('pulled');
    expect(row).not.toHaveTextContent(/scratch/i);
    expect(row).not.toHaveTextContent('withdrawn');
    expect(screen.queryByText(/scratch/i)).not.toBeInTheDocument();
  });

  it('control — an all-live card carries no withdrawn marker', () => {
    renderRows([liveRow()]);

    expect(rowFor('Vehicle Advanced')).not.toHaveTextContent('withdrawn');
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  // Round 2: the two states are byte-identical in the status grammar
  // (`complete` / `text-muted-foreground`), so a capitalisation difference was
  // the only thing telling them apart, and nothing announces that. They now
  // carry different words — and only the day-of row offers "change".
  it('tells a lifecycle withdrawal apart from a day-of pull on the same card', () => {
    renderRows([
      withdrawnRow(),
      mapleRow('maple-pulled', 'Buried Novice', 'confirmed', {
        checkInStatus: 'pulled',
      }),
    ]);

    expect(rowFor('Container Novice')).toHaveTextContent('withdrawn');
    const dayOf = rowFor('Buried Novice');
    expect(dayOf).toHaveTextContent('pulled');
    expect(dayOf).not.toHaveTextContent('withdrawn');
    expect(within(dayOf).getByRole('button', { name: /Change Maple/ })).toBeInTheDocument();
    expect(
      within(rowFor('Container Novice')).queryByRole('button', { name: /Change Maple/ })
    ).toBeNull();
  });

  it('reads a move-up source row as moved, not withdrawn', () => {
    renderRows([mapleRow('maple-moved', 'Container Novice', 'moved'), liveRow()]);

    const row = rowFor('Container Novice');
    expect(row).toHaveTextContent('moved');
    expect(row).not.toHaveTextContent('withdrawn');
  });

  it('reads a declined row as not accepted', () => {
    renderRows([mapleRow('maple-declined', 'Container Novice', 'not_accepted'), liveRow()]);

    const row = rowFor('Container Novice');
    expect(row).toHaveTextContent('not accepted');
    expect(row).not.toHaveTextContent('withdrawn');
  });

  // Owner decision: promotion-expired stays in the review lane. It classifies
  // as `not_accepted`, so a predicate reading the kind alone would decline it.
  it('leaves a promotion-expired row live rather than declining it', () => {
    renderRows([mapleRow('maple-promo', 'Container Novice', 'promotion-expired')]);

    const row = rowFor('Container Novice');
    expect(row).not.toHaveTextContent('not accepted');
    expect(row).not.toHaveTextContent('withdrawn');
  });

  // A terminal `entry_status='absent'` row projects onto the PENDING UI enum,
  // because that enum has no `absent` member. Reading the enum let it fall to
  // the day math and offer "check in with the secretary" on the trial day.
  it('does not offer the secretary to an absent row on its trial day', () => {
    renderRows([mapleRow('maple-absent', 'Container Novice', 'absent')]);

    expect(rowFor('Container Novice')).not.toHaveTextContent('check in with the secretary');
  });

  // Round 2 added a cancelled-show carve-out that sent every row of a cancelled
  // show — withdrawn ones included — back to the day math and the exact copy
  // this issue was filed against. Deleted in round 3: a settled row is settled.
  it('still settles a withdrawn row when the show is cancelled', () => {
    renderRows([withdrawnRow(), liveRow()].map(row => ({ ...row, isShowCancelled: true })));

    expect(rowFor('Container Novice')).not.toHaveTextContent('check in with the secretary');
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  // A withdrawn row keeps the check-in state it had when it was pulled from the
  // running order; that stale value drove the whole dog chip.
  it('keeps a withdrawn row’s stale check-in state out of the dog chip', () => {
    renderRows([withdrawnRow({ checkInStatus: 'pulled' }), liveRow()]);

    expect(rowFor('Container Novice')).toHaveTextContent('withdrawn');
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.queryByText('Pulled')).not.toBeInTheDocument();
    expect(screen.queryByText('pulled')).not.toBeInTheDocument();
  });
});
