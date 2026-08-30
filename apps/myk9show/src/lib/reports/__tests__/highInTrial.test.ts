/**
 * F26 — AKC Scent Work High in Trial, Regulations Chapter 6 §8 and §10.
 *
 * Each test names the rule it pins. The award is computed from qualifying data and
 * handed to a club as an award decision, so a wrong winner here is worse than no report
 * at all — which is what the deleted `AwardsProcessor` produced (hardcoded
 * "Champion Rex" behind a fake progress bar).
 */
import { describe, expect, it } from 'vitest';
import {
  buildHighInTrial,
  HIT_ELEMENTS,
  HIT_NON_PARTICIPATING_STATUSES,
  HIT_PARTICIPATING_STATUSES,
} from '../highInTrial';
import { ENTRY_LIFECYCLE_STATUS_VALUES } from '@/types/entry-lifecycle';
import type { HighInTrialClassLike } from '../highInTrial';
import type { ReportEntry } from '../types';

let seq = 0;

function entry(overrides: Partial<ReportEntry> & Pick<ReportEntry, 'classElement' | 'classLevel'>) {
  seq += 1;
  return {
    id: `entry-${seq}`,
    dogId: 'dog-1',
    armband: '101',
    runOrder: null,
    callName: 'Ranger',
    breed: 'Border Collie',
    handler: 'Alex Kim',
    registrationNumber: 'SW123',
    checkInStatus: 'checked-in',
    section: null,
    isScored: true,
    resultText: 'qualified',
    searchTimeSeconds: 30,
    totalFaults: 0,
    finalPlacement: null,
    entryStatus: 'confirmed',
    ...overrides,
  } as ReportEntry;
}

function cls(element: string, level: string): HighInTrialClassLike {
  return { id: `${element}-${level}`, element, level };
}

/** A team qualifying in every element of `elements` at `level`. */
function qualifyingTeam(input: {
  dogId: string;
  armband: string;
  callName: string;
  level: string;
  elements: readonly string[];
  faults: readonly number[];
  times: readonly (number | null)[];
}): ReportEntry[] {
  return input.elements.map((element, i) =>
    entry({
      dogId: input.dogId,
      armband: input.armband,
      callName: input.callName,
      classElement: element,
      classLevel: input.level,
      totalFaults: input.faults[i] ?? 0,
      searchTimeSeconds: input.times[i] ?? null,
    })
  );
}

describe('§8 — when High in Trial is offered at all', () => {
  it('is not offered for a level running a single element', () => {
    // "If a club offers MORE THAN ONE element ... of a particular difficulty level".
    const model = buildHighInTrial({
      classes: [cls('Container', 'Novice')],
      entries: qualifyingTeam({
        dogId: 'dog-1',
        armband: '101',
        callName: 'Ranger',
        level: 'Novice',
        elements: ['Container'],
        faults: [0],
        times: [30],
      }),
    });

    expect(model.levels).toHaveLength(0);
    expect(model.exclusions).toContainEqual({
      element: 'Container',
      level: 'Novice',
      reason: 'single-element-level',
    });
  });

  it('is offered per level, across the elements that level runs (§10)', () => {
    // The rulebook's own example: Container+Interior+Exterior at Novice, Container+
    // Interior at Advanced -> a Novice HIT over three, an Advanced HIT over two.
    const model = buildHighInTrial({
      classes: [
        cls('Container', 'Novice'),
        cls('Interior', 'Novice'),
        cls('Exterior', 'Novice'),
        cls('Container', 'Advanced'),
        cls('Interior', 'Advanced'),
      ],
      entries: [],
    });

    expect(model.levels.map(l => l.level)).toEqual(['Novice', 'Advanced']);
    expect(model.levels[0]?.elements).toEqual(['Container', 'Interior', 'Exterior']);
    expect(model.levels[1]?.elements).toEqual(['Container', 'Interior']);
  });

  it('orders levels by progression, not by the order classes arrive', () => {
    const model = buildHighInTrial({
      classes: [
        cls('Container', 'Master'),
        cls('Interior', 'Master'),
        cls('Container', 'Novice'),
        cls('Interior', 'Novice'),
        cls('Container', 'Advanced'),
        cls('Interior', 'Advanced'),
      ],
      entries: [],
    });

    expect(model.levels.map(l => l.level)).toEqual(['Novice', 'Advanced', 'Master']);
  });
});

