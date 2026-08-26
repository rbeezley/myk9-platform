import { describe, expect, it } from 'vitest';
import { evaluateLoadResult, type LoadObservation } from './loadEvaluation';
import { G9_NORMAL_SCENARIO, LOAD_SCENARIOS } from './loadScenario';

function activityIntervals(sessionCount: number, ringsideCount: number) {
  return Array.from({ length: sessionCount }, (_, sequence) => ({
    sequence,
    ringside: sequence < ringsideCount,
    startedAtMs: 1_000,
    finishedAtMs: 2_000,
  }));
}

function passingObservation(overrides: Partial<LoadObservation> = {}): LoadObservation {
  return {
    concurrentSessions: 100,
    ringsideSessions: 55,
    sessionLifecycle: {
      configuredSessions: 100,
      preparedSessions: 100,
      startedWorkflows: 100,
      completedWorkflows: 100,
      failedWorkflows: 0,
      peakActiveWorkflows: 100,
      configuredRingsideSessions: 55,
      preparedRingsideSessions: 55,
      startedRingsideWorkflows: 55,
      completedRingsideWorkflows: 55,
      failedRingsideWorkflows: 0,
      peakActiveRingsideWorkflows: 55,
      activityIntervals: activityIntervals(100, 55),
    },
    generator: {
      shards: Array.from({ length: 8 }, (_, shardIndex) => ({
        shardIndex,
        samplingWindow: 'active-load' as const,
        logicalCpuCount: 2,
        samplingDurationMs: 600_000,
        sampleCount: 600,
        hostSampleCoveragePercent: 100,
        hostCpuP95Percent: 70,
        hostCpuPeakPercent: 85,
        hostMemoryPeakPercent: 72,
        hostLoad1mPeak: 3.5,
        eventLoopDelayP95Ms: 20,
        eventLoopDelayMaxMs: 80,
        browserControlP95Ms: 50,
        browserControlMaxMs: 200,
        browserControlAttempts: 600,
        browserControlSamples: 600,
        browserControlFailures: 0,
        browserControlAttemptCoveragePercent: 100,
        contextPreparationMs: 45_000,
        startHeadroomMs: 120_000,
      })),
    },
    requestCount: 36_000,
    failedRequestCount: 720,
    workflowFailures: 0,
    workflowFailureDetails: [],
    scoringWriteP95Ms: 180,
    apiP95Ms: 190,
    pageP95Ms: 2_500,
    errorRate: 0.02,
    throughputRps: 60,
    availabilityPercent: 99.8,
    scoringWriteAttempts: 1_000,
    serializationFailures: 3,
    retryAttempts: 3,
    retrySuccesses: 3,
    exhaustedRetries: 0,
    maxReplicationQueueDepth: 4,
    finalReplicationQueueDepth: 0,
    queueTelemetryFailures: 0,
    expectedPersistedScores: 55,
    persistedScores: 55,
    platform: {
      peakCpuPercent: 72,
      peakIoPercent: 44,
      peakConnections: 42,
      connectionCap: 60,
      statementDeltas: [
        {
          queryId: 'ringside-update',
          calls: 1_000,
          rows: 1_000,
          totalExecTimeMs: 12_000,
          meanExecTimeMs: 12,
        },
      ],
    },
    ...overrides,
  };
}

