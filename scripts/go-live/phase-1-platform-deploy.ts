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
  const stagingWorkflow = readOptional(path.join(rootDir, '.github/workflows/deploy-staging.yml'));
  const productionWorkflow = readOptional(
    path.join(rootDir, '.github/workflows/deploy-production.yml')
  );
  const requiredStagingTokens = [
    'workflow_run:',
    "workflows: ['CI']",
    "vars.STAGING_RELEASE_ENABLED == 'true'",
    'timeout-minutes: 25',
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    'github.event.workflow_run.head_sha',
    'refs/heads/staging-release',
    'refs/heads/guides-release',
    'contents: write',
    'actions: read',
    'deployments: read',
    'cancel-in-progress: false',
    'id: candidate',
    'should_promote=false',
    'should_promote=true',
    "if: steps.candidate.outputs.should_promote == 'true'",
    'id: promote',
    'promoted_at',
    'gh api',
    'Staging – myk9-platform-myk9show',
    'Production – myk9-platform-myk9show-guides',
    '-f environment="$environment"',
    '.creator.login == "vercel[bot]"',
    '(.ref == $sha or .ref == $releaseRef)',
    '.created_at >= $promotedAt',
    'environment_url',
    'latest_sha',
    '[[ "$latest_sha" != "$TARGET_SHA" ]]',
    'git push --atomic --force origin',
    'state',
    'success)',
    'Skipped - Not affected',
    'statuses?per_page=20',
    'curl --fail --silent --show-error --head "https://$domain"',
    'staging.myk9show.com',
    'help.myk9show.com',
    'sleep 10',
  ];
  const requiredProductionTokens = [
    'workflow_dispatch:',
    'commit_sha:',
    'staging_deployment_id:',
    'staging_deployment_sha:',
    '^[0-9a-f]{40}$',
    'git merge-base --is-ancestor',
    'gh run list --workflow CI',
    'needs: preflight',
    'environment:',
    'name: production',
    'secrets.VERCEL_ORG_ID',
    'secrets.VERCEL_PROJECT_ID',
    'secrets.VERCEL_TOKEN',
    'api.vercel.com/v13/deployments',
    'api.vercel.com/v2/deployments/$STAGING_DEPLOYMENT_ID/aliases',
    "aliases?.some(({ alias }) => alias === 'staging.myk9show.com')",
    "deployment.readyState !== 'READY'",
    'rm -f staging-deployment.json staging-aliases.json',
    'staging.myk9show.com',
    'api.vercel.com/v13/deployments/$PRODUCTION_DEPLOYMENT_REF',
    'api.vercel.com/v2/deployments/$PRODUCTION_DEPLOYMENT_ID/aliases',
    "aliases?.some(({ alias }) => alias === 'myk9show.com')",
    'deploymentSha !== expectedSha',
    'curl --fail --silent --show-error --head https://myk9show.com',
    'pnpm dlx vercel@latest deploy --prod',
  ];
  const missingStaging = missingTokens(stagingWorkflow, requiredStagingTokens);
  const missingProduction = missingTokens(productionWorkflow, requiredProductionTokens);
  const forbiddenAutomaticTokens = ['VERCEL_TOKEN', 'vercel deploy --prod'].filter(token =>
    stagingWorkflow.includes(token)
  );

  if (forbiddenAutomaticTokens.length > 0) {
    return {
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
      detail: `automatic staging workflow contains: ${forbiddenAutomaticTokens.join(', ')}`,
    };
  }

  const candidateGate = "if: steps.candidate.outputs.should_promote == 'true'";
  const candidateGateCount = stagingWorkflow.split(candidateGate).length - 1;
  if (candidateGateCount < 3) {
    return {
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
      detail: `superseded-candidate gate covers ${candidateGateCount}/3 downstream steps`,
    };
  }

  const productionEnvironmentMarker = 'environment:\n      name: production';
  const productionTokenIndex = productionWorkflow.indexOf('secrets.VERCEL_TOKEN');
  const productionEnvironmentIndex = productionWorkflow.indexOf(productionEnvironmentMarker);
  if (
    productionTokenIndex < 0 ||
    productionEnvironmentIndex < 0 ||
    productionEnvironmentIndex > productionTokenIndex
  ) {
    return {
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
      detail: 'production Vercel token is not scoped behind the protected production environment',
    };
  }

  const missing = [
    ...missingStaging.map(token => `staging:${token}`),
    ...missingProduction.map(token => `production:${token}`),
  ];

  return {
    key: 'deploy_workflow_ci_gate',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'tokenless staging promotion and protected production release source are staged'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkVercelConfig(rootDir: string): Phase1Check {
  const configPaths = ['apps/myk9show/vercel.json', 'apps/docs/vercel.json'];
  const missingGuards: string[] = [];
  const invalidConfigs: string[] = [];

  for (const relativePath of configPaths) {
    const configPath = path.join(rootDir, relativePath);

    if (!existsSync(configPath)) {
      missingGuards.push(relativePath);
      continue;
    }

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
        git?: { deploymentEnabled?: { main?: boolean } };
      };

      if (config.git?.deploymentEnabled?.main !== false) {
        missingGuards.push(relativePath);
      }
    } catch {
      invalidConfigs.push(relativePath);
    }
  }

  if (invalidConfigs.length > 0) {
    return {
      key: 'vercel_git_auto_deploy_disable',
      status: 'fail',
      detail: `invalid JSON: ${invalidConfigs.join(', ')}`,
    };
  }

  if (missingGuards.length > 0) {
    return {
      key: 'vercel_git_auto_deploy_disable',
      status: 'fail',
      detail: `missing main=false: ${missingGuards.join(', ')}`,
    };
  }

  return {
    key: 'vercel_git_auto_deploy_disable',
    status: 'ok',
    detail: 'both Vercel project configs disable main Git auto-deploy',
  };
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
