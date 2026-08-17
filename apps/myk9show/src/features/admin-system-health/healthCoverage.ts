export type HealthCoverageLevel = 'full' | 'dispatch-only' | 'none';

export interface HealthCoverageSurface {
  label: string;
  verificationLevel: HealthCoverageLevel;
  detail: string;
  checkKey?: string;
}

// The stable denominator for the Coverage card. Snapshot checks remain the
// source of live status; this registry answers the separate question of which
// operational surfaces those checks and durable alerts can actually observe.
export const HEALTH_COVERAGE_SURFACES: readonly HealthCoverageSurface[] = [
  {
    label: 'Nightly payout schedule',
    verificationLevel: 'dispatch-only',
    detail: 'the scheduled request is sent, but this page cannot confirm the payout run started',
    checkKey: 'payout_cron',
  },
  {
    label: 'Recorded payout attempts',
    verificationLevel: 'full',
    detail: 'failed and stalled attempts are checked',
    checkKey: 'payout_ledger',
  },
  {
    label: 'Background schedules',
    verificationLevel: 'dispatch-only',
    detail: 'scheduled web requests are sent, but their results are not read back',
    checkKey: 'background_jobs',
  },
  {
    label: 'Migration version',
    verificationLevel: 'full',
    detail: 'the newest applied migration is checked',
    checkKey: 'migrations',
  },
  {
    label: 'Sign-in email configuration',
    verificationLevel: 'full',
    detail: 'configuration drift is checked',
    checkKey: 'sign_in_email_drift',
  },
  {
    label: 'Ringside conflicts',
    verificationLevel: 'full',
    detail: 'conflict volume and containment are checked',
    checkKey: 'ringside_conflicts',
  },
  {
    label: 'Public access grants',
    verificationLevel: 'full',
    detail: 'expected public grants are checked',
    checkKey: 'anon_grants',
  },
  {
    label: 'Applied access grants',
    verificationLevel: 'full',
    detail: 'live table grants are checked',
    checkKey: 'applied_acl_grants',
  },
  {
    label: 'Public schema access',
    verificationLevel: 'full',
    detail: 'schema creation access is checked',
    checkKey: 'public_schema_create_acl',
  },
  {
    label: 'Sign-in email failures',
    verificationLevel: 'full',
    detail: 'delivery failures raise alerts',
  },
  {
    label: 'Other email delivery',
    verificationLevel: 'none',
    detail: 'no check',
  },
  {
    label: 'Sync backlog',
    verificationLevel: 'none',
    detail: 'waiting changes stay on each device; no central check',
  },
  {
    label: 'Site uptime',
    verificationLevel: 'none',
    detail: 'no outside availability check',
  },
];

export function coverageForCheck(key: string): HealthCoverageSurface | undefined {
  return HEALTH_COVERAGE_SURFACES.find(surface => surface.checkKey === key);
}
