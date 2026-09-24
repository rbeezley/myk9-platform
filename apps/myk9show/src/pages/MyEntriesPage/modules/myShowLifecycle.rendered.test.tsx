/**
 * MYK9-624 — one lifecycle predicate for the My Shows rows, chip and stats.
 *
 * Every fixture starts from a RAW `entry_status` and goes through the same
 * three projections `useMyEntriesData` applies, then through the real
 * `groupEntriesByOrder` → `groupEntriesByShow` → `MyShowsList` pipeline. The
 * three symptoms pinned here all came from lifecycle classification living in
 * more than one place: the stats helpers read the LOSSY UI enum (which folds
 * `absent` onto PENDING), the chip fell back to the order's status when no
 * class was live, and nothing read a recorded `result_status = 'withdrawn'`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { getEntryStatusKindForDisplay } from '@/services/entryDisplay/entryDisplaySelectors';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import { EntryStatus } from '@/types/show-registration-types';
import { render } from '@/test/utils/testUtils';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { groupEntriesByShow } from './groupEntriesByShow';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import { countUpcomingClassesByDog, getPartiallyScoredState } from './myEntriesStats.helpers';
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
 * One raw row for Maple at one raw `entry_status`. `rowStatus` overrides the
 * ORDER-level projection only, which is how the all-withdrawn case reaches an
 * accepted order.
 */
function mapleRow(
  rowId: string,
  className: string,
  rawStatus: string,
  classOverrides: Partial<EntryClass> = {},
  rowStatus: Partial<Pick<MyEntry, 'entryStatus' | 'entryStatusKind'>> = {}
): MyEntry {
  const kind = getEntryStatusKindForDisplay(rawStatus, classOverrides.checkInStatus ?? null);
  return makeRow({
    id: rowId,
    registrationId: 'r-maple',
    dogId: 'dog-maple',
    dogName: 'Maple',
    armband: '12',
    entryStatus: mapEntryStatus(rawStatus),
    entryStatusKind: kind,
    ...rowStatus,
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

function scoredRow(): MyEntry {
  return mapleRow('maple-scored', 'Vehicle Advanced', 'confirmed', {
    isScored: true,
    resultStatus: 'qualified',
    searchTimeSeconds: 41.2,
    resultsReleasedAt: '2026-10-24T15:00:00Z',
  });
}

function dogCard(): HTMLElement {
  const card = screen.getByText('Maple').closest('li');
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

function rowFor(className: string): HTMLElement {
  const row = screen.getByText(className).closest('.myk9-entries-class-row');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

beforeEach(() => localStorage.clear());

describe('My Shows lifecycle — an absent class beside a scored one', () => {
  const rows = () => [mapleRow('maple-absent', 'Container Novice', 'absent'), scoredRow()];

  it('the precondition: the UI enum folds the absent row onto PENDING', () => {
    expect(mapEntryStatus('absent')).toBe(EntryStatus.PENDING);
  });

  it('rolls the chip up to Scored, never Partially scored', () => {
    renderRows(rows());

    expect(within(dogCard()).getByText('Scored')).toBeInTheDocument();
    expect(within(dogCard()).queryByText('Partially scored')).not.toBeInTheDocument();
  });

  it('leaves nothing remaining for the dog', () => {
    const orders = toOrders(rows());
    const [group] = groupEntriesByShow(orders);

    expect(getPartiallyScoredState(group!.dogs[0]!)).toBeUndefined();
    expect(countUpcomingClassesByDog(orders, NOW)['dog-maple']).toBe(0);
  });
});

describe('My Shows lifecycle — every class withdrawn on an accepted order', () => {
  const accepted = { entryStatus: EntryStatus.ACCEPTED, entryStatusKind: 'accepted' as const };

  it('reads a settled chip, not the order-level "Accepted"', () => {
    renderRows([
      mapleRow('maple-w1', 'Container Novice', 'withdrawn', {}, accepted),
      mapleRow('maple-w2', 'Vehicle Advanced', 'withdrawn', {}, accepted),
    ]);

    expect(within(dogCard()).getByText('Withdrawn')).toBeInTheDocument();
    expect(within(dogCard()).queryByText('Accepted')).not.toBeInTheDocument();
  });

  it('reads a pull as a pull when every class was pulled', () => {
    renderRows([
      mapleRow('maple-p1', 'Container Novice', 'scratched', {}, accepted),
      mapleRow('maple-p2', 'Vehicle Advanced', 'scratched', {}, accepted),
    ]);

    expect(within(dogCard()).getByText('Pulled')).toBeInTheDocument();
    expect(within(dogCard()).queryByText('Accepted')).not.toBeInTheDocument();
  });
});

describe('My Shows lifecycle — a result recorded as withdrawn', () => {
  it('renders the WD badge on an accepted entry', () => {
    renderRows([
      mapleRow('maple-wd', 'Container Novice', 'confirmed', { resultStatus: 'withdrawn' }),
      scoredRow(),
    ]);

    expect(rowFor('Container Novice')).toHaveTextContent('WD');
    expect(rowFor('Container Novice')).not.toHaveTextContent(/check in/i);
  });

  // The day button reads `isClassCheckInEligible`, a second reader of the
  // lifecycle: it must not offer to check a WD class in on its trial day.
  it('offers no day check-in for a WD class', () => {
    renderRows([
      mapleRow('maple-wd', 'Container Novice', 'confirmed', { resultStatus: 'withdrawn' }),
    ]);

    expect(
      within(dogCard()).queryByRole('button', { name: 'Check in Maple for Saturday' })
    ).toBeNull();
  });

  it('control — a live accepted class on its day does offer it', () => {
    renderRows([mapleRow('maple-live', 'Container Novice', 'confirmed')]);

    expect(
      within(dogCard()).getByRole('button', { name: 'Check in Maple for Saturday' })
    ).toBeInTheDocument();
  });

  // Codex round 1: a WD the judge recorded AS a result (`is_scored` true) is a
  // result, not a lifecycle withdrawal — the chip must agree with the row.
  it('keeps a SCORED WD result in the scored lifecycle', () => {
    renderRows([
      mapleRow('maple-wd-scored', 'Container Novice', 'confirmed', {
        resultStatus: 'withdrawn',
        isScored: true,
        resultsReleasedAt: '2026-10-24T15:00:00Z',
      }),
    ]);

    expect(within(dogCard()).getByText('Scored')).toBeInTheDocument();
    expect(within(dogCard()).queryByText('Withdrawn')).not.toBeInTheDocument();
  });
});
