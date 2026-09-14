# Review Gate Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the review gate scale scrutiny to a change's risk, and accept a weaker-but-honestly-labelled tier when the required reviewer is unavailable, without ever letting the recorded evidence overstate what happened.

**Architecture:** A new `scripts/qa/review-tier.ts` owns the risk map and exports `requiredTier(files)`. `scripts/qa/review-gate.ts` imports the same module and refuses evidence below the computed floor. The evidence line gains a tier token; the old line stays valid and maps to `independent`. An `owner` override is permitted but must name a deferred re-review issue.

**Tech Stack:** TypeScript run through `node --experimental-strip-types`, vitest, `gh` CLI, GitHub Actions commit statuses.

**Spec:** `docs/superpowers/specs/2026-09-14-review-gate-tiers-design.md`

## Global Constraints

- Node is pinned to `22.12.0`; scripts run via `node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON`.
- Every rule assertion must be shown to fail when its rule is removed. A rule test that passes against a stubbed-out rule means the gate silently accepts anything.
- The existing evidence form `Review gate: codex reviewed <base>..<head> — no findings` MUST keep working unchanged; Codex's scripts emit it today.
- Only `OWNER` / `MEMBER` may supply the `owner` tier. The repo is public.
- Unrecognised paths default to `adversarial` — fail safe, not fail cheap.
- This work touches `scripts/qa/`, which the map itself puts at `independent`. It cannot be self-reviewed; it needs a cross-harness review or an owner override with recorded debt.

---

### Task 1: The risk map and floor calculator

**Files:**
- Create: `scripts/qa/review-tier.ts`
- Create: `scripts/qa/review-tier.test.ts`
- Modify: `package.json` (scripts block, after the `qa:review-gate:test` line)

