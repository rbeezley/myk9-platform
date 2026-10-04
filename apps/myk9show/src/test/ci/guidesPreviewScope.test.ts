import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guides site (apps/docs) shares the Vercel Hobby account's 100
 * deployments a day with myK9Show. A per-branch allowlist was not enough: on
 * 2026-10-04 the guides project created 79 deployments in 24 hours (27 preview
 * builds plus 52 "Skipped - Not affected" records, which Vercel still creates),
 * and the owner's myK9Show production deploy was refused twice
 * ("api-deployments-free-per-day").
 *
 * Owner decision (2026-10-04): the guides publish only when someone asks.
 * Git deploys are off for every branch, exactly like apps/myk9show, and the
 * site ships through `gh workflow run deploy-guides.yml`. vercel.json cannot
 * hold comments, so this test is where the reason lives.
 * Runbook: docs/operations/vercel-preview-quota.md.
 */
const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../docs/vercel.json'), 'utf8')
) as { git?: { deploymentEnabled?: boolean | Record<string, boolean> } };

const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../../../.github/workflows/deploy-guides.yml'),
  'utf8'
);

describe('guides site deploys only on request', () => {
  it('turns Vercel Git deployments off for every branch', () => {
    expect(config.git?.deploymentEnabled).toBe(false);
  });

  it('has a manual-only deploy workflow that targets the guides project', () => {
    const triggers = workflow.match(/^on:\n((?: {2}.*\n)+)/m)?.[1] ?? '';
    expect(triggers).toMatch(/^ {2}workflow_dispatch:/m);
    expect(triggers).not.toMatch(/^ {2}(push|pull_request|schedule|workflow_run):/m);
    expect(workflow).toContain('VERCEL_PROJECT_ID: prj_jHJvF6oJEiRw344vhKHQDkKPGr3f');
  });
});