describe('load result evaluation', () => {
  it('rejects explicit persistence failures even if counts happen to match', () => {
    const observation = passingObservation({
      persistenceFailures: [{ kind: 'http', status: 503, entryCount: 1 }],
    });
    expect(evaluateLoadResult(G9_NORMAL_SCENARIO, observation).failures).toContain(
      'Persisted scoring results did not reconcile.'
    );
  });

  it('rejects resource sample failures even when peak values are finite', () => {
    const observation = passingObservation();
    if (!observation.platform) throw new Error('Missing fixture platform');
    observation.platform.resourceSampling = {
      attempts: 3,
      succeeded: 2,
      failures: [{ kind: 'timeout', count: 1 }],
    };
    expect(evaluateLoadResult(G9_NORMAL_SCENARIO, observation).failures).toContain(
      'Required platform telemetry was missing.'
    );
  });

  it('passes G9 only when every Normal workload and platform target is present', () => {
    expect(evaluateLoadResult(G9_NORMAL_SCENARIO, passingObservation())).toMatchObject({
      passed: true,
      gateEligible: true,
      gate: 'G9',
      failures: [],
    });
  });

  it.each([
    ['ringside sessions', { ringsideSessions: 49 }],
    ['scoring latency', { scoringWriteP95Ms: 201 }],
    ['error rate', { errorRate: 0.051 }],
    ['throughput', { throughputRps: 49.9 }],
    ['availability', { availabilityPercent: 99.4 }],
    ['queue drain', { finalReplicationQueueDepth: 1 }],
    ['queue telemetry', { queueTelemetryFailures: 1 }],
    ['persistence reconciliation', { persistedScores: 54 }],
    ['platform metrics', { platform: undefined }],
    ['connection cap', { platform: { ...passingObservation().platform!, connectionCap: 61 } }],
    ['generator evidence', { generator: undefined }],
    [
      'prepared sessions',
      {
        sessionLifecycle: {
          ...passingObservation().sessionLifecycle,
          preparedSessions: 99,
        },
      },
    ],
  ] satisfies Array<[string, Partial<LoadObservation>]>)(
    'fails Normal when %s misses',
    (_name, overrides) => {
      const result = evaluateLoadResult(G9_NORMAL_SCENARIO, passingObservation(overrides));
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    }
  );

  it('uses the Peak error budget without making the result gate-eligible', () => {
    const peak = LOAD_SCENARIOS.find(scenario => scenario.id === 'peak');
    if (!peak) throw new Error('Missing Peak scenario');

    const result = evaluateLoadResult(
      peak,
      passingObservation({
        concurrentSessions: 250,
        ringsideSessions: 125,
        sessionLifecycle: {
          configuredSessions: 250,
          preparedSessions: 250,
          startedWorkflows: 250,
          completedWorkflows: 250,
          failedWorkflows: 0,
          peakActiveWorkflows: 250,
          configuredRingsideSessions: 125,
          preparedRingsideSessions: 125,
          startedRingsideWorkflows: 125,
          completedRingsideWorkflows: 125,
          failedRingsideWorkflows: 0,
          peakActiveRingsideWorkflows: 125,
          activityIntervals: activityIntervals(250, 125),
        },
        errorRate: 0.09,
        throughputRps: 110,
        availabilityPercent: 99.2,
      })
    );

    expect(result.passed).toBe(true);
    expect(result.informational).toBe(true);
    expect(result.gateEligible).toBe(false);
    expect(result.gate).toBeNull();
  });

  it('defines the serialization-failure rate over all scoring attempts', () => {
    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation({ scoringWriteAttempts: 200, serializationFailures: 5 })
    );

    expect(result.derived.serializationFailureRate).toBe(0.025);
  });

  it('records runner-contaminated page p95 without using it as a backend gate', () => {
    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation({ pageP95Ms: 30_000 })
    );

    expect(result.passed).toBe(true);
    expect(result.failures).not.toContain('Page p95 exceeded or was missing.');
  });

  it('fails closed when a runner supplies only a token sample', () => {
    const passing = passingObservation();
    const shards = passing.generator.shards.map(shard =>
      shard.shardIndex === 1
        ? {
            ...shard,
            sampleCount: 1,
            hostSampleCoveragePercent: 100,
            browserControlAttempts: 1,
            browserControlSamples: 1,
            browserControlAttemptCoveragePercent: 100,
          }
        : shard
    );

    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation({ generator: { shards } })
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain(
      'Required per-runner generator evidence was missing or incomplete.'
    );
    expect(result.derived.generatorAttributionValid).toBe(false);
  });

  it('rejects legacy generator evidence that includes preparation idle time', () => {
    const observation = passingObservation();
    for (const shard of observation.generator.shards) delete shard.samplingWindow;
    const result = evaluateLoadResult(G9_NORMAL_SCENARIO, observation);
    expect(result.passed).toBe(false);
    expect(result.derived.generatorAttributionValid).toBe(false);
    expect(result.failures).toContain(
      'Required per-runner generator evidence was missing or incomplete.'
    );
  });

  it('identifies a saturated runner and invalidates backend latency attribution', () => {
    const passing = passingObservation();
    const shards = passing.generator.shards.map(shard =>
      shard.shardIndex === 2 ? { ...shard, hostCpuP95Percent: 95 } : shard
    );

    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation({ generator: { shards } })
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toContain(
      'Generator saturation made backend latency attribution invalid on runner shard(s): 2.'
    );
    expect(result.derived).toMatchObject({
      generatorAttributionValid: false,
      saturatedGeneratorShards: [2],
    });
  });
});
