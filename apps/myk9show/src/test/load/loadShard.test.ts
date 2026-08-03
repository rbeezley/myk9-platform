import { describe, expect, it } from 'vitest';
import { buildSessionAssignments } from './loadAssignments';
import { loadShardFromEnv, scheduledStartDelayMs, selectShardAssignments } from './loadShard';
import { G9_NORMAL_SCENARIO } from './loadScenario';

describe('distributed load shards', () => {
  it('partitions all 100 global assignments into eight unique 12/13-session shards', () => {
    const assignments = buildSessionAssignments(G9_NORMAL_SCENARIO);
    const shards = Array.from({ length: 8 }, (_, index) =>
      selectShardAssignments(assignments, { count: 8, index })
    );

    expect(shards.map(shard => shard.length)).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);
    expect(
      shards
        .flat()
        .map(assignment => assignment.sequence)
        .sort((a, b) => a - b)
    ).toEqual(Array.from({ length: 100 }, (_, index) => index));
  });

  it('requires the complete eight-shard environment and a valid shared start', () => {
    const now = Date.parse('2026-07-28T12:00:00.000Z');
    const shard = loadShardFromEnv(
      {
        LOAD_TEST_SHARD_COUNT: '8',
        LOAD_TEST_SHARD_INDEX: '2',
        LOAD_TEST_RUN_ID: '12345-1',
        LOAD_TEST_START_AT: String(now + 60_000),
      },
      now
    );

    expect(shard).toEqual({
      count: 8,
      index: 2,
      runId: '12345-1',
      startAtMs: now + 60_000,
    });
    expect(() =>
      loadShardFromEnv(
        {
          LOAD_TEST_SHARD_COUNT: '8',
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
        LOAD_TEST_SHARD_COUNT: '8',
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
