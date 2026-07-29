import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration020 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/020_fix_rls_performance_warnings.sql'),
  'utf8'
);
const migration061 = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/061_email_log_and_confirmation_message.sql'),
  'utf8'
);
const realtimeBroadcastMigration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260718210000_migrate_showday_realtime_to_broadcast.sql'
  ),
  'utf8'
);
const demoSeed = readFileSync(resolve(process.cwd(), 'supabase/seed-demo.sql'), 'utf8');
const lifecycleSource = readFileSync(
  resolve(process.cwd(), 'scripts/qa/isolated-e2e-lifecycle.ts'),
  'utf8'
);
const accountSetupSource = readFileSync(
  resolve(process.cwd(), 'apps/myk9show/scripts/setup-e2e-test-users.ts'),
  'utf8'
);
const isolatedAccountSeedPath = resolve(process.cwd(), 'supabase/seed-isolated-e2e-accounts.sql');
const isolatedAccountSeed = readFileSync(isolatedAccountSeedPath, 'utf8');
const isolatedGrantSeedPath = resolve(
  process.cwd(),
  'supabase/seed-isolated-e2e-platform-grants.sql'
);

describe('isolated E2E migration chain', () => {
  it('defines is_show_secretary before the first policy that references it', () => {
    const helperDefinition = migration020.indexOf('CREATE OR REPLACE FUNCTION is_show_secretary()');
    const firstPolicyReference = migration020.indexOf('OR is_show_secretary()');

    expect(helperDefinition).toBeGreaterThanOrEqual(0);
    expect(firstPolicyReference).toBeGreaterThan(helperDefinition);
  });

  it('defines the show-scoped overload before the first scoped policy reference', () => {
    const helperDefinition = migration061.indexOf(
      'CREATE OR REPLACE FUNCTION is_show_secretary(check_show_id UUID)'
    );
    const firstPolicyReference = migration061.indexOf('AND is_show_secretary(s.id)');

    expect(helperDefinition).toBeGreaterThanOrEqual(0);
    expect(firstPolicyReference).toBeGreaterThan(helperDefinition);
  });

  it('creates the managed Realtime policy without altering the managed table', () => {
    expect(realtimeBroadcastMigration).not.toContain(
      'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY'
    );
    expect(realtimeBroadcastMigration).toContain(
      'CREATE POLICY "show-day change signals are readable"'
    );
  });

  it('targets the current Stripe account uniqueness contract', () => {
    expect(demoSeed).toMatch(
      /INSERT INTO public\.club_stripe_accounts \(club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode\)/
    );
    expect(demoSeed).toContain('ON CONFLICT (club_id, livemode) DO UPDATE');
  });

  it('does not seed show-official columns removed by migration 099', () => {
    const showInsertColumns = demoSeed.slice(
      demoSeed.indexOf('INSERT INTO public.shows ('),
      demoSeed.indexOf(')\nVALUES (', demoSeed.indexOf('INSERT INTO public.shows ('))
    );

    expect(showInsertColumns).not.toMatch(/\bchairman\b/);
    expect(showInsertColumns).not.toMatch(/\bsecretary\b/);
    expect(showInsertColumns).not.toMatch(/\bchief_steward\b/);
  });

  it('mirrors hosted client grants locally before running guarded fixtures', () => {
    expect(existsSync(isolatedGrantSeedPath)).toBe(true);

    const isolatedGrantSeed = readFileSync(isolatedGrantSeedPath, 'utf8');
    expect(lifecycleSource).toContain('supabase/seed-isolated-e2e-platform-grants.sql');
    expect(isolatedGrantSeed).toContain('TO authenticated, service_role');
    expect(isolatedGrantSeed).toContain('ON TABLE public.entries TO service_role');
    expect(isolatedGrantSeed).toContain('public.entry_carts');
    expect(isolatedGrantSeed).toContain('public.enrollments');
    expect(isolatedGrantSeed).toContain('public.show_visibility_settings');
    expect(isolatedGrantSeed).not.toContain('ON ALL TABLES IN SCHEMA public');
    expect(demoSeed).not.toContain('GRANT SELECT ON TABLE public.people TO service_role;');
    expect(demoSeed).not.toContain('GRANT INSERT ON TABLE public.entries TO service_role;');
    expect(demoSeed).toContain('SET LOCAL ROLE service_role;');
  });

  it('uses direct local SQL for account profiles and roles around the demo seed', () => {
    expect(existsSync(isolatedAccountSeedPath)).toBe(true);
    expect(lifecycleSource).toContain("MYK9_E2E_AUTH_ONLY: 'true'");
    expect(lifecycleSource).toContain('supabase/seed-isolated-e2e-accounts.sql');
    expect(lifecycleSource.match(/seedIsolatedAccounts\(local, jobEnv\);/g)).toHaveLength(2);
    expect(accountSetupSource).toContain("process.env.MYK9_E2E_AUTH_ONLY === 'true'");
    expect(isolatedAccountSeed).toContain('onboarding_completed_at');
  });

  it('requires the canonical 514-entry load fixture after every isolated reset', () => {
    expect(lifecycleSource).toContain(
      `(SELECT count(*) FROM public.entries WHERE show_id = '\${DEMO_SHOW_ID}')`
    );
    expect(lifecycleSource).toContain('entryCount !== String(LOAD_SHOW_ENTRY_COUNT)');
    expect(lifecycleSource).toContain(
      "import { LOAD_SHOW_ENTRY_COUNT } from '../../apps/myk9show/src/test/load/loadFixture'"
    );
  });
});
