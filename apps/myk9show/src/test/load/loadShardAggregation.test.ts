import { describe, expect, it } from 'vitest';
import type { LoadObservation } from './loadEvaluation';
import type { LoadMetricSamples } from './loadMetrics';
import { aggregateLoadShardArtifacts, type LoadShardArtifact } from './loadShardAggregation';
import { G9_NORMAL_SCENARIO } from './loadScenario';

const target = {
  mode: 'e2e' as const,
  projectRef: 'sojmvhhwsjxmfistvzbe',
  computeTier: 'Micro',
  gateEligible: true,
};

function shardArtifact(index: number): LoadShardArtifact {
  const scoringDurationsMs = Array.from({ length: 25 }, (_, offset) => index * 25 + offset + 1);
  const observation: LoadObservation = {
    concurrentSessions: 25,
    ringsideSessions: [14, 14, 14, 13][index],
    requestCount: 9_000,
    failedRequestCount: 0,
    workflowFailures: 0,
    scoringWriteP95Ms: scoringDurationsMs.at(-2) ?? Number.POSITIVE_INFINITY,
    apiP95Ms: scoringDurationsMs.at(-2) ?? Number.POSITIVE_INFINITY,
    pageP95Ms: 1_000,
    errorRate: 0,
    throughputRps: 15,
    availabilityPercent: 100,
    scoringWriteAttempts: 110,
    serializationFailures: 0,
    retryAttempts: 0,
    retrySuccesses: 0,
    exhaustedRetries: 0,
    maxReplicationQueueDepth: index + 1,
    finalReplicationQueueDepth: 0,
    queueTelemetryFailures: 0,
    expectedPersistedScores: 110,
    persistedScores: 110,
    ...(index === 0 && {
      platform: {
        peakCpuPercent: 60,
        peakIoPercent: 20,
        peakConnections: 40,
        connectionCap: 60,
        statementDeltas: [
          {
            queryId: 'query-1',
            calls: 440,
            rows: 440,
            totalExecTimeMs: 4_400,
            meanExecTimeMs: 10,
          },
        ],
      },
    }),
  };
  const samples: LoadMetricSamples = {
    scoringDurationsMs,
    apiDurationsMs: scoringDurationsMs,
    pageDurationsMs: [1_000],
  };

  return {
    schemaVersion: 1,
    runId: '12345-1',
    startAtMs: 1_785_283_200_000,
    startedAtMs: 1_785_283_200_000 + index,
    elapsedMs: 600_000,
    shard: { count: 4, index },
    assignmentSequences: Array.from({ length: 25 }, (_, offset) => index + offset * 4),
    target,
    scenarioId: 'normal',
    observation,
    samples,
  };
}

describe('distributed load aggregation', () => {
  it('combines four manifests into exact global metrics and one platform sample', () => {
    const result = aggregateLoadShardArtifacts(
      Array.from({ length: 4 }, (_, index) => shardArtifact(index)),
      G9_NORMAL_SCENARIO
    );

    expect(result.target).toEqual(target);
    expect(result.observation).toMatchObject({
      concurrentSessions: 100,
      ringsideSessions: 55,
      requestCount: 36_000,
      scoringWriteP95Ms: 95,
      apiP95Ms: 95,
      pageP95Ms: 1_000,
      throughputRps: 60,
      expectedPersistedScores: 440,
      persistedScores: 440,
      maxReplicationQueueDepth: 4,
      finalReplicationQueueDepth: 0,
      platform: { peakConnections: 40, connectionCap: 60 },
    });
  });

  it.each([
    ['missing shard', [shardArtifact(0), shardArtifact(1), shardArtifact(2)]],
    ['duplicate shard', [shardArtifact(0), shardArtifact(1), shardArtifact(2), shardArtifact(2)]],
    [
      'late shard',
      [
        shardArtifact(0),
        shardArtifact(1),
        shardArtifact(2),
        { ...shardArtifact(3), startedAtMs: shardArtifact(3).startAtMs + 5_001 },
      ],
    ],
  ])('rejects a %s', (_name, artifacts) => {
    expect(() => aggregateLoadShardArtifacts(artifacts, G9_NORMAL_SCENARIO)).toThrow();
  });
});
