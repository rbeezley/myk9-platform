import type { CDPSession, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiErrorTally,
  extractApiErrorCode,
  formatApiErrorCounts,
  mergeApiErrorCounts,
} from './loadErrorCodes';
import { LoadMetrics } from './loadMetrics';
import { LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT } from './loadClassColumns';
import { LoadVirtualUser } from './loadVirtualUser';
import { FIXTURE_ANON_KEY, FIXTURE_URL } from './loadVirtualUser.fixtures';

describe('error code extraction', () => {
  it.each([
    ['{"code":"PGRST003","message":"Timed out acquiring connection"}', 'PGRST003'],
    ['{"code":"57014","details":null,"message":"canceling statement"}', '57014'],
    ['{"code":"42501","message":"permission denied"}', '42501'],
    ['{"code":"PGRST003","message":"trunc', 'PGRST003'],
    ['<html>502 Bad Gateway</html>', undefined],
    ['', undefined],
    ['{"message":"no code"}', undefined],
    ['{"code":{"nested":1}}', undefined],
    ['{"code":"has spaces and is far too long to be a code"}', undefined],
  ])('reads %j as %j', (body, expected) => {
    expect(extractApiErrorCode(body)).toBe(expected);
  });
});

describe('error tally and merge', () => {
  it('counts by status and code, most frequent first', () => {
    const tally = new ApiErrorTally();
    tally.record(503, 'PGRST003');
    tally.record(503, 'PGRST003');
    tally.record(500, '57014');
    tally.record(502);
    tally.record(0);
    expect(tally.entries()).toEqual([
      { status: 503, code: 'PGRST003', count: 2 },
      { status: 0, code: 'transport', count: 1 },
      { status: 500, code: '57014', count: 1 },
      { status: 502, code: 'none', count: 1 },
    ]);
  });

  it('sums shards and tolerates shards that predate the field', () => {
    const merged = mergeApiErrorCounts([
      [{ status: 503, code: 'PGRST003', count: 4 }],
      undefined,
      [
        { status: 503, code: 'PGRST003', count: 3 },
        { status: 500, code: '57014', count: 1 },
      ],
    ]);
    expect(merged).toEqual([
      { status: 503, code: 'PGRST003', count: 7 },
      { status: 500, code: '57014', count: 1 },
    ]);
    expect(formatApiErrorCounts(merged)).toBe('PGRST003 (HTTP 503) x7, 57014 (HTTP 500) x1');
    expect(formatApiErrorCounts([])).toBe('none');
  });
});

function observationOf(metrics: LoadMetrics) {
  return metrics.buildObservation({
    concurrentSessions: 1,
    ringsideSessions: 0,
    sessionLifecycle: {
      configuredSessions: 1,
      preparedSessions: 1,
      startedWorkflows: 1,
      completedWorkflows: 1,
      failedWorkflows: 0,
      peakActiveWorkflows: 1,
      configuredRingsideSessions: 0,
      preparedRingsideSessions: 0,
      startedRingsideWorkflows: 0,
      completedRingsideWorkflows: 0,
      failedRingsideWorkflows: 0,
      peakActiveRingsideWorkflows: 0,
      activityIntervals: [],
    },
    generator: {} as never,
    elapsedMs: 1_000,
    maxReplicationQueueDepth: 0,
    finalReplicationQueueDepth: 0,
    queueTelemetryFailures: 0,
    expectedPersistedScores: 0,
    persistedScores: 0,
  });
}

