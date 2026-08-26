import type { CDPSession, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { LoadMetrics, percentile } from './loadMetrics';

function sessionEvidence(ringsideSessions: 0 | 1) {
  return {
    sessionLifecycle: {
      configuredSessions: 1,
      preparedSessions: 1,
      startedWorkflows: 1,
      completedWorkflows: 1,
      failedWorkflows: 0,
      peakActiveWorkflows: 1,
      configuredRingsideSessions: ringsideSessions,
      preparedRingsideSessions: ringsideSessions,
      startedRingsideWorkflows: ringsideSessions,
      completedRingsideWorkflows: ringsideSessions,
      failedRingsideWorkflows: 0,
      peakActiveRingsideWorkflows: ringsideSessions,
      activityIntervals: [
        {
          sequence: 0,
          ringside: ringsideSessions === 1,
          startedAtMs: 1,
          finishedAtMs: 2,
        },
      ],
    },
    generator: {
      shardIndex: 0,
      logicalCpuCount: 2,
      samplingDurationMs: 1_000,
      sampleCount: 1,
      hostSampleCoveragePercent: 100,
      hostCpuP95Percent: 1,
      hostCpuPeakPercent: 1,
      hostMemoryPeakPercent: 1,
      hostLoad1mPeak: 1,
      eventLoopDelayP95Ms: 1,
      eventLoopDelayMaxMs: 1,
      browserControlP95Ms: 1,
      browserControlMaxMs: 1,
      browserControlAttempts: 1,
      browserControlSamples: 1,
      browserControlFailures: 0,
      browserControlAttemptCoveragePercent: 100,
      contextPreparationMs: 1,
      startHeadroomMs: 1,
    },
  };
}

describe('load metrics', () => {
  it('retains collected samples alongside unknown persistence in the shard observation', () => {
    const metrics = new LoadMetrics();
    metrics.recordPageDuration(123);
    const observation = metrics.buildObservation({
      concurrentSessions: 1,
      ringsideSessions: 1,
      ...sessionEvidence(1),
      elapsedMs: 1_000,
      maxReplicationQueueDepth: 0,
      finalReplicationQueueDepth: 0,
      queueTelemetryFailures: 0,
      expectedPersistedScores: 1,
      persistedScores: null,
      persistenceFailures: [{ kind: 'http', status: 503, entryCount: 1 }],
    });
    expect(observation.persistedScores).toBeNull();
    expect(observation.persistenceFailures).toEqual([{ kind: 'http', status: 503, entryCount: 1 }]);
    expect(observation.pageP95Ms).toBe(123);
  });

  it('uses nearest-rank percentiles without mutating samples', () => {
    const samples = [100, 20, 80, 40, 60];
    expect(percentile(samples, 95)).toBe(100);
    expect(percentile(samples, 50)).toBe(60);
    expect(samples).toEqual([100, 20, 80, 40, 60]);
  });

  it('fails closed when a metric has no samples', () => {
    expect(percentile([], 95)).toBe(Number.POSITIVE_INFINITY);
  });

  it('records request status and timing through primitive CDP network events', async () => {
    const listeners = new Map<string, (event: never) => void>();
    const session = {
      send: vi.fn().mockResolvedValue({}),
      on(event: string, listener: (event: never) => void) {
        listeners.set(event, listener);
        return session;
      },
    } as unknown as CDPSession;
    const page = {
      context: () => ({ newCDPSession: vi.fn().mockResolvedValue(session) }),
    } as unknown as Page;
    const metrics = new LoadMetrics();
    await metrics.attach(page);

    listeners.get('Network.requestWillBeSent')?.({
      requestId: 'request-1',
      timestamp: 10,
      request: {
        url: 'https://project.supabase.co/rest/v1/entries',
      },
    } as never);
    listeners.get('Network.responseReceived')?.({
      requestId: 'request-1',
      timestamp: 10.125,
      response: {
        url: 'https://project.supabase.co/rest/v1/entries',
        status: 503,
      },
    } as never);
    await metrics.settle();

    const observation = metrics.buildObservation({
      concurrentSessions: 1,
      ringsideSessions: 0,
      ...sessionEvidence(0),
      elapsedMs: 1_000,
      maxReplicationQueueDepth: 0,
      finalReplicationQueueDepth: 0,
      queueTelemetryFailures: 0,
      expectedPersistedScores: 0,
      persistedScores: 0,
    });
    expect(observation.requestCount).toBe(1);
    expect(observation.failedRequestCount).toBe(1);
  });

  it('groups workflow failures by workload, route, and normalized message', () => {
    const metrics = new LoadMetrics();
    metrics.recordWorkflowFailure({
      workload: 'ringside-scoring',
      route: '/at-show/show-1/class/class-1/score/entry-1',
      error: new Error('Timed out waiting for submit'),
    });
    metrics.recordWorkflowFailure({
      workload: 'ringside-scoring',
      route: '/at-show/show-1/class/class-1/score/entry-1',
      error: new Error('Timed out waiting for submit'),
    });

    const observation = metrics.buildObservation({
      concurrentSessions: 1,
      ringsideSessions: 1,
      ...sessionEvidence(1),
      elapsedMs: 1_000,
      maxReplicationQueueDepth: 0,
      finalReplicationQueueDepth: 0,
      queueTelemetryFailures: 0,
      expectedPersistedScores: 0,
      persistedScores: 0,
    });

    expect(observation.workflowFailures).toBe(2);
    expect(observation.workflowFailureDetails).toEqual([
      {
        workload: 'ringside-scoring',
        route: '/at-show/show-1/class/class-1/score/entry-1',
        message: 'Timed out waiting for submit',
        count: 2,
      },
    ]);
  });

  it('bounds unique workflow groups and truncates route/message payloads', () => {
    const metrics = new LoadMetrics();
    for (let index = 0; index < 105; index += 1) {
      metrics.recordWorkflowFailure({
        workload: 'operations-read',
        route: `/failure-${index}-${'r'.repeat(250)}`,
        error: new Error(`failure-${index}-${'m'.repeat(350)}`),
      });
    }

    const observation = metrics.buildObservation({
      concurrentSessions: 1,
      ringsideSessions: 0,
      ...sessionEvidence(0),
      elapsedMs: 1_000,
      maxReplicationQueueDepth: 0,
      finalReplicationQueueDepth: 0,
      queueTelemetryFailures: 0,
      expectedPersistedScores: 0,
      persistedScores: 0,
    });

    expect(observation.workflowFailureDetails).toHaveLength(100);
    expect(observation.workflowFailureDetails.every(detail => detail.route.length <= 200)).toBe(
      true
    );
    expect(observation.workflowFailureDetails.every(detail => detail.message.length <= 300)).toBe(
      true
    );
    expect(
      observation.workflowFailureDetails.find(
        detail => detail.message === 'Additional unique workflow failures were grouped.'
      )?.count
    ).toBe(6);
  });
});
