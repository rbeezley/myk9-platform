import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  mkdirSync(path.join(root, 'apps/docs'), { recursive: true });
  mkdirSync(path.join(root, 'docs/operations'), { recursive: true });
  mkdirSync(path.join(root, 'supabase/functions/send-auth-email'), { recursive: true });
  return root;
}

function writeCompleteRoot(root: string): void {
  writeFileSync(
    path.join(root, '.github/workflows/deploy-staging.yml'),
    [
      'workflow_run:',
      "workflows: ['CI']",
      "vars.STAGING_RELEASE_ENABLED == 'true'",
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
      'refs/heads/staging-release" --force',
      'refs/heads/guides-release" --force',
      'state',
      'success)',
      'statuses?per_page=20',
      'curl --fail --silent --show-error --head "https://$domain"',
      'staging.myk9show.com',
      'help.myk9show.com',
      'sleep 10',
    ].join('\n')
  );
  writeFileSync(
    path.join(root, '.github/workflows/deploy-production.yml'),
    [
      'workflow_dispatch:',
      'commit_sha:',
      'staging_deployment_id:',
      'staging_deployment_sha:',
      '^[0-9a-f]{40}$',
      'git merge-base --is-ancestor',
      'gh run list --workflow CI',
      'needs: preflight',
      'environment:',
      '      name: production',
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
    ].join('\n')
  );
  writeFileSync(
    path.join(root, 'apps/myk9show/vercel.json'),
    '{"git":{"deploymentEnabled":{"main":false}}}'
  );
  writeFileSync(
    path.join(root, 'apps/docs/vercel.json'),
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
        detail: 'tokenless staging promotion and protected production release source are staged',
      },
      {
        key: 'vercel_git_auto_deploy_disable',
        status: 'ok',
        detail: 'both Vercel project configs disable main Git auto-deploy',
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
      status: 'fail',
      detail: 'missing main=false: apps/myk9show/vercel.json, apps/docs/vercel.json',
    });
  });

  it('warns when the guides Vercel Git auto-deploy guard is missing', () => {
    const root = makeRoot();
    writeFileSync(
      path.join(root, 'apps/myk9show/vercel.json'),
      '{"git":{"deploymentEnabled":{"main":false}}}'
    );

    expect(checkVercelConfig(root)).toEqual({
      key: 'vercel_git_auto_deploy_disable',
      status: 'fail',
      detail: 'missing main=false: apps/docs/vercel.json',
    });
  });

  it('fails when the deploy workflow is missing its enable gate', () => {
    const root = makeRoot();
    writeFileSync(path.join(root, '.github/workflows/deploy-staging.yml'), 'workflow_run:\n');

    expect(checkDeployWorkflow(root)).toMatchObject({
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
    });
  });

  it('fails when the automatic staging workflow receives a Vercel token', () => {
    const root = makeRoot();
    writeCompleteRoot(root);
    writeFileSync(
      path.join(root, '.github/workflows/deploy-staging.yml'),
      'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}'
    );

    expect(checkDeployWorkflow(root)).toEqual({
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
      detail: 'automatic staging workflow contains: VERCEL_TOKEN',
    });
  });

  it('fails when superseded staging candidates do not gate every later step', () => {
    const root = makeRoot();
    writeCompleteRoot(root);
    const workflowPath = path.join(root, '.github/workflows/deploy-staging.yml');
    const workflow = readFileSync(workflowPath, 'utf8').replace(
      "if: steps.candidate.outputs.should_promote == 'true'",
      ''
    );
    writeFileSync(workflowPath, workflow);

    expect(checkDeployWorkflow(root)).toMatchObject({
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
    });
  });

  it('fails when staging readiness can select another Vercel project or ref', () => {
    const root = makeRoot();
    writeCompleteRoot(root);
    const workflowPath = path.join(root, '.github/workflows/deploy-staging.yml');
    const workflow = readFileSync(workflowPath, 'utf8').replace(
      '(.ref == $sha or .ref == $releaseRef)',
      ''
    );
    writeFileSync(workflowPath, workflow);

    expect(checkDeployWorkflow(root)).toMatchObject({
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
    });
  });

  it('fails when production does not attest the new deployment alias', () => {
    const root = makeRoot();
    writeCompleteRoot(root);
    const workflowPath = path.join(root, '.github/workflows/deploy-production.yml');
    const workflow = readFileSync(workflowPath, 'utf8').replace(
      "aliases?.some(({ alias }) => alias === 'myk9show.com')",
      ''
    );
    writeFileSync(workflowPath, workflow);

    expect(checkDeployWorkflow(root)).toMatchObject({
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
    });
  });

  it('fails when production credentials are not behind the protected environment', () => {
    const root = makeRoot();
    writeCompleteRoot(root);
    writeFileSync(
      path.join(root, '.github/workflows/deploy-production.yml'),
      ['secrets.VERCEL_TOKEN', 'environment:', 'name: production'].join('\n')
    );

    expect(checkDeployWorkflow(root)).toEqual({
      key: 'deploy_workflow_ci_gate',
      status: 'fail',
      detail: 'production Vercel token is not scoped behind the protected production environment',
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
