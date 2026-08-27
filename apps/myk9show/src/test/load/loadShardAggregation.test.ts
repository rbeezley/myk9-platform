import { describe, expect, it } from 'vitest';
import { evaluateLoadResult, type LoadObservation } from './loadEvaluation';
import type { LoadMetricSamples } from './loadMetrics';
import type { LoadPlatformArtifact } from './loadPlatformArtifact';
import { aggregateLoadShardArtifacts, type LoadShardArtifact } from './loadShardAggregation';
import {
  G9_NORMAL_SCENARIO,
  scenarioRingsideSessionCount,
  scenarioSessionCount,
} from './loadScenario';
import { calculatePeakActiveWorkflows } from './loadSessionLifecycle';
import { DISTRIBUTED_G9_SHARD_COUNT } from './loadShard';

const target = {
  mode: 'e2e' as const,
  projectRef: 'sojmvhhwsjxmfistvzbe',
  computeTier: 'Micro',
  gateEligible: true,
};

// Derived from the shard count rather than hardcoded, so changing the topology
// (8 -> 16 on 2026-08-26) does not silently invalidate every fixture here.
// Mirrors selectShardAssignments: shard i owns the sequences where
// sequence % count === i, and the first RINGSIDE_SESSIONS of them are ringside.
const TOTAL_SESSIONS = scenarioSessionCount(G9_NORMAL_SCENARIO);
const RINGSIDE_SESSIONS = scenarioRingsideSessionCount(G9_NORMAL_SCENARIO);
const PER_SHARD_REQUESTS = 9_000;
const PER_SHARD_EXPECTED_SCORES = 110;
// The busiest single shard -- the cross-shard peak, not the whole-workload sum.
/**
 * Aggregate p95 over every shard's samples. Each shard's durations are its own
 * sequence numbers + 1, so the merged set is 1..TOTAL_SESSIONS and the expected
 * percentile follows from the workload rather than from a pinned literal.
 */
const EXPECTED_P95_MS = (() => {
  const merged = Array.from({ length: TOTAL_SESSIONS }, (_, sequence) => sequence + 1).sort(
    (a, b) => a - b
  );
  const rank = Math.ceil(0.95 * merged.length) - 1;
  return merged[rank];
})();

const PEAK = Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) =>
  shardPeak(index)
).reduce(
  (best, candidate) => ({
    total: Math.max(best.total, candidate.total),
    ringside: Math.max(best.ringside, candidate.ringside),
  }),
  { total: 0, ringside: 0 }
);

function shardSequences(index: number): number[] {
  return Array.from({ length: TOTAL_SESSIONS }, (_, sequence) => sequence).filter(
    sequence => sequence % DISTRIBUTED_G9_SHARD_COUNT === index
  );
}

/**
 * Each shard's intervals are placed 10 s apart and are 9 s wide, so no two shards
 * ever overlap. The true simultaneous peak is therefore the busiest SINGLE shard,
 * which is what lets this fixture catch an aggregation that sums shard-local
 * maxima instead of merging intervals.
 *
 * Reuses the runner's own primitive rather than restating the fixture's interval
 * arithmetic: a hand-copied version could be edited into agreement with a broken
 * aggregator and stop failing.
 */
function shardPeak(index: number): { total: number; ringside: number } {
  return calculatePeakActiveWorkflows(
    shardArtifact(index).observation.sessionLifecycle.activityIntervals
  );
}

