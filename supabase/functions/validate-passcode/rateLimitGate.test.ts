import { describe, expect, it, vi } from 'vitest';

import {
  enforcePasscodeRateLimit,
  type OperatorAlertInsert,
} from './rateLimitGate';

const allowedRateLimit = {
  allowed: true,
  attempts_count: 1,
  remaining_attempts: 4,
  blocked_until: null,
  message: 'ok',
};

function dependencies(result: { data: unknown; error: unknown }) {
  const alerts: OperatorAlertInsert[] = [];
  const logs: Array<{ message: string; error?: unknown }> = [];

  return {
    alerts,
    logs,
    checkRateLimit: vi.fn().mockResolvedValue(result),
    recordBlockedAttempt: vi.fn().mockResolvedValue(undefined),
    persistAlert: vi.fn(async (alert: OperatorAlertInsert) => {
      alerts.push(alert);
    }),
    logError: vi.fn((message: string, error?: unknown) => {
      logs.push({ message, error });
    }),
  };
}

describe('enforcePasscodeRateLimit', () => {
  it('returns 503 and persists a deduplicated alert when the limiter RPC errors', async () => {
    const submittedPasscode = 'secret-passcode-value';
    const deps = dependencies({ data: null, error: { message: 'database unavailable' } });

    const result = await enforcePasscodeRateLimit({
      clientIP: '203.0.113.10',
      ...deps,
    });

    expect(result).toEqual({
      kind: 'response',
      status: 503,
      body: {
        error: 'rate_limit_unavailable',
        message: 'Passcode validation is temporarily unavailable. Please try again.',
      },
    });
    expect(deps.alerts).toEqual([
      {
        source: 'validate-passcode',
        severity: 'error',
        title: 'Passcode rate limiter unavailable',
        detail: {
          component: 'check_login_rate_limit',
          client_ip: '203.0.113.10',
        },
        dedupe_key: 'check_login_rate_limit:203.0.113.10',
      },
    ]);
    expect(deps.recordBlockedAttempt).not.toHaveBeenCalled();
    expect(JSON.stringify({ alerts: deps.alerts, logs: deps.logs })).not.toContain(
      submittedPasscode
    );
  });

  it('returns 503 for unusable limiter data', async () => {
    const deps = dependencies({ data: [{ allowed: 'yes' }], error: null });

    const result = await enforcePasscodeRateLimit({
      clientIP: 'unknown',
      ...deps,
    });

    expect(result).toMatchObject({ kind: 'response', status: 503 });
    expect(deps.persistAlert).toHaveBeenCalledOnce();
  });

  it('returns 503 and persists an alert when the limiter call rejects', async () => {
    const deps = dependencies({ data: null, error: null });
    deps.checkRateLimit.mockRejectedValueOnce(new Error('network unavailable'));

    const result = await enforcePasscodeRateLimit({
      clientIP: '203.0.113.14',
      ...deps,
    });

    expect(result).toMatchObject({ kind: 'response', status: 503 });
    expect(deps.persistAlert).toHaveBeenCalledOnce();
  });

  it('still returns 503 when the durable alert insert fails', async () => {
    const deps = dependencies({ data: null, error: { message: 'database unavailable' } });
    deps.persistAlert.mockRejectedValueOnce(new Error('alert insert failed'));

    const result = await enforcePasscodeRateLimit({
      clientIP: '203.0.113.11',
      ...deps,
    });

    expect(result).toMatchObject({ kind: 'response', status: 503 });
    expect(deps.logError).toHaveBeenCalledWith(
      'Failed to persist passcode limiter alert',
      expect.any(Error)
    );
  });

  it('preserves the existing blocked-attempt recording and 429 response contract', async () => {
    const blocked = {
      ...allowedRateLimit,
      allowed: false,
      remaining_attempts: 0,
      blocked_until: '2026-07-12T03:00:00.000Z',
      message: 'Too many attempts. Try again later.',
    };
    const deps = dependencies({ data: [blocked], error: null });

    const result = await enforcePasscodeRateLimit({
      clientIP: '203.0.113.12',
      ...deps,
    });

    expect(deps.recordBlockedAttempt).toHaveBeenCalledOnce();
    expect(result).toEqual({
      kind: 'response',
      status: 429,
      body: {
        error: 'rate_limited',
        message: 'Too many attempts. Try again later.',
        blocked_until: '2026-07-12T03:00:00.000Z',
        remaining_attempts: 0,
      },
    });
    expect(deps.persistAlert).not.toHaveBeenCalled();
  });

  it('continues only when the limiter returns usable allowed data', async () => {
    const deps = dependencies({ data: [allowedRateLimit], error: null });

    const result = await enforcePasscodeRateLimit({
      clientIP: '203.0.113.13',
      ...deps,
    });

    expect(result).toEqual({ kind: 'allowed', rateLimit: allowedRateLimit });
    expect(deps.recordBlockedAttempt).not.toHaveBeenCalled();
    expect(deps.persistAlert).not.toHaveBeenCalled();
  });
});
