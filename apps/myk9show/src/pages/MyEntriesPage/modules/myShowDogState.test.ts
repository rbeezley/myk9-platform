import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import { groupEntriesByShow, indexOrdersById } from './groupEntriesByShow';
import type { MyShowClass, MyShowDog } from './groupEntriesByShow';
import {
  ENTRY_STATUS_DESCRIPTORS,
  getStatusDescriptor,
} from '@/components/status/statusIconGrammar';
import { deriveClassRowState, deriveDogChip, type DogChipState } from './myShowDogState';
import type { DayCheckInContext } from './dayCheckIn';
import type { EntryClass, MyEntry } from './my-entries-types';

const SATURDAY = new Date('2026-10-24T00:00:00');
const SUNDAY = new Date('2026-10-25T00:00:00');
const PACIFIC = 'America/Los_Angeles';
/** 9am Saturday in Los Angeles. */
const SATURDAY_MORNING = new Date('2026-10-24T16:00:00Z');

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    entryStatus: EntryStatus.ACCEPTED,
    classId: 'class-1',
    name: 'Container Search',
    number: '101',
    fee: 25,
    status: 'entered',
    trialDate: SATURDAY,
    trialNumber: '1',
    trialTimezone: PACIFIC,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    ...overrides,
  };
}

function makeRow(classes: EntryClass[], overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Heartland Classic',
    showDate: SATURDAY,
    showEndDate: SUNDAY,
    location: { venue: 'Expo Hall', city: 'Portland', state: 'OR' },
    dogName: 'Rex',
    dogId: 'd1',
    armband: '10',
    classes,
    dogs: [],
    totalFee: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-09-01'),
    lastUpdated: new Date('2026-09-02'),
    ...overrides,
  };
}

function build(rows: MyEntry[], now = SATURDAY_MORNING) {
  const [showGroup] = groupEntriesByShow(groupEntriesByOrder(rows, now));
  return { group: showGroup, dog: showGroup.dogs[0], ordersById: indexOrdersById(showGroup) };
}

function rowCtx(
  ordersById: Record<string, MyEntry>,
  overrides: Partial<DayCheckInContext> = {}
): DayCheckInContext {
  return { now: SATURDAY_MORNING, ordersById, isPastShow: false, ...overrides };
}

/** Derive the state of one dog's first (or named) class row. */
function stateOf(rows: MyEntry[], overrides: Partial<DayCheckInContext> = {}, index = 0) {
  const { dog, ordersById } = build(rows, overrides.now ?? SATURDAY_MORNING);
  return deriveClassRowState(dog.classes[index] as MyShowClass, rowCtx(ordersById, overrides));
}

