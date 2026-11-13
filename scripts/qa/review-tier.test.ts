import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  requiredTier,
  meetsFloor,
  touchesMigration,
  MIGRATION_LENS,
  manifestChangeIsDependencyOnly,
  optionalReviewReason,
} from './review-tier';
import {
  baselineChangeIsLoweringOnly,
  diffIsCommentOnly,
  exemptGuardrailFiles,
} from './review-tier-exemptions.ts';

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
      'docs/agents/rules-reference.md',
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

describe('manifestChangeIsDependencyOnly', () => {
  const base = {
    name: 'myk9show',
    scripts: { test: 'pnpm qa:dist-fresh && vitest run' },
    dependencies: { react: '19.1.0' },
    devDependencies: { vitest: '3.2.0' },
    pnpm: { onlyBuiltDependencies: ['esbuild'] },
  };
  const json = (value: unknown) => JSON.stringify(value, null, 2);

  it.each([
    ['a dependency bump', { ...base, dependencies: { react: '19.2.0' } }],
    ['a new devDependency', { ...base, devDependencies: { vitest: '3.2.0', tsx: '4.0.0' } }],
    ['a pnpm.overrides pin', { ...base, pnpm: { ...base.pnpm, overrides: { lodash: '4.17.21' } } }],
    [
      'reordered keys',
      {
        pnpm: base.pnpm,
        devDependencies: base.devDependencies,
        dependencies: base.dependencies,
        scripts: base.scripts,
        name: base.name,
      },
    ],
  ])('accepts %s', (label, after) => {
    expect(manifestChangeIsDependencyOnly(json(base), json(after)), label).toBe(true);
  });

  it('accepts adding pnpm.overrides to a manifest with no pnpm block', () => {
    const noPnpm = { name: 'x', dependencies: { a: '1.0.0' } };
    const after = { ...noPnpm, pnpm: { overrides: { a: '1.0.1' } } };
    expect(manifestChangeIsDependencyOnly(json(noPnpm), json(after))).toBe(true);
  });

  it.each([
    ['a repointed test script', { ...base, scripts: { test: 'exit 0' } }],
    [
      'a new postinstall hook',
      { ...base, scripts: { ...base.scripts, postinstall: 'curl x | sh' } },
    ],
    [
      'a pnpm build allowlist change',
      { ...base, pnpm: { onlyBuiltDependencies: ['esbuild', 'evil'] } },
    ],
    ['a packageManager change', { ...base, packageManager: 'pnpm@9.0.0' }],
  ])('refuses %s', (label, after) => {
    expect(manifestChangeIsDependencyOnly(json(base), json(after)), label).toBe(false);
  });

  it('refuses unparseable or non-object manifests', () => {
    expect(manifestChangeIsDependencyOnly('{', json(base))).toBe(false);
    expect(manifestChangeIsDependencyOnly('[]', '[]')).toBe(false);
  });
});

