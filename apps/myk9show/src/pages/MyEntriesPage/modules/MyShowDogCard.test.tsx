/**
 * Dog-card behaviour ported from the retired `MyEntryCard.test.tsx` (MYK9-482,
 * task 5.1): which rows may offer check-in, what a result row is allowed to
 * say before release, and the reveal.
 *
 * Rendered through `MyShowsList` rather than the card directly, so the fixtures
 * pass through the real `groupEntriesByOrder` → `groupEntriesByShow` pipeline
 * and a test can never assert against a group production would not build.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { render } from '@/test/utils/testUtils';
import { makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import type { EntryClass, MyEntry } from './my-entries-types';
import { PENDING_REVIEW_REASSURANCE } from './myShowsCopy';

function renderRows(rows: MyEntry[], overrides: Partial<MyShowsListProps> = {}) {
  const props: MyShowsListProps = {
    filteredEntries: toOrders(rows),
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
    ...overrides,
  };
  return render(<MyShowsList {...props} />);
}

/** One dog named Rex at the fixture show, carrying exactly these classes. */
function rexWith(classes: EntryClass[], overrides: Partial<MyEntry> = {}): MyEntry[] {
  return [
    makeRow({
      id: 'e-rex',
      registrationId: 'r-rex',
      dogId: 'dog-rex',
      dogName: 'Rex',
      armband: '10',
      classes,
      ...overrides,
    }),
  ];
}

/** Nothing on the card writes a check-in: no day button, no row link. */
function expectNoCheckInAnywhere() {
  expect(screen.queryByRole('button', { name: /^Check in for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Check in Rex for/ })).not.toBeInTheDocument();
}

beforeEach(() => localStorage.clear());

describe('MyShowDogCard — check-in is withheld from rows that cannot take one', () => {
  /**
   * MYK9-209, at the exact fixture shape the retired card test used: five rows
   * the secretary has already settled one way or another. Offering check-in on
   * any of them invites a write the RPC refuses and tells the exhibitor their
   * dog might still run.
   */
  it('offers no check-in on any settled production-shaped row', () => {
    renderRows(
      rexWith([
        makeClass({
          id: 'absent-entry',
          classId: 'absent-class',
          name: 'Absent Search',
          entryStatus: EntryStatus.ACCEPTED,
          checkInStatus: 'no-status',
          isScored: false,
          resultStatus: 'absent',
        }),
        makeClass({
          id: 'excused-entry',
          classId: 'excused-class',
          name: 'Excused Search',
          entryStatus: EntryStatus.ACCEPTED,
          checkInStatus: 'no-status',
          isScored: false,
          resultStatus: 'excused',
        }),
        makeClass({
          id: 'scratched-entry',
          classId: 'scratched-class',
          name: 'Scratched Search',
          entryStatus: EntryStatus.SCRATCHED,
          status: 'scratched',
          checkInStatus: 'no-status',
          isScored: false,
        }),
        makeClass({
          id: 'withdrawn-entry',
          classId: 'withdrawn-class',
          name: 'Withdrawn Search',
          entryStatus: EntryStatus.CANCELLED,
          checkInStatus: 'no-status',
          isScored: false,
        }),
        makeClass({
          id: 'pulled-entry',
          classId: 'pulled-class',
          name: 'Pulled Search',
          entryStatus: EntryStatus.ACCEPTED,
          checkInStatus: 'pulled',
          isScored: false,
        }),
      ])
    );

    expectNoCheckInAnywhere();
    // Each row still says what happened, so the missing control reads as
    // settled rather than broken.
    expect(screen.getByText('ABS')).toBeInTheDocument();
    expect(screen.getByText('EX')).toBeInTheDocument();
    expect(screen.getByText('pulled')).toBeInTheDocument();
  });

  it('keeps the live row’s check-in in a mixed settled order', () => {
    renderRows(
      rexWith([
        makeClass({
          id: 'absent-entry',
          classId: 'absent-class',
          name: 'Absent Search',
          entryStatus: EntryStatus.ACCEPTED,
          checkInStatus: 'no-status',
          isScored: false,
          resultStatus: 'absent',
        }),
        makeClass({
          id: 'live-entry',
          classId: 'live-class',
          name: 'Live Search',
          entryStatus: EntryStatus.ACCEPTED,
          checkInStatus: 'no-status',
          isScored: false,
        }),
      ])
    );

    expect(
      screen.queryByRole('button', { name: 'Check in Rex for Absent Search' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check in Rex for Live Search' })
    ).toBeInTheDocument();
  });

  it('offers no check-in for an unresolved placeholder row', () => {
    // `classId` is undefined for the SAME reason the cascade map is empty — the
    // class join has not replicated. `unresolved` must beat the "missing class
    // id defaults to open" rule, or a fake "Unknown Class" row gets a tappable
    // control before it is real.
    renderRows(
      rexWith([
        makeClass({
          id: 'placeholder-entry',
          classId: undefined,
          unresolved: true,
          name: 'Unknown Class',
          checkInStatus: 'no-status',
        }),
      ]),
      { selfCheckinByClassId: {} }
    );

    expectNoCheckInAnywhere();
  });

  it('offers no check-in for a completed-kind class with a legacy accepted status', () => {
    renderRows(
      rexWith(
        [
          makeClass({
            id: 'completed-entry',
            classId: 'completed-class',
            entryStatus: EntryStatus.ACCEPTED,
            entryStatusKind: 'completed',
            isScored: false,
          }),
        ],
        { entryStatus: EntryStatus.ACCEPTED, entryStatusKind: 'completed' }
      ),
      { selfCheckinByClassId: { 'completed-class': true } }
    );

    expectNoCheckInAnywhere();
  });

  it('offers no check-in once every class carries a result', () => {
    // The retired card resolved one "next action" and fell back to View Show
    // here. The dog-first card has no single next action — the equivalent
    // guarantee is that nothing on the card writes a check-in, while the show
    // header still offers the way out.
    renderRows(
      rexWith([makeClass({ id: 'scored-entry', isScored: true, resultStatus: 'qualified' })])
    );

    expectNoCheckInAnywhere();
    expect(screen.getByRole('link', { name: /View show/ })).toBeInTheDocument();
  });
});

describe('MyShowDogCard — a result says only what has been released (MYK9-263)', () => {
  const scored = (overrides: Partial<EntryClass> = {}) =>
    rexWith([
      makeClass({
        id: 'entry-1',
        isScored: true,
        resultStatus: 'qualified',
        finalPlacement: 2,
        searchTimeSeconds: 42.5,
        ...overrides,
      }),
    ]);

  it('labels the result preliminary and withholds the placement before release', () => {
    renderRows(scored());

    expect(screen.getByText('preliminary')).toBeInTheDocument();
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.queryByText('2nd')).not.toBeInTheDocument();
  });

  it('shows the placement and says nothing about "preliminary" once released', () => {
    renderRows(scored({ resultsReleasedAt: '2026-10-24T15:00:00Z' }));

    expect(screen.queryByText('preliminary')).not.toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('42.5s')).toBeInTheDocument();
  });

  it('shows no placement for an NQ row even when a placement value leaks through', () => {
    renderRows(
      scored({ resultStatus: 'nq', resultsReleasedAt: '2026-10-24T15:00:00Z', finalPlacement: 2 })
    );

    expect(screen.getByText('NQ')).toBeInTheDocument();
    expect(screen.queryByText('2nd')).not.toBeInTheDocument();
  });

  // 0 is the un-ranked DB default, not a placement. Rendering it produced
  // "0th"; the `>= 1` guard is what stops that, and `undefined` alone does not
  // exercise it.
  it('shows no placement for the 0 default rather than rendering "0th"', () => {
    renderRows(scored({ resultsReleasedAt: '2026-10-24T15:00:00Z', finalPlacement: 0 }));

    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.queryByText('0th')).not.toBeInTheDocument();
  });

  it('shows no placement for a qualifying row that has not been ranked', () => {
    renderRows(scored({ resultsReleasedAt: '2026-10-24T15:00:00Z', finalPlacement: undefined }));

    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+(st|nd|rd|th)$/)).not.toBeInTheDocument();
  });
});

