import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type Phase1Status = 'ok' | 'warn' | 'fail';

export interface Phase1Check {
  key: string;
  status: Phase1Status;
  detail: string;
}

interface CliOptions {
  rootDir: string;
  strict: boolean;
}

const REQUIRED_KILL_SWITCH_FLAGS = [
  'showPresence',
  'showLiveSync',
  'showEditAwareness',
  'showConflictSurfacing',
] as const;

export function buildPhase1Checks(rootDir: string): Phase1Check[] {
  return [
    checkDeployWorkflow(rootDir),
    checkVercelConfig(rootDir),
    checkAuthEmailRunbook(rootDir),
    checkKillSwitchDefaults(rootDir),
    checkSendAuthEmailSource(rootDir),
  ];
}

export function checkDeployWorkflow(rootDir: string): Phase1Check {
  const workflowPath = path.join(rootDir, '.github/workflows/deploy-production.yml');
  const workflow = readOptional(workflowPath);
  const requiredTokens = [
    'workflow_run:',
    "workflows: ['CI']",
    "vars.PRODUCTION_DEPLOY_ENABLED == 'true'",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    'secrets.VERCEL_ORG_ID',
    'secrets.VERCEL_PROJECT_ID',
    'secrets.VERCEL_TOKEN',
    'vercel deploy --prod',
  ];
  const missing = missingTokens(workflow, requiredTokens);

  return {
    key: 'deploy_workflow_ci_gate',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'CI-gated production deploy workflow source is staged'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkVercelConfig(rootDir: string): Phase1Check {
  const configPath = path.join(rootDir, 'apps/myk9show/vercel.json');
  const rawConfig = readOptional(configPath);

  try {
    const config = JSON.parse(rawConfig) as {
      git?: { deploymentEnabled?: { main?: boolean } };
    };
    const mainDeployEnabled = config.git?.deploymentEnabled?.main;

    if (mainDeployEnabled === false) {
      return {
        key: 'vercel_git_auto_deploy_disable',
        status: 'ok',
        detail: 'git.deploymentEnabled.main=false is present',
      };
    }

    return {
      key: 'vercel_git_auto_deploy_disable',
      status: 'warn',
      detail: 'not yet set; expected until one CI-gated production deploy is validated',
    };
  } catch {
    return {
      key: 'vercel_git_auto_deploy_disable',
      status: 'fail',
      detail: 'apps/myk9show/vercel.json is not valid JSON',
    };
  }
}

export function checkAuthEmailRunbook(rootDir: string): Phase1Check {
  const runbook = readOptional(path.join(rootDir, 'docs/operations/supabase-auth-email.md'));
  const requiredTokens = [
    'https://api.supabase.com/v1/projects/$REF/config/auth',
    '-X PATCH',
    'smtp_host: "smtp.resend.com"',
    'smtp_port: "465"',
    'smtp_user: "resend"',
    'smtp_pass: $pass',
    'smtp_admin_email: "notifications@myk9show.com"',
    'rate_limit_email_sent: 100',
    'Do not use `supabase config push`',
  ];
  const missing = missingTokens(runbook, requiredTokens);

  return {
    key: 'auth_email_management_patch_runbook',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'Management API PATCH procedure is documented'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkKillSwitchDefaults(rootDir: string): Phase1Check {
  const features = readOptional(path.join(rootDir, 'apps/myk9show/src/config/features.ts'));
  const missing = REQUIRED_KILL_SWITCH_FLAGS.filter(
    flag => !new RegExp(`${flag}:\\s*true`).test(features)
  );

  return {
    key: 'show_day_kill_switch_source_defaults',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'all four show-day realtime source defaults are true'
        : `missing true flags: ${missing.join(', ')}`,
  };
}

export function checkSendAuthEmailSource(rootDir: string): Phase1Check {
  const functionPath = path.join(rootDir, 'supabase/functions/send-auth-email/index.ts');
  const source = readOptional(functionPath);
  const requiredTokens = [
    'SEND_EMAIL_HOOK_SECRET',
    'RESEND_API_KEY',
    'verifyStandardWebhookSignature',
  ];
  const missing = missingTokens(source, requiredTokens);

  return {
    key: 'send_auth_email_hook_source',
    status: existsSync(functionPath) && missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'hook source references signature and Resend secrets'
        : `missing: ${missing.join(', ')}`,
  };
}

function readOptional(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function missingTokens(text: string, tokens: readonly string[]): string[] {
  return tokens.filter(token => !text.includes(token));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    rootDir: process.cwd(),
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--strict') {
      options.strict = true;
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

function formatChecks(checks: Phase1Check[]): string {
  return checks.map(check => `${check.status.padEnd(4)} ${check.key}: ${check.detail}`).join('\n');
}

export function runCli(argv: string[]): number {
  const options = parseArgs(argv);
  const checks = buildPhase1Checks(options.rootDir);
  const hasFailure = checks.some(check => check.status === 'fail');
  const hasWarning = checks.some(check => check.status === 'warn');

  console.log('Go Live Phase 1 platform/deploy source readiness');
  console.log(formatChecks(checks));
  console.log('');
  console.log('Operator/shared-system gates still require separate approval and evidence.');

  return hasFailure || (options.strict && hasWarning) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
