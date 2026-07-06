import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildPhase3Checks,
  checkMp04SourceGate,
  checkRunbookCoverage,
} from './phase-3-stripe-cutover';

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'myk9-phase3-'));
  mkdirSync(path.join(root, 'supabase/migrations'), { recursive: true });
  mkdirSync(path.join(root, 'apps/myk9show/supabase/functions/_shared'), { recursive: true });
  for (const dir of [
    'stripe-checkout',
    'stripe-customer-portal',
    'stripe-connect-onboard',
    'stripe-webhook',
    'cron-process-payouts',
  ]) {
    mkdirSync(path.join(root, `apps/myk9show/supabase/functions/${dir}`), { recursive: true });
  }
  mkdirSync(path.join(root, 'docs/operations'), { recursive: true });
  return root;
}

function writeCompleteRoot(root: string): void {
  writeFileSync(path.join(root, 'supabase/migrations/001_livemode.sql'), 'livemode mode_mismatch');
  writeFileSync(
    path.join(root, 'apps/myk9show/supabase/functions/stripe-checkout/index.ts'),
    ".eq('livemode', isLive); resource_missing"
  );
  writeFileSync(
    path.join(root, 'apps/myk9show/supabase/functions/stripe-customer-portal/index.ts'),
    ''
  );
  writeFileSync(
    path.join(root, 'apps/myk9show/supabase/functions/stripe-connect-onboard/index.ts'),
    ''
  );
  writeFileSync(
    path.join(root, 'apps/myk9show/supabase/functions/cron-process-payouts/index.ts'),
    ''
  );
  writeFileSync(
    path.join(root, 'apps/myk9show/supabase/functions/stripe-webhook/index.ts'),
    'STRIPE_CONNECT_WEBHOOK_SECRET account.updated account.application.deauthorized'
  );
  writeFileSync(
    path.join(root, 'apps/myk9show/supabase/functions/_shared/connectAccountMapper.ts'),
    'accountToRowPatch'
  );
  writeFileSync(
    path.join(root, 'docs/operations/go-live-runbook.md'),
    [
      '3.1',
      '3.2',
      '3.3',
      '3.4',
      '3.5',
      '3.6',
      '3.7',
      '3.8',
      '3.9',
      '3.10',
      '3.11',
      'sk_live_',
      'whsec_',
      'PAYOUT_CRON_SECRET',
    ].join('\n')
  );
  writeFileSync(
    path.join(root, 'docs/operations/stripe-platform-setup.md'),
    [
      'Payout schedule → Manual',
      'delete from public.stripe_customers',
      'delete from public.club_stripe_accounts',
      'STRIPE_SECRET_KEY=sk_live_',
      'STRIPE_WEBHOOK_SECRET=whsec_',
      'low-value entry payment + refund',
    ].join('\n')
  );
}

describe('phase 3 stripe cutover preflight', () => {
  it('passes when all local source markers are present', () => {
    const root = makeRoot();
    writeCompleteRoot(root);

    expect(buildPhase3Checks(root).every(check => check.status === 'ok')).toBe(true);
  });

  it('blocks when MP-04 mode-scoping markers are absent', () => {
    const root = makeRoot();
    writeFileSync(
      path.join(root, 'supabase/migrations/001.sql'),
      'create table public.stripe_customers(id uuid);'
    );

    expect(checkMp04SourceGate(root)).toMatchObject({
      key: 'mp04_mode_scoping_source_gate',
      status: 'fail',
    });
  });

  it('detects missing Phase 3 runbook steps', () => {
    const root = makeRoot();
    writeFileSync(path.join(root, 'docs/operations/go-live-runbook.md'), '3.1');

    expect(checkRunbookCoverage(root)).toMatchObject({
      key: 'phase3_runbook_step_coverage',
      status: 'fail',
    });
  });
});
