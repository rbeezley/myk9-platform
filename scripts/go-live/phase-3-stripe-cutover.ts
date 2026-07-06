import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type Phase3Status = 'ok' | 'fail';

export interface Phase3Check {
  key: string;
  status: Phase3Status;
  detail: string;
}

interface CliOptions {
  allowBlocked: boolean;
  rootDir: string;
}

const STRIPE_FUNCTIONS = [
  'apps/myk9show/supabase/functions/stripe-checkout/index.ts',
  'apps/myk9show/supabase/functions/stripe-customer-portal/index.ts',
  'apps/myk9show/supabase/functions/stripe-connect-onboard/index.ts',
  'apps/myk9show/supabase/functions/stripe-webhook/index.ts',
  'apps/myk9show/supabase/functions/cron-process-payouts/index.ts',
] as const;

export function buildPhase3Checks(rootDir: string): Phase3Check[] {
  return [
    checkMp04SourceGate(rootDir),
    checkStripeFunctionsPresent(rootDir),
    checkRunbookCoverage(rootDir),
    checkStripePlatformRunbook(rootDir),
    checkConnectWebhookSource(rootDir),
  ];
}

export function checkMp04SourceGate(rootDir: string): Phase3Check {
  const corpus = [
    readTextCorpus(path.join(rootDir, 'supabase/migrations')),
    ...STRIPE_FUNCTIONS.map(file => readOptional(path.join(rootDir, file))),
    readOptional(
      path.join(rootDir, 'apps/myk9show/supabase/functions/_shared/connectAccountMapper.ts')
    ),
  ].join('\n');
  const requiredTokens = [
    'livemode',
    ".eq('livemode'",
    'resource_missing',
    'mode_mismatch',
    'accountToRowPatch',
  ];
  const missing = missingTokens(corpus, requiredTokens);

  return {
    key: 'mp04_mode_scoping_source_gate',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'mode-scoping source markers present'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkStripeFunctionsPresent(rootDir: string): Phase3Check {
  const missing = STRIPE_FUNCTIONS.filter(file => !existsSync(path.join(rootDir, file)));

  return {
    key: 'stripe_cutover_functions_present',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'required Stripe functions are present'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkRunbookCoverage(rootDir: string): Phase3Check {
  const runbook = readOptional(path.join(rootDir, 'docs/operations/go-live-runbook.md'));
  const requiredTokens = [
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
  ];
  const missing = missingTokens(runbook, requiredTokens);

  return {
    key: 'phase3_runbook_step_coverage',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'Phase 3 runbook step markers are present'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkStripePlatformRunbook(rootDir: string): Phase3Check {
  const runbook = readOptional(path.join(rootDir, 'docs/operations/stripe-platform-setup.md'));
  const requiredTokens = [
    'Payout schedule → Manual',
    'delete from public.stripe_customers',
    'delete from public.club_stripe_accounts',
    'STRIPE_SECRET_KEY=sk_live_',
    'STRIPE_WEBHOOK_SECRET=whsec_',
    'low-value entry payment + refund',
  ];
  const missing = missingTokens(runbook, requiredTokens);

  return {
    key: 'stripe_platform_runbook_coverage',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'Stripe platform live cutover markers are present'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkConnectWebhookSource(rootDir: string): Phase3Check {
  const webhook = readOptional(
    path.join(rootDir, 'apps/myk9show/supabase/functions/stripe-webhook/index.ts')
  );
  const requiredTokens = [
    'STRIPE_CONNECT_WEBHOOK_SECRET',
    'account.updated',
    'account.application.deauthorized',
  ];
  const missing = missingTokens(webhook, requiredTokens);

  return {
    key: 'connect_webhook_source',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'connected-account webhook source markers are present'
        : `missing: ${missing.join(', ')}`,
  };
}

function readOptional(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function readTextCorpus(dir: string): string {
  if (!existsSync(dir)) return '';

  return readdirSync(dir)
    .flatMap(entry => {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        return readTextCorpus(fullPath);
      }
      if (!fullPath.endsWith('.sql') && !fullPath.endsWith('.ts')) {
        return [];
      }
      return readFileSync(fullPath, 'utf8');
    })
    .join('\n');
}

function missingTokens(text: string, tokens: readonly string[]): string[] {
  return tokens.filter(token => !text.includes(token));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    allowBlocked: false,
    rootDir: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--allow-blocked') {
      options.allowBlocked = true;
      continue;
    }

    if (arg === '--root') {
      options.rootDir = path.resolve(requireValue(argv, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function formatChecks(checks: Phase3Check[]): string {
  return checks.map(check => `${check.status.padEnd(4)} ${check.key}: ${check.detail}`).join('\n');
}

export function runCli(argv: string[]): number {
  const options = parseArgs(argv);
  const checks = buildPhase3Checks(options.rootDir);
  const hasFailure = checks.some(check => check.status === 'fail');

  console.log('Go Live Phase 3 Stripe cutover preflight');
  console.log(formatChecks(checks));
  console.log('');
  console.log('Read-only database checklist: scripts/go-live/phase-3-stripe-cutover.sql');
  console.log('No live Stripe, secret, DB write, or payment action was run.');

  return hasFailure && !options.allowBlocked ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
