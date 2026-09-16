/**
 * MYK9-582 — a dog card that mixes a withdrawn class with a live one.
 *
 * Rendered through `MyShowsList` so the fixtures pass through the real
 * `groupEntriesByOrder` → `groupEntriesByShow` pipeline: a withdrawn class and
 * a live class for the same dog arrive as TWO raw rows (production emits one
 * row per class per dog), which is the only way the dog-level fold is exercised
 * honestly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { EntryStatus } from '@/types/show-registration-types';
import { render } from '@/test/utils/testUtils';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import type { EntryClass, MyEntry } from './my-entries-types';

function renderRows(rows: MyEntry[]) {
  const props: MyShowsListProps = {
    filteredEntries: toOrders(rows),
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
  };
  return render(<MyShowsList {...props} />);
}

/**
 * The withdrawn half of Maple's enrollment: Container Novice, pulled.
 *
 * `classOverrides` exists so a test can set exactly ONE of the two fields
 * `lifecycleStatus` reads and still go through the real pipeline.
 */
function withdrawnRow(classOverrides: Partial<EntryClass> = {}): MyEntry {
  return makeRow({
    id: 'e-maple-withdrawn',
    registrationId: 'r-maple',
    dogId: 'dog-maple',
    dogName: 'Maple',
    armband: '12',
    entryStatus: EntryStatus.CANCELLED,
    entryStatusKind: 'withdrawn',
    classes: [
      makeClass({
        id: 'c-maple-withdrawn',
        classId: 'class-container-novice',
        name: 'Container Novice',
        status: 'scratched',
        entryStatus: EntryStatus.CANCELLED,
        entryStatusKind: 'withdrawn',
        ...classOverrides,
      }),
    ],
  });
}

/** The live half: Vehicle Advanced, still awaiting the secretary. */
function liveRow(): MyEntry {
  return makeRow({
    id: 'e-maple-live',
    registrationId: 'r-maple',
    dogId: 'dog-maple',
    dogName: 'Maple',
    armband: '12',
    entryStatus: EntryStatus.PENDING,
    entryStatusKind: 'pending',
    classes: [
      makeClass({
        id: 'c-maple-live',
        classId: 'class-vehicle-advanced',
        name: 'Vehicle Advanced',
        entryStatus: EntryStatus.PENDING,
        entryStatusKind: 'pending',
      }),
    ],
  });
}

/** The `.myk9-entries-class-row` that owns the named class. */
function rowFor(className: string): HTMLElement {
  const row = screen.getByText(className).closest('.myk9-entries-class-row');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

beforeEach(() => localStorage.clear());

describe('MyShowDogCard — a withdrawn class beside a live one (MYK9-582)', () => {
  it('marks only the withdrawn row, in the dialog’s vocabulary', () => {
    renderRows([withdrawnRow(), liveRow()]);

    expect(rowFor('Container Novice')).toHaveTextContent('Pulled');
    expect(rowFor('Vehicle Advanced')).not.toHaveTextContent('Pulled');
  });

  it('reads the dog-level status off the live entry only', () => {
    renderRows([withdrawnRow(), liveRow()]);

    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn')).not.toBeInTheDocument();
  });

  it('control — every class withdrawn keeps the dog-level withdrawn chip and marks both rows', () => {
    renderRows([withdrawnRow()]);

    expect(rowFor('Container Novice')).toHaveTextContent('Pulled');
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
    expect(screen.queryByText('Pending review')).not.toBeInTheDocument();
  });

  // Each of these sets exactly one of the two fields the predicate reads, so
  // deleting either half of the fallback turns one of them red.
  it('marks a row carrying only the canonical withdrawn entryStatus', () => {
    renderRows([withdrawnRow({ status: 'entered' }), liveRow()]);

    expect(rowFor('Container Novice')).toHaveTextContent('Pulled');
  });

  it('marks a row carrying only the lossy scratched participation value', () => {
    renderRows([withdrawnRow({ entryStatus: undefined, entryStatusKind: undefined }), liveRow()]);

    expect(rowFor('Container Novice')).toHaveTextContent('Pulled');
  });

  it('reads a move-up source row as moved rather than pulled', () => {
    renderRows([
      withdrawnRow({
        entryStatus: EntryStatus.MOVED,
        entryStatusKind: 'moved',
        status: 'entered',
      }),
      liveRow(),
    ]);

    const row = rowFor('Container Novice');
    expect(row).toHaveTextContent('moved');
    expect(row).not.toHaveTextContent('Pulled');
  });

  // The probe from review round 1: a withdrawn row keeps the check-in state it
  // had when it was pulled from the running order, and that stale value drove
  // the whole dog chip to "Pulled" while the live class was still pending.
  it('keeps a withdrawn row\u2019s stale check-in state out of the dog chip', () => {
    renderRows([withdrawnRow({ checkInStatus: 'pulled' }), liveRow()]);

    expect(rowFor('Container Novice')).toHaveTextContent('Pulled');
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    // Exactly one "Pulled" on the card: the row's. A second one is the dog
    // chip having believed the stale check-in state.
    expect(screen.getAllByText('Pulled')).toHaveLength(1);
  });

  it('control — an all-live card carries no withdrawn marker', () => {
    renderRows([liveRow()]);

    expect(rowFor('Vehicle Advanced')).not.toHaveTextContent('Pulled');
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });
});
