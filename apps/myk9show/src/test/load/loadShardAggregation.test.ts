import { describe, expect, it } from 'vitest';
import { evaluateLoadResult, type LoadObservation } from './loadEvaluation';
import type { LoadMetricSamples } from './loadMetrics';
import type { LoadPlatformArtifact } from './loadPlatformArtifact';
import { aggregateLoadShardArtifacts, type LoadShardArtifact } from './loadShardAggregation';
import { G9_NORMAL_SCENARIO } from './loadScenario';

const target = {
  mode: 'e2e' as const,
  projectRef: 'sojmvhhwsjxmfistvzbe',
  computeTier: 'Micro',
  gateEligible: true,
};

function shardArtifact(index: number): LoadShardArtifact {
  const sessionCount = index < 4 ? 13 : 12;
  const sequenceBase = index < 4 ? index * 13 : 52 + (index - 4) * 12;
  const scoringDurationsMs = Array.from(
    { length: sessionCount },
    (_, offset) => sequenceBase + offset + 1
  );
  const ringsideSessions = [7, 7, 7, 7, 7, 7, 7, 6][index];
  const ringsidePeak = [6, 6, 6, 6, 6, 6, 6, 5][index];
  const intervalBaseMs = 1_000 + index * 10_000;
  const observation: LoadObservation = {
    concurrentSessions: sessionCount,
    ringsideSessions,
    sessionLifecycle: {
      configuredSessions: sessionCount,
      preparedSessions: sessionCount,
      startedWorkflows: sessionCount,
      completedWorkflows: sessionCount,
      failedWorkflows: 0,
      peakActiveWorkflows: sessionCount,
      configuredRingsideSessions: ringsideSessions,
      preparedRingsideSessions: ringsideSessions,
      startedRingsideWorkflows: ringsideSessions,
      completedRingsideWorkflows: ringsideSessions,
      failedRingsideWorkflows: 0,
      peakActiveRingsideWorkflows: ringsidePeak,
      activityIntervals: Array.from({ length: sessionCount }, (_, offset) => {
        const inPeakBatch =
          offset < ringsidePeak ||
          (offset >= ringsideSessions && offset < ringsideSessions + (20 - ringsidePeak));
        return {
          sequence: index + offset * 8,
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
          samplingWindow: 'active-load' as const,
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
    shard: { count: 8, index },
    assignmentSequences: Array.from({ length: sessionCount }, (_, offset) => index + offset * 8),
    target,
    scenarioId: 'normal',
    observation,
    samples,
  };
}

function platformArtifact(): LoadPlatformArtifact {
  return {
    schemaVersion: 1,
    runId: '12345-1',
    startAtMs: 1_785_283_200_000,
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
  };
}

describe('distributed load aggregation', () => {
  it('retains failed reconciliation evidence through JSON and rejects the complete run', () => {
    const artifacts = Array.from({ length: 8 }, (_, index) => shardArtifact(index));
    artifacts[7].observation.persistedScores = null;
    artifacts[7].observation.persistenceFailures = [{ kind: 'http', status: 503, entryCount: 6 }];
    const result = aggregateLoadShardArtifacts(
      JSON.parse(JSON.stringify(artifacts)),
      G9_NORMAL_SCENARIO,
      platformArtifact()
    );

    expect(result.observation.persistedScores).toBeNull();
    expect(result.observation.persistenceFailures).toEqual([
      { kind: 'http', status: 503, entryCount: 6, shardIndex: 7 },
    ]);
    expect(result.observation.requestCount).toBe(72_000);
    expect(evaluateLoadResult(G9_NORMAL_SCENARIO, result.observation).failures).toContain(
      'Persisted scoring results did not reconcile.'
    );
  });

  it('combines eight manifests without summing temporally disjoint shard peaks', () => {
    const result = aggregateLoadShardArtifacts(
      Array.from({ length: 8 }, (_, index) => shardArtifact(index)),
      G9_NORMAL_SCENARIO,
      platformArtifact()
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
        peakActiveWorkflows: 12,
        configuredRingsideSessions: 55,
        preparedRingsideSessions: 55,
        startedRingsideWorkflows: 55,
        completedRingsideWorkflows: 55,
        failedRingsideWorkflows: 0,
        peakActiveRingsideWorkflows: 6,
      },
      generator: {
        shards: [
          { shardIndex: 0, hostCpuP95Percent: 60 },
          { shardIndex: 1, hostCpuP95Percent: 61 },
          { shardIndex: 2, hostCpuP95Percent: 62 },
          { shardIndex: 3, hostCpuP95Percent: 63 },
          { shardIndex: 4, hostCpuP95Percent: 64 },
          { shardIndex: 5, hostCpuP95Percent: 65 },
          { shardIndex: 6, hostCpuP95Percent: 66 },
          { shardIndex: 7, hostCpuP95Percent: 67 },
        ],
      },
      requestCount: 72_000,
      scoringWriteP95Ms: 95,
      apiP95Ms: 95,
      pageP95Ms: 1_000,
      throughputRps: 120,
      expectedPersistedScores: 880,
      persistedScores: 880,
      maxReplicationQueueDepth: 8,
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
    ['missing shard', Array.from({ length: 7 }, (_, index) => shardArtifact(index))],
    [
      'duplicate shard',
      [...Array.from({ length: 7 }, (_, index) => shardArtifact(index)), shardArtifact(6)],
    ],
    [
      'late shard',
      [
        ...Array.from({ length: 7 }, (_, index) => shardArtifact(index)),
        { ...shardArtifact(7), startedAtMs: shardArtifact(7).startAtMs + 5_001 },
      ],
    ],
  ])('rejects a %s', (_name, artifacts) => {
    expect(() =>
      aggregateLoadShardArtifacts(artifacts, G9_NORMAL_SCENARIO, platformArtifact())
    ).toThrow();
  });

  it('still aggregates eight valid shards when the sampler produced nothing', () => {
    // Eight shards of evidence are expensive and one-shot against shared
    // staging; a dead sampler must degrade to a recorded FAIL, not destroy them.
    const result = aggregateLoadShardArtifacts(
      Array.from({ length: 8 }, (_, index) => shardArtifact(index)),
      G9_NORMAL_SCENARIO,
      undefined
    );

    expect(result.observation.requestCount).toBe(72_000);
    expect(result.observation.platform).toBeUndefined();
    const evaluation = evaluateLoadResult(G9_NORMAL_SCENARIO, result.observation);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toContain('Required platform telemetry was missing.');
  });

  it('rejects a shard that sampled the platform itself', () => {
    // Shard 0 owned the sampler until 2026-08-26; that extra work saturated it
    // (95.3% host CPU p95 against healthy siblings) and invalidated attribution.
    const artifacts = Array.from({ length: 8 }, (_, index) => shardArtifact(index));
    artifacts[0].observation.platform = platformArtifact().platform;

    expect(() =>
      aggregateLoadShardArtifacts(artifacts, G9_NORMAL_SCENARIO, platformArtifact())
    ).toThrow('sampling belongs to the dedicated runner');
  });

  it.each([
    ['run', { runId: 'other-run' }],
    ['start', { startAtMs: 1_785_283_200_001 }],
    ['schema', { schemaVersion: 2 as unknown as 1 }],
  ])('rejects platform telemetry from a different %s', (_name, override) => {
    const artifacts = Array.from({ length: 8 }, (_, index) => shardArtifact(index));

    expect(() =>
      aggregateLoadShardArtifacts(artifacts, G9_NORMAL_SCENARIO, {
        ...platformArtifact(),
        ...override,
      })
    ).toThrow(/does not belong to this rehearsal|schema is not supported/);
  });

  it('rejects an artifact that omits runner evidence', () => {
    const artifact = shardArtifact(6);
    const invalid = {
      ...artifact,
      observation: { ...artifact.observation, generator: undefined },
    } as unknown as LoadShardArtifact;
    expect(() =>
      aggregateLoadShardArtifacts(
        [
          ...Array.from({ length: 6 }, (_, index) => shardArtifact(index)),
          invalid,
          shardArtifact(7),
        ],
        G9_NORMAL_SCENARIO,
        platformArtifact()
      )
    ).toThrow(/generator/i);
  });
});