describe('deriveClassRowState', () => {
  it('reports a result before anything else, even with a check-in state', () => {
    expect(
      stateOf([makeRow([makeClass({ isScored: true, checkInStatus: 'checked-in' })])])
    ).toEqual({ kind: 'result' });
  });

  it('reports a settled-without-score run as absent', () => {
    expect(stateOf([makeRow([makeClass({ resultStatus: 'absent' })])])).toEqual({ kind: 'absent' });
  });

  it('reports in-ring from the check-in column', () => {
    expect(stateOf([makeRow([makeClass({ checkInStatus: 'in-ring' })])])).toEqual({
      kind: 'in-ring',
    });
  });

  it('reports in-ring from the entry status kind', () => {
    expect(stateOf([makeRow([makeClass({ entryStatusKind: 'in_ring' })])])).toEqual({
      kind: 'in-ring',
    });
  });

  // The production mapper sets `entryStatusKind` from the SAME column, and
  // `getEntryStatusKindForDisplay` collapses checked-in, at-gate and in-ring
  // into one `in_ring` kind. Reading the kind first therefore printed "in the
  // ring" over every checked-in and at-gate class and withheld its "change"
  // link — the check-in column has to win whenever it says anything.
  it.each([
    ['at-gate', 'at-gate'],
    ['come-to-gate', 'come-to-gate'],
    ['checked-in', 'checked-in'],
  ] as const)(
    'keeps the %s column over the collapsed in_ring kind the mapper sets beside it',
    (checkInStatus, kind) => {
      expect(
        stateOf([makeRow([makeClass({ checkInStatus, entryStatusKind: 'in_ring' })])])
      ).toEqual({ kind });
    }
  );

  it('reports at-gate', () => {
    expect(stateOf([makeRow([makeClass({ checkInStatus: 'at-gate' })])])).toEqual({
      kind: 'at-gate',
    });
  });

  it('reports come-to-gate', () => {
    expect(stateOf([makeRow([makeClass({ checkInStatus: 'come-to-gate' })])])).toEqual({
      kind: 'come-to-gate',
    });
  });

  it('reports conflict', () => {
    expect(stateOf([makeRow([makeClass({ checkInStatus: 'conflict' })])])).toEqual({
      kind: 'conflict',
    });
  });

  it('reports pulled', () => {
    expect(stateOf([makeRow([makeClass({ checkInStatus: 'pulled' })])])).toEqual({
      kind: 'pulled',
    });
  });

  it('reports checked-in', () => {
    expect(stateOf([makeRow([makeClass({ checkInStatus: 'checked-in' })])])).toEqual({
      kind: 'checked-in',
    });
  });

  it('offers check-in on the trial day for an accepted class with no state', () => {
    expect(stateOf([makeRow([makeClass()])])).toEqual({ kind: 'check-in-available' });
  });

  it("names the weekday a later day's class opens", () => {
    expect(stateOf([makeRow([makeClass({ trialDate: SUNDAY })])])).toEqual({
      kind: 'opens-later',
      weekday: 'Sunday',
    });
  });

  it("names the trial's own weekday the night before, in the trial's zone", () => {
    // 11pm Friday in Los Angeles — Saturday's classes have not opened yet.
    expect(stateOf([makeRow([makeClass()])], { now: new Date('2026-10-24T06:00:00Z') })).toEqual({
      kind: 'opens-later',
      weekday: 'Saturday',
    });
  });

  it('sends the exhibitor to the secretary when self-check-in is closed on the trial day', () => {
    // NOT "opens Saturday" — it is Saturday. The secretary owns check-in now.
    expect(
      stateOf([makeRow([makeClass()])], { selfCheckinByClassId: { 'class-1': false } })
    ).toEqual({ kind: 'closed-today' });
  });

  it('keeps "opens <weekday>" for a closed class whose day is still ahead', () => {
    expect(
      stateOf([makeRow([makeClass({ trialDate: SUNDAY })])], {
        selfCheckinByClassId: { 'class-1': false },
      })
    ).toEqual({ kind: 'opens-later', weekday: 'Sunday' });
  });

  it('reads not-run once the show is past with no result and no state', () => {
    expect(stateOf([makeRow([makeClass()])], { isPastShow: true })).toEqual({ kind: 'not-run' });
  });

  it('reads not-run for a class whose own trial day has passed mid-show', () => {
    // Sunday morning of a Saturday-Sunday show; Saturday's class never ran.
    expect(stateOf([makeRow([makeClass()])], { now: new Date('2026-10-25T16:00:00Z') })).toEqual({
      kind: 'not-run',
    });
  });

  it('offers no control for a cancelled show', () => {
    expect(stateOf([makeRow([makeClass()], { isShowCancelled: true })])).toEqual({
      kind: 'closed-today',
    });
  });
});

