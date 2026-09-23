import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const ORPHAN_SHOW_ID = 'f3360000-0000-0000-0000-000000000001';
const ORPHAN_TITLE = '[E2E MYK9-336] Past Due Payment Fixture';
const CANONICAL_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const seed = readFileSync(join(repoRoot, 'supabase/seed-demo.sql'), 'utf8');
const preflightPath = join(repoRoot, 'scripts/qa/preflight-known-orphan-show.sql');
const oldCleanupPath = join(repoRoot, 'scripts/qa/cleanup-known-orphan-show.sql');

const stripSqlComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

describe('MYK9-615 orphan cleanup boundary', () => {
  it('keeps the canonical seed free of the observed orphan and broad show deletion', () => {
    expect(seed).not.toContain(ORPHAN_SHOW_ID);
    expect(seed).not.toContain(ORPHAN_TITLE);
    expect(stripSqlComments(seed)).not.toContain(
      `DELETE FROM public.shows WHERE id = '${ORPHAN_SHOW_ID}'`
    );
    expect(seed).toContain(`DELETE FROM public.shows WHERE id = '${CANONICAL_SHOW_ID}'`);
  });

  it('replaces the executable cleanup file with a read-only exact-ID preflight', () => {
    expect(existsSync(oldCleanupPath)).toBe(false);
    expect(existsSync(preflightPath)).toBe(true);

    const preflight = readFileSync(preflightPath, 'utf8');
    const withoutComments = stripSqlComments(preflight);
    expect(withoutComments.trimStart()).toMatch(/^BEGIN TRANSACTION READ ONLY;/);
    expect(withoutComments.trimEnd()).toMatch(/ROLLBACK;\s*$/);
    expect(withoutComments).not.toMatch(/\b(?:DELETE|COMMIT)\b/i);
    expect(withoutComments).not.toMatch(
      /\b(?:INSERT|UPDATE|TRUNCATE|CREATE|ALTER|DROP|CALL|DO)\b/i
    );
    expect(withoutComments).not.toMatch(/hard_delete_show\s*\(/i);
    expect(preflight).toContain(ORPHAN_SHOW_ID);
    expect(preflight).toContain(ORPHAN_TITLE);
    expect(withoutComments).toContain('public.entries');
    expect(withoutComments).toContain('public.enrollments');
    expect(withoutComments).toContain('public.result_submissions');
    expect(withoutComments).toContain('public.activity_log');
    expect(withoutComments).toContain('catalog_manifest_status');
    expect(withoutComments).toContain('public.trial_packet_snapshots');
    expect(withoutComments).toContain('public.stripe_orders');
    expect(withoutComments).toContain('public.entry_payment_links');
  });

  it('documents the existing Show Details action as the separately approved mutation path', () => {
    const runbook = readFileSync(
      join(repoRoot, 'docs/operations/known-orphan-show-cleanup.md'),
      'utf8'
    );
    expect(runbook).toContain('preflight-known-orphan-show.sql');
    expect(runbook).toContain('Show Details');
    expect(runbook).toContain('site-admin');
    expect(runbook).toContain('separate approval');
    expect(runbook).not.toContain('confirm_cleanup');
    expect(runbook).not.toContain('hard_delete_show(');
    expect(runbook).not.toContain('cleanup-known-orphan-show.sql');
  });
});
