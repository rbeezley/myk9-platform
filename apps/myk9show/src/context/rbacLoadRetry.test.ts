import { describe, expect, it } from 'vitest';
import { readDeadlineReason } from '@/services/database/readDeadlineFetch';
import {
  RBAC_DEADLINE_ATTEMPTS,
  RBAC_DEADLINE_RETRY_DELAY_MS,
  RBAC_TRANSIENT_ATTEMPTS,
  RBAC_TRANSIENT_RETRY_STEP_MS,
  rbacRetryDelayMs,
} from './rbacLoadRetry';

describe('rbacRetryDelayMs (MYK9-1374)', () => {
  it('retries a transient failure up to three attempts, 250 ms apart and growing', () => {
    const transport = new TypeError('Failed to fetch');
    expect(rbacRetryDelayMs(transport, 0, true)).toBe(RBAC_TRANSIENT_RETRY_STEP_MS);
    expect(rbacRetryDelayMs(transport, 1, true)).toBe(RBAC_TRANSIENT_RETRY_STEP_MS * 2);
    expect(rbacRetryDelayMs(transport, RBAC_TRANSIENT_ATTEMPTS - 1, true)).toBeNull();
  });

  it('retries a read-deadline timeout once, after a long pause, however it surfaces', () => {
    const asDomException = readDeadlineReason();
    const asRethrow = new Error(`TimeoutError: ${asDomException.message}`);
    const asCause = new Error('Supabase query failed', { cause: asDomException });
    for (const error of [asDomException, asRethrow, asCause]) {
      expect(rbacRetryDelayMs(error, 0, true)).toBe(RBAC_DEADLINE_RETRY_DELAY_MS);
      expect(rbacRetryDelayMs(error, RBAC_DEADLINE_ATTEMPTS - 1, true)).toBeNull();
    }
    expect(RBAC_DEADLINE_ATTEMPTS).toBeLessThan(RBAC_TRANSIENT_ATTEMPTS);
    expect(RBAC_DEADLINE_RETRY_DELAY_MS).toBeGreaterThan(
      RBAC_TRANSIENT_RETRY_STEP_MS * RBAC_TRANSIENT_ATTEMPTS
    );
  });

  it('does not retry a failure the caller did not classify as transient', () => {
    expect(rbacRetryDelayMs(new Error('permission denied'), 0, false)).toBeNull();
  });
});