describe('§8 — eligibility is all-or-nothing', () => {
  const CLASSES = [cls('Container', 'Novice'), cls('Interior', 'Novice')];

  it('excludes a team that qualified in one element but did not enter the other', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: qualifyingTeam({
        dogId: 'dog-1',
        armband: '101',
        callName: 'Ranger',
        level: 'Novice',
        elements: ['Container'],
        faults: [0],
        times: [30],
      }),
    });

    expect(model.levels[0]?.teams).toHaveLength(0);
  });

  it('excludes a team that entered both but failed to qualify in one', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        entry({ classElement: 'Container', classLevel: 'Novice' }),
        entry({ classElement: 'Interior', classLevel: 'Novice', resultText: 'nq' }),
      ],
    });

    expect(model.levels[0]?.teams).toHaveLength(0);
  });

  it('includes a team that qualified in every element offered', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: qualifyingTeam({
        dogId: 'dog-1',
        armband: '101',
        callName: 'Ranger',
        level: 'Novice',
        elements: ['Container', 'Interior'],
        faults: [1, 2],
        times: [30, 40],
      }),
    });

    const team = model.levels[0]?.teams[0];
    expect(team?.callName).toBe('Ranger');
    expect(team?.totalFaults).toBe(3);
    expect(team?.totalTimeSeconds).toBe(70);
    expect(team?.rank).toBe(1);
  });

  it.each(['withdrawn', 'moved', 'scratched', 'absent', 'not_accepted'])(
    'does not count a %s entry as participation',
    status => {
      // A `moved` row is the vacated half of a move-up; its replacement is its own row.
      // `scratched` and `absent` mean the dog never ran. Counting any of them would
      // demand a qualifying score from a class the dog did not complete.
      const model = buildHighInTrial({
        classes: CLASSES,
        entries: [
          entry({ classElement: 'Container', classLevel: 'Novice' }),
          entry({ classElement: 'Interior', classLevel: 'Novice', entryStatus: status }),
        ],
      });

      expect(model.levels[0]?.teams).toHaveLength(0);
    }
  );

  it('ignores a stale qualifying result left on a scratched entry', () => {
    // The sharper half of the same bug: a row scratched AFTER being scored still carries
    // result_status 'qualified'. Ranking it would award on a run that was struck.
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        entry({ classElement: 'Container', classLevel: 'Novice' }),
        entry({ classElement: 'Interior', classLevel: 'Novice', entryStatus: 'scratched' }),
      ],
    });

    expect(model.levels[0]?.teams).toHaveLength(0);
  });
});

describe('§8 — Handler Discrimination and non-Odor-Search classes are excluded', () => {
  it('ignores Handler Discrimination even when offered at the level', () => {
    // "The High in Trial award does not take into account Handler Discrimination
    // classes, even if offered at the trial." A dog that skipped HD must still win.
    const model = buildHighInTrial({
      classes: [
        cls('Container', 'Novice'),
        cls('Interior', 'Novice'),
        cls('Handler Discrimination', 'Novice'),
      ],
      entries: qualifyingTeam({
        dogId: 'dog-1',
        armband: '101',
        callName: 'Ranger',
        level: 'Novice',
        elements: ['Container', 'Interior'],
        faults: [0, 0],
        times: [30, 30],
      }),
    });

    expect(model.levels[0]?.elements).toEqual(['Container', 'Interior']);
    expect(model.levels[0]?.teams).toHaveLength(1);
    expect(model.exclusions).toContainEqual({
      element: 'Handler Discrimination',
      level: 'Novice',
      reason: 'not-an-odor-search-element',
    });
  });

  it('ignores elements from other registries sharing the classes table', () => {
    // `public.classes` really does hold "Vehicle" (a UKC/NACSW element). An
    // exclude-only-HD denylist would fold it into an AKC HIT.
    const model = buildHighInTrial({
      classes: [cls('Container', 'Advanced'), cls('Interior', 'Advanced'), cls('Vehicle', 'Advanced')],
      entries: qualifyingTeam({
        dogId: 'dog-1',
        armband: '101',
        callName: 'Ranger',
        level: 'Advanced',
        elements: ['Container', 'Interior'],
        faults: [0, 0],
        times: [30, 30],
      }),
    });

    expect(model.levels[0]?.elements).toEqual(['Container', 'Interior']);
    expect(model.levels[0]?.teams).toHaveLength(1);
  });

  it('counts only the four Odor Search elements', () => {
    expect([...HIT_ELEMENTS]).toEqual(['Container', 'Interior', 'Exterior', 'Buried']);
  });
});

