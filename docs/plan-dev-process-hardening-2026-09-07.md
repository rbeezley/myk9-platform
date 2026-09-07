# Dev Process Hardening Implementation Plan

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, one task per PR, in the order given. Steps use checkbox (`- [ ]`) syntax for tracking. Every PR goes through `/ship-pr` (in-flight check, Codex gate, squash merge).

**Goal:** Close the nine process gaps found in the 2026-09-07 review so both harnesses run one rulebook, `main` gets a real CI verdict, scheduled jobs are green unless something is actually wrong, and the remaining gates are mechanical rather than typed by hand.

**Architecture:** Each task is one reviewable PR. Where a rule can be a program it becomes one, with a behavioural test and a known-answer fixture; where it must stay prose it is written once in `docs/agents/shared-rules.md` and copied into both instruction files by a sync script that CI checks. Nothing here touches product code except two Playwright specs.

**Tech Stack:** GitHub Actions, Node 22 (`--experimental-strip-types` scripts under `scripts/qa/`), vitest, Prettier 3.9.6, pnpm 9, Codex CLI, Playwright.

**Spec:** The review conversation of 2026-09-07 (this session). Findings, with evidence, are restated at the top of each task so the plan stands alone.

## Global Constraints

- Work in a worktree; never the primary checkout (CLAUDE.md § Worktree & Merge Workflow).
- `pnpm`, never `npm`/`npx`. Scripts under `scripts/qa/` are run with `node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON` (see existing `qa:*` entries in root `package.json`) or `tsx`.
- Every new check has a vitest file beside it and is registered as a `qa:<name>:test` script, run in the `Quality Checks` job of `.github/workflows/ci.yml`, next to the existing `pnpm qa:inflight:test` line (line ~210).
- Redirect test output to a file and echo `EXIT=$?`; never pipe through `tail`.
- Do not run `git branch -D`, `rm`, `git checkout --`, `git reset --hard`. Delete tracked files with `git rm`.
- Tasks 4, 5, 6 and 10 all edit `CLAUDE.md`. Run them in that order and rebase each on `main` after the previous one merges.
- `CLAUDE.md`, `AGENTS.md`, `.claude/**`, `.codex/**`, `.agents/**`, `.github/**` always go through a PR, never docs-only direct-to-`main`.

---

### Task 1: `main` gets a completed CI run

**Finding:** `ci.yml` declares `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`. Merges land every 10 to 30 minutes and a `main` run takes 20 to 30 minutes (the push-only `Test myK9Show (coverage)` job), so 25 of the last 30 `main` runs were `cancelled`. The post-merge coverage report and the "is main green" signal mostly do not exist.

**Files:**

- Modify: `.github/workflows/ci.yml:18-20`
- Create: `scripts/qa/ci-concurrency.test.ts`
- Modify: `package.json` (add `qa:ci-concurrency:test`)
- Modify: `.github/workflows/ci.yml` Quality Checks step that runs `pnpm qa:inflight:test` (add the new test)
- Modify: `.gitignore` (add `.logs/`, the per-worktree log directory every later task writes to)

**Interfaces:**

- Produces: nothing consumed later. Task 11 reads `gh run list --branch main` for evidence.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/qa/ci-concurrency.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `cancel-in-progress: true` on every ref cancelled 25 of 30 consecutive
 * `main` runs on 2026-09-06/07: merges landed faster than the push-only
 * coverage job finished, so `main` never carried a completed verdict.
 * PR runs may still be superseded; `main` runs must run to completion.
 */
const ci = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8');

