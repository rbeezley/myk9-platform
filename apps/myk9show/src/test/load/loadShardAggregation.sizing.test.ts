import { describe, expect, it } from 'vitest';
import type { LoadObservation } from './loadEvaluation';
import { aggregateLoadShardArtifacts, type LoadShardArtifact } from './loadShardAggregation';
import { G9_NORMAL_SCENARIO } from './loadScenario';
import { scaleScenarioToSessions } from './loadSessionSizing';
import { DISTRIBUTED_G9_SHARD_COUNT } from './loadShard';

const SIZE = 50;
const scenario = scaleScenarioToSessions(G9_NORMAL_SCENARIO, SIZE);
const START = 1_785_283_200_000;

/** Only what aggregation reads: counts, one generator row, empty lifecycle intervals. */
function shard(index: number, overrides: Partial<LoadShardArtifact> = {}): LoadShardArtifact {
  const sequences = Array.from({ length: SIZE }, (_, sequence) => sequence).filter(
    sequence => sequence % DISTRIBUTED_G9_SHARD_COUNT === index
  );
  const lifecycle = {
    configuredSessions: sequences.length,
    preparedSessions: sequences.length,
    startedWorkflows: sequences.length,
    completedWorkflows: sequences.length,
    failedWorkflows: 0,
    peakActiveWorkflows: 0,
    configuredRingsideSessions: 0,
    preparedRingsideSessions: 0,
    startedRingsideWorkflows: 0,
    completedRingsideWorkflows: 0,
    failedRingsideWorkflows: 0,
    peakActiveRingsideWorkflows: 0,
    activityIntervals: [],
  };
  const observation = {
    concurrentSessions: sequences.length,
    ringsideSessions: 0,
    sessionLifecycle: lifecycle,
    generator: { shards: [{ shardIndex: index }] },
    requestCount: 100,
    failedRequestCount: 0,
    workflowFailures: 0,
    workflowFailureDetails: [],
    scoringWriteAttempts: 0,
    serializationFailures: 0,
    retryAttempts: 0,
    retrySuccesses: 0,
    exhaustedRetries: 0,
    maxReplicationQueueDepth: 0,
    finalReplicationQueueDepth: 0,
    queueTelemetryFailures: 0,
    expectedPersistedScores: 0,
    persistedScores: 0,
    // Shards 0 and 1 saw PGRST003; shard 1 also saw a statement timeout.
    ...(index === 0 ? { apiErrorCounts: [{ status: 503, code: 'PGRST003', count: 4 }] } : {}),
    ...(index === 1
      ? {
          apiErrorCounts: [
            { status: 503, code: 'PGRST003', count: 3 },
            { status: 500, code: '57014', count: 2 },
          ],
        }
      : {}),
  } as unknown as LoadObservation;
  return {
    schemaVersion: 2,
    runId: '1-1',
    startAtMs: START,
    startedAtMs: START,
    elapsedMs: 600_000,
    shard: { count: DISTRIBUTED_G9_SHARD_COUNT, index },
    assignmentSequences: sequences,
    target: { mode: 'e2e', projectRef: 'p', computeTier: 'Micro', gateEligible: false },
    scenarioId: 'normal',
    sessionSize: SIZE,
    observation,
    samples: { apiDurationsMs: [1], scoringDurationsMs: [1], pageDurationsMs: [1] },
    ...overrides,
  };
}

const allShards = (overrides: Partial<LoadShardArtifact> = {}) =>
  Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) => shard(index, overrides));

describe('aggregation at a reduced session size', () => {
  it('covers every sequence exactly once and sums per-code API errors across shards', () => {
    const { observation } = aggregateLoadShardArtifacts(allShards(), scenario, undefined);
    expect(observation.concurrentSessions).toBe(SIZE);
    expect(observation.apiErrorCounts).toEqual([
      { status: 503, code: 'PGRST003', count: 7 },
      { status: 500, code: '57014', count: 2 },
    ]);
  });

  it('rejects shards cut for a different size with a message naming both', () => {
    expect(() =>
      aggregateLoadShardArtifacts(allShards({ sessionSize: 358 }), scenario, undefined)
    ).toThrow(/358-session workload but the aggregate expects 50/);
  });

  it('rejects a full-size aggregate expecting more sequences than the shards ran', () => {
    expect(() =>
      aggregateLoadShardArtifacts(
        allShards({ sessionSize: undefined }),
        G9_NORMAL_SCENARIO,
        undefined
      )
    ).toThrow(/missing, duplicated, or out of range/);
  });
});
