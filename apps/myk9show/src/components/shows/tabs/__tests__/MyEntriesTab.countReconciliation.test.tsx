/**
 * MYK9-387 — the show page stated the exhibitor's entry count three ways.
 *
 * One fixture, both on-screen figures, asserted together:
 *
 *  - the "My Entries" TAB BADGE, which ShowDetailsPage takes from
 *    `buildSubmittedEntryProjection(...).historyCount` — every entry the
 *    exhibitor holds in this show, terminal states included, minus dead
 *    move-up SOURCE rows (the one exclusion the reporter could not identify:
 *    486 rows − 1 superseded `moved` source = 485).
 *  - the RUN SCHEDULE HEADER, which `useShowEntriesForUser` derives with
 *    `isRunnableScheduleStatus` — the same set minus withdrawn, scratched,
 *    not-accepted (which is where `promotion-expired` folds) and moved rows.
 *
 * The two legitimately measure DIFFERENT sets, so the fix is labelling, not a
 * single number: the header now says "scheduled runs" and states the remainder
 * outright. What must never diverge is the *history* set the two derivations
 * share, so this file also pins `allEntries.length === historyCount` — the hook
 * and the page projection each implement move-up suppression, and this is the
 * assertion that fails if either one drifts.
 *
 * Both figures come from the real hook / real projection here: nothing that
 * decides an inclusion rule is mocked, so flipping a rule fails this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';

vi.mock('@/store/entryStore', () => ({ useEntryStore: vi.fn() }));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: vi.fn() }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: vi.fn() }));
vi.mock('@/hooks/useShowStoreCompat', () => ({ useShowStoreCompat: vi.fn() }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@/components/shows/tabs/WhereToBe', () => ({
  WhereToBe: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="where-to-be">{entries.length}</div>
  ),
}));
vi.mock('@/components/shows/tabs/DogEntriesSection', () => ({
  DogEntriesSection: ({ group }: { group: { dogName: string; entries: unknown[] } }) => (
    <div data-testid="dog-section" data-entry-count={String(group.entries.length)}>
      {group.dogName}
    </div>
  ),
}));

import { MyEntriesTab } from '../MyEntriesTab';
import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStoreCompat } from '@/hooks/useShowStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  buildSubmittedEntryProjection,
  toSubmittedEntryProjectionRow,
  type SubmittedEntryDbRow,
} from '@/features/exhibitor-entry/submittedEntryProjection';

const SHOW_ID = 'show-1';
const PERSON_ID = 'person-1';

function row(
  id: string,
  dogId: string,
  classId: string,
  entryStatus: string,
  extra: Partial<SubmittedEntryDbRow> = {}
): SubmittedEntryDbRow {
  return {
    id,
    show_id: SHOW_ID,
    dog_id: dogId,
    class_id: classId,
    entry_status: entryStatus,
    payment_status: 'paid',
    class: { name: `Class ${classId}` },
    dog: { call_name: dogId === 'dog-1' ? 'Maggie' : 'Daisy' },
    ...extra,
  };
}

/**
 * The shape MYK9-387 reported, in miniature: two runnable entries, one
 * withdrawn, one promotion-expired, and a move-up pair (dead source + live
 * destination) — plus a second dog so the dog counts differ from the row count.
 *
 *   history (tab badge)  : 5  (6 rows − 1 superseded `moved` source)
 *   run schedule (header): 3  (− withdrawn, − promotion-expired)
 *   schedule dog count   : 2
 */
const ROWS: SubmittedEntryDbRow[] = [
  row('e1', 'dog-1', 'class-1', 'confirmed'),
  row('e2', 'dog-1', 'class-2', 'withdrawn'),
  row('e3', 'dog-1', 'class-3', 'promotion-expired'),
  row('e4', 'dog-1', 'class-4', 'moved'),
  row('e5', 'dog-1', 'class-5', 'confirmed', {
    special_requests: 'Moved up from class class-4',
  }),
  row('e6', 'dog-2', 'class-6', 'confirmed'),
];

const EXPECTED_HISTORY_COUNT = 5;
const EXPECTED_SCHEDULED_RUNS = 3;
const EXPECTED_SCHEDULE_DOGS = 2;

function tabBadgeCount(): number {
  const projection = buildSubmittedEntryProjection({
    rows: ROWS.flatMap(r => {
      const projected = toSubmittedEntryProjectionRow(r);
      return projected ? [projected] : [];
    }),
    ownedDogIds: new Set(['dog-1', 'dog-2']),
    personId: PERSON_ID,
    state: 'ready',
  });
  return projection.historyCount;
}

function renderTab() {
  return render(<MyEntriesTab showId={SHOW_ID} canonicalEntries={ROWS} entryDataState="ready" />);
}

describe('show page entry counts reconcile (MYK9-387)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthContext).mockReturnValue(
      fromPartial({
        userWithRoles: { databaseUserId: PERSON_ID, scopes: [] },
        isAdmin: false,
        isSecretary: false,
        hasRole: () => false,
      })
    );
    vi.mocked(useEntryStore).mockImplementation(
      fromAny((selector: (s: unknown) => unknown) =>
        selector({ entries: [], isLoading: false, error: null, loadEntries: vi.fn() })
      )
    );
    vi.mocked(useClassStoreCompat).mockReturnValue(fromPartial({ classes: [] }));
    vi.mocked(useDogStoreCompat).mockReturnValue(fromPartial({ dogs: [] }));
    vi.mocked(useShowStoreCompat).mockReturnValue(
      fromPartial({ shows: [{ id: SHOW_ID, clubId: 'club-1' }] })
    );
  });

  it('counts the tab badge as every entry the exhibitor holds, minus the dead move-up source', () => {
    expect(tabBadgeCount()).toBe(EXPECTED_HISTORY_COUNT);
  });

  it('states the run-schedule figure in RUNS, not classes, and names the remainder', () => {
    renderTab();

    expect(
      screen.getByText(
        new RegExp(
          `${EXPECTED_SCHEDULED_RUNS} scheduled runs across ${EXPECTED_SCHEDULE_DOGS} dogs`
        )
      )
    ).toBeInTheDocument();
    // The gap between the two figures is stated, not left to be inferred.
    expect(
      screen.getByText(/2 other entries \(withdrawn, scratched, moved up, or expired\)/)
    ).toBeInTheDocument();
    // The old wording called these "classes", which read as a contradiction of
    // the tab badge. It must not come back.
    expect(screen.queryByText(/scheduled runs.*classes across/)).toBeNull();
  });

  it('keeps the history set the two figures share identical', () => {
    renderTab();

    // WhereToBe receives the schedule set; the dog sections carry the history
    // set, which is exactly what the tab badge counts. The hook and the page
    // projection implement move-up suppression separately — if either drifts,
    // these two numbers stop matching and this assertion fails.
    expect(screen.getByTestId('where-to-be')).toHaveTextContent(String(EXPECTED_SCHEDULED_RUNS));
    const renderedHistoryCount = screen
      .getAllByTestId('dog-section')
      .reduce((total, node) => total + Number(node.getAttribute('data-entry-count')), 0);
    expect(renderedHistoryCount).toBe(tabBadgeCount());
    expect(renderedHistoryCount).toBe(EXPECTED_HISTORY_COUNT);
    expect(EXPECTED_HISTORY_COUNT).toBeGreaterThan(EXPECTED_SCHEDULED_RUNS);
  });
});