describe('optionalReviewReason', () => {
  it('allows docs-only changes without review evidence', () => {
    expect(optionalReviewReason({ changedFiles: ['docs/qa/findings.md'] })).toBe('documentation');
  });

  it('allows dependency-manifest-only changes when marked with the dependencies label', () => {
    expect(
      optionalReviewReason({
        changedFiles: [
          'packages/replication/package.json',
          'apps/myk9show/package.json',
          'pnpm-lock.yaml',
        ],
        labels: ['dependencies'],
        dependencyManifestsVerified: true,
      })
    ).toBe('dependency-only');
  });

  it.each([
    { name: 'unverified', dependencyManifestsVerified: undefined },
    { name: 'refused', dependencyManifestsVerified: false },
  ])('keeps a labeled dependency set on the review path when its manifests are $name', v => {
    expect(
      optionalReviewReason({
        changedFiles: ['apps/myk9show/package.json', 'pnpm-lock.yaml'],
        labels: ['dependencies'],
        dependencyManifestsVerified: v.dependencyManifestsVerified,
      })
    ).toBeUndefined();
  });

  it('does not treat dependency manifests as optional without the dependencies label', () => {
    expect(
      optionalReviewReason({
        changedFiles: ['packages/replication/package.json', 'pnpm-lock.yaml'],
      })
    ).toBeUndefined();
  });

  it('allows a small app-source change within the three-file and 100-line limits', () => {
    expect(
      optionalReviewReason({
        changedFiles: [
          'apps/myk9show/src/components/ShowCard.tsx',
          'apps/myk9show/src/components/ShowCard.test.tsx',
          'apps/myk9show/src/components/show-card.css',
        ],
        addedFiles: ['apps/myk9show/src/components/ShowCard.test.tsx'],
        additions: 61,
        deletions: 39,
      })
    ).toBe('small-app-change');
  });

  // Guard tests live all over app source; a one-line `it.skip` in any of them
  // turns CI green while disabling what it guards. Editing one needs review.
  it.each([
    'apps/myk9show/src/test/database/anonEntriesGrantContract.test.ts',
    'apps/myk9show/src/test/database/forceRlsInvariant.test.ts',
    'apps/myk9show/src/test/ci/instructionFileBudget.test.ts',
    'apps/myk9show/src/test/supabaseNetworkGuard.ts',
    'apps/myk9show/src/test/setup.ts',
    'apps/myk9show/src/pages/RegistrationWizardPage/entryCloseGuard.test.ts',
    'apps/myk9show/src/components/cart/CartSummary.source.test.ts',
    'apps/myk9show/src/services/database/__tests__/softDeletePerson.source.test.ts',
    'apps/myk9show/src/components/ShowCard.spec.tsx',
  ])('keeps an edit to existing test file %s on the review path', file => {
    expect(
      optionalReviewReason({ changedFiles: [file], addedFiles: [], additions: 1, deletions: 1 })
    ).toBeUndefined();
    // Unknown added-files list is the same as "nothing added".
    expect(
      optionalReviewReason({ changedFiles: [file], additions: 1, deletions: 1 })
    ).toBeUndefined();
  });

  it('still lets a small change ADD a new test file', () => {
    const test = 'apps/myk9show/src/pages/RegistrationWizardPage/newGuard.test.ts';
    expect(
      optionalReviewReason({
        changedFiles: ['apps/myk9show/src/pages/RegistrationWizardPage/wizard.ts', test],
        addedFiles: [test],
        additions: 20,
        deletions: 2,
      })
    ).toBe('small-app-change');
  });

  it.each([
    {
      name: 'more than three files',
      changedFiles: [
        'apps/myk9show/src/a.ts',
        'apps/myk9show/src/b.ts',
        'apps/myk9show/src/c.ts',
        'apps/myk9show/src/d.ts',
      ],
      additions: 1,
      deletions: 0,
    },
    {
      name: 'more than 100 changed lines',
      changedFiles: ['apps/myk9show/src/a.ts'],
      additions: 100,
      deletions: 1,
    },
    {
      name: 'a protected replication source file',
      changedFiles: ['packages/replication/src/replicatedEntriesTable.ts'],
      additions: 1,
      deletions: 0,
    },
    {
      name: 'a migration',
      changedFiles: ['supabase/migrations/20260923174500_example.sql'],
      additions: 1,
      deletions: 0,
    },
  ])('keeps $name on the mandatory-review path', ({ changedFiles, additions, deletions }) => {
    expect(optionalReviewReason({ changedFiles, additions, deletions })).toBeUndefined();
  });

  it('fails closed when GitHub did not provide a complete changed-file list', () => {
    expect(
      optionalReviewReason({
        changedFiles: ['apps/myk9show/src/a.ts'],
        additions: 1,
        deletions: 0,
        labels: ['dependencies'],
        fileListUnusable: true,
      })
    ).toBeUndefined();
  });

  it('fails closed when app diff line counts are unavailable', () => {
    expect(optionalReviewReason({ changedFiles: ['apps/myk9show/src/a.ts'] })).toBeUndefined();
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

/**
 * MYK9-1932: a lowering-only ratchet baseline and a comment-only edit do not
 * raise the tier by themselves. Real git repos, so the diff the exemption reads
 * is the one `qa:review-tier` reads.
 */
describe('guardrail exemptions (MYK9-1932)', () => {
  const BASELINE = 'scripts/qa/em-dash-ratchet.baseline.json';
  const CONFIG = 'apps/myk9show/playwright.ci.config.ts';
  const APP = 'apps/myk9show/src/a.ts';
  const baselineJson = (total: number, files: Record<string, number>, updatedAt = 'x') =>
    JSON.stringify({ version: 1, updatedAt, total, files }, null, 2) + '\n';
  const CONFIG_BASE = ['// retries stay low', 'export default {', '  retries: 1,', '};', ''].join(
    '\n'
  );
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** Base commit on `main`, then `edit` applied on a branch and committed. */
  function repo(edit: Record<string, string>): { dir: string; files: string[] } {
    const dir = mkdtempSync(join(tmpdir(), 'review-tier-'));
    dirs.push(dir);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    const write = (file: string, text: string) => {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    git('config', 'commit.gpgsign', 'false');
    write(BASELINE, baselineJson(5, { 'a.ts': 3, 'b.ts': 2 }));
    write(CONFIG, CONFIG_BASE);
    write(APP, 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'work');
    for (const [file, text] of Object.entries(edit)) write(file, text);
    git('add', '.');
    git('commit', '-q', '-m', 'work');
    return { dir, files: Object.keys(edit) };
  }

  const tierFor = (edit: Record<string, string>) => {
    const { dir, files } = repo(edit);
    return requiredTier(files, exemptGuardrailFiles('main', files, { cwd: dir })).tier;
  };

  it('lowered baseline alone falls to the floor of the other files', () => {
    const lowered = baselineJson(3, { 'a.ts': 3 }, 'y');
    expect(tierFor({ [BASELINE]: lowered })).toBe('adversarial');
    expect(tierFor({ [BASELINE]: lowered, 'docs/x.md': '# x\n' })).toBe('adversarial');
  });

  it('raised baseline stays independent', () => {
    expect(tierFor({ [BASELINE]: baselineJson(6, { 'a.ts': 4, 'b.ts': 2 }) })).toBe('independent');
  });

  it('baseline with an added entry stays independent', () => {
    expect(tierFor({ [BASELINE]: baselineJson(5, { 'a.ts': 3, 'c.ts': 1 }) })).toBe('independent');
  });

  it('comment-only edit to playwright.ci.config.ts falls to the floor of the other files', () => {
    const edited = CONFIG_BASE.replace('retries stay low', 'retries stay low on CI');
    expect(tierFor({ [CONFIG]: edited })).toBe('adversarial');
  });

  it('code edit to playwright.ci.config.ts stays independent', () => {
    expect(tierFor({ [CONFIG]: CONFIG_BASE.replace('retries: 1', 'retries: 3') })).toBe(
      'independent'
    );
  });

  it('a comment edit beside a code edit stays independent', () => {
    const both = CONFIG_BASE.replace('stay low', 'stay low!').replace('retries: 1', 'retries: 0');
    expect(tierFor({ [CONFIG]: both })).toBe('independent');
  });

  it('other guardrail files that are not exempt keep independent beside an exempt one', () => {
    const edit = {
      [BASELINE]: baselineJson(3, { 'a.ts': 3 }),
      '.githooks/pre-push': '#!/bin/sh\n',
    };
    expect(tierFor(edit)).toBe('independent');
  });

  it('fails closed when the base cannot be resolved', () => {
    const { dir, files } = repo({ [BASELINE]: baselineJson(3, { 'a.ts': 3 }) });
    expect(exemptGuardrailFiles('no-such-ref', files, { cwd: dir }).size).toBe(0);
  });

  describe('baselineChangeIsLoweringOnly', () => {
    const base = baselineJson(5, { 'a.ts': 3, 'b.ts': 2 });
    it.each([
      ['equal counts', base, true],
      ['lowered count', baselineJson(4, { 'a.ts': 2, 'b.ts': 2 }), true],
      ['removed entry', baselineJson(3, { 'a.ts': 3 }), true],
      ['raised count', baselineJson(5, { 'a.ts': 4, 'b.ts': 2 }), false],
      ['added entry', baselineJson(5, { 'a.ts': 3, 'b.ts': 2, 'c.ts': 0 }), false],
      ['changed version', base.replace('"version": 1', '"version": 0'), false],
      ['not JSON', '{', false],
    ])('%s', (_name, head, expected) => {
      expect(baselineChangeIsLoweringOnly(base, head)).toBe(expected);
    });

    it('ignores updatedAt but not other strings', () => {
      expect(
        baselineChangeIsLoweringOnly(base, baselineJson(5, { 'a.ts': 3, 'b.ts': 2 }, 'z'))
      ).toBe(true);
      expect(baselineChangeIsLoweringOnly('{"mode":"a","n":1}', '{"mode":"b","n":1}')).toBe(false);
    });
  });

  describe('diffIsCommentOnly', () => {
    const diff = (...lines: string[]) => ['--- a/f', '+++ b/f', '@@ -1 +1 @@', ...lines].join('\n');
    it.each([
      ['f.ts', ['-// old', '+// new'], true],
      ['f.ts', ['-/** old', '+ * new', '+ */'], true],
      ['f.ts', ['+const x = 1; // note'], false],
      ['f.ts', ['+  retries: 3,'], false],
      ['f.ts', ['+# not a comment in ts'], false],
      ['pre-push', ['-# old', '+# new'], true],
      ['pre-push', ['+#!/bin/bash'], false],
      ['x.yml', ['+# note'], true],
      ['CLAUDE.md', ['+# A heading'], false],
      ['x.ts', [], false],
    ] as const)('%s %j', (file, lines, expected) => {
      expect(diffIsCommentOnly(file, diff(...lines))).toBe(expected);
    });
  });
});