describe('Chapter 2 §11 — Novice A and B are one difficulty level', () => {
  it('confers ONE Novice HIT across both sections', () => {
    // "Novice A and Novice B are different sections of the same class", and §8 awards
    // one HIT per difficulty LEVEL. Grouping by section would produce two Novice HITs.
    const model = buildHighInTrial({
      classes: [
        { id: 'c-nov-a', element: 'Container', level: 'Novice' },
        { id: 'c-nov-b', element: 'Container', level: 'Novice' },
        { id: 'i-nov-a', element: 'Interior', level: 'Novice' },
      ],
      entries: [],
    });

    expect(model.levels).toHaveLength(1);
    expect(model.levels[0]?.level).toBe('Novice');
  });

  it('lets a dog combine Container Novice A with Interior Novice B', () => {
    const model = buildHighInTrial({
      classes: [cls('Container', 'Novice'), cls('Interior', 'Novice')],
      entries: [
        entry({ classElement: 'Container', classLevel: 'Novice', classSection: 'A' }),
        entry({ classElement: 'Interior', classLevel: 'Novice', classSection: 'B' }),
      ],
    });

    expect(model.levels[0]?.teams).toHaveLength(1);
  });
});

describe('§8 — ranking and ties', () => {
  const CLASSES = [cls('Container', 'Novice'), cls('Interior', 'Novice')];

  function twoTeams(a: { faults: number[]; times: (number | null)[] }, b: { faults: number[]; times: (number | null)[] }) {
    return [
      ...qualifyingTeam({
        dogId: 'dog-a',
        armband: '101',
        callName: 'Ranger',
        level: 'Novice',
        elements: ['Container', 'Interior'],
        faults: a.faults,
        times: a.times,
      }),
      ...qualifyingTeam({
        dogId: 'dog-b',
        armband: '102',
        callName: 'Juni',
        level: 'Novice',
        elements: ['Container', 'Interior'],
        faults: b.faults,
        times: b.times,
      }),
    ];
  }

  it('ranks by summed faults BEFORE time', () => {
    // The clean team must be SLOWER than the faulty one, or faults-first and time-first
    // agree and the test proves nothing about the ordering. Chapter 6 §6 states the
    // same principle for placements: "a team with no faults will place higher than a
    // faster-finishing team with faults".
    //   Ranger: 1 fault,  20s total (fast, faulty)
    //   Juni:   0 faults, 180s total (slow, clean)  <- wins
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: twoTeams({ faults: [0, 1], times: [10, 10] }, { faults: [0, 0], times: [90, 90] }),
    });

    expect(model.levels[0]?.teams.map(t => t.callName)).toEqual(['Juni', 'Ranger']);
    expect(model.levels[0]?.teams[0]?.totalTimeSeconds).toBe(180);
    expect(model.levels[0]?.needsCoinFlip).toBe(false);
  });

  it('breaks a fault tie on summed time', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: twoTeams({ faults: [1, 1], times: [30, 30] }, { faults: [1, 1], times: [20, 25] }),
    });

    expect(model.levels[0]?.teams.map(t => t.callName)).toEqual(['Juni', 'Ranger']);
  });

  it('surfaces a faults-and-time tie as a shared rank rather than picking a winner', () => {
    // §8's final tie-break is a coin flip -- a human act. Resolving it here would
    // fabricate a winner.
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: twoTeams({ faults: [1, 1], times: [30, 30] }, { faults: [1, 1], times: [30, 30] }),
    });

    const level = model.levels[0]!;
    expect(level.needsCoinFlip).toBe(true);
    expect(level.teams.map(t => t.rank)).toEqual([1, 1]);
    expect(level.teams.every(t => t.tiedCount === 2)).toBe(true);
  });

  it('does not let a team with an unrecorded time win a tie-break', () => {
    // Treating a missing time as 0 would hand it the win outright.
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: twoTeams({ faults: [0, 0], times: [null, 30] }, { faults: [0, 0], times: [60, 60] }),
    });

    const level = model.levels[0]!;
    expect(level.teams[0]?.callName).toBe('Juni');
    expect(level.teams[1]?.totalTimeSeconds).toBeNull();
    expect(level.needsCoinFlip).toBe(false);
  });

  it('skips ranks after a tie', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        ...twoTeams({ faults: [0, 0], times: [30, 30] }, { faults: [0, 0], times: [30, 30] }),
        ...qualifyingTeam({
          dogId: 'dog-c',
          armband: '103',
          callName: 'Scout',
          level: 'Novice',
          elements: ['Container', 'Interior'],
          faults: [2, 2],
          times: [50, 50],
        }),
      ],
    });

    expect(model.levels[0]?.teams.map(t => t.rank)).toEqual([1, 1, 3]);
  });
});