describe('deriveDogChip', () => {
  const ctx = { isPastShow: false, isShowCancelled: false };

  function chipFor(classes: EntryClass[], overrides: Partial<MyEntry> = {}) {
    const { dog, group } = build([makeRow(classes, overrides)]);
    return deriveDogChip(dog, { ...ctx, isShowCancelled: group.isShowCancelled });
  }

  it('reports a cancelled show above everything else', () => {
    expect(chipFor([makeClass({ checkInStatus: 'in-ring' })], { isShowCancelled: true })).toEqual({
      kind: 'cancelled',
      label: 'Cancelled',
      status: 'not_accepted',
    });
  });

  it('reports pulled above conflict', () => {
    expect(
      chipFor([
        makeClass({ id: 'c1', checkInStatus: 'pulled' }),
        makeClass({ id: 'c2', classId: 'class-2', checkInStatus: 'conflict' }),
      ])
    ).toEqual({ kind: 'pulled', label: 'Pulled', status: 'pulled' });
  });

  it('reports conflict above in-ring', () => {
    expect(
      chipFor([
        makeClass({ id: 'c1', checkInStatus: 'conflict' }),
        makeClass({ id: 'c2', classId: 'class-2', checkInStatus: 'in-ring' }),
      ])
    ).toEqual({ kind: 'conflict', label: 'Conflict', status: 'conflict' });
  });

  it('reports in-ring above at-gate', () => {
    expect(
      chipFor([
        makeClass({ id: 'c1', checkInStatus: 'in-ring' }),
        makeClass({ id: 'c2', classId: 'class-2', checkInStatus: 'at-gate' }),
      ])
    ).toEqual({ kind: 'in_ring', label: 'In ring', status: 'in_ring' });
  });

  it('reports at-gate above checked-in', () => {
    expect(
      chipFor([
        makeClass({ id: 'c1', checkInStatus: 'at-gate' }),
        makeClass({ id: 'c2', classId: 'class-2', checkInStatus: 'checked-in' }),
      ])
    ).toEqual({ kind: 'at_gate', label: 'At gate', status: 'at_gate' });
  });

  it('chips an at-gate dog "At gate" despite the collapsed in_ring kind beside it', () => {
    expect(chipFor([makeClass({ checkInStatus: 'at-gate', entryStatusKind: 'in_ring' })])).toEqual({
      kind: 'at_gate',
      label: 'At gate',
      status: 'at_gate',
    });
  });

  it('reports checked-in only when every class carrying a state is in', () => {
    expect(
      chipFor([
        makeClass({ id: 'c1', checkInStatus: 'checked-in' }),
        makeClass({ id: 'c2', classId: 'class-2', checkInStatus: 'checked-in' }),
      ])
    ).toEqual({ kind: 'checked_in', label: 'Checked in', status: 'checked_in' });
  });

  it('does not report checked-in while a sibling class has no state', () => {
    const chip = chipFor([
      makeClass({ id: 'c1', checkInStatus: 'checked-in' }),
      makeClass({ id: 'c2', classId: 'class-2' }),
    ]);
    expect(chip.kind).toBe('status');
  });

  it('reports partially scored when some classes have results', () => {
    expect(
      chipFor([
        makeClass({ id: 'c1', isScored: true, resultStatus: 'qualified' }),
        makeClass({ id: 'c2', classId: 'class-2' }),
      ])
    ).toEqual({ kind: 'partially_scored', label: 'Partially scored', status: 'in-progress' });
  });

  it('reports scored when every class is settled and at least one scored', () => {
    expect(
      chipFor([
        makeClass({ id: 'c1', isScored: true, resultStatus: 'qualified' }),
        makeClass({ id: 'c2', classId: 'class-2', isScored: true, resultStatus: 'nq' }),
      ])
    ).toEqual({ kind: 'scored', label: 'Scored', status: 'completed' });
  });

  it('reports absent when every run was settled without a score', () => {
    expect(
      chipFor([
        makeClass({ id: 'c1', resultStatus: 'absent' }),
        makeClass({ id: 'c2', classId: 'class-2', resultStatus: 'absent' }),
      ])
    ).toEqual({ kind: 'absent', label: 'Absent', status: 'absent' });
  });

  it('falls back to the entry status for an accepted dog with nothing recorded', () => {
    const chip = chipFor([makeClass()]);
    expect(chip.kind).toBe('status');
    expect(chip.label).toBeTruthy();
  });

  /**
   * The chip's COLOUR, not just its word. `kind: 'status'` covers every
   * lifecycle status, and a single hard-coded descriptor key for the whole
   * arm painted an accepted dog in pending's warning colour under an
   * "Accepted" label — the badge and the word disagreeing on the same chip.
   */
  it.each([
    [EntryStatus.ACCEPTED, 'accepted'],
    [EntryStatus.PENDING, 'pending'],
    [EntryStatus.WAITLIST, 'waitlist'],
    [EntryStatus.REJECTED, 'not_accepted'],
    [EntryStatus.MOVE_UP_REQUESTED, 'move-up-requested'],
    [EntryStatus.MISSING_INFO, 'missing_info'],
  ])('carries %s through as the descriptor key %s', (entryStatus, expected) => {
    const chip = chipFor([makeClass({ entryStatus })], { entryStatus });

    expect(chip.kind).toBe('status');
    expect(chip.status).toBe(expected);
    expect(getStatusDescriptor('entry', chip.status).colorClass).toBe(
      getStatusDescriptor('entry', expected).colorClass
    );
  });

  it('reports an unresolved status as no-status rather than pending', () => {
    const chip = chipFor([makeClass({ entryStatusKind: 'unknown' })], {
      entryStatusKind: 'unknown',
    });

    expect(chip.status).toBe('no-status');
  });

  it('gives every chip kind a key the shared status vocabulary knows', () => {
    // A key the descriptors do not carry falls back to the "no status" grey,
    // which is exactly the failure this whole field exists to prevent — and it
    // would render silently.
    const kinds: DogChipState[] = [
      chipFor([makeClass({ checkInStatus: 'pulled' })]),
      chipFor([makeClass({ checkInStatus: 'conflict' })]),
      chipFor([makeClass({ checkInStatus: 'in-ring' })]),
      chipFor([makeClass({ checkInStatus: 'at-gate' })]),
      chipFor([makeClass({ checkInStatus: 'checked-in' })]),
      chipFor([
        makeClass({ id: 'c1', isScored: true, resultStatus: 'qualified' }),
        makeClass({ id: 'c2', classId: 'class-2' }),
      ]),
      chipFor([makeClass({ isScored: true, resultStatus: 'qualified' })]),
      chipFor([makeClass({ resultStatus: 'absent' })]),
      chipFor([makeClass()], { isShowCancelled: true }),
    ];

    for (const chip of kinds) {
      expect(
        Object.prototype.hasOwnProperty.call(ENTRY_STATUS_DESCRIPTORS, chip.status),
        `${chip.kind} maps to an unknown descriptor key "${chip.status}"`
      ).toBe(true);
    }
  });

  it('names the pending-review status for a pending dog', () => {
    const chip = chipFor([makeClass({ entryStatus: EntryStatus.PENDING })], {
      entryStatus: EntryStatus.PENDING,
    });
    expect(chip.kind).toBe('status');
    expect(chip.label.toLowerCase()).toContain('review');
  });

  it('names the waitlist status', () => {
    const chip = chipFor([makeClass({ entryStatus: EntryStatus.WAITLIST })], {
      entryStatus: EntryStatus.WAITLIST,
    });
    expect(chip).toEqual({ kind: 'status', label: 'Waitlist', status: 'waitlist' });
  });

  it('rolls the chip up across two orders for one dog', () => {
    const { group } = build([
      makeRow([makeClass({ id: 'c1' })], { id: 'e1', registrationId: 'r1' }),
      makeRow([makeClass({ id: 'c2', classId: 'class-2', checkInStatus: 'in-ring' })], {
        id: 'e2',
        registrationId: 'r2',
      }),
    ]);

    expect(deriveDogChip(group.dogs[0] as MyShowDog, ctx)).toEqual({
      kind: 'in_ring',
      label: 'In ring',
      status: 'in_ring',
    });
  });
});
