import { describe, expect, it } from 'vitest';

import { classResultsPushCheck, retryJobProblem } from './classResultsPushChecks';
import { buildSnapshot } from './systemHealthChecks';
import { shouldRunHealthCheck } from './healthCheckCadence';

// MYK9-737: the board goes red when a "Results Posted" push failed or is
// still pending 20+ minutes after it was queued, or the retry cron has
// stopped, and names the classes.

const AT = '2026-09-25T19:00:00.000Z';
const minutesBefore = (minutes: number) =>
  new Date(Date.parse(AT) - minutes * 60_000).toISOString();

const RUNNING = {
  scheduled: true,
  active: true,
  last_success_at: minutesBefore(3),
  last_status: 'succeeded',
  last_message: '1 row',
};

const healthy = (over: Record<string, unknown> = {}) => ({
  stuck: 0,
  failed: 0,
  pending: 0,
  sample: [],
  retry_job: RUNNING,
  ...over,
});

describe('classResultsPushCheck', () => {
  it('is ok when nothing due is undelivered and the retry cron is running', () => {
    const check = classResultsPushCheck(healthy({ pending: 2 }), AT);
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('2 pending');
    expect(check.checked_at).toBe(AT);
  });

  it('fails and names failed and still-pending classes', () => {
    const check = classResultsPushCheck(
      healthy({
        stuck: 2,
        failed: 1,
        pending: 1,
        sample: [
          {
            class_id: 'c1',
            class_name: 'Novice Interior',
            show_name: 'Fall Trial',
            status: 'failed',
            attempts: 5,
            last_error: '1/2 recipients failed',
          },
          {
            class_id: 'c2',
            class_name: 'Advanced Buried',
            show_name: null,
            status: 'pending',
            attempts: 3,
            last_error: null,
          },
        ],
      }),
      AT
    );

    expect(check.status).toBe('fail');
    expect(check.delta_value).toBe(2);
    expect(check.detail).toBe(
      '2 classes have not had their Results Posted push delivered: ' +
        'Novice Interior (Fall Trial) failed, 5 attempts: 1/2 recipients failed; ' +
        'Advanced Buried pending, 3 attempts'
    );
  });

  it('says how many more there are beyond the sample', () => {
    const check = classResultsPushCheck(
      healthy({
        stuck: 12,
        sample: [{ class_id: 'c1', class_name: 'A', status: 'failed', attempts: 5 }],
      }),
      AT
    );
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('A failed, 5 attempts; and 11 more');
  });

  it('falls back to the class id when the class has no name', () => {
    const check = classResultsPushCheck(
      healthy({
        stuck: 1,
        sample: [{ class_id: 'c9', class_name: null, status: 'failed', attempts: 5 }],
      }),
      AT
    );
    expect(check.detail).toContain('class c9 failed');
  });

  it('fails when the retry cron has not succeeded for 20 minutes, even with nothing stuck', () => {
    const check = classResultsPushCheck(
      healthy({ retry_job: { ...RUNNING, last_success_at: minutesBefore(20) } }),
      AT
    );
    expect(check.status).toBe('fail');
    expect(check.detail).toBe('class-results-push-retry last succeeded 20 minutes ago');
  });

  it('reports both a stuck class and a stopped cron', () => {
    const check = classResultsPushCheck(
      healthy({
        stuck: 1,
        sample: [{ class_id: 'c1', class_name: 'A', status: 'pending', attempts: 2 }],
        retry_job: { ...RUNNING, scheduled: false, active: false },
      }),
      AT
    );
    expect(check.status).toBe('fail');
    expect(check.detail).toBe(
      '1 class has not had their Results Posted push delivered: A pending, 2 attempts. ' +
        'class-results-push-retry is not scheduled'
    );
  });

  it.each([
    [undefined, 'was not reported'],
    [{ error: 'permission denied' }, 'failed: permission denied'],
    [{ stuck: 'x' }, 'unreadable count'],
  ])('is an unprovable warn when the fact is %j', (raw, detail) => {
    const check = classResultsPushCheck(raw, AT);
    expect(check.status).toBe('warn');
    expect(check.verification).toBe('unprovable');
    expect(check.detail).toContain(detail);
  });
});

describe('retryJobProblem', () => {
  const now = Date.parse(AT);

  it.each([
    ['running, last success 3 minutes ago', RUNNING, null],
    [
      'last success exactly 15 minutes ago',
      { ...RUNNING, last_success_at: minutesBefore(15) },
      null,
    ],
    [
      'last success 16 minutes ago',
      { ...RUNNING, last_success_at: minutesBefore(16) },
      'class-results-push-retry last succeeded 16 minutes ago',
    ],
    ['not scheduled', { scheduled: false }, 'class-results-push-retry is not scheduled'],
    ['inactive', { ...RUNNING, active: false }, 'class-results-push-retry is not active'],
    [
      'latest run failed',
      { ...RUNNING, last_status: 'failed', last_message: 'Missing Vault secret' },
      'class-results-push-retry last run failed: Missing Vault secret',
    ],
    [
      'never succeeded',
      { ...RUNNING, last_success_at: null, last_status: null },
      'class-results-push-retry has no successful run recorded',
    ],
    ['not reported', undefined, 'class-results-push-retry was not reported'],
  ])('%s', (_label, raw, expected) => {
    expect(retryJobProblem(raw, now)).toBe(expected);
  });
});

describe('class_results_push on the board', () => {
  it('is measured on every continuous run, not carried forward', () => {
    expect(shouldRunHealthCheck('class_results_push', 'continuous')).toBe(true);
  });

  it('turns the snapshot red', () => {
    const snap = buildSnapshot(
      {
        probed_at: AT,
        class_results_push: healthy({
          stuck: 1,
          sample: [{ class_id: 'c1', class_name: 'A', status: 'failed', attempts: 5 }],
        }),
      },
      { now: Date.parse(AT), mode: 'continuous' }
    );
    const check = snap.checks.find(c => c.key === 'class_results_push');
    expect(check?.status).toBe('fail');
    expect(check?.stale_after_ms).toBe(10 * 60 * 1000);
    expect(snap.overall_status).toBe('fail');
  });
});
