import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_MS,
  deriveEffectiveStatus,
  formatCheckedAgo,
  getHealthCheckRemediation,
  isStale,
  isCoverageIncomplete,
  normalizeCheckStatus,
  normalizeOverallStatus,
  parseSnapshot,
  statusToBadgeVariant,
} from './systemHealthSelectors';
import type { SystemHealthSnapshot, SystemHealthSnapshotRow } from './systemHealthTypes';

const NOW = Date.parse('2026-07-04T12:00:00.000Z');

function row(overrides: Partial<SystemHealthSnapshotRow> = {}): SystemHealthSnapshotRow {
  return {
    id: 'snap-1',
    created_at: new Date(NOW - 60_000).toISOString(),
    source: 'daily-health-check',
    overall_status: 'ok',
    checks: [
      {
        key: 'migrations',
        label: 'Migration parity',
        status: 'ok',
        detail: 'in sync',
        checked_at: new Date(NOW - 60_000).toISOString(),
      },
    ],
    run_duration_ms: 1234,
    ...overrides,
  };
}

function snapshot(overrides: Partial<SystemHealthSnapshot> = {}): SystemHealthSnapshot {
  return {
    id: 'snap-1',
    createdAt: new Date(NOW - 60_000).toISOString(),
    source: 'daily-health-check',
    overallStatus: 'ok',
    checks: [],
    runDurationMs: 1234,
    ...overrides,
  };
}

describe('normalizeCheckStatus', () => {
  it('passes through known statuses', () => {
    expect(normalizeCheckStatus('ok')).toBe('ok');
    expect(normalizeCheckStatus('warn')).toBe('warn');
    expect(normalizeCheckStatus('fail')).toBe('fail');
  });

  it('falls back to unknown for unrecognized or missing values', () => {
    expect(normalizeCheckStatus('green')).toBe('unknown');
    expect(normalizeCheckStatus(undefined)).toBe('unknown');
    expect(normalizeCheckStatus(null)).toBe('unknown');
    expect(normalizeCheckStatus(42)).toBe('unknown');
  });
});

describe('normalizeOverallStatus', () => {
  it('fails safe to fail for an unrecognized value', () => {
    expect(normalizeOverallStatus('bogus')).toBe('fail');
    expect(normalizeOverallStatus(undefined)).toBe('fail');
  });
});

describe('parseSnapshot', () => {
  it('maps a well-formed row and preserves check order', () => {
    const parsed = parseSnapshot(
      row({
        checks: [
          { key: 'a', label: 'A', status: 'ok', detail: 'x', checked_at: '2026-07-04T11:00:00Z' },
          { key: 'b', label: 'B', status: 'warn', detail: 'y', checked_at: '2026-07-04T11:30:00Z' },
        ],
      })
    );
    expect(parsed.checks.map(c => c.key)).toEqual(['a', 'b']);
    expect(parsed.checks[1]?.status).toBe('warn');
    expect(parsed.overallStatus).toBe('ok');
  });

  it('treats an absent (null) checks payload as an empty list', () => {
    const parsed = parseSnapshot(row({ checks: null }));
    expect(parsed.checks).toEqual([]);
  });

  it('surfaces a visible malformed check for a non-array payload instead of emptying it', () => {
    // A bad writer storing an object (not an array) must not render as a fresh,
    // healthy-looking board with zero checks — the anomaly has to be visible.
    const parsed = parseSnapshot(row({ overall_status: 'ok', checks: {} }));
    expect(parsed.checks).toHaveLength(1);
    expect(parsed.checks[0]?.key).toBe('malformed-checks');
    expect(parsed.checks[0]?.status).toBe('unknown');
    expect(parsed.checks[0]?.label).toBe('Malformed health payload');
  });

  it('degrades a malformed check to a safe fallback instead of crashing', () => {
    const parsed = parseSnapshot(
      row({ checks: [{ label: 'No status field' }, 'not-an-object', null] })
    );
    expect(parsed.checks).toHaveLength(3);
    expect(parsed.checks[0]?.status).toBe('unknown');
    expect(parsed.checks[0]?.label).toBe('No status field');
    expect(parsed.checks[1]?.status).toBe('unknown');
    // synthesized key/label rather than throwing
    expect(parsed.checks[1]?.key).toBe('check-1');
    expect(parsed.checks[2]?.status).toBe('unknown');
  });

  it('coerces a non-numeric run_duration_ms to null', () => {
    expect(parseSnapshot(row({ run_duration_ms: null })).runDurationMs).toBeNull();
  });
});

describe('isStale', () => {
  it('is false for a fresh snapshot', () => {
    expect(isStale(new Date(NOW - 60_000).toISOString(), NOW)).toBe(false);
  });

  it('is true just past the threshold', () => {
    expect(isStale(new Date(NOW - STALE_AFTER_MS - 1000).toISOString(), NOW)).toBe(true);
  });

  it('treats an unparseable timestamp as stale', () => {
    expect(isStale('not-a-date', NOW)).toBe(true);
  });
});

