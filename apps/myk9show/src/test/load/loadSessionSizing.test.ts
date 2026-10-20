import { describe, expect, it } from 'vitest';
import { buildSessionAssignments } from './loadAssignments';
import { planGeneration } from './loadGenerationPlan';
import {
  G9_NORMAL_SCENARIO,
  scenarioRingsideSessionCount,
  scenarioSessionCount,
  validateScenarioDefinition,
} from './loadScenario';
import {
  G9_SESSION_SIZES,
  loadScenarioFromEnv,
  parseSessionSize,
  scaleScenarioToSessions,
  scaleWorkloadSessions,
  shardSessionCounts,
} from './loadSessionSizing';
import { DISTRIBUTED_G9_SHARD_COUNT } from './loadShard';

function mix(size: number): Record<string, number> {
  return Object.fromEntries(
    scaleScenarioToSessions(G9_NORMAL_SCENARIO, size).workloads.map(w => [w.kind, w.sessions])
  );
}

describe('session sizing', () => {
  it('returns the base scenario untouched at 358', () => {
    expect(scaleScenarioToSessions(G9_NORMAL_SCENARIO, 358)).toBe(G9_NORMAL_SCENARIO);
    expect(loadScenarioFromEnv({})).toBe(G9_NORMAL_SCENARIO);
    expect(loadScenarioFromEnv({ LOAD_TEST_SESSIONS: '358' })).toBe(G9_NORMAL_SCENARIO);
  });

  // The per-size role mix is pinned so a change to the rounding rule is a
  // visible diff, not a silent shift in what a "100-session" run means.
  it.each([
    [
      50,
      {
        'ringside-scoring': 3,
        'scoring-correction': 1,
        'steward-check-in': 2,
        'exhibitor-check-in': 5,
        'secretary-class-edit': 1,
        'run-order-read': 26,
        'exhibitor-read': 11,
        'operations-read': 1,
      },
    ],
    [
      100,
      {
        'ringside-scoring': 6,
        'scoring-correction': 1,
        'steward-check-in': 5,
        'exhibitor-check-in': 11,
        'secretary-class-edit': 1,
        'run-order-read': 52,
        'exhibitor-read': 22,
        'operations-read': 2,
      },
    ],
    [
      200,
      {
        'ringside-scoring': 11,
        'scoring-correction': 2,
        'steward-check-in': 11,
        'exhibitor-check-in': 22,
        'secretary-class-edit': 2,
        'run-order-read': 104,
        'exhibitor-read': 44,
        'operations-read': 4,
      },
    ],
    [
      358,
      {
        'ringside-scoring': 20,
        'scoring-correction': 4,
        'steward-check-in': 20,
        'exhibitor-check-in': 40,
        'secretary-class-edit': 4,
        'run-order-read': 186,
        'exhibitor-read': 78,
        'operations-read': 6,
      },
    ],
  ])('scales the role mix at %i sessions', (size, expected) => {
    expect(mix(size)).toEqual(expected);
  });

  it.each([...G9_SESSION_SIZES])('is a valid scenario with the exact size at %i', size => {
    const scenario = scaleScenarioToSessions(G9_NORMAL_SCENARIO, size);
    expect(scenarioSessionCount(scenario)).toBe(size);
    expect(validateScenarioDefinition(scenario)).toEqual([]);
    expect(scenario.targets.ringsideSessionsExact).toBe(scenarioRingsideSessionCount(scenario));
    expect(buildSessionAssignments(scenario)).toHaveLength(size);
  });

  it.each([...G9_SESSION_SIZES])('splits %i sessions across every shard', size => {
    const counts = shardSessionCounts(size);
    expect(counts).toHaveLength(DISTRIBUTED_G9_SHARD_COUNT);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(size);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(Math.min(...counts)).toBeGreaterThan(0);

    // The arithmetic split must be what the runner's `sequence % count` produces.
    const assignments = buildSessionAssignments(scaleScenarioToSessions(G9_NORMAL_SCENARIO, size));
    const actual = Array.from(
      { length: DISTRIBUTED_G9_SHARD_COUNT },
      (_, index) =>
        assignments.filter(a => a.sequence % DISTRIBUTED_G9_SHARD_COUNT === index).length
    );
    expect(actual).toEqual(counts);
  });

  it('keeps the 358 split at 23 for six shards and 22 for ten', () => {
    const counts = shardSessionCounts(358);
    expect(counts.filter(c => c === 23)).toHaveLength(6);
    expect(counts.filter(c => c === 22)).toHaveLength(10);
  });

  it.each([...G9_SESSION_SIZES])('gives every shard a real browser at %i sessions', size => {
    const assignments = buildSessionAssignments(scaleScenarioToSessions(G9_NORMAL_SCENARIO, size));
    for (let index = 0; index < DISTRIBUTED_G9_SHARD_COUNT; index += 1) {
      const mine = assignments.filter(a => a.sequence % DISTRIBUTED_G9_SHARD_COUNT === index);
      const plan = planGeneration(mine, { browserReaderSample: 1 });
      expect(plan.browser.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps writers a strict minority and one scorer per ring at every size', () => {
    for (const size of G9_SESSION_SIZES) {
      const scenario = scaleScenarioToSessions(G9_NORMAL_SCENARIO, size);
      const scoring = scenarioRingsideSessionCount(scenario);
      expect(scoring).toBeLessThanOrEqual(20);
      const scoringClasses = new Set(
        buildSessionAssignments(scenario)
          .filter(a => a.kind === 'ringside-scoring')
          .map(a => a.target.classId)
      );
      expect(scoringClasses.size).toBe(scoring);
    }
  });

  it('never loosens a latency, error or availability target and scales throughput', () => {
    const scaled = scaleScenarioToSessions(G9_NORMAL_SCENARIO, 100);
    const { throughputMin, ringsideSessionsExact, ...scaledRest } = scaled.targets;
    const {
      throughputMin: baseThroughput,
      ringsideSessionsExact: baseRingside,
      ...baseRest
    } = G9_NORMAL_SCENARIO.targets;
    expect(scaledRest).toEqual(baseRest);
    expect(throughputMin).toBeCloseTo((baseThroughput * 100) / 358, 1);
    expect(ringsideSessionsExact).toBeLessThan(baseRingside);
  });

  it('marks a reduced run informational so it cannot claim the G9 gate', () => {
    expect(scaleScenarioToSessions(G9_NORMAL_SCENARIO, 100).informational).toBe(true);
    expect(G9_NORMAL_SCENARIO.informational).toBe(false);
  });

  it('settles odd sizes to the exact total with at least one session per workload', () => {
    const base = G9_NORMAL_SCENARIO.workloads.map(w => w.sessions);
    for (const size of [8, 16, 17, 33, 77, 199, 357]) {
      const seats = scaleWorkloadSessions(base, size);
      expect(seats.reduce((a, b) => a + b, 0)).toBe(size);
      expect(Math.min(...seats)).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects sizes the workload cannot be cut to', () => {
    expect(() => scaleWorkloadSessions([5, 5], 1)).toThrow(/must be an integer/);
    expect(() => scaleWorkloadSessions([5, 5], 11)).toThrow(/must be an integer/);
  });

  it('accepts only the four published sizes from the environment', () => {
    expect(parseSessionSize({ LOAD_TEST_SESSIONS: '100' })).toBe(100);
    expect(() => parseSessionSize({ LOAD_TEST_SESSIONS: '99' })).toThrow(/must be one of/);
    expect(() => parseSessionSize({ LOAD_TEST_SESSIONS: 'lots' })).toThrow(/must be one of/);
  });
});