describe('CI concurrency', () => {
  it('cancels superseded PR runs but never a main run', () => {
    const block = ci.match(/^concurrency:\n((?:  .*\n)+)/m)?.[1] ?? '';
    expect(block).toContain(
      "group: ${{ github.workflow }}-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}"
    );
    expect(block).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `mkdir -p .logs; pnpm vitest run scripts/qa/ci-concurrency.test.ts > .logs/t1.log 2>&1; echo "EXIT=$?"` (`.logs/` is gitignored by this task)
Expected: EXIT=1, assertion on `cancel-in-progress`.

- [ ] **Step 3: Change the workflow**

In `.github/workflows/ci.yml` replace

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

with

```yaml
# PR runs are superseded by the next push (one group per ref, cancel on push).
# A `main` run is never cancelled OR replaced: merges land minutes apart and
# the push-only coverage job takes ~25 min, so a ref-keyed group left 25 of 30
# consecutive main runs without a verdict (2026-09-06/07) -- and GitHub keeps
# only ONE queued run per group, so `cancel-in-progress: false` alone would
# still let a third merge replace the second's pending run (Codex review of
# #2110). Keying main's group by SHA gives every main commit its own run.
# scripts/qa/ci-concurrency.test.ts pins both halves.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

- [ ] **Step 4: Register the test and run it**

Add to root `package.json` scripts: `"qa:ci-concurrency:test": "vitest run scripts/qa/ci-concurrency.test.ts"`. Add `pnpm qa:ci-concurrency:test` to the Quality Checks step that already runs `pnpm qa:inflight:test`.

Run: `pnpm qa:ci-concurrency:test > .logs/t1.log 2>&1; echo "EXIT=$?"`
Expected: EXIT=0.

- [ ] **Step 5: Commit and ship**

```bash
git add .github/workflows/ci.yml scripts/qa/ci-concurrency.test.ts package.json .gitignore
git commit -m "ci: never cancel an in-progress main run

25 of the last 30 main runs were cancelled by the next merge, so main
carried no completed verdict and the post-merge coverage report never
ran. PR runs are still superseded on push.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then `/ship-pr`.

---

### Task 2: Clear the real high advisory behind the dependency-audit red

**Finding:** `Dependency Audit` has failed 3 of 3 runs. It is not a broken workflow: `pnpm audit --audit-level=high` exits 1 locally with `brace-expansion <1.1.17` (GHSA-mh99-v99m-4gvg) reachable through 44 paths (`@vercel/node`, `eslint`, others via `minimatch@3.1.5`). `package.json` `pnpm.overrides` pins `"brace-expansion@1.1.15": "1.1.16"`, which no longer matches the installed `1.1.16` and is one patch short of the fix.

**Files:**

- Modify: `package.json` `pnpm.overrides`
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

- [ ] **Step 1: Reproduce**

Run: `pnpm audit --audit-level=high > .logs/audit.log 2>&1; echo "EXIT=$?"`
Expected: EXIT=1 and the log names `brace-expansion`.

- [ ] **Step 2: Replace the stale pins**

In `package.json` `pnpm.overrides`, replace the three `brace-expansion@…` lines with range-keyed overrides so a future patch bump cannot silently fall outside them:

```json
"brace-expansion@<1.1.17": "1.1.17",
"brace-expansion@>=2 <2.1.2": "2.1.2",
"brace-expansion@>=5 <5.0.8": "5.0.8",
```

Run: `pnpm install > .logs/install.log 2>&1; echo "EXIT=$?"`
Expected: EXIT=0 and `git diff --stat` shows only `package.json` and `pnpm-lock.yaml`.

- [ ] **Step 3: Verify**

Run: `pnpm audit --audit-level=high > .logs/audit.log 2>&1; echo "EXIT=$?"`
Expected: EXIT=0.

Run: `pnpm why brace-expansion 2>/dev/null | grep -E 'brace-expansion@1\.' | sort -u`
Expected: only `brace-expansion@1.1.17` (or newer).

Run: `pnpm typecheck > .logs/tc.log 2>&1; echo "EXIT=$?"` and `pnpm --filter @myk9/show lint > .logs/lint.log 2>&1; echo "EXIT=$?"`
Expected: EXIT=0 for both.

- [ ] **Step 4: Commit and ship**

```bash
git add package.json pnpm-lock.yaml
git commit -m "fix(deps): patch brace-expansion past GHSA-mh99-v99m-4gvg

The monthly dependency audit has been red since 2026-09-01 on a real
high advisory: the existing override pinned 1.1.15 -> 1.1.16 and the
fix is 1.1.17. Range-keyed overrides so the next patch cannot slip
outside the pin.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`/ship-pr`. After merge, trigger `gh workflow run dependency-audit.yml` and confirm the run is green (Task 11 records it).

---

### Task 3: Make the nightly workflows report only real failures

**Finding:** `nightly-e2e.yml` (Stateful Playwright Regression, Mondays 07:00 UTC) failed 4 of 5; `nightly-health.yml` (daily 06:00 UTC) failed 4 of 5. The last nightly-e2e run has two failures: `cross-role-workflows.spec.ts:6` asserts a `Browse All` tab that Find Shows stopped rendering for guests in PR #2087 (`BrowseShowsPage.test.tsx:493` pins "hides the tab strip for guests"), and `browse-shows-to-details.spec.ts` sees one console line `Failed to load resource: … 500` with nothing in the artifact naming the request. Nightly-health's blocking job fails `route-health-by-role.spec.ts:183` with `secretary/entries: app API requests did not settle before route transition`; its advisory cross-browser job already carries `continue-on-error: true` and is not the cause of the red.

**Files:**

- Modify: `apps/myk9show/src/test/e2e/cross-role-workflows.spec.ts:13-15`
- Modify: `apps/myk9show/src/test/e2e/browse-shows-to-details.spec.ts:5-16`
- Modify: `apps/myk9show/playwright.ci.config.ts:128`
- Modify: `apps/myk9show/src/test/e2e/route-health-by-role.spec.ts` (only if Step 5 lands on branch (a))

- [ ] **Step 1: Fix the stale guest locator**

In `cross-role-workflows.spec.ts` replace

```ts
await expect(page.getByRole('textbox', { name: /Search shows/i })).toBeVisible();
await expect(page.getByRole('tab', { name: /Browse All/i })).toBeVisible();
```

with

```ts
await expect(page.getByRole('textbox', { name: /Search shows/i })).toBeVisible();
// Guests get no tab strip since #2087 (Browse All is their only tab); the
// month scrubber is the guest-visible control that proves the redesigned page.
await expect(page.getByRole('group', { name: /month/i })).toBeVisible();
```

Before committing, confirm the accessible name with `grep -n 'aria-label' apps/myk9show/src/pages/BrowseShowsPage.tsx apps/myk9show/src/components/shows/browse/*.tsx | grep -i month` and use the exact name the scrubber renders. If it has no accessible name, give it one (`aria-label="Month"`) in the component rather than weakening the spec.

- [ ] **Step 2: Make the 500 name its request**

In `browse-shows-to-details.spec.ts` change the first test to collect failed responses beside console errors:

```ts
const consoleErrors: string[] = [];
const failedResponses: string[] = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('response', response => {
  if (response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`);
});
await page.goto('/shows');
await expect(page.getByPlaceholder(/search shows/i)).toBeVisible({ timeout: 15000 });
expect(failedResponses, 'server errors while loading /shows').toEqual([]);
expect(consoleErrors.filter(error => !error.includes('DevTools'))).toHaveLength(0);
```

- [ ] **Step 3: Keep traces on regression failures**

In `playwright.ci.config.ts` change `trace: 'on-first-retry',` to

```ts
// Regression runs `--retries=0` (scripts/qa/run-playwright-regression.sh), so
// on-first-retry never records; a failure there must carry its own trace.
trace: process.env.PLAYWRIGHT_REGRESSION === 'true' ? 'retain-on-failure' : 'on-first-retry',
```

- [ ] **Step 4: Run the two specs locally against the dev server**

Run: `cd apps/myk9show && pnpm exec playwright test src/test/e2e/cross-role-workflows.spec.ts src/test/e2e/browse-shows-to-details.spec.ts --project=chromium --workers=1 --retries=0 > ../../.logs/t3.log 2>&1; echo "EXIT=$?"`
Expected: EXIT=0. If `browse-shows-to-details` fails with a named 500, that is the product bug the nightly has been hiding: file it in Linear (`todo-add`) with the URL and stop this task's Step 2 there; do not paper over it.

- [ ] **Step 5: Diagnose the nightly-health settle failure from its artifact**

Run: `RID=$(gh run list --workflow nightly-health.yml --limit 1 --status failure --json databaseId --jq '.[0].databaseId'); gh run download $RID -n myk9show-nightly-health-report -D .logs/nh`
Then: `grep -rho 'unsettled-api-requests=[^"]*' .logs/nh | sort | uniq -c`

Decide by what the URL is:

- (a) A long-lived subscription or poll that never settles by design (`/realtime/`, `/rest/v1/rpc/…heartbeat`, `messages?…` polling): add its path to the tracker's ignore list in `apps/myk9show/src/test/e2e/harness/routeHealthDiagnostics.ts` (or the `waitForAppApiRequestsToSettle` helper it calls) with a one-line comment naming this run id, and re-run `pnpm qa:nightly:health` locally.
- (b) A one-shot data query that takes longer than the settle budget: that is a real slow query on `secretary/entries`. File it in Linear with the URL and timing, and leave the spec red. Record the issue id in the PR body.

- [ ] **Step 6: Commit and ship**

```bash
git add apps/myk9show/src/test/e2e/cross-role-workflows.spec.ts apps/myk9show/src/test/e2e/browse-shows-to-details.spec.ts apps/myk9show/playwright.ci.config.ts
# Branch (a) in Step 5 also edits the harness; stage it or the nightly-health fix does not ship:
git add apps/myk9show/src/test/e2e/harness/routeHealthDiagnostics.ts 2>/dev/null || true
git status --short   # every M/A line must be one of the files above
git commit -m "test(e2e): retire the guest tab-strip locator and make a nightly 500 name its request

cross-role-workflows expected a Browse All tab that guests have not seen
since #2087. browse-shows-to-details reported a bare 500 with nothing
naming the request; it now records failed responses and regression
runs keep a trace on failure.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`/ship-pr`. After merge: `gh workflow run nightly-e2e.yml` and `gh workflow run nightly-health.yml`; record both conclusions in Task 11.

---

### Task 4: One rulebook for both harnesses

**Finding:** `AGENTS.md` (read by Codex) and `CLAUDE.md` (read by Claude Code) disagree: AGENTS.md says `git branch -D` after merge (CLAUDE.md: leave the branch), still describes the Linear free-tier 250 cap (retired 2026-09-01), says to keep retired sprint docs in sync, gives 60s for a hung test run (CLAUDE.md: 30s), uses `npx vitest`, and mentions none of `qa:inflight`, `qa:codex-review`, `watch-pr-checks.sh`, the ratchet, or the review-gate grammar. Each harness reviews the other's PR against its own file.

**Design:** `docs/agents/shared-rules.md` is the single source. Both instruction files carry its body verbatim between `<!-- shared-rules:begin -->` and `<!-- shared-rules:end -->` markers. `scripts/qa/sync-shared-rules.ts --write` copies it in; `--check` (CI) fails on any byte of drift or a missing marker pair. Harness-specific content stays outside the markers.

**Files:**

- Create: `docs/agents/shared-rules.md`
- Create: `scripts/qa/sync-shared-rules.ts`
- Create: `scripts/qa/sync-shared-rules.test.ts`
- Modify: `CLAUDE.md`, `AGENTS.md` (restructure), `package.json` (scripts), `.github/workflows/ci.yml` (Quality Checks), `docs/agents/README.md` if present, else `docs/PLAYBOOK.md` "See also" line

**Interfaces:**

- Produces: `syncSharedRules({ root, mode: 'check' | 'write' }): { changed: string[]; problems: string[] }` exported from `scripts/qa/sync-shared-rules.ts`. Task 5 runs `--write` after editing the shared file.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/qa/sync-shared-rules.test.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncSharedRules, BEGIN, END } from './sync-shared-rules';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(shared: string, claude: string, agents: string): string {
  const root = mkdtempSync(join(tmpdir(), 'shared-rules-'));
  dirs.push(root);
  mkdirSync(join(root, 'docs/agents'), { recursive: true });
  writeFileSync(join(root, 'docs/agents/shared-rules.md'), shared);
  writeFileSync(join(root, 'CLAUDE.md'), claude);
  writeFileSync(join(root, 'AGENTS.md'), agents);
  return root;
}
const wrap = (body: string, before = '# X\n\n', after = '\n## Only here\n') =>
  `${before}${BEGIN}\n${body}\n${END}${after}`;

describe('syncSharedRules', () => {
  it('passes when both files carry the shared body verbatim', () => {
    const root = repo(
      '## Rule\n\nDo the thing.\n',
      wrap('## Rule\n\nDo the thing.'),
      wrap('## Rule\n\nDo the thing.')
    );
    expect(syncSharedRules({ root, mode: 'check' })).toEqual({ changed: [], problems: [] });
  });

  it('fails check on a single-byte drift and names the file', () => {
    const root = repo(
      '## Rule\n\nDo the thing.\n',
      wrap('## Rule\n\nDo the thing.'),
      wrap('## Rule\n\nDo the thing!')
    );
    const result = syncSharedRules({ root, mode: 'check' });
    expect(result.problems).toEqual([
      'AGENTS.md: shared-rules block differs from docs/agents/shared-rules.md',
    ]);
  });

  it('fails check when a marker pair is missing', () => {
    const root = repo('## Rule\n', wrap('## Rule'), '# No markers\n');
    expect(syncSharedRules({ root, mode: 'check' }).problems).toEqual([
      'AGENTS.md: missing shared-rules markers',
    ]);
  });

  it('fails check on a second marker pair (a stale duplicate block would otherwise hide)', () => {
    const root = repo('## Rule\n', wrap('## Rule'), `${wrap('## Rule')}\n${wrap('## Stale')}`);
    expect(syncSharedRules({ root, mode: 'check' }).problems).toEqual([
      'AGENTS.md: more than one shared-rules marker pair',
    ]);
  });

  it('write rewrites only the block and keeps everything outside it', () => {
    const root = repo('## New\n', wrap('## Old', '# Head\n', '\n## Tail\n'), wrap('## Old'));
    expect(syncSharedRules({ root, mode: 'write' }).changed.sort()).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe(
      `# Head\n${BEGIN}\n## New\n${END}\n## Tail\n`
    );
    expect(syncSharedRules({ root, mode: 'check' })).toEqual({ changed: [], problems: [] });
  });

  it('the real repo is in sync (positive control on the actual files)', () => {
    const root = join(import.meta.dirname, '../..');
    const result = syncSharedRules({ root, mode: 'check' });
    expect(result.problems).toEqual([]);
    const shared = readFileSync(join(root, 'docs/agents/shared-rules.md'), 'utf8');
    expect(shared.length).toBeGreaterThan(2000); // vacuity guard: an empty shared file would also "sync"
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/qa/sync-shared-rules.test.ts > .logs/t4.log 2>&1; echo "EXIT=$?"`
Expected: EXIT=1, module not found.

- [ ] **Step 3: Write the sync script**

```ts
// scripts/qa/sync-shared-rules.ts
/**
 * docs/agents/shared-rules.md is the ONE rulebook both harnesses read.
 * CLAUDE.md and AGENTS.md each carry its body verbatim between the markers
 * below; everything outside the markers is harness-specific. `--check` (CI)
 * fails on any drift; `--write` copies the shared file in.
 *
 * Why a copy and not an include: Codex reads AGENTS.md as a flat file, and a
 * rule that lives only in a linked doc is a rule one harness never sees. On
 * 2026-09-07 the two files disagreed on branch deletion, the Linear archive
 * window, the hung-test budget and the test runner spelling, and AGENTS.md
 * named none of the CI gates CLAUDE.md required.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BEGIN = '<!-- shared-rules:begin -->';
export const END = '<!-- shared-rules:end -->';
export const SHARED_PATH = 'docs/agents/shared-rules.md';
export const TARGETS = ['CLAUDE.md', 'AGENTS.md'] as const;

export interface SyncResult {
  changed: string[];
  problems: string[];
}

export function syncSharedRules(opts: { root: string; mode: 'check' | 'write' }): SyncResult {
  const shared = readFileSync(join(opts.root, SHARED_PATH), 'utf8').replace(/\s+$/, '');
  const result: SyncResult = { changed: [], problems: [] };
  for (const target of TARGETS) {
    const path = join(opts.root, target);
    const text = readFileSync(path, 'utf8');
    const begin = text.indexOf(BEGIN);
    const end = text.indexOf(END);
    if (begin < 0 || end < 0 || end < begin) {
      result.problems.push(`${target}: missing shared-rules markers`);
      continue;
    }
    if (text.indexOf(BEGIN, begin + 1) >= 0 || text.indexOf(END, end + 1) >= 0) {
      result.problems.push(`${target}: more than one shared-rules marker pair`);
      continue;
    }
    const current = text
      .slice(begin + BEGIN.length, end)
      .replace(/^\n/, '')
      .replace(/\s+$/, '');
    if (current === shared) continue;
    if (opts.mode === 'check') {
      result.problems.push(`${target}: shared-rules block differs from ${SHARED_PATH}`);
      continue;
    }
    writeFileSync(path, `${text.slice(0, begin)}${BEGIN}\n${shared}\n${text.slice(end)}`);
    result.changed.push(target);
  }
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  const result = syncSharedRules({ root: process.cwd(), mode });
  for (const p of result.problems) console.error(`shared-rules: ${p}`);
  for (const c of result.changed) console.log(`shared-rules: wrote ${c}`);
  if (result.problems.length) {
    console.error(
      'shared-rules: run `pnpm qa:shared-rules:write` after editing docs/agents/shared-rules.md'
    );
    process.exit(1);
  }
  console.log(
    `shared-rules: ${mode === 'check' ? 'in sync' : `updated ${result.changed.length} file(s)`}`
  );
}
```

Add scripts to root `package.json`:

```json
"qa:shared-rules": "node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/sync-shared-rules.ts",
"qa:shared-rules:write": "node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/sync-shared-rules.ts --write",
"qa:shared-rules:test": "vitest run scripts/qa/sync-shared-rules.test.ts",
```

- [ ] **Step 4: Write `docs/agents/shared-rules.md`**

Start it with:

```markdown
## Shared rules

This block is the one rulebook for Claude Code and Codex. Edit it HERE, then run
`pnpm qa:shared-rules:write`; CI fails if `CLAUDE.md` or `AGENTS.md` drifts from it.
Harness-specific material (Claude Code's LESSONS, Codex's OPSX routing) lives outside the markers.
```

Then move these sections in, taking the CLAUDE.md wording wherever the two files differ, with these specific corrections:

| Section                                 | Source                        | Correction while moving                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product Goal                            | AGENTS.md                     | none (Claude gains it)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Project Overview                        | both                          | identical, keep once                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Current development phase               | both                          | identical, keep once                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Intent & Emotional Design               | both                          | keep the CLAUDE.md version                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Development Principles                  | both                          | keep AGENTS.md's five (it has "Don't guess or assume" which CLAUDE.md lacks)                                                                                                                                                                                                                                                                                                                                                                         |
| Commands                                | both                          | `pnpm vitest run …`, never `npx`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Architecture Decisions, Database Config | both                          | keep CLAUDE.md's (it carries the heritage-column pointer)                                                                                                                                                                                                                                                                                                                                                                                            |
| Deployment                              | both                          | CLAUDE.md's plus AGENTS.md's Vercel Hobby quota paragraph                                                                                                                                                                                                                                                                                                                                                                                            |
| Key Patterns, State Management          | both                          | AGENTS.md's longer offline-first paragraph                                                                                                                                                                                                                                                                                                                                                                                                           |
| Testing                                 | both                          | 30 seconds for a hung runner; assertion-first paragraph from AGENTS.md; `--sequence.shuffle` one-liner pointing at the commit skill                                                                                                                                                                                                                                                                                                                  |
| Workflow                                | both                          | CLAUDE.md's version (Linear is the tracker of record; no sprint docs) plus AGENTS.md's Before/While/After editing lists and the PR review standard. Add the gate list: `pnpm qa:inflight` before starting, `pnpm qa:codex-review` / `scripts/qa/watch-pr-checks.sh` / `pnpm qa:code-quality-ratchet` before merging, review-gate evidence grammar (`Review gate: <reviewer> reviewed <base>..<head> — no findings` or `<N> findings, all addressed`) |
| Linear reading rules                    | AGENTS.md "Reading the board" | delete the free-tier sentence; keep `includeArchived: true` and `get_issue`                                                                                                                                                                                                                                                                                                                                                                          |
| Worktree & Merge hard rules             | CLAUDE.md                     | replace AGENTS.md's `git branch -D` step with: "Leave the local branch. Claude Code cannot delete it (denied); Codex may, after the worktree is removed, if `git rev-parse <branch>` equals the merged PR's `headRefOid`."                                                                                                                                                                                                                           |
| Database Migrations                     | CLAUDE.md                     | none                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Auto Mode shared-system writes          | both                          | CLAUDE.md's (has the docs-only exception)                                                                                                                                                                                                                                                                                                                                                                                                            |
| Browser automation session ownership    | both                          | identical, keep once                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Debugging seed-data / config bugs       | AGENTS.md                     | replace with one line pointing at `docs/PLAYBOOK.md` § 3                                                                                                                                                                                                                                                                                                                                                                                             |

Left OUTSIDE the markers: in `CLAUDE.md` the Communication Style line, Agent skills pointers, Self Learning, LESSONS, Planning (Claude's plan-file rules), and the EnterWorktree hook note; in `AGENTS.md` the Communication Style line, Mandatory start check, OPSX / OpenSpec Workflow, PR reviews, Small Maintenance Changes (correct its `codex/maintenance-notes` guidance to say the branch must still pass `pnpm qa:inflight`).

- [ ] **Step 5: Insert the markers and sync**

In each instruction file, delete the moved sections and put `<!-- shared-rules:begin -->` / `<!-- shared-rules:end -->` where they were (directly after `## Communication Style` and its paragraph). Then:

Run: `pnpm qa:shared-rules:write; pnpm qa:shared-rules; echo "EXIT=$?"`
Expected: `shared-rules: wrote CLAUDE.md`, `shared-rules: wrote AGENTS.md`, then `in sync`, EXIT=0.

- [ ] **Step 6: Prove the check bites (mutation)**

First stage the synced result so the mutations below can be undone from the index without losing Step 5's work: `git add CLAUDE.md AGENTS.md docs/agents/shared-rules.md`.

Run: `printf '\nx\n' >> AGENTS.md; pnpm qa:shared-rules; echo "EXIT=$?"; git restore AGENTS.md`
Expected: appending AFTER the end marker leaves it in sync (EXIT=0); `git restore` (no `--staged`) puts the staged, synced file back.
Run: `perl -0pi -e 's/(shared-rules:begin -->\n## Shared rules)/$1!/' AGENTS.md; pnpm qa:shared-rules; echo "EXIT=$?"; git restore AGENTS.md; pnpm qa:shared-rules; echo "AFTER_RESTORE_EXIT=$?"`
Expected: EXIT=1 naming `AGENTS.md`, then AFTER_RESTORE_EXIT=0 proving the restore brought the synced text back, not the pre-task one.

- [ ] **Step 7: Run the tests, the doc staleness check and the whole test file**

Run: `pnpm qa:shared-rules:test > .logs/t4.log 2>&1; echo "EXIT=$?"` → EXIT=0.
Run: `pnpm qa:doc-staleness:strict > .logs/ds.log 2>&1; echo "EXIT=$?"` → EXIT=0 (fix any link it reports).
Add `pnpm qa:shared-rules:test` and `pnpm qa:shared-rules` to the Quality Checks step beside `pnpm qa:inflight:test`.

- [ ] **Step 8: Commit and ship**

```bash
git add docs/agents/shared-rules.md scripts/qa/sync-shared-rules.ts scripts/qa/sync-shared-rules.test.ts CLAUDE.md AGENTS.md package.json .github/workflows/ci.yml docs/PLAYBOOK.md
git commit -m "docs(agents): one rulebook for Claude Code and Codex, checked in CI

AGENTS.md and CLAUDE.md had drifted: branch deletion, the retired
Linear free-tier cap, retired sprint docs, 60s vs 30s hung-test budget,
npx vs pnpm, and none of the CI gates named in only one file. The
shared body now lives in docs/agents/shared-rules.md and is copied into
both files between markers; qa:shared-rules fails on a byte of drift.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`/ship-pr`.

---

### Task 5: LESSONS become rules with pointers

**Finding:** `CLAUDE.md` is 12,546 words; the LESSONS section is 10,097 of them, loaded into every session and subagent. Most entries are incident narratives. The section's own retire clause says a lesson leaves once a check makes the trap impossible, and at least nine now have one.

**Files:**

- Create: `docs/lessons/README.md` (the narratives, one `## <slug>` per lesson, moved verbatim)
- Modify: `CLAUDE.md` LESSONS section
- Create: `apps/myk9show/src/test/ci/instructionFileBudget.test.ts`

**Interfaces:**

- Consumes: Task 4's markers (LESSONS stay outside them).

- [ ] **Step 1: Write the budget test first**

```ts
// apps/myk9show/src/test/ci/instructionFileBudget.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CLAUDE.md is loaded into every session and every subagent. On 2026-09-07 it
 * was 12,546 words, 10,097 of them LESSONS narratives; that is ~16k tokens per
 * turn spent on stories about traps that mostly have checks now. Narratives
 * live in docs/lessons/README.md; CLAUDE.md keeps one or two lines per lesson
 * and a pointer. Raise these numbers only in a PR that says why.
 */
const root = resolve(__dirname, '../../../../..');
const words = (file: string) =>
  readFileSync(resolve(root, file), 'utf8').split(/\s+/).filter(Boolean).length;

describe('instruction file budgets', () => {
  it('CLAUDE.md stays under 5,000 words', () => {
    expect(words('CLAUDE.md')).toBeLessThan(5000);
  });
  it('AGENTS.md stays under 5,000 words', () => {
    expect(words('AGENTS.md')).toBeLessThan(5000);
  });
  it('every LESSONS bullet is at most three lines of prose', () => {
    const claude = readFileSync(resolve(root, 'CLAUDE.md'), 'utf8');
    const lessons = claude.slice(
      claude.indexOf('## LESSONS'),
      claude.indexOf('## ', claude.indexOf('## LESSONS') + 1)
    );
    const bullets = lessons.split(/\n(?=- )/).slice(1);
    expect(bullets.length).toBeGreaterThan(20); // vacuity guard
    const long = bullets.filter(b => b.split('\n').filter(l => l.trim()).length > 3);
    expect(long.map(b => b.slice(0, 60))).toEqual([]);
  });
});
```

Run: `cd apps/myk9show && pnpm vitest run src/test/ci/instructionFileBudget.test.ts > ../../.logs/t5.log 2>&1; echo "EXIT=$?"`
Expected: EXIT=1 on the word count and on long bullets.

- [ ] **Step 2: Move every narrative into `docs/lessons/README.md`**

Create the file with a heading `# Lessons (narratives)` and a paragraph: "The rule for each of these lives in `CLAUDE.md` § LESSONS. This file keeps the incident that produced it. Add a section here when you add a lesson; delete it when the lesson is retired." Then one `## <slug>` section per bullet, body copied verbatim from today's CLAUDE.md, in the same order. Slugs (use these exactly so the pointers resolve):

`no-docker`, `linear-include-archived`, `codex-review-exit-code`, `linear-done-from-list`, `vitest-shuffle`, `timeout-class-flake`, `git-branch-delete-denied`, `functions-deploy-workdir`, `dismiss-absorbed-chip`, `plan-status-line`, `edge-tests-jsdom`, `postgrest-count-column`, `postgrest-embed-grants`, `missing-column-not-drift`, `stale-package-dist`, `untracked-migration-sql`, `slideover-size-inert`, `migration-timestamp`, `sequence-privileges`, `grant-contract-splitter`, `grant-never-narrows`, `headrefname-not-merged`, `replace-function-latest`, `stale-red-check`, `stale-health-check`, `view-predicate-audit`, `select-star-reexpands`, `replace-view-reloptions`, `offline-identity-pairing`, `partition-rearms-guards`, `definer-deliberate-edge`, `source-text-tests`, `code-quality-ratchet`, `shared-tmp-log`, `pipe-exit-code`, `vitest-timeout-names-it`, `confirm-click-destructive`, `deploy-probe-unique-string`, `ci-poll-settled`, `git-log-s-assertion`, `cascade-delete-vs-upsert`, `last-hop-drop`, `comment-satisfies-grep`, `mutation-actually-mutated`, `tsc-solution-tsconfig`, `conflicting-pr-no-runs`, `measurement-harness`, `assertion-worst-case`, `token-composited`, `last-on-destructive`, `composite-action-expression`, `dead-suite-reds`, `dead-suite-green`, `review-after-merge`, `discriminator-branches`, `vercel-rate-limit`, `pr-smoke-network`, `anchored-edit-after-format`, `guard-word-split`, `local-self-reference`, `watcher-first-failure`, `inflight-check`.

- [ ] **Step 3: Rewrite the LESSONS section**

Each bullet becomes at most three lines: the rule, the mechanism in one clause, and `(docs/lessons/README.md#<slug>)`. Apply these dispositions:

| Disposition                                                                         | Lessons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Retire to a one-line pointer at the check** (the trap is now caught by a program) | `codex-review-exit-code` → `scripts/qa/codex-review.sh`; `plan-status-line` → `pnpm qa:plans` in CI; `stale-package-dist` → `pnpm qa:dist-fresh`; `migration-timestamp` → `pnpm qa:migrations:guard` in CI (keep the "pick an odd time" clause); `ci-poll-settled` (all three paragraphs) → `scripts/qa/watch-pr-checks.sh`; `composite-action-expression` → `scheduledFailureNotification.test.ts`; `review-after-merge` → the `Review gate` status; `guard-word-split` → the deny-guard fixtures; `inflight-check` → `pnpm qa:inflight`; `shared-tmp-log` → Task 10's `.logs/` |
| **Merge**                                                                           | `last-on-destructive` into `confirm-click-destructive`; `dead-suite-green` into `dead-suite-reds`; `assertion-worst-case` and `token-composited` into `measurement-harness`                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Keep, trimmed to ≤3 lines**                                                       | everything else                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Example of the target shape:

```markdown
- **A Vercel check whose `targetUrl` ends `?upgradeToPro=build-rate-limit` is an account quota, not a verdict**; GitHub leaves the PR `MERGEABLE`/`UNSTABLE`. Merge on the Actions jobs plus the app's own Vercel context and say which check you ignored. The same limit fails the `main` build, so before closing an issue confirm a green production build on a `main` commit at or after yours. (docs/lessons/README.md#vercel-rate-limit)
```

- [ ] **Step 4: Run the budget test, the doc checks and the shared-rules check**

Run: `cd apps/myk9show && pnpm vitest run src/test/ci/instructionFileBudget.test.ts > ../../.logs/t5.log 2>&1; echo "EXIT=$?"` → EXIT=0.
Run: `pnpm qa:shared-rules; pnpm qa:doc-staleness:strict; echo "EXIT=$?"` → EXIT=0.
Run: `for s in $(grep -o 'docs/lessons/README.md#[a-z0-9-]*' CLAUDE.md | cut -d# -f2 | sort -u); do grep -q "^## $s$" docs/lessons/README.md || echo "MISSING $s"; done` → no output.

- [ ] **Step 5: Commit and ship**

```bash
git add CLAUDE.md docs/lessons/README.md apps/myk9show/src/test/ci/instructionFileBudget.test.ts
git commit -m "docs(claude): LESSONS become rules with pointers; narratives move to docs/lessons

CLAUDE.md was 12.5k words, 10k of them incident narratives loaded into
every session. Ten lessons whose trap is now caught by a check are
retired to one-line pointers, three pairs are merged, the rest are
trimmed to three lines, and the stories move verbatim to
docs/lessons/README.md. A budget test keeps both instruction files
under 5,000 words.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`/ship-pr`.

---

### Task 6: Say which deploy path is real

**Finding:** `deploy-staging.yml` has been `skipped` on every run because `STAGING_RELEASE_ENABLED` is unset; the `staging-release` and `guides-release` refs sit at `5975adadb` (2026-07-27), 731 commits behind `main`. Vercel deploys `main` to the public domain on push, before CI finishes. PR #2020 fixed the gating of a workflow that never runs, and `CLAUDE.md`'s Deployment section does not say the CI-gated path is dormant. MYK9-44 tracks enabling it with no priority.

**Files:**

- Modify: `docs/agents/shared-rules.md` Deployment section (then `pnpm qa:shared-rules:write`)
- Modify: `.github/workflows/deploy-staging.yml` header comment
- Modify: `docs/operations/ci-vercel-deploys.md` "Current pre-launch mode"
- Linear: MYK9-44

- [ ] **Step 1: State the truth in the shared rules**

Replace the Deployment bullets with:

```markdown
## Deployment

- **What ships today:** Vercel builds every push to `main` and serves it at the public domain. That build starts before CI finishes and is not gated by it. A Vercel build-rate-limit failure on `main` leaves the previous bundle live (see LESSONS `vercel-rate-limit`).
- **Dormant until MYK9-44:** the CI-gated path in `deploy-staging.yml` / `deploy-production.yml` (`STAGING_RELEASE_ENABLED` is unset; the `staging-release` ref is frozen at 2026-07-27). Do not reason from it, fix it, or gate on it until that issue is In Progress. Runbook: `docs/operations/ci-vercel-deploys.md`.
- **Legacy production myK9Qv3:** myk9q.com (separate repo, untouched).
```

- [ ] **Step 2: Mark the workflow dormant at the top**

Insert after the existing header comment in `deploy-staging.yml`:

```yaml
# DORMANT: STAGING_RELEASE_ENABLED is unset, so every run of this workflow is
# skipped and the release refs are frozen at 2026-07-27. Enabling it is
# MYK9-44, sequenced with the Stripe live cutover (MYK9-11). Until then this
# file is the launch design, not the deploy path; see
# docs/operations/ci-vercel-deploys.md "Current pre-launch mode".
```

- [ ] **Step 3: Tighten the runbook's opening**

In `docs/operations/ci-vercel-deploys.md` under "Current pre-launch mode", replace "Keep `STAGING_RELEASE_ENABLED` set to `false`…" with a sentence that names the frozen ref SHA and MYK9-44, and add "The refs are 700+ commits behind `main`; do not use `staging-release` as evidence of anything."

- [ ] **Step 4: Sync, check, and update Linear**

Run: `pnpm qa:shared-rules:write; pnpm qa:shared-rules; pnpm qa:doc-staleness:strict; echo "EXIT=$?"` → EXIT=0.
Set MYK9-44 priority to High, add a comment linking MYK9-11 and this plan, and add "blocked by MYK9-11 (Stripe live cutover)" to its description. Leave it in Backlog.

- [ ] **Step 5: Commit and ship**

```bash
git add docs/agents/shared-rules.md CLAUDE.md AGENTS.md .github/workflows/deploy-staging.yml docs/operations/ci-vercel-deploys.md
git commit -m "docs(deploy): say which deploy path is real and mark the CI-gated one dormant

Vercel deploys main on push, ungated. deploy-staging.yml has been
skipped on every run and its release refs are 731 commits behind.
Both instruction files now say so, and the workflow header points at
MYK9-44 instead of reading as live machinery.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`/ship-pr`.

---

### Task 7: The review gate posts its own evidence

**Finding:** `scripts/qa/codex-review.sh` prints the evidence line and the agent types `gh pr comment` by hand; the script header admits this "proves a review was CLAIMED". Findings never reach the PR, only `12 findings, all addressed`, so there is no record of what Codex found or a dataset of where it finds things.

**Design:** `scripts/qa/post-review-gate.sh` is the only writer of evidence comments. It takes reviewer, base, head, verdict, and a log path; it posts the evidence line first, then `log sha256: <hash>`, then the verdict block from the log in a fenced section. `codex-review.sh --post` calls it on a clean verdict, and on findings posts a separate `Codex findings for <head>` comment (which never starts with `Review gate:` and so is never evidence). A clean re-run after findings reports `<N> findings, all addressed`, N summed from the wrapper's own earlier findings comments on that PR.

**Files:**

- Create: `scripts/qa/post-review-gate.sh`
- Modify: `scripts/qa/codex-review.sh`
- Modify: `scripts/qa/codex-review.test.ts`
- Create: `scripts/qa/post-review-gate.test.ts`
- Modify: `.claude/skills/ship-pr/SKILL.md` Step 4
- Modify: `package.json` (`qa:post-review-gate:test`), `.github/workflows/ci.yml` Quality Checks

**Interfaces:**

- Produces: `scripts/qa/post-review-gate.sh <pr> <codex|claude> <base-sha> <head-sha> "<verdict>" <log-path>`; env `GH_BIN` overrides `gh` for tests. Exit 0 posted, 2 refused (bad verdict grammar, empty log).
- Produces: `scripts/qa/review-gate.ts --verdict "<text>"` exits 0 when `CLEAN_VERDICT` (line 88) accepts the text and 2 otherwise. The poster calls this so there is ONE grammar; a hand-copied regex in the poster drifted from the parser in the first draft of this plan (`finding(s)` is accepted by the parser's docs in ship-pr but rejected by `CLEAN_VERDICT`).
- `codex-review.sh --post` (PR number from `gh pr view --json number`), env `GH_BIN` for tests.

- [ ] **Step 1: Write the failing tests for the poster**

```ts
// scripts/qa/post-review-gate.test.ts
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, 'post-review-gate.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function stubGh(): { bin: string; calls: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gh-stub-'));
  dirs.push(dir);
  const calls = join(dir, 'calls.log');
  const bin = join(dir, 'gh');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> '${calls}'\nprintf -- '---\\n' >> '${calls}'\n`
  );
  chmodSync(bin, 0o755);
  return { bin, calls };
}
function logFile(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'review-log-'));
  dirs.push(dir);
  const p = join(dir, 'review.log');
  writeFileSync(p, text);
  return p;
}
function run(args: string[], gh: string): { code: number; out: string } {
  try {
    return {
      code: 0,
      out: execFileSync('bash', [SCRIPT, ...args], {
        encoding: 'utf8',
        env: { ...process.env, GH_BIN: gh },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

describe('post-review-gate.sh', () => {
  it('posts the evidence line first, then the log hash, then the verdict block', () => {
    const gh = stubGh();
    const log = logFile('codex\nNo actionable defects found.\n');
    expect(run(['42', 'codex', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin).code).toBe(0);
    const calls = readFileSync(gh.calls, 'utf8');
    expect(calls).toMatch(/^pr\ncomment\n42\n--body\n/);
    const body = calls.split('--body\n')[1]!.split('\n---')[0]!;
    const lines = body.split('\n');
    expect(lines[0]).toBe('Review gate: codex reviewed 0a2020c7a..5af9af158 — no findings');
    expect(lines[1]).toMatch(/^log sha256: [0-9a-f]{64}$/);
    expect(body).toContain('No actionable defects found.');
  });

  it.each(['no blocking findings', '1 finding(s), all addressed', 'no findings yet'])(
    'refuses %j (rejected by review-gate.ts CLEAN_VERDICT) and posts nothing',
    verdict => {
      const gh = stubGh();
      const log = logFile('codex\nNo actionable defects found.\n');
      const r = run(['42', 'codex', '0a2020c7a', '5af9af158', verdict, log], gh.bin);
      expect(r.code).toBe(2);
      expect(r.out).toContain('verdict');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    }
  );

  it('accepts exactly what review-gate.ts accepts (grammar is shared, not copied)', () => {
    const gh = stubGh();
    const log = logFile('codex\n- fixed\n');
    expect(
      run(['42', 'claude', '0a2020c7a', '5af9af158', '2 findings, all fixed', log], gh.bin).code
    ).toBe(0);
  });

  it('refuses an empty log', () => {
    const gh = stubGh();
    const log = logFile('');
    expect(
      run(['42', 'claude', '0a2020c7a', '5af9af158', '2 findings, all addressed', log], gh.bin).code
    ).toBe(2);
  });

  it.each([
    'codex\nUnable to complete the review because the connection failed.\n',
    "ERROR: You've hit your usage limit\nReview was interrupted\n",
    'codex\n- [P1] Something is broken\n',
  ])(
    'refuses "no findings" over a log that did not complete or still carries findings: %j',
    text => {
      const gh = stubGh();
      const log = logFile(text);
      const r = run(['42', 'codex', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin);
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/log does not support/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    }
  );

  it('accepts "no findings" only over a log whose verdict opens with a clean sentence', () => {
    const gh = stubGh();
    for (const text of [
      'codex\nNo actionable defects found.\n',
      'No issues found in this diff.\n',
      'No findings.\n',
    ]) {
      const log = logFile(text);
      expect(run(['42', 'claude', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin).code).toBe(
        0
      );
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run scripts/qa/post-review-gate.test.ts > .logs/t7.log 2>&1; echo "EXIT=$?"` → EXIT=1 (script missing).

- [ ] **Step 3a: Give review-gate.ts a `--verdict` mode**

In `scripts/qa/review-gate.ts`, at the top of the CLI block (the `if (import.meta.url === pathToFileURL(...))` branch), add:

```ts
const verdictFlag = process.argv.indexOf('--verdict');
if (verdictFlag >= 0) {
  const text = (process.argv[verdictFlag + 1] ?? '').trim();
  process.exit(CLEAN_VERDICT.test(text) ? 0 : 2);
}
```

and in `scripts/qa/review-gate.test.ts` add a case that spawns the script with `--verdict "1 finding(s), all addressed"` and expects exit 2, and with `--verdict "no findings"` expects 0. Also fix `.claude/skills/ship-pr/SKILL.md` Step 4, which today documents `finding(s)` as accepted: the accepted forms are exactly `no findings` and `<N> findings, all addressed|fixed` (`1 findings, all addressed` is the singular, ugly but green).

- [ ] **Step 3: Write the poster**

````bash
#!/usr/bin/env bash
# The ONLY writer of `Review gate:` evidence comments. An agent that ran a
# review calls this with the log; an agent that did not has no log to hash.
# Format contract: line 1 is the evidence line scripts/qa/review-gate.ts
# parses; line 2 is the sha256 of the review log; the rest is the verdict
# block, fenced, so the PR carries what the reviewer actually said.
#
# Usage: post-review-gate.sh <pr> <codex|claude> <base-sha> <head-sha> "<verdict>" <log>
# Exit:  0 posted · 2 refused (bad verdict grammar or empty log); nothing posted
set -euo pipefail
PR="$1"; REVIEWER="$2"; BASE="$3"; HEAD="$4"; VERDICT="$5"; LOG="$6"
GH="${GH_BIN:-gh}"

case "$REVIEWER" in codex|claude) ;; *) echo "post-review-gate: reviewer must be codex or claude" >&2; exit 2;; esac
# ONE grammar: ask the parser that will judge the comment, never a copied regex.
if ! node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
    "$(dirname "$0")/review-gate.ts" --verdict "$VERDICT"; then
  echo "post-review-gate: verdict '$VERDICT' is outside the gate grammar (review-gate.ts CLEAN_VERDICT); nothing posted" >&2
  exit 2
fi
if [ ! -s "$LOG" ]; then
  echo "post-review-gate: log '$LOG' is empty or missing; nothing posted" >&2
  exit 2
fi
HASH="$(shasum -a 256 "$LOG" | cut -d' ' -f1)"
VERDICT_BLOCK="$(awk '/^codex$/{f=1; next} f' "$LOG")"
[ -n "$VERDICT_BLOCK" ] || VERDICT_BLOCK="$(tail -40 "$LOG")"

# The log must SUPPORT the verdict. The poster is reachable without the Codex
# wrapper (the Claude path calls it directly), so it re-checks what the wrapper
# checks: an interrupted or incomplete review is never evidence, and "no
# findings" needs a clean sentence in the log, not just a caller's say-so.
if grep -Eq "^(ERROR: You've hit your usage limit|Review was interrupted)" "$LOG" ||
   printf '%s' "$VERDICT_BLOCK" | grep -Eiq '\bunable to complete the review\b|\breview (did not run|was interrupted)\b'; then
  echo "post-review-gate: log does not support any verdict (review did not complete); nothing posted" >&2
  exit 2
fi
if [ "$VERDICT" = "no findings" ]; then
  if printf '%s' "$VERDICT_BLOCK" | grep -Eq '^\s*- \[P[0-9]\]'; then
    echo "post-review-gate: log does not support 'no findings' (it carries [P*] bullets); nothing posted" >&2
    exit 2
  fi
  # One place to extend when a reviewer's clean phrasing changes; add a fixture with the real log.
  if ! printf '%s' "$VERDICT_BLOCK" | grep -Eiq '(^|[.!?][[:space:]]+)No (actionable |blocking )?(findings|defects|issues|regressions)'; then
    echo "post-review-gate: log does not support 'no findings' (no clean sentence found); nothing posted" >&2
    exit 2
  fi
fi
BODY="$(printf 'Review gate: %s reviewed %s..%s — %s\nlog sha256: %s\n\n<details><summary>%s verdict</summary>\n\n```text\n%s\n```\n\n</details>\n' \
  "$REVIEWER" "${BASE:0:9}" "${HEAD:0:9}" "$VERDICT" "$HASH" "$REVIEWER" "$VERDICT_BLOCK")"
"$GH" pr comment "$PR" --body "$BODY"
echo "post-review-gate: posted '$VERDICT' for ${HEAD:0:9} on #$PR (log sha256 ${HASH:0:12})"
````

Run: `chmod +x scripts/qa/post-review-gate.sh; pnpm vitest run scripts/qa/post-review-gate.test.ts > .logs/t7.log 2>&1; echo "EXIT=$?"` → EXIT=0.

- [ ] **Step 4: Teach `codex-review.sh` to post**

Add after `BASE_REF="${1:-origin/main}"`:

```bash
POST=0
for arg in "$@"; do [ "$arg" = "--post" ] && POST=1; done
GH="${GH_BIN:-gh}"
POSTER="$(dirname "$0")/post-review-gate.sh"
```

and replace `BASE_REF="${1:-origin/main}"` with a parser that ignores `--post` and a stray `--` (pnpm forwards `--` to the script, so `pnpm qa:codex-review -- --post` would otherwise review base `--`):

```bash
BASE_REF="origin/main"
for arg in "$@"; do
  case "$arg" in --post|--) ;; *) BASE_REF="$arg" ;; esac
done
```

Invoke it as `pnpm qa:codex-review --post` (no `--`). Add a test that `bash codex-review.sh -- --post` still passes `--base HEAD`'s default `origin/main` to the stub (assert `args[2]` is not `--`).

In the findings branch (before `exit 1`), add:

```bash
if [ "$POST" = 1 ]; then
  PR="$("$GH" pr view --json number -q .number)"
  "$GH" pr comment "$PR" --body "$(printf 'Codex findings for %s (not gate evidence):\n\n%s\n' "${HEAD_SHA:0:9}" "$VERDICT")"
fi
```

In the clean branch (replace the final two `echo` lines and `exit 0`):

```bash
VERDICT_LINE="no findings"
if [ "$POST" = 1 ]; then
  PR="$("$GH" pr view --json number -q .number)"
  PRIOR="$("$GH" pr view "$PR" --json comments -q '[.comments[].body | select(startswith("Codex findings for"))] | join("\n")')"
  N="$(printf '%s' "$PRIOR" | grep -cE '^\s*- \[P[0-9]\]' || true)"
  [ "${N:-0}" -gt 0 ] && VERDICT_LINE="$N findings, all addressed"
  # The wrapper runs without errexit; a poster failure (grammar refusal, gh
  # error) must not fall through to exit 0 as if evidence had been posted.
  if ! "$POSTER" "$PR" codex "$BASE_SHA" "$HEAD_SHA" "$VERDICT_LINE" "$LOG"; then
    echo "codex-review: review was clean but the evidence was NOT posted (poster failed). Exit 2; nothing recorded." >&2
    exit 2
  fi
else
  echo
  echo "codex-review: clean. Post it with: scripts/qa/post-review-gate.sh <pr> codex ${BASE_SHA:0:9} ${HEAD_SHA:0:9} \"no findings\" $LOG"
fi
exit 0
```

- [ ] **Step 5: Extend the wrapper tests**

Add to `scripts/qa/codex-review.test.ts` a `stubGh` like the one above whose `pr view --json number` prints `7` and whose `pr view 7 --json comments` prints `[]` (branch on `"$1 $2"`), and three cases: `--post` on a clean stub posts a comment whose body starts `Review gate: codex reviewed`; `--post` on a findings stub posts a body starting `Codex findings for` and exits 1; and `--post` on a clean stub with a `gh` stub whose `pr comment` exits 1 makes the wrapper exit 2 with `NOT posted` in its output (the poster's failure propagates instead of falling through to exit 0). Run `pnpm qa:codex-review:test > .logs/t7b.log 2>&1; echo "EXIT=$?"` → EXIT=0.

- [ ] **Step 6: Update ship-pr Step 4**

Replace the hand-typed `gh pr comment … "Review gate: …"` instructions with: Claude-authored → `pnpm qa:codex-review --post` (no `--`: pnpm forwards it and the wrapper would read it as the base ref); Codex-authored → `claude -p "/code-review $PR_NUMBER" > "$LOG" 2>&1` then `scripts/qa/post-review-gate.sh $PR_NUMBER claude $BASE_SHA $HEAD_SHA "no findings" "$LOG"` (or the `N findings, all addressed` form). Keep the grammar example line the contract test parses. Add the rule: "Never type an evidence comment by hand; the poster is the only writer."

- [ ] **Step 7: Register and ship**

Add `"qa:post-review-gate:test": "vitest run scripts/qa/post-review-gate.test.ts"` and run it in Quality Checks beside `pnpm qa:codex-review:test`.

```bash
git add scripts/qa/post-review-gate.sh scripts/qa/post-review-gate.test.ts scripts/qa/review-gate.ts scripts/qa/review-gate.test.ts scripts/qa/codex-review.sh scripts/qa/codex-review.test.ts .claude/skills/ship-pr/SKILL.md package.json .github/workflows/ci.yml
git commit -m "tooling(qa): the review gate posts its own evidence and keeps the findings

Evidence comments were typed by the agent that ran the review, and the
findings never reached the PR. post-review-gate.sh is now the only
writer: evidence line, log hash, verdict block. codex-review.sh --post
uses it, and posts findings as a non-evidence comment so the PR
carries what Codex said.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`/ship-pr` (this PR's own gate should be posted by the new poster; say so in the PR body).

---

### Task 8: Formatting is enforced for both harnesses

**Finding:** Prettier runs only from a user-level Claude Code hook; Codex has no format hook and CI has no `prettier --check`. `pnpm exec prettier --check .` reports 2,187 unformatted files today, 1,106 of them under `apps/myk9show` and 2 syntax errors in archived design handoffs. The hook is also bypassed whenever a file is edited through Bash.

**Files:**

- Modify: `.prettierignore`
- Modify: every file `prettier --write` touches (one-time)
- Create: `scripts/qa/format-changed.sh`
- Modify: `.codex/hooks.json`, `package.json` (`format`, `format:check`), `.github/workflows/ci.yml` Quality Checks

- [ ] **Step 1: Confirm the tree and the neighbourhood are clean BEFORE editing anything**

Run: `gh pr list --state open --json number,title --jq '.[] | "\(.number) \(.title)"'`. If any non-Dependabot PR is open, stop and merge or coordinate first: this PR conflicts with everything.
Run: `pnpm qa:inflight apps packages supabase scripts .github .claude .codex .agents docs openspec > .logs/inflight.log 2>&1; echo "EXIT=$?"`. Exit 1 lists every worktree with uncommitted edits and every unmerged branch touching those paths; the other worktrees must be clean (`git -C <path> status --short` empty) before continuing, because a reformat lands on top of whatever they later merge. Exit 2 is not a pass.
Run: `git status --short > .logs/pre-fmt.txt; wc -l < .logs/pre-fmt.txt` → 0. A dirty tree here means untracked WIP that Step 6 must not sweep; stop. (`.logs/` is gitignored since Task 1, so it does not appear.)

- [ ] **Step 2: Ignore what should never be formatted, then reformat once**

Append to `.prettierignore`:

```
# Archived design handoffs and one-off analysis dumps: not code, two of them
# are not even valid syntax (docs/archive/design_handoff_myk9/colors_and_type_v2.css).
docs/archive
docs/design
openspec/changes/archive
myk9q-analysis.json
mockup-dashboard.html
```

Run: `pnpm exec prettier --write . > .logs/fmt.log 2>&1; echo "EXIT=$?"` → EXIT=0.
Run: `pnpm exec prettier --check . > .logs/fmtc.log 2>&1; echo "EXIT=$?"` → EXIT=0.
Run: `git diff --shortstat > .logs/fmt-stat.txt; cat .logs/fmt-stat.txt` and record the file count in the PR body. Run `git status --short | grep -v '^ M' > .logs/fmt-untracked.txt; wc -l < .logs/fmt-untracked.txt` → 0: Prettier modifies tracked files only, so anything else here is not the reformat (`.prettierignore` shows as ` M`, which is expected).

- [ ] **Step 3: Prove nothing but formatting changed**

Run: `pnpm typecheck > .logs/tc.log 2>&1; echo "EXIT=$?"` → 0.
Run: `pnpm lint > .logs/lint.log 2>&1; echo "EXIT=$?"` → 0.
Run: `cd apps/myk9show && pnpm test > ../../.logs/suite.log 2>&1; echo "EXIT=$?"` → 0.
Run: `pnpm test:packages > .logs/pkg.log 2>&1; echo "EXIT=$?"` → 0.
Run: `pnpm qa:code-quality-ratchet > .logs/ratchet.log 2>&1; echo "EXIT=$?"` → 0 (a reformat can push a 499-line file over 500; if it does, extract a sibling module, do not raise the baseline).

- [ ] **Step 4: Add the check and the scripts**

Root `package.json`:

```json
"format": "prettier --write .",
"format:check": "prettier --check .",
```

Quality Checks in `ci.yml`, directly after the `pnpm lint` step:

```yaml
- name: Prettier
  run: pnpm format:check
```

- [ ] **Step 5: A hook both harnesses can run**

```bash
#!/usr/bin/env bash
# Format the files this working tree has changed. Used as a PostToolUse hook
# by Codex (.codex/hooks.json) and safe to run by hand; it does not need to
# know which file the tool wrote, so it works for Bash-driven edits too.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
FILES="$(git diff --name-only --diff-filter=ACMR HEAD; git ls-files --others --exclude-standard)"
FILES="$(printf '%s\n' "$FILES" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|yml|yaml|html)$' | sort -u)"
[ -z "$FILES" ] && exit 0
# One argument per line: the tree has paths with spaces
# (docs/design/.../Field Guide Landing Page.html), which a bare xargs would split.
printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 ./node_modules/.bin/prettier --write --ignore-unknown --log-level warn
```

`.codex/hooks.json`: add to the `PostToolUse` array an entry with NO matcher, so it fires after every tool including the shell (Bash-driven edits are exactly the path the Claude hook misses; the script is a no-op on a clean tree, so firing after reads costs one `git diff --name-only`):

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "bash scripts/qa/format-changed.sh",
      "timeout": 30,
      "statusMessage": "Formatting changed files..."
    }
  ]
}
```

Confirm the harness honours an entry without `matcher` by running one Codex turn that edits a file through the shell and checking `git diff` shows it formatted; if Codex requires a matcher, use `".*"`.

Probe the hook with an untracked file, then remove ONLY that file (a bare `git stash push -u` would stash the whole reformat; `rm` is denied here):

```bash
printf 'const x   = 1\n' > scripts/qa/format-changed.probe.ts
bash scripts/qa/format-changed.sh; cat scripts/qa/format-changed.probe.ts        # expect: const x = 1;
git stash push -u -m fmt-probe -- scripts/qa/format-changed.probe.ts             # path-scoped
SHA=$(git stash list --format='%H %gs' | grep ' fmt-probe$' | cut -d' ' -f1); git stash drop "$SHA"
git status --short | grep probe; echo "probe-gone=$?"                            # expect: probe-gone=1
```

- [ ] **Step 6: Commit and ship**

Two commits in one PR so the review can read the second one alone. Stage tracked modifications only (`-u`); never `-A`, which sweeps untracked WIP in a shared checkout:

```bash
git add -u -- . ':!.prettierignore' ':!package.json' ':!.github/workflows/ci.yml' ':!.codex/hooks.json'
git commit -m "style: one-time Prettier pass over the tree

No behavior change; typecheck, lint, the app suite, the package suites
and the ratchet are green on this commit. See the next commit for the
check that keeps it this way.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then the second commit: `git add .prettierignore package.json .github/workflows/ci.yml .codex/hooks.json scripts/qa/format-changed.sh` and commit as `ci: check formatting in Quality Checks; format-changed hook for Codex`. `git status --short` must be empty afterwards.

`/ship-pr`. In the PR body: file count, the five green checks, and "Codex: review the second commit; the first is `prettier --write .`".

---

### Task 9: Only skills the playbook routes to

**Finding:** `.agents/skills` has 69 entries; about 37 are third-party (Matt Pocock's set, tracked by #2062) that nothing in the repo routes to except their own router `ask-matt`, and several duplicate a built-in or project skill: `code-review` (Matt's) duplicates the built-in `/code-review` the PLAYBOOK and ship-pr actually invoke, `review-fix`/`simplify-review` overlap `/simplify` and `/harden`, `claude-handoff`/`handoff` overlap the harness handoff skill, `tdd` duplicates `superpowers:test-driven-development`, and three grill variants overlap `superpowers:brainstorming`. Codex loads all of their descriptions for routing. (`simplify` and `harden` themselves are distinct pipeline stages, not duplicates.)

**Reference rule:** a mention counts only when it names the thing as a skill: `skills/<name>`, `` `<name>` `` in backticks, or `/<name>` as a command. A bare word (`qa`, `triage`, `implement`, `wizard`, `handoff`, `research`) is prose, not routing, and the "code-review" mentions in PLAYBOOK and ship-pr are the built-in `/code-review`, not `.agents/skills/code-review`.

**Files:**

- Create: `docs/agents/skills-inventory.md`
- Delete (via `git rm -r`): the third-party directories listed in Step 2
- Modify: `apps/myk9show/src/test/ci/skillTrees.test.ts` (add the inventory assertion)

- [ ] **Step 1: Write the inventory test first**

Add to `skillTrees.test.ts`:

```ts
describe('third-party skills are inventoried', () => {
  const inventory = readFileSync(resolve(repoRoot, 'docs/agents/skills-inventory.md'), 'utf8');
  // | `name` | origin | reason |  -- split on pipes and trim: Prettier pads
  // table cells to column width, so a fixed-space regex would reject every
  // formatted row (Codex review of #2110).
  const rows = inventory
    .split('\n')
    .filter(line => /^\|\s*`[^`]+`\s*\|/.test(line))
    .map(line =>
      line
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim())
    )
    .filter(cells => cells.length === 3 && cells.every(Boolean))
    .map(([name, origin, reason]) => ({
      name: name!.replace(/^`|`$/g, ''),
      origin: origin!,
      reason: reason!,
    }));
  const onDisk = readdirSync(resolve(repoRoot, '.agents/skills'), { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.isSymbolicLink())
    .map(d => d.name);

  it('every real (non-symlink) .agents/skills entry has a row, and every row has a directory', () => {
    const listed = new Set(rows.map(r => r.name));
    expect(onDisk.filter(n => !listed.has(n)).sort()).toEqual([]);
    expect(
      rows
        .map(r => r.name)
        .filter(n => !onDisk.includes(n))
        .sort()
    ).toEqual([]);
    expect(onDisk.length).toBeGreaterThan(5); // vacuity guard
  });

  it('every third-party row names a repo file that routes to it, and that file exists and mentions it', () => {
    for (const row of rows.filter(r => r.origin !== 'ours')) {
      const path = row.reason.match(/`([^`]+\.(?:md|ts|js|yml|json))`/)?.[1];
      expect(path, `${row.name}: reason must name the routing file in backticks`).toBeTruthy();
      const text = readFileSync(resolve(repoRoot, path!), 'utf8');
      expect(text, `${path} does not name ${row.name}`).toMatch(
        new RegExp(`(skills/${row.name}\\b|\`${row.name}\`|/${row.name}\\b)`)
      );
    }
  });
});
```

(import `readdirSync` and `readFileSync` from `node:fs`.) Run it: EXIT=1, inventory file missing.

- [ ] **Step 2: Compute the delete list from references, then delete**

Run (from the worktree root):

```bash
for d in .agents/skills/*/; do [ -L "${d%/}" ] && continue; n=$(basename "$d")
  refs=$(grep -rlE "(^|[^a-z0-9-])$n([^a-z0-9-]|$)" CLAUDE.md AGENTS.md docs/PLAYBOOK.md docs/agents .claude/skills .codex .github scripts 2>/dev/null | grep -vE "^\.agents/skills/$n/|skills-inventory" | wc -l | tr -d ' ')
  echo "$n $refs"; done | sort -k2 -n
```

Apply the reference rule above (skill-shaped mentions only), then delete every directory with 0 such references EXCEPT the four project-owned real directories (`launch-readiness-triage`, `quality-finding-lifecycle`, `role-journey-ux-audit`, `supabase-health-drift-audit`; they are symlink targets for `.codex/skills`). Today that list is: `ask-matt claude-handoff code-review codebase-design design-an-interface diagnosing-bugs edit-article git-guardrails-claude-code grill-me grill-with-docs grilling handoff implement loop-me migrate-to-shoehorn obsidian-vault prototype qa request-refactor-plan research resolving-merge-conflicts review-fix scaffold-exercises setup-matt-pocock-skills setup-pre-commit simplify-review tdd teach to-issues to-prd triage ubiquitous-language wayfinder wizard write-a-skill writing-beats writing-concisely writing-fragments writing-great-skills writing-shape` (40). Verify each of `code-review`, `handoff`, `research` before deleting: `grep -rnE 'skills/(code-review|handoff|research)\b|`(code-review|handoff|research)`' CLAUDE.md AGENTS.md docs/PLAYBOOK.md docs/agents .claude/skills .codex .github scripts` must return only the built-in `/code-review` command mentions; if a hit names the `.agents` skill, keep it and add its row. Kept today with a skill-shaped reference: `UX-to-Prompt` (UX-Audit, IA-Review), `domain-modeling` (`docs/agents/domain.md`), `improve-codebase-architecture` (codebase-health references, `/simplify`), `supabase-postgres-best-practices` (`debugging-patterns`), and the three that are also real directories under `.claude/skills` only because #2062 tracked them (`vercel-composition-patterns`, `vercel-react-best-practices`, `web-design-guidelines`; check `ls -la .claude/skills | grep -E 'vercel|web-design'` and delete the `.agents` copy if `.claude` holds a real directory, since `skillTrees.test.ts` forbids two real copies). Before deleting, check the kept skills do not reference a deleted one: `for n in <delete list>; do grep -rlw "$n" .agents/skills/{UX-to-Prompt,domain-modeling,improve-codebase-architecture,supabase-postgres-best-practices} && echo "KEEP $n"; done` and keep any that prints (add its row with the kept skill's SKILL.md as the routing file).

Run: `git rm -r -q .agents/skills/<name> …` for the final list.

- [ ] **Step 3: Write the inventory**

`docs/agents/skills-inventory.md`: a table `| Skill | Origin | Why we keep it |` with one row per remaining real directory. Origin is `ours` or `Matt Pocock skills`; a third-party row's reason MUST name, in backticks, the repo file that routes to it, e.g. `| \`domain-modeling\` | Matt Pocock skills | routed from \`docs/agents/domain.md\` |`, `| \`role-journey-ux-audit\` | ours | PLAYBOOK § 6 |`. The test reads that path and greps it for the skill name, so a row with a vague reason fails. Add a paragraph: "A third-party skill stays only while something in the repo routes to it. `skillTrees.test.ts` fails when a real directory is missing from this table or a listed one is gone. Reinstall a deleted one from its upstream when a playbook row needs it."

- [ ] **Step 4: Run the tests and the doc check**

Run: `cd apps/myk9show && pnpm vitest run src/test/ci/skillTrees.test.ts > ../../.logs/t9.log 2>&1; echo "EXIT=$?"` → EXIT=0.
Run: `pnpm qa:doc-staleness:strict > .logs/ds.log 2>&1; echo "EXIT=$?"` → EXIT=0 (fix any link into a deleted dir).

- [ ] **Step 5: Commit and ship**

```bash
git add -A .agents/skills docs/agents/skills-inventory.md apps/myk9show/src/test/ci/skillTrees.test.ts
git commit -m "chore(skills): keep only the third-party skills something routes to

37 Matt Pocock skills were tracked by #2062 and referenced by nothing
but their own router; Codex loaded every description for routing. The
survivors are inventoried with a reason, and skillTrees.test.ts fails
on an uninventoried directory.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`/ship-pr`.

---

### Task 10: Small drift, one PR

**Findings:** the commit, ship-pr, ship-it and screenshot-docs skills still write to `/tmp/*.log` against the shared-log lesson; `docs/reference/git-workflow.md:38` lists the retired `OPEN-TODOS.md` / `TO-DOS.md` in the docs-only scope; AGENTS.md references a PR template that does not exist; Stryker mutation targets (`pnpm test:mutation`) exist for cart, score validator, placement and replication conflict but nothing runs them.

**Files:**

- Modify: `.claude/skills/{commit,ship-pr,ship-it,screenshot-docs}/SKILL.md`
- Modify: `docs/reference/git-workflow.md:38`, `docs/PLAYBOOK.md` § 7 if it repeats the list
- Create: `.github/pull_request_template.md`
- Create: `.github/workflows/mutation-tests.yml`
- Modify: `docs/agents/shared-rules.md` (log-dir rule), then sync

- [ ] **Step 1: A per-worktree log directory**

`.logs/` is gitignored since Task 1. In the four skills replace every `/tmp/<name>.log` with `.logs/<name>.log` and add once, in the commit skill's Step 1a: "Logs go to `.logs/` at the worktree root (gitignored, one per worktree, so two sessions never write the same file); `mkdir -p .logs` first." Add the same sentence to the Testing section of `docs/agents/shared-rules.md` and run `pnpm qa:shared-rules:write`.

Run: `grep -rn '/tmp/' .claude/skills/*/SKILL.md | grep -v 'claude-501\|scratchpad' ; echo "remaining=$?"` → `remaining=1` (no matches).

- [ ] **Step 2: Docs-only scope**

In `docs/reference/git-workflow.md:38` delete `OPEN-TODOS.md`, `TO-DOS.md` (retired by #1350).

- [ ] **Step 3: PR template**

```markdown
## Summary

-

## Linear

MYK9-

## Test plan

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] related tests (name them)

## Review gate

- [ ] Independent review recorded for the final head SHA by `scripts/qa/post-review-gate.sh` (`/ship-pr` Step 4)

## Risk / non-goals

-
```

- [ ] **Step 4: Weekly mutation run**

```yaml
name: Mutation tests

# Weekly Stryker run over the four money/scoring/replication targets in
# stryker.config.mjs. These exist since MYK9-? but nothing scheduled them;
# a mutation score that drifts down is a test suite that stopped biting.

on:
  schedule:
    - cron: '0 8 * * 0' # Sundays 08:00 UTC
  workflow_dispatch: {}

permissions:
  contents: read
  issues: write

concurrency:
  group: mutation-tests
  cancel-in-progress: false

jobs:
  mutation:
    name: Stryker mutation targets
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: '22.12.0'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Run mutation targets
        run: pnpm test:mutation
      - name: Report status to the tracking issue
        if: always()
        uses: ./.github/actions/report-scheduled-failure
        with:
          workflow-name: Mutation tests
          outcome: ${{ job.status }}
          token: ${{ github.token }}
```

Check the `report-scheduled-failure` inputs against `.github/actions/report-scheduled-failure/action.yml` (`workflow-name`, `outcome`, `token`, optional `extra`) and copy the exact `with:` shape from `dependency-audit.yml`. Replace `MYK9-?` with the issue that added Stryker (`git log -S'stryker' --oneline -- package.json | tail -1`).

Run: `pnpm test:mutation:cart > .logs/mut.log 2>&1; echo "EXIT=$?"` once locally to confirm the runner works on this tree and note the runtime in the PR body.

- [ ] **Step 5: Commit and ship**

```bash
git add .claude/skills docs/reference/git-workflow.md docs/agents/shared-rules.md CLAUDE.md AGENTS.md .github/pull_request_template.md .github/workflows/mutation-tests.yml
git commit -m "chore(process): per-worktree logs, PR template, weekly mutation run, scope drift

Skills wrote to /tmp against the shared-log lesson; the docs-only scope
listed files retired by #1350; AGENTS.md cited a PR template that did
not exist; four Stryker targets had no schedule.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`/ship-pr`.

---

### Task 11: Verification phase (post-merge evidence)

Nothing above is done until these are recorded in this file under a `## Evidence` heading, each with the command and its output date.

- [ ] **Two consecutive `main` runs completed** after Task 1 merged: `gh run list --workflow ci.yml --branch main --event push --limit 8 --json conclusion,status,createdAt,headSha,displayTitle` shows, for the two `main` pushes immediately after the #2110 merge commit (identify them by `headSha` against `git log --first-parent origin/main`), `status: completed` and `conclusion: success`. Queued or in-progress runs do not count; a `failure` is recorded as such with the failing job named, and is still evidence the run was not cancelled.
- [ ] **Dependency audit green**: `gh workflow run dependency-audit.yml` then `gh run list --workflow dependency-audit.yml --limit 1 --json conclusion` → `success`.
- [ ] **Nightly-e2e and nightly-health**: both dispatched after Task 3 merged; conclusions recorded. If either is still red, the failure is named in this file with the Linear issue that owns it.
- [ ] **Shared rules in CI**: the Quality Checks log of the first PR after Task 4 shows `shared-rules: in sync`.
- [ ] **CLAUDE.md word count**: `wc -w CLAUDE.md AGENTS.md` both under 5,000.
- [ ] **Review gate self-posted**: the Task 7 PR's evidence comment carries a `log sha256:` second line and a verdict block.
- [ ] **Prettier in CI**: the first PR after Task 8 shows a green `Prettier` step; `pnpm format:check` locally exits 0 on `main`.
- [ ] **Skill count**: `ls .agents/skills | wc -l` recorded; `skillTrees.test.ts` green on `main`.
- [ ] **Mutation workflow ran once**: `gh workflow run mutation-tests.yml`; conclusion and runtime recorded.
- [ ] Flip this file's status to `Complete`, `git mv` it to `docs/archive/`, and drop its `docs/README.md` row.
