import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildPhase1Checks,
  checkDeployWorkflow,
  checkKillSwitchDefaults,
  checkVercelConfig,
} from './phase-1-platform-deploy';

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'myk9-phase1-'));
  mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  mkdirSync(path.join(root, 'apps/myk9show/src/config'), { recursive: true });
  mkdirSync(path.join(root, 'apps/myk9show'), { recursive: true });
  mkdirSync(path.join(root, 'docs/operations'), { recursive: true });
  mkdirSync(path.join(root, 'supabase/functions/send-auth-email'), { recursive: true });
  return root;
}

function writeCompleteRoot(root: string): void {
  writeFileSync(
    path.join(root, '.github/workflows/deploy-production.yml'),
    [
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
    ].join('\n')
  );
  writeFileSync(
    path.join(root, 'apps/myk9show/vercel.json'),
    '{"git":{"deploymentEnabled":{"main":false}}}'
  );
  writeFileSync(
    path.join(root, 'apps/myk9show/src/config/features.ts'),
    [
      'showPresence: true',
      'showLiveSync: true',
      'showEditAwareness: true',
      'showConflictSurfacing: true',
    ].join('\n')
  );
  writeFileSync(
    path.join(root, 'docs/operations/supabase-auth-email.md'),
    [
      'Do not use `supabase config push`',
      'https://api.supabase.com/v1/projects/$REF/config/auth',
      '-X PATCH',
      'smtp_host: "smtp.resend.com"',
      'smtp_port: "465"',
      'smtp_user: "resend"',
      'smtp_pass: $pass',
      'smtp_admin_email: "notifications@myk9show.com"',
      'rate_limit_email_sent: 100',
    ].join('\n')
  );
  writeFileSync(
    path.join(root, 'supabase/functions/send-auth-email/index.ts'),
    ['SEND_EMAIL_HOOK_SECRET', 'RESEND_API_KEY', 'verifyStandardWebhookSignature'].join('\n')
  );
}

describe('phase 1 deploy verifier', () => {
  it('passes when all source evidence is present', () => {
    const root = makeRoot();
    writeCompleteRoot(root);

    expect(buildPhase1Checks(root)).toEqual([
      {
        key: 'deploy_workflow_ci_gate',
        status: 'ok',
        detail: 'CI-gated production deploy workflow source is staged',
      },
      {
        key: 'vercel_git_auto_deploy_disable',
        status: 'ok',
        detail: 'git.deploymentEnabled.main=false is present',
      },
      {
        key: 'auth_email_management_patch_runbook',
        status: 'ok',
        detail: 'Management API PATCH procedure is documented',
      },
      {
        key: 'show_day_kill_switch_source_defaults',
        status: 'ok',
        detail: 'all four show-day realtime source defaults are true',
      },
      {
        key: 'send_auth_email_hook_source',
        status: 'ok',
        detail: 'hook source references signature and Resend secrets',
      },
    ]);
  });

  it('warns when Vercel Git auto-deploy has not been disabled yet', () => {
    const root = makeRoot();
    writeFileSync(path.join(root, 'apps/myk9show/vercel.json'), '{"framework":"vite"}');

    expect(checkVercelConfig(root)).toEqual({
      key: 'vercel_git_auto_deploy_disable',
      status: 'warn',
      detail: 'not yet set; expected until one CI-gated production deploy is validated',
    });
  });

  it('fails when the deploy workflow is missing its enable gate', () => {
    const root = makeRoot();
    writeFileSync(path.join(root, '.github/workflows/deploy-production.yml'), 'workflow_run:\n');

    expect(checkDeployWorkflow(root)).toMatchObject({
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
    });
  });

  it('fails when a show-day kill-switch default is not true', () => {
    const root = makeRoot();
    writeFileSync(
      path.join(root, 'apps/myk9show/src/config/features.ts'),
      ['showPresence: true', 'showLiveSync: false'].join('\n')
    );

    expect(checkKillSwitchDefaults(root)).toEqual({
      key: 'show_day_kill_switch_source_defaults',
      status: 'fail',
      detail: 'missing true flags: showLiveSync, showEditAwareness, showConflictSurfacing',
    });
  });
});
