import type { CDPSession, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { LoadMetrics, percentile } from './loadMetrics';

describe('load metrics', () => {
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
});