function shardArtifact(index: number): LoadShardArtifact {
  const sequences = shardSequences(index);
  const sessionCount = sequences.length;
  const scoringDurationsMs = sequences.map(sequence => sequence + 1);
  const ringsideSessions = sequences.filter(sequence => sequence < RINGSIDE_SESSIONS).length;
  // One below the session count, so the aggregate peak stays a real cross-shard
  // maximum rather than a sum of shard-local ones.
  const ringsidePeak = Math.max(0, ringsideSessions - 1);
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
          sequence: sequences[offset],
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
    requestCount: PER_SHARD_REQUESTS,
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
    expectedPersistedScores: PER_SHARD_EXPECTED_SCORES,
    persistedScores: PER_SHARD_EXPECTED_SCORES,
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
    shard: { count: DISTRIBUTED_G9_SHARD_COUNT, index },
    assignmentSequences: sequences,
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
    const artifacts = Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) =>
      shardArtifact(index)
    );
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
    expect(result.observation.requestCount).toBe(PER_SHARD_REQUESTS * DISTRIBUTED_G9_SHARD_COUNT);
    expect(evaluateLoadResult(G9_NORMAL_SCENARIO, result.observation).failures).toContain(
      'Persisted scoring results did not reconcile.'
    );
  });

  it('combines every manifest without summing temporally disjoint shard peaks', () => {
    const result = aggregateLoadShardArtifacts(
      Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) => shardArtifact(index)),
      G9_NORMAL_SCENARIO,
      platformArtifact()
    );

    expect(result.target).toEqual(target);
    expect(result.observation).toMatchObject({
      concurrentSessions: TOTAL_SESSIONS,
      ringsideSessions: RINGSIDE_SESSIONS,
      sessionLifecycle: {
        configuredSessions: TOTAL_SESSIONS,
        preparedSessions: TOTAL_SESSIONS,
        startedWorkflows: TOTAL_SESSIONS,
        completedWorkflows: TOTAL_SESSIONS,
        failedWorkflows: 0,
        peakActiveWorkflows: PEAK.total,
        configuredRingsideSessions: RINGSIDE_SESSIONS,
        preparedRingsideSessions: RINGSIDE_SESSIONS,
        startedRingsideWorkflows: RINGSIDE_SESSIONS,
        completedRingsideWorkflows: RINGSIDE_SESSIONS,
        failedRingsideWorkflows: 0,
        peakActiveRingsideWorkflows: PEAK.ringside,
      },
      generator: {
        // Every shard's evidence is preserved separately and in index order --
        // the property that lets a single saturated runner be identified.
        shards: Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) => ({
          shardIndex: index,
          hostCpuP95Percent: 60 + index,
        })),
      },
      requestCount: PER_SHARD_REQUESTS * DISTRIBUTED_G9_SHARD_COUNT,
      scoringWriteP95Ms: EXPECTED_P95_MS,
      apiP95Ms: EXPECTED_P95_MS,
      pageP95Ms: 1_000,
      throughputRps: (PER_SHARD_REQUESTS * DISTRIBUTED_G9_SHARD_COUNT) / 600,
      expectedPersistedScores: PER_SHARD_EXPECTED_SCORES * DISTRIBUTED_G9_SHARD_COUNT,
      persistedScores: PER_SHARD_EXPECTED_SCORES * DISTRIBUTED_G9_SHARD_COUNT,
      maxReplicationQueueDepth: DISTRIBUTED_G9_SHARD_COUNT,
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
    [
      'missing shard',
      Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT - 1 }, (_, index) => shardArtifact(index)),
    ],
    [
      'duplicate shard',
      [
        ...Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT - 1 }, (_, index) =>
          shardArtifact(index)
        ),
        shardArtifact(DISTRIBUTED_G9_SHARD_COUNT - 2),
      ],
    ],
    [
      'late shard',
      [
        ...Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT - 1 }, (_, index) =>
          shardArtifact(index)
        ),
        {
          ...shardArtifact(DISTRIBUTED_G9_SHARD_COUNT - 1),
          startedAtMs: shardArtifact(0).startAtMs + 5_001,
        },
      ],
    ],
  ])('rejects a %s', (_name, artifacts) => {
    expect(() =>
      aggregateLoadShardArtifacts(artifacts, G9_NORMAL_SCENARIO, platformArtifact())
    ).toThrow();
  });

  it('still aggregates every valid shard when the sampler produced nothing', () => {
    // A full set of shard evidence is expensive and one-shot against shared
    // staging; a dead sampler must degrade to a recorded FAIL, not destroy it.
    const result = aggregateLoadShardArtifacts(
      Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) => shardArtifact(index)),
      G9_NORMAL_SCENARIO,
      undefined
    );

    expect(result.observation.requestCount).toBe(PER_SHARD_REQUESTS * DISTRIBUTED_G9_SHARD_COUNT);
    expect(result.observation.platform).toBeUndefined();
    const evaluation = evaluateLoadResult(G9_NORMAL_SCENARIO, result.observation);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toContain('Required platform telemetry was missing.');
  });

  it('rejects a shard that sampled the platform itself', () => {
    // Shard 0 owned the sampler until 2026-08-26; that extra work saturated it
    // (95.3% host CPU p95 against healthy siblings) and invalidated attribution.
    const artifacts = Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) =>
      shardArtifact(index)
    );
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
    const artifacts = Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT }, (_, index) =>
      shardArtifact(index)
    );

    expect(() =>
      aggregateLoadShardArtifacts(artifacts, G9_NORMAL_SCENARIO, {
        ...platformArtifact(),
        ...override,
      })
    ).toThrow(/does not belong to this rehearsal|schema is not supported/);
  });

  it('rejects an artifact that omits runner evidence', () => {
    const artifact = shardArtifact(DISTRIBUTED_G9_SHARD_COUNT - 2);
    const invalid = {
      ...artifact,
      observation: { ...artifact.observation, generator: undefined },
    } as unknown as LoadShardArtifact;
    expect(() =>
      aggregateLoadShardArtifacts(
        [
          ...Array.from({ length: DISTRIBUTED_G9_SHARD_COUNT - 2 }, (_, index) =>
            shardArtifact(index)
          ),
          invalid,
          shardArtifact(DISTRIBUTED_G9_SHARD_COUNT - 1),
        ],
        G9_NORMAL_SCENARIO,
        platformArtifact()
      )
    ).toThrow(/generator/i);
  });
});
