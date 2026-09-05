/**
 * Who owns a health check, and where an operator goes to repair it.
 *
 * MYK9-394. This mapping is keyed on the *stable check key* the runner emits
 * (`apps/myk9show/supabase/functions/_shared/systemHealthChecks.ts` and its
 * `anonGrantChecks` / `appliedAclChecks` / `publicSchemaAclChecks` siblings),
 * never on the diagnostic text. Routing on the detail string meant that a check
 * naming `service_role` matched a generic /role/ pattern and was sent to the
 * RBAC role editor — which cannot repair a SQL table-ACL contract — while the
 * `authenticated`-only wording of the very same check matched nothing and
 * rendered as unowned. Changing a table name or a grant word in a diagnostic
 * must never change who owns the check.
 *
 * INTENT: every entry here points at a surface that exists in
 * `routeRegistry.ts`. Consumers render `href` through a react-router `<Link>`
 * (`AdminDashboard/NeedsALookSection.tsx`), so an off-site URL would not
 * navigate — name a repo runbook in `nextStep` prose instead of linking it.
 */

/** Owner + recovery route for one check. `coverageIncomplete` is added by the selector. */
export interface HealthCheckRemediationRoute {
  ownerLabel: string;
  actionLabel: string;
  href: string;
  nextStep: string;
}

const PAYOUT_LEDGER: HealthCheckRemediationRoute = {
  ownerLabel: 'Payout Ledger',
  actionLabel: 'Open Payouts',
  href: '/admin/payouts',
  nextStep: 'Review payout/payment status and the money-path runbook.',
};

/**
 * The public-schema ACL family: `anon_grants`, `applied_acl_grants` and
 * `public_schema_create_acl` all fail for the same reason — the grants applied
 * to the live database diverge from the contract the migrations declare. The
 * repair is a grants migration, and the proof is a *full* run (these keys sit
 * outside `CONTINUOUS_HEALTH_CHECK_KEYS`, so the 5-minute cron copies the old
 * verdict forward verbatim and a fixed check keeps reading red for up to 24h).
 */
const DATABASE_ACCESS_CONTRACT: HealthCheckRemediationRoute = {
  ownerLabel: 'Database Access Contract',
  actionLabel: 'Re-run full health check',
  href: '/admin/health',
  nextStep:
    'SQL grant drift, not RBAC — role assignments cannot repair this. Follow the grants runbook (docs/operations/START-HERE.md, "Missing GRANTs"), land a grants migration, then use Run now here: only a full run re-measures this check, and closure is two consecutive passing snapshots.',
};

const HEALTH_RUNNER: HealthCheckRemediationRoute = {
  ownerLabel: 'Health Runner',
  actionLabel: 'Open Admin Help',
  href: '/admin/help',
  nextStep:
    'The health runner itself could not report — check that cron-health-check is deployed and that system_health_probe() still returns facts before trusting any other row.',
};

/**
 * Keyed remediation for every check the runner emits. A key present here is
 * authoritative: no detail-text inspection may override its owner or its link.
 */
export const HEALTH_CHECK_REMEDIATION: Readonly<Record<string, HealthCheckRemediationRoute>> = {
  payout_cron: PAYOUT_LEDGER,
  payout_ledger: {
    ownerLabel: 'Payout Ledger',
    actionLabel: 'Open Payouts',
    href: '/admin/payouts',
    nextStep: 'Review failed and stalled payout attempts in the ledger.',
  },
  background_jobs: {
    ownerLabel: 'Scheduled Jobs',
    actionLabel: 'Open Admin Help',
    href: '/admin/help',
    nextStep:
      'Scheduled web requests are dispatched but their results are not read back — confirm the job ran from its own runbook before treating this as green.',
  },
  migrations: {
    ownerLabel: 'Database Migrations',
    actionLabel: 'Open Admin Help',
    href: '/admin/help',
    nextStep:
      'Compare the newest applied migration version with supabase/migrations on main, then push the missing migration — a merge is not a deploy.',
  },
  ringside_conflicts: {
    ownerLabel: 'Support Inbox',
    actionLabel: 'Open Support',
    href: '/admin/support',
    nextStep: 'Review ringside conflict volume and containment for the affected shows.',
  },
  sign_in_email_drift: {
    ownerLabel: 'User Management',
    actionLabel: 'Open Users',
    href: '/admin/users',
    nextStep:
      'A person record disagrees with its auth identity; reconcile the drifted sign-in address before the user is locked out.',
  },
  anon_grants: DATABASE_ACCESS_CONTRACT,
  applied_acl_grants: DATABASE_ACCESS_CONTRACT,
  public_schema_create_acl: DATABASE_ACCESS_CONTRACT,
  probe: HEALTH_RUNNER,
  'malformed-checks': HEALTH_RUNNER,
};

