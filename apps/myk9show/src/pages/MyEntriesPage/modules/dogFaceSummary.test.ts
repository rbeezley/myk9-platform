import { describe, it, expect } from 'vitest';
import { buildDogFaceSummary, formatCheckInTally, dogGroupsForFace } from './dogFaceSummary';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryClass, MyEntry } from './my-entries-types';

function cls(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'c1',
    name: 'Novice Container',
    number: '12',
    fee: 25,
    status: 'entered',
    ...overrides,
  };
}

describe('buildDogFaceSummary — before the run', () => {
  it('names every class and reports none arrived by default', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', name: 'Novice Container' }),
      cls({ id: 'b', name: 'Novice Interior' }),
      cls({ id: 'c', name: 'Novice Buried' }),
    ]);
    expect(summary.classes.map(c => c.name)).toEqual([
      'Novice Container',
      'Novice Interior',
      'Novice Buried',
    ]);
    expect(summary.awaitingRun).toBe(3);
    expect(summary.arrived).toBe(0);
    expect(summary.hasResults).toBe(false);
  });

  it('counts every ringside status that implies the dog was presented', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', checkInStatus: 'checked-in' }),
      cls({ id: 'b', checkInStatus: 'at-gate' }),
      cls({ id: 'c', checkInStatus: 'come-to-gate' }),
      cls({ id: 'd', checkInStatus: 'in-ring' }),
    ]);
    expect(summary.arrived).toBe(4);
  });

  it('does NOT count pulled or conflict as checked in', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', checkInStatus: 'pulled' }),
      cls({ id: 'b', checkInStatus: 'conflict' }),
      cls({ id: 'c', checkInStatus: 'no-status' }),
    ]);
    expect(summary.arrived).toBe(0);
    expect(summary.awaitingRun).toBe(3);
  });

  it('keeps the denominator stable as classes get checked in', () => {
    // Regression guard: counting only *eligible* rows would shrink the
    // denominator on every check-in, so a fully checked-in dog would read
    // "0 of 0" instead of "3 of 3".
    const before = buildDogFaceSummary([cls({ id: 'a' }), cls({ id: 'b' }), cls({ id: 'c' })]);
    const after = buildDogFaceSummary([
      cls({ id: 'a', checkInStatus: 'checked-in' }),
      cls({ id: 'b', checkInStatus: 'checked-in' }),
      cls({ id: 'c', checkInStatus: 'checked-in' }),
    ]);
    expect(before.awaitingRun).toBe(3);
    expect(after.awaitingRun).toBe(3);
    expect(after.arrived).toBe(3);
  });

  it('excludes a scratched class from the run count', () => {
    const summary = buildDogFaceSummary([cls({ id: 'a' }), cls({ id: 'b', status: 'scratched' })]);
    expect(summary.awaitingRun).toBe(1);
  });
});

describe('buildDogFaceSummary — after the run', () => {
  it('carries the result instead of check-in state once a class is scored', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'qualified', finalPlacement: 2 }),
    ]);
    expect(summary.classes[0]?.resultStatus).toBe('qualified');
    expect(summary.classes[0]?.finalPlacement).toBe(2);
    expect(summary.classes[0]?.awaitingRun).toBe(false);
    expect(summary.hasResults).toBe(true);
  });

  it('never renders a placement for a non-qualifying result', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'nq', finalPlacement: 3 }),
    ]);
    expect(summary.classes[0]?.resultStatus).toBe('nq');
    expect(summary.classes[0]?.finalPlacement).toBeUndefined();
  });

  it('never renders an unranked placement of 0', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'qualified', finalPlacement: 0 }),
    ]);
    expect(summary.classes[0]?.finalPlacement).toBeUndefined();
  });

  it('mixes results and pending classes on a part-scored order', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'qualified' }),
      cls({ id: 'b', checkInStatus: 'checked-in' }),
      cls({ id: 'c' }),
    ]);
    expect(summary.hasResults).toBe(true);
    expect(summary.awaitingRun).toBe(2);
    expect(summary.arrived).toBe(1);
  });

  it('treats isScored without a resultStatus as still awaiting its run', () => {
    const summary = buildDogFaceSummary([cls({ id: 'a', isScored: true })]);
    expect(summary.classes[0]?.resultStatus).toBeUndefined();
    expect(summary.awaitingRun).toBe(1);
  });
});

describe('buildDogFaceSummary — replication and blank rows', () => {
  it('omits an unresolved placeholder rather than naming a class it does not know', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', name: 'Novice Container' }),
      cls({ id: 'b', name: '', unresolved: true }),
    ]);
    expect(summary.classes).toHaveLength(1);
    expect(summary.awaitingRun).toBe(1);
  });

  it('skips a blank class name without emitting an empty entry', () => {
    expect(buildDogFaceSummary([cls({ name: '   ' })]).classes).toHaveLength(0);
  });
});

describe('formatCheckInTally', () => {
  it('reports progress once at least one class is checked in', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', checkInStatus: 'checked-in' }),
      cls({ id: 'b' }),
      cls({ id: 'c' }),
    ]);
    expect(formatCheckInTally(summary)).toBe('Checked in 1 of 3');
  });

  it('stays silent before any check-in, rather than reading "0 of 3"', () => {
    const summary = buildDogFaceSummary([cls({ id: 'a' }), cls({ id: 'b' })]);
    expect(formatCheckInTally(summary)).toBeNull();
  });

  it('stays silent once every class has a result', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'qualified' }),
    ]);
    expect(formatCheckInTally(summary)).toBeNull();
  });
});

describe('dogGroupsForFace', () => {
  const base = {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Test Show',
    showDate: new Date('2026-09-01'),
    location: { venue: 'V', city: 'Denver', state: 'CO' },
    dogId: 'd1',
    dogName: 'Rex',
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-08-01'),
    lastUpdated: new Date('2026-08-01'),
  } as unknown as MyEntry;

  it('passes a populated dogs array through untouched', () => {
    const dogs = [
      {
        id: 'g1',
        dogId: 'd1',
        dogName: 'Willow',
        armband: '142',
        classes: [cls()],
        entryStatus: EntryStatus.ACCEPTED,
      },
    ];
    expect(dogGroupsForFace({ ...base, dogs, classes: [cls()] })).toBe(dogs);
  });

  it('synthesizes one group from the top-level fields when dogs is empty', () => {
    const entry = { ...base, dogs: [], armband: '77', classes: [cls()] };
    const groups = dogGroupsForFace(entry);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.dogName).toBe('Rex');
    expect(groups[0]?.armband).toBe('77');
    expect(groups[0]?.classes).toHaveLength(1);
  });
});
