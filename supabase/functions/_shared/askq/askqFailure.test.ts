// @vitest-environment node
/**
 * MYK9-684: every failure after the quota reservation fell into one catch that
 * answered a bare 500 "Internal server error" and left the reserved
 * `chatbot_query_log` row at tools_used {} / response_time_ms 0 — the state of
 * every AskQ row since 2026-09-15. An upstream model failure is now a 503 the
 * client can present as "try again", and the reserved row records what failed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifyAskQFailure } from './askqFailure.ts';
import { ClaudeApiError, callClaude } from './promptBuilder.ts';

describe('callClaude', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws a ClaudeApiError carrying the upstream status and error type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: { type: 'rate_limit_error', message: 'Number of request tokens exceeded' },
            }),
            { status: 429 }
          )
      )
    );

    const error = await callClaude([], 'key', [], 'system').catch(e => e);
    expect(error).toBeInstanceOf(ClaudeApiError);
    expect(error.status).toBe(429);
    expect(error.errorType).toBe('rate_limit_error');
  });

  it('returns the parsed message on success', async () => {
    const body = { content: [{ type: 'text', text: 'Answer' }], stop_reason: 'end_turn' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
    );
    await expect(callClaude([], 'key', [], 'system')).resolves.toEqual(body);
  });
});

describe('classifyAskQFailure', () => {
  it.each([
    [429, 'rate_limit_error'],
    [529, 'overloaded_error'],
    [500, 'api_error'],
    [400, 'invalid_request_error'],
    [401, 'authentication_error'],
  ])('answers an upstream %i (%s) with a retryable 503', (status, errorType) => {
    const failure = classifyAskQFailure(new ClaudeApiError(status, errorType, 'detail'));
    expect(failure.httpStatus).toBe(503);
    expect(failure.body).toEqual({
      error: 'AskQ is temporarily unavailable',
      code: 'upstream_unavailable',
    });
    expect(failure.logMarker).toBe(`upstream_error:${status}:${errorType}`);
  });

  it('keeps an unexpected internal failure a 500 and marks the log row', () => {
    const failure = classifyAskQFailure(new TypeError('x is undefined'));
    expect(failure.httpStatus).toBe(500);
    expect(failure.body).toEqual({ error: 'Internal server error', code: 'internal_error' });
    expect(failure.logMarker).toBe('internal_error');
  });
});
