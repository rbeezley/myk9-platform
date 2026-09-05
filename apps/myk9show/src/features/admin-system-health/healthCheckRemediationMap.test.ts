/**
 * MYK9-394 regression guard.
 *
 * The defect: `getHealthCheckRemediation` chose an owner and a recovery link by
 * regex-matching the diagnostic text, so the live `applied_acl_grants` failure
 * whose detail happened to name `service_role` was routed to the RBAC role
 * editor, while the `authenticated`-only wording of the SAME check matched
 * nothing and rendered as unowned. These tests assert the returned values, and
 * above all that three different wordings of one key are indistinguishable.
 */
import { describe, expect, it } from 'vitest';
import { getHealthCheckRemediation } from './systemHealthSelectors';
import { HEALTH_CHECK_REMEDIATION } from './healthCheckRemediationMap';
import { HEALTH_COVERAGE_SURFACES } from './healthCoverage';
import { fullRouteRegistry } from '@/routes/routeRegistry';
import type { HealthCheck } from './systemHealthTypes';

function check(overrides: Partial<HealthCheck> & { key: string }): HealthCheck {
  return {
    label: 'Some check',
    status: 'fail',
    detail: '',
    checkedAt: null,
    verification: 'proven',
    ...overrides,
  };
}

/** The routes the app actually mounts — the link targets are checked against this. */
const LIVE_ROUTES = new Set(Object.keys(fullRouteRegistry));

const ACL_KEYS = ['applied_acl_grants', 'anon_grants', 'public_schema_create_acl'] as const;

describe('keyed health-check remediation', () => {
  it('routes every public-schema ACL check to the database access contract owner', () => {
    for (const key of ACL_KEYS) {
      const remediation = getHealthCheckRemediation(check({ key }));

      expect(remediation.ownerLabel).toBe('Database Access Contract');
      expect(remediation.href).toBe('/admin/health');
      // Triage must not be sent to the role editor: it cannot repair SQL grants.
      expect(remediation.href).not.toBe('/admin/permissions');
      expect(remediation.ownerLabel).not.toBe('Permissions');
      // A concrete next proof step, not a shrug.
      expect(remediation.nextStep).toContain('grants migration');
      expect(remediation.nextStep).toContain('full run');
    }
  });

  // THE core guard. Reverting to text-regex routing must break this.
  it.each(ACL_KEYS)(
    'gives %s an identical owner and link regardless of how the diagnostic is worded',
    key => {
      const authenticatedOnly = getHealthCheckRemediation(
        check({
          key,
          label: 'Applied ACL grants',
          detail: 'entries: authenticated has SELECT, INSERT; expected SELECT',
        })
      );
      const serviceRole = getHealthCheckRemediation(
        check({
          key,
          label: 'Applied ACL grants',
          detail: 'entries: service_role privileges diverge from the declared role contract',
        })
      );
      const differentTable = getHealthCheckRemediation(
        check({
          key,
          label: 'Applied ACL grants',
          detail: 'show_eve_nudge_log: unexpected table in the applied grant set',
        })
      );

      expect(serviceRole.ownerLabel).toBe(authenticatedOnly.ownerLabel);
      expect(serviceRole.href).toBe(authenticatedOnly.href);
      expect(serviceRole.actionLabel).toBe(authenticatedOnly.actionLabel);
      expect(differentTable.ownerLabel).toBe(authenticatedOnly.ownerLabel);
      expect(differentTable.href).toBe(authenticatedOnly.href);
      expect(differentTable.actionLabel).toBe(authenticatedOnly.actionLabel);
      // And none of the three may drift to the RBAC surface.
      for (const r of [authenticatedOnly, serviceRole, differentTable]) {
        expect(r.href).not.toBe('/admin/permissions');
      }
    }
  );

  it('keeps a mapped key on its own owner even when the detail names another domain', () => {
    // `migrations` is text that matches /migration/ AND /payment/ here; the key wins.
    const remediation = getHealthCheckRemediation(
      check({
        key: 'migrations',
        label: 'Migrations',
        detail: 'stripe payment refund payout deleted restore role permission sync queue',
      })
    );

    expect(remediation.ownerLabel).toBe('Database Migrations');
    expect(remediation.href).toBe('/admin/help');
  });

  it('routes the runner-level failure keys to the health runner owner', () => {
    for (const key of ['probe', 'malformed-checks']) {
      expect(getHealthCheckRemediation(check({ key })).ownerLabel).toBe('Health Runner');
    }
  });

  it('falls back safely, and generically, for an unknown check key', () => {
    const remediation = getHealthCheckRemediation(
      check({ key: 'totally-new-check', label: 'Brand new', detail: 'no idea' })
    );

    expect(remediation.ownerLabel).toBe('Owner incomplete');
    expect(remediation.href).toBe('/admin/help');
    expect(remediation.actionLabel).toBe('Open Admin Help');
    expect(remediation.coverageIncomplete).toBe(false);
  });

  it('labels an inferred owner as inferred rather than asserting it', () => {
    // An unmapped key may still be categorised, but never silently.
    const remediation = getHealthCheckRemediation(
      check({ key: 'replication_queue', label: 'Replication queue', detail: 'Queue is stale' })
    );

    expect(remediation.href).toBe('/admin/support');
    expect(remediation.nextStep).toContain('Unmapped check key');
  });

  it('covers every check key the coverage registry declares', () => {
    const declared = HEALTH_COVERAGE_SURFACES.map(s => s.checkKey).filter(
      (k): k is string => typeof k === 'string'
    );
    expect(declared.length).toBeGreaterThan(0);
    for (const key of declared) {
      expect(HEALTH_CHECK_REMEDIATION).toHaveProperty(key);
    }
  });

  it('points every mapped route at a route that exists in the app', () => {
    for (const [key, route] of Object.entries(HEALTH_CHECK_REMEDIATION)) {
      expect(LIVE_ROUTES.has(route.href), `${key} -> ${route.href}`).toBe(true);
      expect(route.ownerLabel.length).toBeGreaterThan(0);
      expect(route.nextStep.length).toBeGreaterThan(0);
    }
  });
});