describe('deriveEffectiveStatus', () => {
  it('returns the stored status for a fresh snapshot', () => {
    const eff = deriveEffectiveStatus(snapshot({ overallStatus: 'ok' }), NOW);
    expect(eff).toEqual({ status: 'ok', isStale: false, isEmpty: false });
  });

  it('preserves a fresh warn status', () => {
    const eff = deriveEffectiveStatus(snapshot({ overallStatus: 'warn' }), NOW);
    expect(eff.status).toBe('warn');
    expect(eff.isStale).toBe(false);
  });

  it('forces fail when stale, regardless of stored status', () => {
    const stale = snapshot({
      overallStatus: 'ok',
      createdAt: new Date(NOW - STALE_AFTER_MS - 1000).toISOString(),
    });
    const eff = deriveEffectiveStatus(stale, NOW);
    expect(eff.status).toBe('fail');
    expect(eff.isStale).toBe(true);
    expect(eff.isEmpty).toBe(false);
  });

  it('forces the aggregate stale when a carried check exceeds its own window', () => {
    const stale = snapshot({
      overallStatus: 'ok',
      checks: [
        {
          key: 'ringside_conflicts',
          label: 'Ringside conflicts',
          status: 'ok',
          detail: 'baseline recorded',
          checkedAt: new Date(NOW - 11 * 60 * 1000).toISOString(),
          staleAfterMs: 10 * 60 * 1000,
          verification: 'proven' as const,
        },
      ],
    });

    expect(deriveEffectiveStatus(stale, NOW)).toEqual({
      status: 'fail',
      isStale: true,
      isEmpty: false,
    });
  });

  it('forces fail + isEmpty when there is no snapshot', () => {
    const eff = deriveEffectiveStatus(null, NOW);
    expect(eff).toEqual({ status: 'fail', isStale: false, isEmpty: true });
  });
});

describe('statusToBadgeVariant', () => {
  it('maps each status to a shared StatusBadge variant', () => {
    expect(statusToBadgeVariant('ok')).toBe('success');
    expect(statusToBadgeVariant('warn')).toBe('warning');
    expect(statusToBadgeVariant('fail')).toBe('error');
    expect(statusToBadgeVariant('unknown')).toBe('muted');
  });
});

describe('getHealthCheckRemediation', () => {
  it('routes sync checks to sync monitoring', () => {
    const remediation = getHealthCheckRemediation({
      key: 'replication_queue',
      label: 'Replication queue',
      status: 'warn',
      detail: 'Queue is stale',
      checkedAt: null,
      verification: 'proven' as const,
    });

    expect(remediation).toMatchObject({
      ownerLabel: 'Sync Monitoring',
      actionLabel: 'Open Sync',
      href: '/admin/sync',
    });
  });

  it('explains the dispatch boundary for an unprovable payout schedule', () => {
    const remediation = getHealthCheckRemediation({
      key: 'payout_cron',
      label: 'Payout cron',
      status: 'warn',
      detail: 'The scheduled request was sent',
      checkedAt: null,
      verification: 'unprovable' as const,
    });

    expect(remediation).toMatchObject({
      ownerLabel: 'Payout Scheduling',
      actionLabel: 'Open Payouts',
      href: '/admin/payouts',
      nextStep: expect.stringContaining('payout attempts that were recorded'),
    });
  });

  it('uses the payout failure runbook when the schedule check fails', () => {
    const remediation = getHealthCheckRemediation({
      key: 'payout_cron',
      label: 'Payout cron',
      status: 'fail',
      detail: 'The payout schedule is not active',
      checkedAt: null,
      verification: 'proven' as const,
    });

    expect(remediation).toMatchObject({
      ownerLabel: 'Payout Ledger',
      actionLabel: 'Open Payouts',
      href: '/admin/payouts',
      nextStep: 'Review payout/payment status and the money-path runbook.',
    });
    expect(remediation.nextStep).not.toContain('request was sent');
  });

  it('uses an owner-incomplete fallback for unknown keys', () => {
    const remediation = getHealthCheckRemediation({
      key: 'mystery',
      label: 'Mystery check',
      status: 'unknown',
      detail: 'No metadata mapped',
      checkedAt: null,
      verification: 'proven' as const,
    });

    expect(remediation).toMatchObject({
      ownerLabel: 'Owner incomplete',
      href: '/admin/help',
    });
  });

  it('detects coverage-incomplete checks distinctly', () => {
    const check = {
      key: 'manual_check',
      label: 'Manual check',
      status: 'unknown' as const,
      detail: 'Coverage incomplete: not checked here',
      checkedAt: null,
      verification: 'proven' as const,
    };

    expect(isCoverageIncomplete(check)).toBe(true);
    expect(getHealthCheckRemediation(check).coverageIncomplete).toBe(true);
  });

  it('does not mark completed coverage checks as incomplete', () => {
    const check = {
      key: 'role_coverage',
      label: 'Role coverage complete',
      status: 'ok' as const,
      detail: 'All role coverage checks complete',
      checkedAt: '2026-07-04T12:00:00Z',
      verification: 'proven' as const,
    };

    expect(isCoverageIncomplete(check)).toBe(false);
    expect(getHealthCheckRemediation(check).coverageIncomplete).toBe(false);
  });
});

describe('formatCheckedAgo', () => {
  it('returns unknown for a missing or invalid time', () => {
    expect(formatCheckedAgo(null, NOW)).toBe('unknown');
    expect(formatCheckedAgo('nope', NOW)).toBe('unknown');
  });

  it('renders sub-minute as just now', () => {
    expect(formatCheckedAgo(new Date(NOW - 30_000).toISOString(), NOW)).toBe('just now');
  });

  it('renders minutes, hours, and days', () => {
    expect(formatCheckedAgo(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5 min ago');
    expect(formatCheckedAgo(new Date(NOW - 3 * 60 * 60_000).toISOString(), NOW)).toBe('3 hr ago');
    expect(formatCheckedAgo(new Date(NOW - 2 * 24 * 60 * 60_000).toISOString(), NOW)).toBe(
      '2 days ago'
    );
    expect(formatCheckedAgo(new Date(NOW - 1 * 24 * 60 * 60_000).toISOString(), NOW)).toBe(
      '1 day ago'
    );
  });

  it('clamps future timestamps (clock skew) to just now', () => {
    expect(formatCheckedAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe('just now');
  });
});