describe('provisional results', () => {
  const CLASSES = [cls('Container', 'Novice'), cls('Interior', 'Novice')];

  it('marks a level not final while any entry awaits a result', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        ...qualifyingTeam({
          dogId: 'dog-a',
          armband: '101',
          callName: 'Ranger',
          level: 'Novice',
          elements: ['Container', 'Interior'],
          faults: [0, 0],
          times: [30, 30],
        }),
        entry({
          dogId: 'dog-b',
          armband: '102',
          classElement: 'Interior',
          classLevel: 'Novice',
          isScored: false,
          resultText: 'pending',
        }),
      ],
    });

    expect(model.levels[0]?.pendingCount).toBe(1);
    expect(model.levels[0]?.isFinal).toBe(false);
  });

  it('is final once every entry is scored', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        ...qualifyingTeam({
          dogId: 'dog-a',
          armband: '101',
          callName: 'Ranger',
          level: 'Novice',
          elements: ['Container', 'Interior'],
          faults: [0, 0],
          times: [30, 30],
        }),
        entry({ dogId: 'dog-b', armband: '102', classElement: 'Interior', classLevel: 'Novice', resultText: 'nq' }),
      ],
    });

    expect(model.levels[0]?.pendingCount).toBe(0);
    expect(model.levels[0]?.isFinal).toBe(true);
  });

  it('does not count a withdrawn entry as pending', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        entry({
          classElement: 'Container',
          classLevel: 'Novice',
          isScored: false,
          resultText: 'pending',
          entryStatus: 'withdrawn',
        }),
      ],
    });

    expect(model.levels[0]?.pendingCount).toBe(0);
  });
});

describe('highInTrialStatusCoverage', () => {
  it('classifies EVERY lifecycle status as participating or not', () => {
    // The guard that makes the two sets maintainable. `entries_entry_status_check`
    // permits 21 values; my first cut covered three ('withdrawn', 'moved', and a
    // 'cancelled' that is not even in the constraint), so a scratched entry counted as
    // a competitor. Because this reads the canonical list rather than a copy, adding a
    // lifecycle status fails here until someone decides which side it belongs on.
    const unclassified = ENTRY_LIFECYCLE_STATUS_VALUES.filter(
      status =>
        !HIT_NON_PARTICIPATING_STATUSES.has(status) && !HIT_PARTICIPATING_STATUSES.has(status)
    );

    expect(unclassified).toEqual([]);
  });

  it('puts no status on both sides at once', () => {
    const both = [...HIT_NON_PARTICIPATING_STATUSES].filter(s => HIT_PARTICIPATING_STATUSES.has(s));
    expect(both).toEqual([]);
  });

  it('treats an unrecognised status as participating, not as removed', () => {
    // Conservative default: an unknown status leaves the level PROVISIONAL rather than
    // silently finalising an award on incomplete data.
    const model = buildHighInTrial({
      classes: [cls('Container', 'Novice'), cls('Interior', 'Novice')],
      entries: [
        entry({
          classElement: 'Container',
          classLevel: 'Novice',
          entryStatus: 'some-future-status',
          isScored: false,
          resultText: 'pending',
        }),
      ],
    });

    expect(model.levels[0]?.pendingCount).toBe(1);
    expect(model.levels[0]?.isFinal).toBe(false);
  });
});

