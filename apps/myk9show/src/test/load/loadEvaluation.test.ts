import { describe, expect, it } from 'vitest';
import { evaluateLoadResult, type LoadObservation } from './loadEvaluation';
import { G9_NORMAL_SCENARIO, LOAD_SCENARIOS } from './loadScenario';

function passingObservation(overrides: Partial<LoadObservation> = {}): LoadObservation {
  return {
    concurrentSessions: 100,
    ringsideSessions: 55,
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
});