describe('MyShowDogCard — the result reveal', () => {
  const released = makeClass({
    id: 'entry-1',
    isScored: true,
    resultStatus: 'qualified',
    finalPlacement: 1,
    resultsReleasedAt: '2026-09-14T20:00:00.000Z',
  });
  const RELEASE_KEY = 'entry-1:2026-09-14T20:00:00.000Z:qualified:1';

  it('offers "New result" for a release the exhibitor has not opened', () => {
    renderRows(rexWith([released]), { onResultRevealClick: vi.fn() });

    expect(screen.getByRole('button', { name: 'New result' })).toBeInTheDocument();
    // The reveal REPLACES the result, so nothing beside it spoils the moment.
    expect(screen.queryByText('1st')).not.toBeInTheDocument();
  });

  it('quiets to "Result card" once the release has been seen, carrying the same model', async () => {
    const user = userEvent.setup();
    const onResultRevealClick = vi.fn();
    renderRows(rexWith([released]), {
      onResultRevealClick,
      seenResultReleaseKeys: new Set([RELEASE_KEY]),
    });

    expect(screen.queryByRole('button', { name: 'New result' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Result card' }));

    expect(onResultRevealClick).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'entry-1', releaseKey: RELEASE_KEY })
    );
  });

  it('offers no reveal at all for a non-qualifying result', () => {
    renderRows(
      rexWith([
        makeClass({
          id: 'entry-1',
          isScored: true,
          resultStatus: 'nq',
          resultsReleasedAt: '2026-09-14T20:00:00.000Z',
        }),
      ]),
      { onResultRevealClick: vi.fn() }
    );

    expect(screen.queryByRole('button', { name: 'New result' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Result card' })).not.toBeInTheDocument();
  });
});

describe('MyShowDogCard — the pending-review reassurance', () => {
  it('says nothing to a dog whose entry is already accepted and paid', () => {
    renderRows(
      rexWith([makeClass({ id: 'c-rex-1' })], {
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
      })
    );

    expect(screen.queryByText(PENDING_REVIEW_REASSURANCE)).not.toBeInTheDocument();
  });
});