**Interfaces:**
- Produces: `export type Tier = 'independent' | 'adversarial' | 'owner' | 'none'`
- Produces: `export const TIER_ORDER: readonly Tier[]` — weakest to strongest for comparison: `['none', 'owner', 'adversarial', 'independent']`
- Produces: `export function requiredTier(files: readonly string[]): { tier: Tier; reason: string }` — `reason` names the path that set the floor, or `'no files'`.
- Produces: `export function meetsFloor(supplied: Tier, floor: Tier): boolean`
- Produces: `export const MIGRATION_LENS: string` — `'migration-auditor'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { requiredTier, meetsFloor, MIGRATION_LENS } from './review-tier';

describe('requiredTier', () => {
  it('puts guardrails at independent', () => {
    for (const file of [
      '.github/workflows/ci.yml',
      'scripts/qa/review-gate.ts',
      'apps/myk9show/playwright.ci.config.ts',
      'CLAUDE.md',
      'AGENTS.md',
      'docs/agents/shared-rules.md',
    ]) {
      expect(requiredTier([file]).tier, file).toBe('independent');
    }
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "$(git rev-parse --show-toplevel)" && pnpm vitest run scripts/qa/review-tier.test.ts`
Expected: FAIL — `Cannot find module './review-tier'`

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Risk map for the review gate: which tier of scrutiny a change's paths
 * require. Imported by BOTH scripts/qa/review-gate.ts (to refuse evidence
 * below the floor) and the qa:review-tier CLI (so an agent can learn the
 * floor BEFORE spending tokens on a review it does not need).
 *
 * Deliberately a short readable table, never inference over file contents:
 * a keyword scan would make the floor depend on prose, and prose about code
 * satisfies a text scan (LESSONS #comment-satisfies-grep).
 */
export type Tier = 'independent' | 'adversarial' | 'owner' | 'none';

/** Weakest to strongest. `owner` outranks `none` but is below `adversarial`. */
export const TIER_ORDER: readonly Tier[] = ['none', 'owner', 'adversarial', 'independent'];

export const MIGRATION_LENS = 'migration-auditor';

/** Guardrails: a change here can disable what catches the next defect. */
const INDEPENDENT_PATTERNS: readonly RegExp[] = [
  /^\.github\//,
  /^scripts\/qa\//,
  /(^|\/)playwright[^/]*\.config\.ts$/,
  /^(CLAUDE|AGENTS)\.md$/,
  /^docs\/agents\/shared-rules\.md$/,
  /^supabase\/functions\//,
  /^packages\/replication\//,
  /(^|\/)(rls|grants?|policies)[^/]*\.(sql|ts)$/i,
  /(^|\/)(auth|rbac|permissions?|roles?)\//i,
  /(^|\/)(stripe|payout|refund|checkout|payments?)/i,
];

const MIGRATION_PATTERN = /^supabase\/migrations\//;

/** Docs are the only `none`, and never the instruction files above. */
const NONE_PATTERNS: readonly RegExp[] = [/^docs\//, /^[^/]*\.md$/];

function floorFor(file: string): { tier: Tier; reason: string } {
  if (INDEPENDENT_PATTERNS.some(p => p.test(file))) {
    return { tier: 'independent', reason: `${file} is a guardrail or high-risk path` };
  }
  if (MIGRATION_PATTERN.test(file)) {
    return {
      tier: 'adversarial',
      reason: `${file} is a migration — one lens must be ${MIGRATION_LENS}, and src/test/database/ must be green`,
    };
  }
  if (NONE_PATTERNS.some(p => p.test(file))) {
    return { tier: 'none', reason: `${file} is documentation` };
  }
  // Everything else, INCLUDING unrecognised paths: fail safe, not fail cheap.
  return { tier: 'adversarial', reason: `${file} is application or tooling code` };
}

export function requiredTier(files: readonly string[]): { tier: Tier; reason: string } {
  if (files.length === 0) return { tier: 'adversarial', reason: 'no files' };
  let best = { tier: 'none' as Tier, reason: 'no files' };
  for (const file of files) {
    const candidate = floorFor(file);
    if (TIER_ORDER.indexOf(candidate.tier) > TIER_ORDER.indexOf(best.tier)) best = candidate;
  }
  return best;
}

export function meetsFloor(supplied: Tier, floor: Tier): boolean {
  return TIER_ORDER.indexOf(supplied) >= TIER_ORDER.indexOf(floor);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run scripts/qa/review-tier.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Prove each rule test can fail**

For each of the three rules below, make the edit, run the named test, confirm it FAILS, then revert:

1. Delete `/^scripts\/qa\//` from `INDEPENDENT_PATTERNS` → `puts guardrails at independent` must fail.
2. Change the final `return` in `floorFor` from `'adversarial'` to `'none'` → `defaults an unknown path to adversarial` must fail.
3. Change `>` to `>=` in the `requiredTier` loop comparison → `takes the highest floor across a mixed file list` must still pass, but change it to `<` and the test must fail.

Record the three failures in the commit body. A rule whose test still passes when the rule is gone is not a test.

- [ ] **Step 6: Add the CLI entrypoint**

Append to `scripts/qa/review-tier.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Files changed against a base ref, for the CLI. */
export function changedFiles(base: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseIndex = process.argv.indexOf('--base');
  const base = baseIndex === -1 ? 'origin/main' : (process.argv[baseIndex + 1] ?? 'origin/main');
  const files = changedFiles(base);
  const { tier, reason } = requiredTier(files);
  console.log(`review-tier: ${files.length} file(s) vs ${base}`);
  console.log(`tier: ${tier}`);
  console.log(`reason: ${reason}`);
}
```

- [ ] **Step 7: Add the package scripts**

In `package.json`, directly after the `"qa:review-gate:test"` line:

```json
    "qa:review-tier": "node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/review-tier.ts",
    "qa:review-tier:test": "vitest run scripts/qa/review-tier.test.ts",
```

- [ ] **Step 8: Verify the CLI against this very branch**

Run: `pnpm qa:review-tier --base origin/main`
Expected: `tier: independent`, and the reason naming a `scripts/qa/` path — this branch modifies the guardrails, so it must demand the strongest tier. If it prints anything weaker, the map is wrong.

- [ ] **Step 9: Commit**

```bash
git add scripts/qa/review-tier.ts scripts/qa/review-tier.test.ts package.json
git commit -m "feat(qa): add review-tier risk map and floor calculator"
```

---

### Task 2: Accept a tier token in the evidence line

**Files:**
- Modify: `scripts/qa/review-gate.ts:128` (`REVIEW_GATE_LINE`), and the `GateEvidence` interface near `:66`
- Modify: `scripts/qa/review-gate.test.ts`

**Interfaces:**
- Consumes: `Tier` from Task 1.
- Produces: `GateEvidence` gains `tier: Tier`. The legacy `codex` / `claude` reviewers map to `tier: 'independent'`; `human-fallback` maps to `tier: 'owner'`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/qa/review-gate.test.ts`:

```ts
describe('tier parsing', () => {
  it('maps the legacy codex line to the independent tier', () => {
    const [evidence] = parseGateComments([
      comment(`Review gate: codex reviewed abc1234..${HEAD} — no findings`),
    ]);
    expect(evidence.tier).toBe('independent');
    expect(evidence.reviewer).toBe('codex');
  });

  it('parses an explicit tier token', () => {
    const [evidence] = parseGateComments([
      comment(`Review gate: adversarial reviewed abc1234..${HEAD} — 2 lenses, all findings addressed`),
    ]);
    expect(evidence.tier).toBe('adversarial');
  });

  it('parses the none tier', () => {
    const [evidence] = parseGateComments([
      comment(`Review gate: none reviewed abc1234..${HEAD} — low-risk paths, CI green`),
    ]);
    expect(evidence.tier).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/qa/review-gate.test.ts -t "tier parsing"`
Expected: FAIL — `evidence.tier` is `undefined`, and the `adversarial` / `none` lines do not match `REVIEW_GATE_LINE` at all.

- [ ] **Step 3: Widen the line and map reviewers to tiers**

Replace `REVIEW_GATE_LINE` at `scripts/qa/review-gate.ts:128`:

```ts
export const REVIEW_GATE_LINE =
  /^Review gate: (independent\/codex|independent\/claude|codex|claude|adversarial|owner|none|human-fallback) reviewed ([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})\s+[—–-]\s+(.+?)\s*$/m;

/** Legacy reviewer tokens predate tiers and all mean a cross-harness review. */
export function tierForReviewer(reviewer: string): Tier {
  if (reviewer === 'none') return 'none';
  if (reviewer === 'adversarial') return 'adversarial';
  if (reviewer === 'owner' || reviewer === 'human-fallback') return 'owner';
  return 'independent';
}
```

Add `tier: Tier;` to the `GateEvidence` interface, import `type Tier` from `./review-tier`, and in `parseGateComments` set `tier: tierForReviewer(reviewer)` on the pushed object.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/qa/review-gate.test.ts`
Expected: PASS — the new `tier parsing` block AND every pre-existing test. If an existing test fails, the legacy form has been broken; that is a stop condition, not something to update the test for.

- [ ] **Step 5: Commit**

```bash
git add scripts/qa/review-gate.ts scripts/qa/review-gate.test.ts
git commit -m "feat(qa): name the review tier in gate evidence, legacy lines map to independent"
```

---

### Task 3: Refuse evidence below the computed floor

**Files:**
- Modify: `scripts/qa/review-gate.ts` (`evaluateReviewGate` at `:183`, and the `main()` `gh pr view --json` call)
- Modify: `scripts/qa/review-gate.test.ts`

**Interfaces:**
- Consumes: `requiredTier`, `meetsFloor` from Task 1; `GateEvidence.tier` from Task 2.
- Produces: `evaluateReviewGate` gains a `changedFiles: readonly string[]` input. Callers must pass it.

- [ ] **Step 1: Write the failing test**

```ts
describe('floor enforcement', () => {
  const noneLine = `Review gate: none reviewed abc1234..${HEAD} — low-risk paths, CI green`;

  it('accepts the none tier on a docs-only change', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: ['docs/qa/findings.md'],
    });
    expect(result.state).toBe('success');
  });

  it('refuses the none tier on application code', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: ['apps/myk9show/src/pages/Foo.tsx'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('adversarial');
  });

  it('refuses adversarial on a guardrail change', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(`Review gate: adversarial reviewed abc1234..${HEAD} — 2 lenses, all findings addressed`),
      ],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/qa/review-gate.test.ts -t "floor enforcement"`
Expected: FAIL — `changedFiles` is not an accepted input and no floor is applied, so all three return `success`.

- [ ] **Step 3: Enforce the floor**

In `evaluateReviewGate`, widen the input to `{ headSha: string; comments: readonly GateComment[]; changedFiles: readonly string[] }`. After the existing `accepted` check passes, and before the success return:

```ts
  const floor = requiredTier(input.changedFiles);
  if (!meetsFloor(latest.tier, floor.tier)) {
    return {
      state: 'failure',
      description: `${latest.tier} review of ${short} is below the ${floor.tier} floor: ${floor.reason}`,
      evidence: latest,
    };
  }
```

In `main()`, add `files` to the `gh pr view --json` field list and pass
`changedFiles: pr.files.map(f => f.path)` into `evaluateReviewGate`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/qa/review-gate.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Prove the floor check can fail**

Comment out the `if (!meetsFloor(...))` block, run `pnpm vitest run scripts/qa/review-gate.test.ts -t "floor enforcement"`, confirm two of the three tests FAIL, then restore. Record the failure output in the commit body.

- [ ] **Step 6: Commit**

```bash
git add scripts/qa/review-gate.ts scripts/qa/review-gate.test.ts
git commit -m "feat(qa): refuse review evidence below the risk floor"
```

---

### Task 4: Owner override with mandatory recorded debt

**Files:**
- Modify: `scripts/qa/review-gate.ts` (replace `FALLBACK_REASON`, add `OVERRIDE_REASON` / `DEFERRED_REVIEW`, extend the acceptance branch)
- Modify: `scripts/qa/review-gate.test.ts`

**Interfaces:**
- Consumes: `GateEvidence.tier` from Task 2; the floor from Task 3.
- Produces: `export function overrideAccepted(evidence: GateEvidence): boolean`

- [ ] **Step 1: Write the failing test**

```ts
describe('owner override', () => {
  const body = (extra: string) =>
    [
      `Review gate: owner reviewed abc1234..${HEAD} — override, floor was independent`,
      'Override reason: Codex unavailable — usage limit until Sep 19',
      extra,
    ]
      .filter(Boolean)
      .join('\n');

  it('accepts an override that names a deferred re-review issue', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(body('Deferred re-review: MYK9-523'))],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('success');
  });

  it('refuses an override with no deferred re-review', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(body(''))],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('Deferred re-review');
  });

  it('refuses an override from an untrusted association', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(body('Deferred re-review: MYK9-523'), '2026-09-14T18:00:00Z', undefined, 'CONTRIBUTOR'),
      ],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
  });

  it('accepts a non-Claude harness in the override reason', () => {
    const [evidence] = parseGateComments([comment(body('Deferred re-review: MYK9-523'))]);
    expect(overrideAccepted(evidence)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run scripts/qa/review-gate.test.ts -t "owner override"`
Expected: FAIL — `overrideAccepted` is not exported, and the `owner` line is refused by the floor check from Task 3.

- [ ] **Step 3: Implement the override**

Replace the `FALLBACK_REASON` constant at `scripts/qa/review-gate.ts:142`:

```ts
/**
 * The old regex hardcoded "Claude unavailable", so "Codex unavailable" was
 * unsayable and the documented fallback was structurally unusable in half the
 * cases it was written for (2026-09-14). The harness is free text now; what is
 * mandatory is the deferred re-review, so an override defers scrutiny rather
 * than skipping it.
 */
const OVERRIDE_REASON = /^Override reason: .+ unavailable\s*[-—:]\s*.+$/im;
const DEFERRED_REVIEW = /^Deferred re-review: [A-Z]+-\d+$/im;

export const OVERRIDE_VERDICT = /^override, floor was (independent|adversarial)\.?$/i;

export function overrideAccepted(evidence: GateEvidence): boolean {
  if (evidence.tier !== 'owner') return false;
  if (!HUMAN_FALLBACK_ASSOCIATIONS.has(evidence.authorAssociation)) return false;
  if (!OVERRIDE_VERDICT.test(evidence.verdict.trim())) return false;
  if (!OVERRIDE_REASON.test(evidence.body)) return false;
  return DEFERRED_REVIEW.test(evidence.body);
}
```

In `evaluateReviewGate`, replace the `accepted` expression:

```ts
  const isOverride = latest.tier === 'owner';
  const accepted = isOverride
    ? latest.reviewer === 'human-fallback'
      ? humanFallbackAccepted(latest)
      : overrideAccepted(latest)
    : verdictAccepted(latest.verdict);
```

and skip the floor check when `isOverride && accepted` — an accepted override is, by definition, permission to be below the floor. Give the failure path a description naming what is missing:

```ts
  if (!accepted) {
    const why = isOverride && !DEFERRED_REVIEW.test(latest.body)
      ? 'override must name a Deferred re-review: <ISSUE-ID>'
      : `${latest.tier} review of ${short} is not clean: ${latest.verdict}`;
    return { state: 'failure', description: why, evidence: latest };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run scripts/qa/review-gate.test.ts`
Expected: PASS, including the pre-existing `human-fallback` tests — the old form must keep working.

- [ ] **Step 5: Prove the debt requirement can fail**

Change `return DEFERRED_REVIEW.test(evidence.body);` to `return true;`, run
`pnpm vitest run scripts/qa/review-gate.test.ts -t "owner override"`, confirm
`refuses an override with no deferred re-review` FAILS, then restore. Record it in the commit body.

- [ ] **Step 6: Commit**

```bash
git add scripts/qa/review-gate.ts scripts/qa/review-gate.test.ts
git commit -m "feat(qa): owner override with mandatory deferred re-review, any harness"
```

---

### Task 5: Teach the shipping path to ask for the floor first

**Files:**
- Modify: `.claude/skills/ship-pr/SKILL.md`
- Modify: `scripts/qa/codex-review.sh` (header usage block only)
- Modify: `scripts/qa/claude-review.sh` (header usage block only)

**Interfaces:**
- Consumes: `pnpm qa:review-tier` from Task 1.

- [ ] **Step 1: Add the floor check to ship-pr Step 4**

In `.claude/skills/ship-pr/SKILL.md`, before the existing independent-review step, insert:

```markdown
**Step 4a — ask what tier this change needs.**

    pnpm qa:review-tier --base origin/main

The printed `tier:` is the floor. Do NOT run a cross-harness review when the
floor is `adversarial` or `none` — that is the whole point of the calculator,
and a needless Codex round is the budget leaving.

- `none` → post `Review gate: none reviewed <base>..<head> — low-risk paths, CI green`
- `adversarial` → run two subagent reviews with distinct bug-finding lenses,
  fix every finding, then post
  `Review gate: adversarial reviewed <base>..<head> — 2 lenses, all findings addressed`.
  For migration paths one lens MUST be the `migration-auditor` agent and
  `src/test/database/` must be green.
- `independent` → the existing cross-harness gate, unchanged.

If the required harness is unavailable, the owner may override — see
docs/PLAYBOOK.md § 4.
```

- [ ] **Step 2: Update both wrapper header comments**

Add one line to the `Usage:` block of `scripts/qa/codex-review.sh` and `scripts/qa/claude-review.sh`:

```
#        Check `pnpm qa:review-tier --base origin/main` FIRST — a cross-harness
#        review is only required when the printed tier is `independent`.
```

- [ ] **Step 3: Verify the skill file still parses**

Run: `pnpm vitest run apps/myk9show/src/test/ci/instructionFileBudget.test.ts`
Expected: PASS. If the instruction-file budget test fails, the addition is too long — trim the prose, not the commands.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/ship-pr/SKILL.md scripts/qa/codex-review.sh scripts/qa/claude-review.sh
git commit -m "docs(qa): check the review tier before spending a cross-harness round"
```

---

### Task 6: Document the tiers in the shared rulebook

**Files:**
- Modify: `docs/agents/shared-rules.md` (the "Gates, in order" section, item 3)
- Modify: `docs/PLAYBOOK.md` (§ 4, replacing the human-fallback block)
- Generated: `CLAUDE.md`, `AGENTS.md` (never edited by hand)

**Interfaces:**
- Consumes: the grammar from Tasks 2 and 4.

- [ ] **Step 1: Rewrite the gate rule in shared-rules.md**

In `docs/agents/shared-rules.md`, in "Gates, in order" item 3, replace the sentence describing the independent review gate with:

```markdown
Scrutiny scales with risk. Run `pnpm qa:review-tier --base origin/main` to get
the floor: `independent` (cross-harness review — guardrails, auth, money,
replication, edge functions), `adversarial` (two same-harness subagent lenses —
app code, tests, dependency manifests, and migrations where one lens must be
`migration-auditor`), or `none` (docs only). Record the tier in the evidence
line; a green status must never read as "reviewed" when it means "nobody
looked". When the required harness is unavailable, a repository OWNER/MEMBER
may post an `owner` override, which MUST name a `Deferred re-review: <ISSUE-ID>`
— scrutiny is deferred and tracked, never skipped.
```

- [ ] **Step 2: Replace the human-fallback block in PLAYBOOK § 4**

Replace the "If the required harness is genuinely unavailable" block and its
numbered list with the override grammar from the spec, verbatim:

```text
Review gate: owner reviewed <base>..<head> — override, floor was independent
Override reason: <harness> unavailable — <detail>
Deferred re-review: MYK9-<n>
```

Keep the #1536 warning — two clean subagent rounds still missed a P1 that Codex
caught — attached to the `adversarial` tier, because that is the tier it is
evidence about.

- [ ] **Step 3: Regenerate the instruction files**

Run: `pnpm qa:shared-rules:write`
Then: `git diff --stat CLAUDE.md AGENTS.md`
Expected: both files change. If neither does, the edit landed outside the
synced markers and the rule will drift — stop and fix the placement.

- [ ] **Step 4: Verify the sync check passes**

Run: `pnpm qa:shared-rules && pnpm qa:shared-rules:test && pnpm format:check:changed`
Expected: all three exit 0. `qa:shared-rules` is the drift check CI runs (ci.yml:253); there is no `:check` variant.

- [ ] **Step 5: Commit**

```bash
git add docs/agents/shared-rules.md docs/PLAYBOOK.md CLAUDE.md AGENTS.md
git commit -m "docs(agents): document risk-scaled review tiers and the owner override"
```

---

## Final verification

- [ ] `pnpm qa:review-tier:test && pnpm qa:review-gate:test` — both pass
- [ ] `pnpm typecheck && pnpm lint` — both exit 0
- [ ] `pnpm format:check:changed` — exit 0
- [ ] `pnpm qa:e2e-map:check` — exit 0 (no specs changed, but Quality Checks runs it)
- [ ] `pnpm qa:review-tier --base origin/main` prints `tier: independent` for this branch
- [ ] Open the PR. Its own floor is `independent`, so it needs a cross-harness
      review or an owner override with a recorded deferred re-review. Do not
      self-review it: the map exists to make that impossible.