/**
 * The `payout_cron` refinement. Keyed on the runner's structured `verification`
 * field, never on the detail text: an unprovable dispatch check has a different
 * accountable boundary (we sent the request; the ledger owns what ran) from a
 * schedule that is provably down.
 */
export const PAYOUT_CRON_DISPATCH_ONLY: HealthCheckRemediationRoute = {
  ownerLabel: 'Payout Scheduling',
  actionLabel: 'Open Payouts',
  href: '/admin/payouts',
  nextStep:
    'This confirms the scheduled request was sent; the ledger covers only payout attempts that were recorded.',
};

/**
 * A key the runner does not emit and this map does not know. Deliberately
 * generic: naming a confident owner here would be a guess, and the old
 * text-matching path proved that a guess reads exactly like a fact.
 */
export const UNKNOWN_HEALTH_CHECK_REMEDIATION: HealthCheckRemediationRoute = {
  ownerLabel: 'Owner incomplete',
  actionLabel: 'Open Admin Help',
  href: '/admin/help',
  nextStep:
    'This check key is not mapped to an owner; use admin help or the operations runbook to triage, then add it to the remediation map.',
};

/**
 * Legacy category inference, retained ONLY for keys absent from the map above.
 *
 * The merged `admin-system-health` spec requires sync/support/recovery/access
 * category routing, and snapshots written by an older or a future runner can
 * still carry keys this build has never seen. Every result is explicitly marked
 * as inferred so it never reads as an owner someone actually assigned. It can
 * never apply to a key in `HEALTH_CHECK_REMEDIATION`, which is the whole point.
 */
const INFERRED_ROUTES: readonly { pattern: RegExp; route: HealthCheckRemediationRoute }[] = [
  {
    pattern: /sync|replication|queue|conflict/,
    route: {
      ownerLabel: 'Support Inbox',
      actionLabel: 'Open Support',
      href: '/admin/support',
      nextStep: 'Review the affected diagnostics and replication state.',
    },
  },
  {
    pattern: /support|ticket|inbox/,
    route: {
      ownerLabel: 'Support Inbox',
      actionLabel: 'Open Support',
      href: '/admin/support',
      nextStep: 'Review the support queue and affected diagnostics.',
    },
  },
  {
    pattern: /deleted|restore|recovery|trash/,
    route: {
      ownerLabel: 'Deleted Items',
      actionLabel: 'Open Deleted Items',
      href: '/admin/deleted-items',
      nextStep: 'Check whether missing data can be restored.',
    },
  },
  {
    pattern: /permission|access|rbac|role|user role/,
    route: {
      ownerLabel: 'Permissions',
      actionLabel: 'Open Permissions',
      href: '/admin/permissions',
      nextStep: 'Review role assignments and access repair surfaces.',
    },
  },
  {
    pattern: /payout|payment|stripe|money/,
    route: PAYOUT_LEDGER,
  },
  {
    pattern: /migration|deploy|cron|scheduler|background|edge|manual|job/,
    route: {
      ownerLabel: 'Operations Runbook',
      actionLabel: 'Open Admin Help',
      href: '/admin/help',
      nextStep: 'Use the operations runbook or admin help to assign the manual recovery owner.',
    },
  },
];

const INFERRED_PREFIX = 'Unmapped check key — owner inferred from its description, so confirm it.';

/**
 * Best-effort routing for an UNMAPPED key. Returns `undefined` when nothing
 * matches so the caller can use the explicit unknown fallback.
 */
export function inferRemediationFromText(text: string): HealthCheckRemediationRoute | undefined {
  const haystack = text.toLowerCase();
  const hit = INFERRED_ROUTES.find(entry => entry.pattern.test(haystack));
  if (!hit) return undefined;
  return { ...hit.route, nextStep: `${INFERRED_PREFIX} ${hit.route.nextStep}` };
}