describe('error codes in load metrics', () => {
  it('counts virtual-user failed requests, and takes the code tally only from the fetch layer', () => {
    const metrics = new LoadMetrics();
    metrics.recordVirtualUserRequest({ durationMs: 5, ok: true, status: 200 });
    metrics.recordVirtualUserRequest({ durationMs: 5, ok: false, status: 503, code: 'PGRST003' });
    metrics.recordVirtualUserRequest({ durationMs: 5, ok: false });
    // The final-outcome samples carry codes, but must not tally them: the fetch
    // layer already reported every response, and tallying both would double count.
    expect(observationOf(metrics).failedRequestCount).toBe(2);
    expect(observationOf(metrics).apiErrorCounts).toEqual([]);
    metrics.recordApiError({ status: 503, code: 'PGRST003' });
    metrics.recordApiError({ status: 503, code: 'PGRST003' });
    metrics.recordApiError({ status: 500 });
    metrics.recordApiError({ status: 0 });
    expect(observationOf(metrics).apiErrorCounts).toEqual([
      { status: 503, code: 'PGRST003', count: 2 },
      { status: 0, code: 'transport', count: 1 },
      { status: 500, code: 'none', count: 1 },
    ]);
  });

  it('reads the code from a failed browser API response body', async () => {
    const listeners = new Map<string, (event: never) => void>();
    const bodies = new Map<string, string>([
      ['r1', '{"code":"PGRST003","message":"pool"}'],
      ['r2', '{"code":"57014","message":"timeout"}'],
    ]);
    const session = {
      send: vi.fn(async (method: string, params?: { requestId?: string }) =>
        method === 'Network.getResponseBody' && params?.requestId
          ? { body: bodies.get(params.requestId) ?? '' }
          : {}
      ),
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

    const respond = (requestId: string, url: string, status: number) => {
      listeners.get('Network.requestWillBeSent')?.({
        requestId,
        timestamp: 1,
        request: { url },
      } as never);
      listeners.get('Network.responseReceived')?.({
        requestId,
        timestamp: 1.1,
        response: { url, status },
      } as never);
      listeners.get('Network.loadingFinished')?.({ requestId } as never);
    };
    respond('r1', 'https://p.supabase.co/rest/v1/classes', 503);
    respond('r2', 'https://p.supabase.co/rest/v1/rpc/ringside_update_entry', 500);
    respond('r3', 'https://p.supabase.co/rest/v1/dogs', 200);
    respond('r4', 'https://app.example/assets/missing.js', 404);
    listeners.get('Network.requestWillBeSent')?.({
      requestId: 'r5',
      timestamp: 2,
      request: { url: 'https://p.supabase.co/rest/v1/dogs' },
    } as never);
    listeners.get('Network.loadingFailed')?.({ requestId: 'r5' } as never);
    await metrics.settle();

    const observation = observationOf(metrics);
    expect(observation.failedRequestCount).toBe(4);
    expect(observation.apiErrorCounts).toEqual([
      { status: 0, code: 'transport', count: 1 },
      { status: 404, code: 'none', count: 1 },
      { status: 500, code: '57014', count: 1 },
      { status: 503, code: 'PGRST003', count: 1 },
    ]);
  });

  it('keeps the known status when a failed response then emits loadingFailed', async () => {
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
    const url = 'https://p.supabase.co/rest/v1/classes';
    listeners.get('Network.requestWillBeSent')?.({
      requestId: 'x',
      timestamp: 1,
      request: { url },
    } as never);
    listeners.get('Network.responseReceived')?.({
      requestId: 'x',
      timestamp: 1.1,
      response: { url, status: 503 },
    } as never);
    listeners.get('Network.loadingFailed')?.({ requestId: 'x' } as never);
    // A late loadingFinished for the same id must not double count.
    listeners.get('Network.loadingFinished')?.({ requestId: 'x' } as never);
    await metrics.settle();
    const observation = observationOf(metrics);
    expect(observation.failedRequestCount).toBe(1);
    expect(observation.apiErrorCounts).toEqual([{ status: 503, code: 'none', count: 1 }]);
  });
});

describe('virtual reader to metrics', () => {
  // The producer, not just the tally: a reader whose failed response reached the
  // metrics as status 0 would mislabel every overload error as a transport failure.
  it('carries the HTTP status and Postgres code from a real reader pass', async () => {
    const failing = (async () =>
      new Response(JSON.stringify({ code: 'PGRST003', message: 'fixture' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    const observed: { status: number; code?: string }[] = [];
    const user = new LoadVirtualUser(
      {
        supabaseUrl: FIXTURE_URL,
        anonKey: FIXTURE_ANON_KEY,
        accessToken: 'fixture-token',
        role: 'exhibitor',
        fetchImpl: failing,
        onApiError: observation => observed.push(observation),
      },
      LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT
    );
    vi.useFakeTimers();
    let samples;
    try {
      const pass = user.syncOnce();
      await vi.runAllTimersAsync();
      samples = (await pass).samples;
    } finally {
      vi.useRealTimers();
    }

    const metrics = new LoadMetrics();
    for (const sample of samples) metrics.recordVirtualUserRequest(sample);
    for (const observation of observed) metrics.recordApiError(observation);

    expect(samples.length).toBeGreaterThan(0);
    // Failed requests come from final samples; codes come from the fetch layer,
    // which sees every attempt (supabase-js retries 503s), so it reports at least
    // one response per failed request, each with its real status and code.
    expect(observationOf(metrics).failedRequestCount).toBe(samples.length);
    const counts = observationOf(metrics).apiErrorCounts ?? [];
    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ status: 503, code: 'PGRST003' });
    expect(counts[0].count).toBeGreaterThanOrEqual(samples.length);
  });

  it('counts a 503 PGRST003 that a retry recovered, without a failed request', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls += 1;
      return calls <= 2
        ? new Response(JSON.stringify({ code: 'PGRST003', message: 'pool' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const observed: { status: number; code?: string }[] = [];
    const user = new LoadVirtualUser(
      {
        supabaseUrl: FIXTURE_URL,
        anonKey: FIXTURE_ANON_KEY,
        accessToken: 'fixture-token',
        role: 'exhibitor',
        fetchImpl: flaky,
        onApiError: observation => observed.push(observation),
      },
      LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT
    );
    vi.useFakeTimers();
    let samples;
    try {
      const pass = user.syncOnce();
      await vi.runAllTimersAsync();
      samples = (await pass).samples;
    } finally {
      vi.useRealTimers();
    }
    const metrics = new LoadMetrics();
    for (const sample of samples) metrics.recordVirtualUserRequest(sample);
    for (const observation of observed) metrics.recordApiError(observation);

    expect(samples.every(sample => sample.ok)).toBe(true);
    expect(observationOf(metrics).failedRequestCount).toBe(0);
    expect(observationOf(metrics).apiErrorCounts).toEqual([
      { status: 503, code: 'PGRST003', count: 2 },
    ]);
  });
});
