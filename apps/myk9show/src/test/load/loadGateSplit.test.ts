import { describe, expect, it } from 'vitest';
import { evaluateLoadResult, type LoadObservation } from './loadEvaluation';
import { LOAD_TOTAL_RING_COUNT } from './loadFixture';
import { G9_NORMAL_SCENARIO, scenarioSessionCount } from './loadScenario';

/**
 * Gate eligibility is decided per target, not per scenario.
 *
 * Suspending the whole gate to re-derive three numbers would open it far wider
 * than the remodel requires: a lost scoring write, a queue that never drains or
 * an unreconciled persistence count is a defect at any workload. These tests fix
 * the split in both directions — moving a gating invariant to informational must
 * fail, and so must making a shape-dependent target gate before derivation.
 */

const TOTAL = scenarioSessionCount(G9_NORMAL_SCENARIO);
const RINGSIDE = LOAD_TOTAL_RING_COUNT;

function intervals(total: number, ringside: number) {
  return Array.from({ length: total }, (_, sequence) => ({
    sequence,
    ringside: sequence < ringside,
    startedAtMs: 1_000,
    finishedAtMs: 3_000,
  }));
}

function passingObservation(overrides: Partial<LoadObservation> = {}): LoadObservation {
  return {
    concurrentSessions: TOTAL,
    ringsideSessions: RINGSIDE,
    sessionLifecycle: {
      configuredSessions: TOTAL,
      preparedSessions: TOTAL,
      startedWorkflows: TOTAL,
      completedWorkflows: TOTAL,
      failedWorkflows: 0,
      peakActiveWorkflows: TOTAL,
      configuredRingsideSessions: RINGSIDE,
      preparedRingsideSessions: RINGSIDE,
      startedRingsideWorkflows: RINGSIDE,
      completedRingsideWorkflows: RINGSIDE,
      failedRingsideWorkflows: 0,
      peakActiveRingsideWorkflows: RINGSIDE,
      activityIntervals: intervals(TOTAL, RINGSIDE),
    },
    generator: {
      shards: Array.from({ length: 16 }, (_, shardIndex) => ({
        shardIndex,
        logicalCpuCount: 4,
        sampleCount: 100,
        samplingDurationMs: 100_000,
        samplingWindow: 'active-load' as const,
        hostSampleCoveragePercent: 100,
        hostCpuP95Percent: 50,
        hostCpuPeakPercent: 60,
        hostMemoryPeakPercent: 20,
        hostLoad1mPeak: 2,
        eventLoopDelayP95Ms: 10,
        eventLoopDelayMaxMs: 20,
        browserControlP95Ms: 10,
        browserControlMaxMs: 20,
        browserControlAttempts: 100,
        browserControlSamples: 100,
        browserControlFailures: 0,
        browserControlAttemptCoveragePercent: 100,
        contextPreparationMs: 4_000,
        startHeadroomMs: 100_000,
      })),
    },
    requestCount: 100_000,
    failedRequestCount: 0,
    workflowFailures: 0,
    workflowFailureDetails: [],
    scoringWriteP95Ms: 100,
    apiP95Ms: 100,
    pageP95Ms: 500,
    errorRate: 0,
    throughputRps: 200,
    availabilityPercent: 100,
    scoringWriteAttempts: 100,
    serializationFailures: 0,
    retryAttempts: 0,
    retrySuccesses: 0,
    exhaustedRetries: 0,
    maxReplicationQueueDepth: 1,
    finalReplicationQueueDepth: 0,
    queueTelemetryFailures: 0,
    expectedPersistedScores: 10,
    persistedScores: 10,
    platform: {
      peakCpuPercent: 40,
      peakIoPercent: 10,
      peakConnections: 30,
      connectionCap: 60,
      statementDeltas: [{ queryId: '1', calls: 1, rows: 1, totalExecTimeMs: 1, meanExecTimeMs: 1 }],
    },
    ...overrides,
  };
}

describe('shape-dependent targets report without gating', () => {
  it.each([
    ['API p95', { apiP95Ms: 99_999 }, /API p95/],
    ['scoring-write p95', { scoringWriteP95Ms: 99_999 }, /Scoring-write p95/],
    ['throughput', { throughputRps: 0.1 }, /Throughput/],
  ])('%s misses without failing the gate', (_name, override, matcher) => {
    const result = evaluateLoadResult(G9_NORMAL_SCENARIO, passingObservation(override));
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.pendingDerivation.join(' ')).toMatch(matcher);
  });

  it('reports every missed shape-dependent target, not just the first', () => {
    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation({ apiP95Ms: 99_999, scoringWriteP95Ms: 99_999, throughputRps: 0.1 })
    );
    expect(result.passed).toBe(true);
    expect(result.pendingDerivation).toHaveLength(3);
  });
});

describe('shape-independent invariants keep gating', () => {
  it.each([
    ['queues did not drain', { finalReplicationQueueDepth: 3 }],
    ['queue telemetry incomplete', { queueTelemetryFailures: 1 }],
    ['persistence did not reconcile', { persistedScores: 9 }],
    ['error rate exceeded', { errorRate: 0.9 }],
    ['availability below target', { availabilityPercent: 10 }],
    [
      'connections beyond the verified cap',
      {
        platform: { ...passingObservation().platform!, peakConnections: 61 },
      },
    ],
    ['platform telemetry missing', { platform: undefined }],
  ])('%s fails the gate', (_name, override) => {
    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation(override as Partial<LoadObservation>)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it('fails on two scorers in one ring, which is the whole point of the remodel', () => {
    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation({ ringsideSessions: RINGSIDE + 1 })
    );
    expect(result.passed).toBe(false);
    expect(result.failures.join(' ')).toMatch(/did not equal the ring count/);
  });
});

describe('the split is non-vacuous', () => {
  it('a clean run has neither gating failures nor pending items', () => {
    const result = evaluateLoadResult(G9_NORMAL_SCENARIO, passingObservation());
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.pendingDerivation).toEqual([]);
  });

  it('keeps the two sets disjoint', () => {
    // If a message could appear in both, the split would not distinguish
    // anything and a reader could not tell which half a run actually passed.
    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation({ apiP95Ms: 99_999, finalReplicationQueueDepth: 2 })
    );
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.pendingDerivation.length).toBeGreaterThan(0);
    for (const item of result.pendingDerivation) {
      expect(result.failures).not.toContain(item);
    }
  });

  it('a gating failure still fails even when a shape-dependent target also missed', () => {
    // The dangerous direction: a run must not pass merely because the only
    // enforced problems were moved to the reported column.
    const result = evaluateLoadResult(
      G9_NORMAL_SCENARIO,
      passingObservation({ apiP95Ms: 99_999, persistedScores: 0 })
    );
    expect(result.passed).toBe(false);
  });
});
