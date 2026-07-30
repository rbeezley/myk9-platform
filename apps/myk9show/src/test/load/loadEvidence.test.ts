import { describe, expect, it } from 'vitest';
import { buildLoadEvidence, renderLoadEvidenceMarkdown } from './loadEvidence';
import type { LoadEvaluation, LoadObservation } from './loadEvaluation';
import { G9_NORMAL_SCENARIO } from './loadScenario';

const observation: LoadObservation = {
  concurrentSessions: 100,
  ringsideSessions: 55,
  requestCount: 36_000,
  failedRequestCount: 10,
  workflowFailures: 0,
  workflowFailureDetails: [
    {
      workload: 'secretary-check-in',
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
  derived: { serializationFailureRate: 2 / 440 },
};

describe('load evidence', () => {
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
      seedSize: 514,
      target: { mode: 'e2e', projectRef: 'approved', computeTier: 'Small' },
      scenario: {
        durationMs: 600_000,
        configuredSessions: 100,
        configuredRingsideSessions: 55,
        browserBehaviorVersion: 'connected-devices-v2',
      },
      supportedCeiling: '55 concurrent ringside sessions on a show of 514 entries',
    });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('supabase.co');
    expect(renderLoadEvidenceMarkdown(evidence)).toContain('Result: PASS');
    expect(renderLoadEvidenceMarkdown(evidence)).toContain(
      'secretary-check-in ×3 — Checked-in button timed out'
    );
  });
});
