import { describe, expect, it, vi } from 'vitest';

import { sendResendEmailWithRetry } from './resendEmail.ts';

describe('sendResendEmailWithRetry', () => {
  it('returns a first-attempt success without sleeping or emitting retry telemetry', async () => {
    const response = Response.json({ id: 'email-1' });
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const sleep = vi.fn();
    const onRetry = vi.fn();

    const result = await sendResendEmailWithRetry(
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-key' },
        body: JSON.stringify({ to: 'recipient@example.com' }),
      },
      { fetchImpl, sleep, onRetry }
    );

    expect(result).toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('honors Retry-After for a 429 and preserves an explicit idempotency key', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', { status: 429, headers: { 'Retry-After': '1' } })
      )
      .mockResolvedValueOnce(Response.json({ id: 'email-2' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();
    const init = {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Idempotency-Key': 'registration-123',
      },
      body: JSON.stringify({ to: 'recipient@example.com' }),
    };

    const result = await sendResendEmailWithRetry(init, { fetchImpl, sleep, onRetry });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'registration-123' }),
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'registration-123' }),
      })
    );
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, status: 429, delayMs: 1000 });
  });

  it('uses bounded exponential fallback delays for transient 503 responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: 'email-3' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    const result = await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, random: () => 0, onRetry }
    );

    expect(result.ok).toBe(true);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
    expect(onRetry.mock.calls).toEqual([
      [{ attempt: 1, status: 503, delayMs: 250 }],
      [{ attempt: 2, status: 503, delayMs: 500 }],
    ]);
  });

  it('recovers from a transient network exception', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(Response.json({ id: 'email-4' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    const result = await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, random: () => 0, onRetry }
    );

    expect(result.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(onRetry).toHaveBeenCalledWith({
      attempt: 1,
      status: 'network_error',
      delayMs: 250,
    });
  });

  it('does not retry an AbortError', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    const fetchImpl = vi.fn().mockRejectedValue(abortError);
    const sleep = vi.fn();

    await expect(
      sendResendEmailWithRetry(
        { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
        { fetchImpl, sleep }
      )
    ).rejects.toBe(abortError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not send when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();

    await expect(
      sendResendEmailWithRetry(
        {
          method: 'POST',
          body: JSON.stringify({ to: 'recipient@example.com' }),
          signal: controller.signal,
        },
        { fetchImpl }
      )
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops immediately when the caller signal aborts during retry backoff', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const pending = sendResendEmailWithRetry(
      {
        method: 'POST',
        body: JSON.stringify({ to: 'recipient@example.com' }),
        signal: controller.signal,
      },
      { fetchImpl, sleep, random: () => 0, onRetry: vi.fn() }
    );

    await vi.waitFor(() => expect(sleep).toHaveBeenCalledWith(250));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops immediately when the caller signal aborts during response cleanup', async () => {
    const controller = new AbortController();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 503,
      headers: new Headers(),
      body: { cancel },
    } as unknown as Response);
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const pending = sendResendEmailWithRetry(
      {
        method: 'POST',
        body: JSON.stringify({ to: 'recipient@example.com' }),
        signal: controller.signal,
      },
      { fetchImpl, sleep, random: () => 0, onRetry: vi.fn() }
    );

    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-string body before the first network attempt', async () => {
    const fetchImpl = vi.fn();

    await expect(
      sendResendEmailWithRetry(
        { method: 'POST', body: undefined } as unknown as Parameters<
          typeof sendResendEmailWithRetry
        >[0],
        { fetchImpl }
      )
    ).rejects.toThrow('Resend email body must be a JSON string');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('adds a content-derived SHA-256 idempotency key when the caller omits one', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: 'email-5' }));
    const body = '{"to":"recipient@example.com"}';

    await sendResendEmailWithRetry({ method: 'POST', body }, { fetchImpl });

    const sentInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(sentInit.headers).get('Idempotency-Key')).toBe(
      'myk9-76cdbed9f5d713310f6aa1cede2b3c032d5f12f5f513c53bcb9eaf5ab2ad246c'
    );
  });

  it('parses an HTTP-date Retry-After value and clamps the wait to 2000 ms', async () => {
    const now = Date.UTC(2026, 6, 12, 18, 0, 0);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': new Date(now + 10_000).toUTCString() },
        })
      )
      .mockResolvedValueOnce(Response.json({ id: 'email-6' }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, now: () => now }
    );

    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('uses fallback backoff for a malformed Retry-After delta value', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', { status: 429, headers: { 'Retry-After': '0.5' } })
      )
      .mockResolvedValueOnce(Response.json({ id: 'email-after-malformed-header' }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, random: () => 0, onRetry: vi.fn() }
    );

    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('clamps an overflowing delta-seconds Retry-After value to 2000 ms', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': '9'.repeat(400) },
        })
      )
      .mockResolvedValueOnce(Response.json({ id: 'email-after-overflowing-header' }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, random: () => 0, onRetry: vi.fn() }
    );

    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('parses the RFC 850 Retry-After date format', async () => {
    const now = Date.UTC(1994, 10, 6, 8, 49, 35);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': 'Sunday, 06-Nov-94 08:49:37 GMT' },
        })
      )
      .mockResolvedValueOnce(Response.json({ id: 'email-after-rfc850-date' }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, now: () => now, random: () => 0, onRetry: vi.fn() }
    );

    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('parses asctime Retry-After dates as UTC instead of host-local time', async () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'America/Chicago';
    try {
      const now = Date.UTC(1994, 10, 6, 8, 49, 36);
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response('rate limited', {
            status: 429,
            headers: { 'Retry-After': 'Sun Nov  6 08:49:37 1994' },
          })
        )
        .mockResolvedValueOnce(Response.json({ id: 'email-after-asctime-date' }));
      const sleep = vi.fn().mockResolvedValue(undefined);

      await sendResendEmailWithRetry(
        { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
        { fetchImpl, sleep, now: () => now, random: () => 0, onRetry: vi.fn() }
      );

      expect(sleep).toHaveBeenCalledWith(1000);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it('keeps an RFC 850 year in the current century when it is within 50 years', async () => {
    const now = Date.UTC(2040, 0, 1, 0, 0, 0);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': 'Wednesday, 06-Nov-75 08:49:37 GMT' },
        })
      )
      .mockResolvedValueOnce(Response.json({ id: 'email-after-rfc850-rollover' }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, now: () => now, random: () => 0, onRetry: vi.fn() }
    );

    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('rolls an RFC 850 year back when it is more than 50 years in the future', async () => {
    const now = Date.UTC(2020, 0, 1, 0, 0, 0);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': 'Thursday, 06-Nov-75 08:49:37 GMT' },
        })
      )
      .mockResolvedValueOnce(Response.json({ id: 'email-after-rfc850-roll-back' }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, now: () => now, random: () => 0, onRetry: vi.fn() }
    );

    expect(sleep).toHaveBeenCalledWith(0);
  });

  it('emits PII-free structured retry telemetry by default', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: 'email-7' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await sendResendEmailWithRetry(
      {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-key' },
        body: JSON.stringify({
          to: 'private@example.com',
          subject: 'private subject',
          token_hash: 'private-token',
        }),
      },
      { fetchImpl, sleep: vi.fn(), random: () => 0 }
    );

    expect(warn).toHaveBeenCalledWith('resend_email_retry', {
      attempt: 1,
      status: 503,
      delayMs: 250,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private@example.com');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-key');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-token');
    warn.mockRestore();
  });

  it('returns a permanent 422 response without retrying', async () => {
    const response = new Response('invalid request', { status: 422 });
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const sleep = vi.fn();

    const result = await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep }
    );

    expect(result).toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('returns the third retryable response after exhausting three attempts', async () => {
    const finalResponse = new Response('still unavailable', { status: 503 });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(finalResponse);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await sendResendEmailWithRetry(
      { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
      { fetchImpl, sleep, random: () => 0, onRetry: vi.fn() }
    );

    expect(result).toBe(finalResponse);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it('throws the third network error after exhausting three attempts', async () => {
    const finalError = new TypeError('final network failure');
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network failure'))
      .mockRejectedValueOnce(new TypeError('network failure'))
      .mockRejectedValueOnce(finalError);

    await expect(
      sendResendEmailWithRetry(
        { method: 'POST', body: JSON.stringify({ to: 'recipient@example.com' }) },
        { fetchImpl, sleep: vi.fn(), random: () => 0, onRetry: vi.fn() }
      )
    ).rejects.toBe(finalError);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
