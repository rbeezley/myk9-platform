import { describe, expect, it } from 'vitest';
import { G9_NORMAL_SCENARIO, scenarioSessionCount } from './loadScenario';
import { LOAD_SHOWS, LOAD_TOTAL_ENTRY_COUNT, LOAD_TOTAL_RING_COUNT } from './loadFixture';

const TOTAL = scenarioSessionCount(G9_NORMAL_SCENARIO);
const RINGSIDE = LOAD_TOTAL_RING_COUNT;
import { buildLoadEvidence, renderLoadEvidenceMarkdown } from './loadEvidence';
import type { LoadEvaluation, LoadObservation } from './loadEvaluation';

const observation: LoadObservation = {
  concurrentSessions: TOTAL,
  ringsideSessions: RINGSIDE,
  sessionLifecycle: {
    configuredSessions: TOTAL,
    preparedSessions: TOTAL,
    startedWorkflows: TOTAL,
    completedWorkflows: TOTAL - 3,
    failedWorkflows: 3,
    peakActiveWorkflows: TOTAL,
    configuredRingsideSessions: RINGSIDE,
    preparedRingsideSessions: RINGSIDE,
    startedRingsideWorkflows: RINGSIDE,
    completedRingsideWorkflows: 54,
    failedRingsideWorkflows: 1,
    peakActiveRingsideWorkflows: RINGSIDE,
    activityIntervals: Array.from({ length: TOTAL }, (_, sequence) => ({
      sequence,
      ringside: sequence < RINGSIDE,
      startedAtMs: 1_000,
      finishedAtMs: 3_000,
    })),
  },
  generator: {
    shards: [
      {
        shardIndex: 0,
        samplingWindow: 'active-load' as const,
        logicalCpuCount: 2,
        samplingDurationMs: 600_000,
        sampleCount: 600,
        hostSampleCoveragePercent: 100,
        hostCpuP95Percent: 70,
        hostCpuPeakPercent: 88,
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
      },
    ],
  },
  requestCount: 36_000,
  failedRequestCount: 10,
  workflowFailures: 3,
  workflowFailureDetails: [
    {
      workload: 'steward-check-in',
      route: '/at-show/show-1/class/class-1',
      message: 'Checked-in button timed out',
      count: 3,
    },
  ],
  scoringWriteP95Ms: 180,
  apiP95Ms: 190,
  pageP95Ms: 2_500,
  errorRate: 0.001,
  throughputRps: 60,
  availabilityPercent: 99.9,
  scoringWriteAttempts: 440,
  serializationFailures: 2,
  retryAttempts: 2,
  retrySuccesses: 2,
  exhaustedRetries: 0,
  maxReplicationQueueDepth: 3,
  finalReplicationQueueDepth: 0,
  queueTelemetryFailures: 0,
  expectedPersistedScores: 440,
  persistedScores: 440,
  platform: {
    peakCpuPercent: 70,
    peakIoPercent: 40,
    peakConnections: 42,
    connectionCap: 60,
    statementDeltas: [
      {
        queryId: 'redacted-id',
        calls: 440,
        rows: 440,
        totalExecTimeMs: 4_400,
        meanExecTimeMs: 10,
      },
    ],
  },
};

const evaluation: LoadEvaluation = {
  passed: true,
  gateEligible: true,
  informational: false,
  gate: 'G9',
  failures: [],
  derived: {
    serializationFailureRate: 2 / 440,
    generatorAttributionValid: true,
    saturatedGeneratorShards: [],
  },
};

describe('load evidence', () => {
  it('does not advertise a supported ceiling after a failed rehearsal', () => {
    const evidence = buildLoadEvidence({
      target: { mode: 'e2e', projectRef: 'approved', computeTier: 'Micro', gateEligible: true },
      scenario: G9_NORMAL_SCENARIO,
      observation,
      evaluation: { ...evaluation, passed: false, failures: ['Incomplete evidence'] },
    });
    expect(evidence.supportedCeiling).toBe('Not established');
  });
  it('records the sanitized target, seed, duration, and supported ceiling', () => {
    const evidence = buildLoadEvidence({
      target: {
        mode: 'e2e',
        projectRef: 'approved',
        computeTier: 'Small',
        gateEligible: true,
      },
      scenario: G9_NORMAL_SCENARIO,
      observation,
      evaluation,
      generatedAt: '2026-07-28T12:00:00.000Z',
    });

    expect(evidence).toMatchObject({
      seedSize: LOAD_TOTAL_ENTRY_COUNT,
      target: { mode: 'e2e', projectRef: 'approved', computeTier: 'Small' },
      scenario: {
        durationMs: 600_000,
        configuredSessions: TOTAL,
        configuredRingsideSessions: RINGSIDE,
        browserBehaviorVersion: 'connected-devices-v3-generator-evidence',
      },
      supportedCeiling: `${RINGSIDE} concurrent rings across ${LOAD_SHOWS.length} shows and ${LOAD_TOTAL_ENTRY_COUNT} entries`,
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('supabase.co');
    expect(renderLoadEvidenceMarkdown(evidence)).toContain('Result: PASS');
    expect(renderLoadEvidenceMarkdown(evidence)).toContain(
      'steward-check-in ×3 — Checked-in button timed out'
    );
    expect(renderLoadEvidenceMarkdown(evidence)).toContain(
      `Sessions configured/prepared/started/completed/failed/peak-active: ${TOTAL} / ${TOTAL} / ${TOTAL} / ${TOTAL - 3} / 3 / ${TOTAL}`
    );
    expect(renderLoadEvidenceMarkdown(evidence)).toContain('Runner 0: HEALTHY');
    expect(renderLoadEvidenceMarkdown(evidence)).toContain(
      'Backend-latency attribution from browser timings: VALID'
    );
  });
});
