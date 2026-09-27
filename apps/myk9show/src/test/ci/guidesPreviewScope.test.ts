import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guides site (apps/docs) shares the Vercel Hobby account's 100
 * deployments a day with myK9Show. On 2026-09-25 it used 78 of them: 46 were
 * correctly skipped by Vercel's "skip unaffected projects" setting, but 32
 * built, 21 of them for agent PRs that touched only myK9Show, migrations or
 * edge functions, and the real myK9Show production deploy was then refused
 * ("api-deployments-free-per-day").
 *
 * Agent branches therefore never build a guides preview. Hand-made branches
 * still do (that is where someone edits the guides), and `main` stays off as
 * before: the guides site is released deliberately, not on merge. vercel.json
 * cannot hold comments, so this test is where the reason lives.
 * Runbook: docs/operations/vercel-preview-quota.md.
 */
const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../docs/vercel.json'), 'utf8')
) as { git?: { deploymentEnabled?: boolean | Record<string, boolean> } };

const enabled = config.git?.deploymentEnabled;

describe('guides site preview scope', () => {
  it('keeps main off', () => {
    expect(typeof enabled).toBe('object');
    expect((enabled as Record<string, boolean>).main).toBe(false);
  });

  it.each(['claude/*', 'codex/*', 'worktree-*'])('never builds a preview for %s', pattern => {
    expect((enabled as Record<string, boolean>)[pattern]).toBe(false);
  });

  it('does not switch previews off everywhere (hand-made branches still preview)', () => {
    expect(enabled).not.toBe(false);
    expect((enabled as Record<string, boolean>)['*']).toBeUndefined();
    expect((enabled as Record<string, boolean>)['**']).toBeUndefined();
  });
});
