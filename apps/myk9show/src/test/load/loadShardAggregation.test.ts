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
  const ringsideSessions = [14, 14, 14, 13][index];
  const ringsidePeak = [12, 12, 12, 11][index];
  const intervalBaseMs = 1_000 + index * 10_000;
  const observation: LoadObservation = {
    concurrentSessions: 25,
    ringsideSessions,
    sessionLifecycle: {
      configuredSessions: 25,
      preparedSessions: 25,
      startedWorkflows: 25,
      completedWorkflows: 25,
      failedWorkflows: 0,
      peakActiveWorkflows: 20,
      configuredRingsideSessions: ringsideSessions,
      preparedRingsideSessions: ringsideSessions,
      startedRingsideWorkflows: ringsideSessions,
      completedRingsideWorkflows: ringsideSessions,
      failedRingsideWorkflows: 0,
      peakActiveRingsideWorkflows: ringsidePeak,
      activityIntervals: Array.from({ length: 25 }, (_, offset) => {
        const inPeakBatch =
          offset < ringsidePeak ||
          (offset >= ringsideSessions && offset < ringsideSessions + (20 - ringsidePeak));
        return {
          sequence: index + offset * 4,
          ringside: offset < ringsideSessions,
          startedAtMs: intervalBaseMs + (inPeakBatch ? 0 : 5_000),
          finishedAtMs: intervalBaseMs + (inPeakBatch ? 5_000 : 9_000),
        };
      }),
    },
    generator: {
      shards: [
        {
          shardIndex: index,
          logicalCpuCount: 2,
          samplingDurationMs: 600_000,
          sampleCount: 600,
          hostSampleCoveragePercent: 100,
          hostCpuP95Percent: 60 + index,
          hostCpuPeakPercent: 80 + index,
          hostMemoryPeakPercent: 70,
          hostLoad1mPeak: 3,
          eventLoopDelayP95Ms: 20,
          eventLoopDelayMaxMs: 80,
          browserControlP95Ms: 50,
          browserControlMaxMs: 200,
          browserControlAttempts: 600,
          browserControlSamples: 600,
          browserControlFailures: 0,
          browserControlAttemptCoveragePercent: 100,
          contextPreparationMs: 40_000,
          startHeadroomMs: 120_000,
        },
      ],
    },
    requestCount: 9_000,
    failedRequestCount: 0,
    workflowFailures: 0,
    workflowFailureDetails:
      index === 1 || index === 2
        ? [
            {
              workload: 'run-order-read',
              route: '/at-show/show-1/class/class-1',
              message: 'Dog card timed out',
              count: index === 1 ? 2 : 3,
            },
          ]
        : [],
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
    schemaVersion: 2,
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
  it('combines four manifests without summing temporally disjoint shard peaks', () => {
    const result = aggregateLoadShardArtifacts(
      Array.from({ length: 4 }, (_, index) => shardArtifact(index)),
      G9_NORMAL_SCENARIO
    );

    expect(result.target).toEqual(target);
    expect(result.observation).toMatchObject({
      concurrentSessions: 100,
      ringsideSessions: 55,
      sessionLifecycle: {
        configuredSessions: 100,
        preparedSessions: 100,
        startedWorkflows: 100,
        completedWorkflows: 100,
        failedWorkflows: 0,
        peakActiveWorkflows: 20,
        configuredRingsideSessions: 55,
        preparedRingsideSessions: 55,
        startedRingsideWorkflows: 55,
        completedRingsideWorkflows: 55,
        failedRingsideWorkflows: 0,
        peakActiveRingsideWorkflows: 12,
      },
      generator: {
        shards: [
          { shardIndex: 0, hostCpuP95Percent: 60 },
          { shardIndex: 1, hostCpuP95Percent: 61 },
          { shardIndex: 2, hostCpuP95Percent: 62 },
          { shardIndex: 3, hostCpuP95Percent: 63 },
        ],
      },
      requestCount: 36_000,
      scoringWriteP95Ms: 95,
      apiP95Ms: 95,
      pageP95Ms: 1_000,
      throughputRps: 60,
      expectedPersistedScores: 440,
      persistedScores: 440,
      maxReplicationQueueDepth: 4,
      finalReplicationQueueDepth: 0,
      workflowFailureDetails: [
        {
          workload: 'run-order-read',
          route: '/at-show/show-1/class/class-1',
          message: 'Dog card timed out',
          count: 5,
        },
      ],
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

  it('rejects an artifact that omits runner evidence', () => {
    const artifact = shardArtifact(2);
    const invalid = {
      ...artifact,
      observation: { ...artifact.observation, generator: undefined },
    } as unknown as LoadShardArtifact;
    expect(() =>
      aggregateLoadShardArtifacts(
        [shardArtifact(0), shardArtifact(1), invalid, shardArtifact(3)],
        G9_NORMAL_SCENARIO
      )
    ).toThrow(/generator/i);
  });
});
