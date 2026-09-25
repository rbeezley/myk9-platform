import { describe, expect, it } from 'vitest';

import { classResultsPushCheck } from './classResultsPushChecks';
import { buildSnapshot } from './systemHealthChecks';
import { shouldRunHealthCheck } from './healthCheckCadence';

// MYK9-737: the board goes red when a class's "Results Posted" push has failed
// or is still pending after three attempts, and names the classes.

const AT = '2026-09-25T19:00:00.000Z';

describe('classResultsPushCheck', () => {
  it('is ok when nothing is stuck, mentioning rows still retrying', () => {
    const check = classResultsPushCheck({ stuck: 0, failed: 0, pending: 2, sample: [] }, AT);
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('2 pending');
    expect(check.checked_at).toBe(AT);
  });

  it('fails and names every stuck class, failed and 3+-attempt pending alike', () => {
    const check = classResultsPushCheck(
      {
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
      },
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
      {
        stuck: 12,
        sample: [{ class_id: 'c1', class_name: 'A', status: 'failed', attempts: 5 }],
      },
      AT
    );
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('A failed, 5 attempts; and 11 more');
  });

  it('falls back to the class id when the class has no name', () => {
    const check = classResultsPushCheck(
      { stuck: 1, sample: [{ class_id: 'c9', class_name: null, status: 'failed', attempts: 5 }] },
      AT
    );
    expect(check.detail).toContain('class c9 failed');
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

describe('class_results_push on the board', () => {
  it('is measured on every continuous run, not carried forward', () => {
    expect(shouldRunHealthCheck('class_results_push', 'continuous')).toBe(true);
  });

  it('turns the snapshot red', () => {
    const snap = buildSnapshot(
      {
        probed_at: AT,
        class_results_push: {
          stuck: 1,
          sample: [{ class_id: 'c1', class_name: 'A', status: 'failed', attempts: 5 }],
        },
      },
      { now: Date.parse(AT), mode: 'continuous' }
    );
    const check = snap.checks.find(c => c.key === 'class_results_push');
    expect(check?.status).toBe('fail');
    expect(check?.stale_after_ms).toBe(10 * 60 * 1000);
    expect(snap.overall_status).toBe('fail');
  });
});
