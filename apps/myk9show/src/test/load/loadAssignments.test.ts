import { describe, expect, it } from 'vitest';
import { buildSessionAssignments, scoringClassIds } from './loadAssignments';
import { LOAD_SHOWS, LOAD_TOTAL_RING_COUNT, loadEntryFixtureFor } from './loadFixture';
import { G9_NORMAL_SCENARIO, scenarioSessionCount } from './loadScenario';

const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);

describe('session assignment', () => {
  it('produces one assignment per declared session', () => {
    expect(assignments).toHaveLength(scenarioSessionCount(G9_NORMAL_SCENARIO));
    expect(new Set(assignments.map(a => a.sequence)).size).toBe(assignments.length);
  });

  it('never puts two scoring sessions on the same class', () => {
    // The invariant this whole reshape exists to enforce. Under the previous
    // workload 55 sessions spread over 8 classes by modulo, giving ~7 scorers per
    // class and a 9.4 s write p95 that was an artifact rather than a measurement.
    const classIds = scoringClassIds(assignments);
    expect(classIds).toHaveLength(LOAD_TOTAL_RING_COUNT);
    expect(new Set(classIds).size).toBe(LOAD_TOTAL_RING_COUNT);
  });

  it('covers every ring exactly once with scoring', () => {
    const everyClass = LOAD_SHOWS.flatMap(show => [...show.classIds]);
    expect(new Set(scoringClassIds(assignments))).toEqual(new Set(everyClass));
  });

  it('resolves every target to a class that belongs to its own show', () => {
    for (const assignment of assignments) {
      const show = LOAD_SHOWS[assignment.target.showIndex];
      expect(show.showId).toBe(assignment.target.showId);
      expect(show.classIds).toContain(assignment.target.classId);
      const owningTrial = show.trials.find(trial =>
        trial.classIds.includes(assignment.target.classId)
      );
      expect(assignment.target.trialId).toBe(owningTrial?.trialId);
    }
  });

  it('points every target at an entry that exists in that class', () => {
    for (const assignment of assignments) {
      const entry = loadEntryFixtureFor(assignment.target.showIndex, assignment.target.entryNumber);
      expect(entry.classId).toBe(assignment.target.classId);
      expect(entry.showId).toBe(assignment.target.showId);
    }
  });
});

describe('multi-actor contention is actually produced', () => {
  function classesFor(kind: string): string[] {
    return assignments.filter(a => a.kind === kind).map(a => a.target.classId);
  }

  it('puts steward check-in on classes that are being scored', () => {
    // Targeting idle classes would measure nothing: the contention between
    // check-in and scoring on one class row is the property under test.
    const scored = new Set(scoringClassIds(assignments));
    for (const classId of classesFor('steward-check-in')) {
      expect(scored.has(classId)).toBe(true);
    }
  });

  it('puts exhibitor check-in on classes that are being scored', () => {
    const scored = new Set(scoringClassIds(assignments));
    for (const classId of classesFor('exhibitor-check-in')) {
      expect(scored.has(classId)).toBe(true);
    }
  });

  it('puts secretary class edits on classes that are being scored', () => {
    const scored = new Set(scoringClassIds(assignments));
    for (const classId of classesFor('secretary-class-edit')) {
      expect(scored.has(classId)).toBe(true);
    }
  });

  it('gives each scored class more than one concurrent writer', () => {
    const writerKinds = [
      'ringside-scoring',
      'scoring-correction',
      'steward-check-in',
      'exhibitor-check-in',
      'secretary-class-edit',
    ];
    const byClass = new Map<string, number>();
    for (const assignment of assignments) {
      if (!writerKinds.includes(assignment.kind)) continue;
      byClass.set(assignment.target.classId, (byClass.get(assignment.target.classId) ?? 0) + 1);
    }
    // Every ring gets its scorer plus a steward plus at least two self-check-ins.
    for (const count of byClass.values()) {
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('deliberate optimistic-concurrency collision', () => {
  it('collides scoring-correction with a ringside scorer on the same entry', () => {
    // Preserves the coverage the old harness got from making sessions 50-54
    // share an entry. With one scorer per ring there is no session 50, so this
    // has to be modelled explicitly or the 40001 path stops being exercised.
    const corrections = assignments.filter(a => a.kind === 'scoring-correction');
    const scoring = assignments.filter(a => a.kind === 'ringside-scoring');
    expect(corrections).toHaveLength(LOAD_SHOWS.length);

    for (const correction of corrections) {
      const collidingScorer = scoring.find(
        scorer =>
          scorer.target.classId === correction.target.classId &&
          scorer.target.entryNumber === correction.target.entryNumber
      );
      expect(collidingScorer).toBeDefined();
    }
  });

  it('keeps every other scoring target disjoint', () => {
    // The other half of the old scoringEntryNumber contract: exactly one bounded
    // overlap, every other scoring session on its own entry.
    const scoringTargets = assignments
      .filter(a => a.kind === 'ringside-scoring')
      .map(a => `${a.target.showIndex}:${a.target.entryNumber}`);
    expect(new Set(scoringTargets).size).toBe(scoringTargets.length);
  });

  it('collides on exactly one entry per show, not across the whole class', () => {
    const corrections = assignments.filter(a => a.kind === 'scoring-correction');
    expect(new Set(corrections.map(c => c.target.showIndex)).size).toBe(LOAD_SHOWS.length);
  });
});

describe('check-in does not collide on entries with scoring', () => {
  it('keeps check-in on different dogs than the scorer starts on', () => {
    // Class-row contention is wanted; entry-row contention outside the
    // deliberate correction workload would be an unmodelled collision.
    const scoringEntries = new Set(
      assignments
        .filter(a => a.kind === 'ringside-scoring')
        .map(a => `${a.target.showIndex}:${a.target.entryNumber}`)
    );
    for (const assignment of assignments) {
      if (assignment.kind !== 'steward-check-in' && assignment.kind !== 'exhibitor-check-in') {
        continue;
      }
      expect(
        scoringEntries.has(`${assignment.target.showIndex}:${assignment.target.entryNumber}`)
      ).toBe(false);
    }
  });
});

describe('smoke mode', () => {
  it('reduces every workload to a single session but keeps valid targets', () => {
    const smoke = buildSessionAssignments(G9_NORMAL_SCENARIO, true);
    expect(smoke).toHaveLength(G9_NORMAL_SCENARIO.workloads.length);
    for (const assignment of smoke) {
      const show = LOAD_SHOWS[assignment.target.showIndex];
      expect(show.classIds).toContain(assignment.target.classId);
    }
  });
});
