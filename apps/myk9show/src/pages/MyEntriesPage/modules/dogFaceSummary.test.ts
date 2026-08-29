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
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]?.classes.map(c => c.name)).toEqual([
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
    // `pulled` leaves the denominator entirely — that dog will not run in that
    // class. `conflict` stays: it is unresolved, not withdrawn.
    expect(summary.awaitingRun).toBe(2);
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
    expect(summary.groups[0]?.classes[0]?.resultStatus).toBe('qualified');
    expect(summary.groups[0]?.classes[0]?.finalPlacement).toBe(2);
    expect(summary.groups[0]?.classes[0]?.awaitingRun).toBe(false);
    expect(summary.hasResults).toBe(true);
  });

  it('never renders a placement for a non-qualifying result', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'nq', finalPlacement: 3 }),
    ]);
    expect(summary.groups[0]?.classes[0]?.resultStatus).toBe('nq');
    expect(summary.groups[0]?.classes[0]?.finalPlacement).toBeUndefined();
  });

  it('never renders an unranked placement of 0', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'qualified', finalPlacement: 0 }),
    ]);
    expect(summary.groups[0]?.classes[0]?.finalPlacement).toBeUndefined();
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
    expect(summary.groups[0]?.classes[0]?.resultStatus).toBeUndefined();
    expect(summary.awaitingRun).toBe(1);
  });
});

describe('buildDogFaceSummary — replication and blank rows', () => {
  it('omits an unresolved placeholder rather than naming a class it does not know', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', name: 'Novice Container' }),
      cls({ id: 'b', name: '', unresolved: true }),
    ]);
    expect(summary.groups[0]?.classes).toHaveLength(1);
    expect(summary.awaitingRun).toBe(1);
  });

  it('skips a blank class name without emitting an empty entry', () => {
    expect(buildDogFaceSummary([cls({ name: '   ' })]).groups).toHaveLength(0);
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


describe('buildDogFaceSummary — trial grouping', () => {
  const AUG1 = () => new Date('2026-08-01T00:00:00Z');
  const AUG2 = () => new Date('2026-08-02T00:00:00Z');

  it('keeps two same-day trials apart even when their class lists are identical', () => {
    // The real shape this exists for: a show runs Trial 1 and Trial 2 on the
    // same Saturday with the same classes. Flat, the face would read
    // "Novice Container, Novice Container" with nothing to tell them apart.
    const summary = buildDogFaceSummary([
      cls({ id: 't1c1', name: 'Novice Container', trialDate: AUG1(), trialNumber: '1' }),
      cls({ id: 't1c2', name: 'Novice Interior', trialDate: AUG1(), trialNumber: '1' }),
      cls({ id: 't2c1', name: 'Novice Container', trialDate: AUG1(), trialNumber: '2' }),
      cls({ id: 't2c2', name: 'Novice Interior', trialDate: AUG1(), trialNumber: '2' }),
    ]);

    expect(summary.groups).toHaveLength(2);
    expect(summary.showTrialHeadings).toBe(true);
    expect(summary.groups[0]?.trialNumber).toBe('1');
    expect(summary.groups[1]?.trialNumber).toBe('2');
    expect(summary.groups[0]?.classes.map(c => c.id)).toEqual(['t1c1', 't1c2']);
    expect(summary.groups[1]?.classes.map(c => c.id)).toEqual(['t2c1', 't2c2']);
  });

  it('attributes a check-in to the right trial when both carry the same class', () => {
    const summary = buildDogFaceSummary([
      cls({
        id: 't1c1',
        name: 'Novice Container',
        trialDate: AUG1(),
        trialNumber: '1',
        checkInStatus: 'checked-in',
      }),
      cls({ id: 't2c1', name: 'Novice Container', trialDate: AUG1(), trialNumber: '2' }),
    ]);

    expect(summary.groups[0]?.classes[0]?.arrived).toBe(true);
    expect(summary.groups[1]?.classes[0]?.arrived).toBe(false);
    expect(formatCheckInTally(summary)).toBe('Checked in 1 of 2');
  });

  it('separates the same trial number on different days', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', trialDate: AUG1(), trialNumber: '1' }),
      cls({ id: 'b', trialDate: AUG2(), trialNumber: '1' }),
    ]);
    expect(summary.groups).toHaveLength(2);
    expect(summary.groups[0]?.trialDate?.getTime()).toBe(AUG1().getTime());
    expect(summary.groups[1]?.trialDate?.getTime()).toBe(AUG2().getTime());
  });

  it('does not label a single-trial order — nothing to tell apart', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', name: 'Novice Container', trialDate: AUG1(), trialNumber: '1' }),
      cls({ id: 'b', name: 'Novice Interior', trialDate: AUG1(), trialNumber: '1' }),
    ]);
    expect(summary.groups).toHaveLength(1);
    expect(summary.showTrialHeadings).toBe(false);
  });

  it('orders groups chronologically, then by trial number naturally', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'd', trialDate: AUG2(), trialNumber: '10' }),
      cls({ id: 'c', trialDate: AUG2(), trialNumber: '2' }),
      cls({ id: 'b', trialDate: AUG1(), trialNumber: '2' }),
      cls({ id: 'a', trialDate: AUG1(), trialNumber: '1' }),
    ]);
    expect(summary.groups.map(g => g.classes[0]?.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts a group with no trial information last rather than folding it in', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'untrialed' }),
      cls({ id: 'dated', trialDate: AUG1(), trialNumber: '1' }),
    ]);
    expect(summary.groups).toHaveLength(2);
    expect(summary.groups[1]?.classes[0]?.id).toBe('untrialed');
    expect(summary.groups[1]?.trialNumber).toBeUndefined();
  });
});


