/**
 * MYK9-684: a failing AskQ server surfaced its raw body — "Internal server
 * error" — in the panel. A server-side or network failure now reads as a
 * plain-English "try again" message; a request the server rejected for a
 * reason the user can act on still says why.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

import {
  ASKQ_UNAVAILABLE_MESSAGE,
  AskQUnavailableError,
  RateLimitError,
  sendAskQQuery,
} from '@/services/askqService';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sendAskQQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-1' } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the question with the session token and returns the event stream', async () => {
    const body = new ReadableStream<Uint8Array>();
    fetchMock.mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    );

    await expect(
      sendAskQQuery({ message: 'How do I add a mail-in entry?', questionMode: 'app-help' })
    ).resolves.toBe(body);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/functions\/v1\/ask-myk9show$/);
    expect(init.headers.Authorization).toBe('Bearer jwt-1');
    expect(JSON.parse(init.body)).toEqual({
      message: 'How do I add a mail-in entry?',
      questionMode: 'app-help',
    });
  });

  it.each([500, 502, 503, 504])(
    'turns a %i from the server into a friendly, retryable message',
    async status => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'Internal server error' }, status));

      const error = await sendAskQQuery({ message: 'hi' }).catch(e => e);
      expect(error).toBeInstanceOf(AskQUnavailableError);
      expect(error.message).toBe(ASKQ_UNAVAILABLE_MESSAGE);
      expect(error.message).not.toMatch(/internal server error/i);
    }
  );

  it('treats a network failure as the service being unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sendAskQQuery({ message: 'hi' })).rejects.toThrow(ASKQ_UNAVAILABLE_MESSAGE);
  });

  it('keeps an actionable 400 message from the server', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Message too long (max 2000 characters)' }, 400)
    );
    await expect(sendAskQQuery({ message: 'x' })).rejects.toThrow(
      'Message too long (max 2000 characters)'
    );
  });

  it('still reports the daily limit as a rate limit', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Daily limit reached', remaining: 0, limit: 10, resetsAt: 'x' }, 429)
    );
    await expect(sendAskQQuery({ message: 'hi' })).rejects.toBeInstanceOf(RateLimitError);
  });

  it('does not swallow an aborted request as an outage', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const error = await sendAskQQuery({ message: 'hi' }).catch(e => e);
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');
  });
});
