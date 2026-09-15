import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { requiredTier, meetsFloor, touchesMigration, MIGRATION_LENS } from './review-tier';

describe('requiredTier', () => {
  it('puts guardrails at independent', () => {
    for (const file of [
      '.github/workflows/ci.yml',
      '.claude/skills/ship-pr/SKILL.md',
      '.codex/config.toml',
      '.agents/anything.md',
      'scripts/qa/review-gate.ts',
      'apps/myk9show/playwright.ci.config.ts',
      'CLAUDE.md',
      'AGENTS.md',
      'docs/agents/shared-rules.md',
    ]) {
      expect(requiredTier([file]).tier, file).toBe('independent');
    }
  });

  // F2 of the final whole-branch review: five INDEPENDENT_PATTERNS — the
  // spec's semantic high-risk categories — were pinned by no test at all;
  // each could be deleted with every suite still green. One assertion per
  // pattern, each on a path that NO other pattern matches, so deleting the
  // pattern it names is the only way to turn it red.
  it.each([
    ['supabase/functions/', 'supabase/functions/send-entry-email/index.ts'],
    ['packages/replication/', 'packages/replication/src/replicatedEntriesTable.ts'],
    ['rls/grants/policies file', 'supabase/tests/rls_entries_select.sql'],
    ['auth/rbac/permissions/roles directory', 'apps/myk9show/src/features/auth/useAuth.ts'],
    ['money paths', 'apps/myk9show/src/features/checkout/CartSummary.tsx'],
  ])('puts %s at independent', (_label, file) => {
    expect(requiredTier([file]).tier, file).toBe('independent');
  });

  // M1 of the fallback review of #2243: a guard at `independent` reached
  // through a LAUNCHER that is not leaves the guard perfectly reviewed and
  // trivially unreachable. `.githooks/pre-push` invokes scripts/qa/push-hold.ts
  // (independent); the hook itself sat at `adversarial`, so a PR neutering the
  // trusted PUSH HOLD enforcement went green on two self-typed lens names.
  // Neither path matches any OTHER INDEPENDENT_PATTERN, so deleting
  // `/^\.githooks\//` is the only way to turn these red.
  it.each(['.githooks/pre-push', '.githooks/pre-commit', '.githooks/README.md'])(
    'puts the hook launcher %s at independent',
    file => {
      expect(requiredTier([file]).tier, file).toBe('independent');
    }
  );

  // The CLI's own empty-list answer. The gate never reaches it (resolveFloor
  // pins an empty list to `independent` first), but `pnpm qa:review-tier` with
  // no diff is advice an agent acts on, and flipping this to 'none' left every
  // suite green (fallback review of #2243, test lens S2).
  it('answers an empty file list with adversarial, never none', () => {
    expect(requiredTier([]).tier).toBe('adversarial');
  });

  it('puts migrations at adversarial and names the required lens', () => {
    const got = requiredTier(['supabase/migrations/20260914174500_x.sql']);
    expect(got.tier).toBe('adversarial');
    expect(got.reason).toContain(MIGRATION_LENS);
  });

  it('keeps tests and dependency manifests above none', () => {
    for (const file of [
      'apps/myk9show/src/components/ui/dialog/dialog.test.tsx',
      'package.json',
      'pnpm-lock.yaml',
    ]) {
      expect(requiredTier([file]).tier, file).toBe('adversarial');
    }
  });

  it('allows none only for docs outside the instruction files', () => {
    expect(requiredTier(['docs/qa/findings.md']).tier).toBe('none');
    expect(requiredTier(['README.md']).tier).toBe('none');
  });

  it('floors a docs path that NAMES money above none (PLAYBOOK § 4 clause)', () => {
    // The money pattern has no directory anchor, so it fires inside docs/ too.
    // PLAYBOOK's "`none` — docs only" reads as the whole rule without this.
    expect(requiredTier(['docs/archive/stripe-notes.md']).tier).toBe('independent');
  });

  it('names a real file in the reason for a non-empty docs-only list, never "no files"', () => {
    const got = requiredTier(['docs/qa/findings.md', 'README.md']);
    expect(got.tier).toBe('none');
    expect(got.reason).not.toBe('no files');
    expect(['docs/qa/findings.md', 'README.md']).toContain(got.reason.split(' ')[0]);
  });

  it('defaults an unknown path to adversarial, never none', () => {
    expect(requiredTier(['some/brand/new/place.txt']).tier).toBe('adversarial');
  });

  it('takes the highest floor across a mixed file list', () => {
    const got = requiredTier([
      'docs/qa/findings.md',
      'apps/myk9show/src/pages/Foo.tsx',
      'scripts/qa/review-gate.ts',
    ]);
    expect(got.tier).toBe('independent');
    expect(got.reason).toContain('scripts/qa/review-gate.ts');
  });
});

describe('touchesMigration', () => {
  it('sees a migration even when another file owns the reason string', () => {
    // requiredTier seeds `best` from the first file and only replaces it on a
    // STRICTLY higher tier, so this list's reason names the .tsx, not the
    // migration — both are `adversarial`. The migration-auditor lens rule must
    // not be read off that reason (F3).
    const files = ['apps/myk9show/src/pages/Foo.tsx', 'supabase/migrations/20260914174500_x.sql'];
    expect(requiredTier(files).reason).not.toContain('migrations/');
    expect(touchesMigration(files)).toBe(true);
  });

  it('is false for a diff with no migration', () => {
    expect(touchesMigration(['apps/myk9show/src/pages/Foo.tsx', 'docs/qa/findings.md'])).toBe(
      false
    );
  });
});

describe('meetsFloor', () => {
  it('accepts an equal or stronger tier', () => {
    expect(meetsFloor('independent', 'adversarial')).toBe(true);
    expect(meetsFloor('adversarial', 'adversarial')).toBe(true);
  });

  it('refuses a weaker tier', () => {
    expect(meetsFloor('none', 'adversarial')).toBe(false);
    expect(meetsFloor('owner', 'independent')).toBe(false);
  });
});

/**
 * The `--files-stdin` mode exists so `scripts/qa/post-review-gate.sh` can ask
 * THIS table for an override's real floor instead of copying the rules into
 * shell (fallback review of #2243, S-c). Its end-to-end behaviour is pinned by
 * the poster suite; these cover the contract of the mode itself, including the
 * fail-safe an empty list must get.
 */
describe('the --files-stdin CLI mode', () => {
  const SCRIPT = resolve(import.meta.dirname, 'review-tier.ts');
  const tierOf = (stdin: string) =>
    execFileSync(
      'node',
      [
        '--experimental-strip-types',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        SCRIPT,
        '--files-stdin',
      ],
      { input: stdin, encoding: 'utf8' }
    ).trim();

  it('prints ONLY the tier, so the shell can compare it directly', () => {
    expect(tierOf('scripts/qa/review-gate.ts\n')).toBe('independent');
    expect(tierOf('supabase/migrations/20260914174500_x.sql\n')).toBe('adversarial');
    expect(tierOf('docs/qa/findings.md\n')).toBe('none');
  });

  it('answers an EMPTY list with independent, never a cheaper tier', () => {
    // "We could not tell" is not "no risk" — the same fail-safe
    // review-gate.ts's resolveFloor applies to an empty changed-file list.
    expect(tierOf('')).toBe('independent');
    expect(tierOf('\n\n')).toBe('independent');
  });
});