describe('buildDogFaceSummary — exhibitor-set check-in states', () => {
  it('takes a pulled class out of the tally denominator', () => {
    // `pulled` is a CHECK-IN status, not a row status, so it is invisible to
    // the row-level withdrawn set. Counting it left an exhibitor who pulled
    // one of three classes reading "Checked in 2 of 3" forever — nagging them
    // about a class they had already withdrawn from.
    const summary = buildDogFaceSummary([
      cls({ id: 'a', checkInStatus: 'checked-in' }),
      cls({ id: 'b', checkInStatus: 'checked-in' }),
      cls({ id: 'c', checkInStatus: 'pulled' }),
    ]);
    expect(summary.awaitingRun).toBe(2);
    expect(summary.arrived).toBe(2);
    expect(formatCheckInTally(summary)).toBe('Checked in 2 of 2');
  });

  it('surfaces pulled and conflict rather than leaving them blank', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', checkInStatus: 'pulled' }),
      cls({ id: 'b', checkInStatus: 'conflict' }),
      cls({ id: 'c', checkInStatus: 'checked-in' }),
      cls({ id: 'd' }),
    ]);
    const byId = Object.fromEntries(
      summary.groups.flatMap(g => g.classes).map(c => [c.id, c.checkInState])
    );
    expect(byId.a).toBe('pulled');
    expect(byId.b).toBe('conflict');
    expect(byId.c).toBe('arrived');
    expect(byId.d).toBe('none');
  });

  it('keeps a conflict in the denominator — it is unresolved, not withdrawn', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', checkInStatus: 'checked-in' }),
      cls({ id: 'b', checkInStatus: 'conflict' }),
    ]);
    expect(summary.awaitingRun).toBe(2);
    expect(summary.arrived).toBe(1);
  });

  it('shows no pre-run marker once a class is scored', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'qualified', checkInStatus: 'completed' }),
    ]);
    expect(summary.groups[0]?.classes[0]?.checkInState).toBe('none');
  });
});


describe('buildDogFaceSummary — result detail', () => {
  it('carries search time and faults onto the face with the result', () => {
    const summary = buildDogFaceSummary([
      cls({
        id: 'a',
        isScored: true,
        resultStatus: 'qualified',
        searchTimeSeconds: 24.34,
        totalFaults: 1,
      }),
    ]);
    expect(summary.groups[0]?.classes[0]?.searchTimeSeconds).toBeCloseTo(24.34);
    expect(summary.groups[0]?.classes[0]?.totalFaults).toBe(1);
  });

  it('omits a zero fault count — "0F" is noise on a clean run', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'qualified', totalFaults: 0 }),
    ]);
    expect(summary.groups[0]?.classes[0]?.totalFaults).toBeUndefined();
  });

  it('keeps a zero search time, which is a real measurement', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', isScored: true, resultStatus: 'qualified', searchTimeSeconds: 0 }),
    ]);
    expect(summary.groups[0]?.classes[0]?.searchTimeSeconds).toBe(0);
  });

  it('never carries time or faults for a class that has not been scored', () => {
    const summary = buildDogFaceSummary([
      cls({ id: 'a', searchTimeSeconds: 12.5, totalFaults: 2 }),
    ]);
    expect(summary.groups[0]?.classes[0]?.searchTimeSeconds).toBeUndefined();
    expect(summary.groups[0]?.classes[0]?.totalFaults).toBeUndefined();
  });
});