describe('incomplete scores are never converted into a clean result', () => {
  const CLASSES = [cls('Container', 'Novice'), cls('Interior', 'Novice')];

  it('does not treat an unrecorded fault count as zero faults', () => {
    // `entries.total_faults` is nullable. Coercing null to 0 reads as a perfect run and,
    // with one eligible team, hands it High in Trial on data nobody entered.
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        entry({ classElement: 'Container', classLevel: 'Novice', totalFaults: null }),
        entry({ classElement: 'Interior', classLevel: 'Novice', totalFaults: 0 }),
      ],
    });

    const level = model.levels[0]!;
    const team = level.teams[0]!;
    expect(team.totalFaults).toBeNull();
    expect(team.hasIncompleteScores).toBe(true);
    // Listed (it did qualify) but the level cannot be awarded yet.
    expect(level.teams).toHaveLength(1);
    expect(level.incompleteScoreCount).toBe(1);
    expect(level.isFinal).toBe(false);
  });

  it('ranks a team with missing faults BELOW one with a recorded, worse score', () => {
    // The sharp end: 'unknown' must not beat a real 3-fault round.
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        ...qualifyingTeam({
          dogId: 'dog-a',
          armband: '101',
          callName: 'Ranger',
          level: 'Novice',
          elements: ['Container', 'Interior'],
          faults: [3, 0],
          times: [30, 30],
        }),
        entry({
          dogId: 'dog-b',
          armband: '102',
          callName: 'Juni',
          classElement: 'Container',
          classLevel: 'Novice',
          totalFaults: null,
        }),
        entry({
          dogId: 'dog-b',
          armband: '102',
          callName: 'Juni',
          classElement: 'Interior',
          classLevel: 'Novice',
          totalFaults: 0,
        }),
      ],
    });

    expect(model.levels[0]?.teams.map(t => t.callName)).toEqual(['Ranger', 'Juni']);
  });

  it('does not call two teams with unrecorded faults a coin-flip tie', () => {
    // A coin flip settles a genuine §8 tie. It settles nothing when the numbers the rule
    // ranks on were never entered.
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: [
        entry({ dogId: 'dog-a', armband: '101', classElement: 'Container', classLevel: 'Novice', totalFaults: null }),
        entry({ dogId: 'dog-a', armband: '101', classElement: 'Interior', classLevel: 'Novice', totalFaults: null }),
        entry({ dogId: 'dog-b', armband: '102', classElement: 'Container', classLevel: 'Novice', totalFaults: null }),
        entry({ dogId: 'dog-b', armband: '102', classElement: 'Interior', classLevel: 'Novice', totalFaults: null }),
      ],
    });

    expect(model.levels[0]?.needsCoinFlip).toBe(false);
    expect(model.levels[0]?.incompleteScoreCount).toBe(2);
  });

  it('stays final when every qualifying run has both numbers', () => {
    const model = buildHighInTrial({
      classes: CLASSES,
      entries: qualifyingTeam({
        dogId: 'dog-a',
        armband: '101',
        callName: 'Ranger',
        level: 'Novice',
        elements: ['Container', 'Interior'],
        faults: [0, 1],
        times: [30, 30],
      }),
    });

    expect(model.levels[0]?.incompleteScoreCount).toBe(0);
    expect(model.levels[0]?.isFinal).toBe(true);
  });
});
