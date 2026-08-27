import { describe, expect, it } from 'vitest';
import { buildSessionAssignments } from './loadAssignments';
import {
  DISTRIBUTED_G9_SHARD_COUNT,
  loadShardFromEnv,
  scheduledStartDelayMs,
  selectShardAssignments,
} from './loadShard';
import { G9_NORMAL_SCENARIO, scenarioRingsideSessionCount } from './loadScenario';

describe('distributed load shards', () => {
  it('partitions all 100 global assignments into unique, evenly sized shards', () => {
    const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
    const shards = Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) =>
      selectShardAssignments(assignments, { count: DISTRIBUTED_G9_SHARD_COUNT, index })
    );

    // The workload is fixed at 100 sessions; only how thinly they spread changes.
    // Sizes must differ by at most one, or some runner carries the contention the
    // topology exists to relieve.
    const sizes = shards.map(shard => shard.length);
    expect(sizes.reduce((total, size) => total + size, 0)).toBe(100);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);

    // The gate requires >= 50 ringside sessions (loadScenario targets), so a
    // partition that dropped or duplicated any of them would weaken the workload
    // the issue's non-goals forbid weakening -- while still passing every count
    // assertion above.
    const ringside = shards.flat().filter(assignment => assignment.kind === 'ringside-scoring');
    expect(ringside).toHaveLength(scenarioRingsideSessionCount(G9_NORMAL_SCENARIO));
    expect(new Set(ringside.map(assignment => assignment.sequence)).size).toBe(ringside.length);
    expect(ringside.length).toBeGreaterThanOrEqual(G9_NORMAL_SCENARIO.targets.ringsideSessionsMin);
    expect(
      shards
        .flat()
        .map(assignment => assignment.sequence)
        .sort((a, b) => a - b)
    ).toEqual(Array.from({ length: 100 }, (_, index) => index));
  });

  it('requires the complete shard environment and a valid shared start', () => {
    const now = Date.parse('2026-07-28T12:00:00.000Z');
    const shard = loadShardFromEnv(
      {
        LOAD_TEST_SHARD_COUNT: String(DISTRIBUTED_G9_SHARD_COUNT),
        LOAD_TEST_SHARD_INDEX: '2',
        LOAD_TEST_RUN_ID: '12345-1',
        LOAD_TEST_START_AT: String(now + 60_000),
      },
      now
    );

    expect(shard).toEqual({
      count: DISTRIBUTED_G9_SHARD_COUNT,
      index: 2,
      runId: '12345-1',
      startAtMs: now + 60_000,
    });
    expect(() =>
      loadShardFromEnv(
        {
          LOAD_TEST_SHARD_COUNT: String(DISTRIBUTED_G9_SHARD_COUNT),
          LOAD_TEST_SHARD_INDEX: '2',
        },
        now
      )
    ).toThrow('Distributed load configuration is incomplete');
  });

  it('allows the same five-second lateness tolerance used by the start barrier', () => {
    const now = Date.parse('2026-07-28T12:00:00.000Z');
    const shard = loadShardFromEnv(
      {
        LOAD_TEST_SHARD_COUNT: String(DISTRIBUTED_G9_SHARD_COUNT),
        LOAD_TEST_SHARD_INDEX: '2',
        LOAD_TEST_RUN_ID: '12345-1',
        LOAD_TEST_START_AT: String(now - 3_000),
      },
      now
    );

    expect(shard?.startAtMs).toBe(now - 3_000);
    expect(scheduledStartDelayMs(shard!, now)).toBe(0);
  });

  it('fails closed when a runner misses the start barrier', () => {
    const shard = { count: 8, index: 0, runId: '12345-1', startAtMs: 10_000 };

    expect(scheduledStartDelayMs(shard, 9_000)).toBe(1_000);
    expect(scheduledStartDelayMs(shard, 10_005)).toBe(0);
    expect(() => scheduledStartDelayMs(shard, 15_001)).toThrow(
      'Load shard missed the synchronized start'
    );
  });
});
