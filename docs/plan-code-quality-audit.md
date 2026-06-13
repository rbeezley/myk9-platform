# Plan: Proactive Code-Quality Audit

**Created:** 2026-06-10 · **Status:** Complete through Phase 5; repeatable skill and CI ratchets added after Waves A-D
**Goal:** A repeatable, repo-wide static-quality sweep that finds maintainability debt the diff-scoped skills (`/code-review`, `/simplify`, `/harden`) never see, verifies findings to kill false positives, and fixes them in severity order. Pre-launch (no real users) is the cheapest moment: fixes can be deletions and refactors with no backwards-compat shims.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Fix waves may touch shared utilities, generated types, offline/replication paths, and cross-app imports, so local verification must be broad before PR and CI must remain the final gate.

## Plan verification (2026-06-12)

Coverage: **84/100**. The plan strongly covers audit dimensions, false-positive control, fix sequencing, and test expectations, but needed more explicit setup safety, command/tool failure handling, rollback, and handoff paths for out-of-scope security or migration discoveries.

| Requirement | Status | Evidence |
| --- | --- | --- |
| Define a repo-wide quality audit that does not duplicate existing skills | **Covered** | Goal says the sweep finds debt "the diff-scoped skills (`/code-review`, `/simplify`, `/harden`) never see"; Not in scope maps security, runtime health, UX/IA, diff correctness, and migration safety to existing tools. |
| Preserve launch-readiness and consolidation priorities | **Partial** | Plan says pre-launch fixes can be deletions/refactors; missing an explicit read of `docs/goals/fall-2026-launch-readiness.md` and the duplication question before findings are filed. |
| Establish safe execution context before writes | **Missing** | No worktree/bootstrap/start-check phase existed. |
| Inventory the intended quality dimensions | **Covered** | Phase 1 lists 1a-1h: oversized files, dead code, duplication, replication bypasses, type escapes/schema drift, TODO triage, test gaps, and config/flag debt. |
| Protect INTENT behavior | **Covered** | INTENT guardrail requires checking `// INTENT:` comments and `docs/INTENT.md`, and says INTENT-backed code is not a finding. |
| Verify findings before fixes | **Covered** | Phase 2 requires adversarial verification for every P1/P2 and spot checks for P3s, with `confirmed` / `refuted` / `needs-human` output. |
| Handle audit-tool failure and long-running commands | **Partial** | Phase 1 includes fallback from `knip` to targeted grep; missing explicit command timeout, partial-output capture, and no-retry-loop guidance. |
| Avoid false positives from concurrency/stale state | **Covered** | Phase 2 says to verify against git refs, not the working tree, because concurrent agents may have stale state. |
| Route out-of-scope security/migration discoveries | **Partial** | Not in scope lists `/security-audit` and `migration-auditor`; missing instructions for what to do if these issues are discovered incidentally. |
| Triage and fix in reviewable waves | **Covered** | Phase 3 defines waves A-D and one PR per cohesive cluster. |
| Include rollback/recovery expectations per wave | **Missing** | No explicit rollback strategy or revert boundary existed. |
| Require human approval before judgment-heavy or broad fixes | **Covered** | Phase 3 requires a human pass before fix list approval, especially for type-file consolidation. |
| Include adequate testing | **Covered** | Phase 4 lists typecheck, lint, affected tests, extraction tests, assertion-first replication tests, app tests, and baseline delta reruns. |
| Codify the audit as a repeatable skill | **Covered** | Phase 5 creates `.claude/skills/code-quality-audit/SKILL.md` with modes and drift tracking. |

Top gaps patched below:

1. [ADDED] Phase 0 for worktree safety, launch-readiness/INTENT inputs, audit directory setup, and command-failure handling.
2. [EXPANDED] Phase 1 and Phase 2 to capture partial tool failures and route security/migration findings to the right audit process.
3. [EXPANDED] Phase 3 with rollback/recovery boundaries for each fix wave.

**Not in scope** (covered by existing skills — run those separately, don't duplicate):

| Dimension | Existing tool |
| --- | --- |
| Security (RLS, edge functions, RBAC, Stripe, auth) | `/security-audit` (full mode) |
| Runtime health (console/network errors per role) | `/audit-pages` |
| UX / IA quality | `/UX-Audit`, `/IA-Review` |
| Diff correctness on active branches | `/code-review`, `/harden` |
| Migration safety | `migration-auditor` agent |

---

## Baseline metrics (2026-06-10, source files excluding tests and `node_modules`)

| Metric | Value | Notes |
| --- | --- | --- |
| Source files (`.ts`/`.tsx`) | 2,985 | apps + packages |
| Test files | 1,078 | ~36% file ratio |
| Files > 500 lines | **181** | Top 4 are generated Supabase types — exclude generated files, real count ≈ 177 |
| `as any` casts | 32 | Healthy for repo size; enumerate anyway |
| `@ts-ignore` / `@ts-expect-error` | 0 | Clean |
| `TODO`/`FIXME`/`HACK` markers | 24 | Each violates SLC "zero placeholders" — triage all |
| `// INTENT:` comments | 96 | Protected behavior — audit verifies they're intact, never "fixes" them |

**Known smell found while baselining:** four near-duplicate generated Supabase type files (`apps/myk9show/src/types/supabase.ts`, `packages/supabase/src/types/database.types.ts`, `packages/supabase/src/types.ts`, `packages/supabase/src/database.types.ts`, ~29k lines combined). Phase 1 must determine which is canonical and whether the others can be deleted or re-exported.

---

## Phase 0 — Setup and safety [ADDED]

1. Run the mandatory worktree check before any file write: `git branch --show-current` and `git rev-parse --git-dir --git-common-dir`. If in the primary checkout on `main`, create or enter a feature worktree before continuing.
2. Read `docs/goals/fall-2026-launch-readiness.md` and `docs/INTENT.md` before filing findings. Use launch-readiness as the prioritization frame and INTENT as a hard guardrail.
3. Create `docs/audits/2026-06-code-quality/` and write every dimension's raw findings there. The audit directory is the durable handoff between sessions or agents.
4. For each finding that proposes new UI, workflow, or affordance, answer the duplication question before filing: "Does this duplicate an existing page? If so, why is duplication justified instead of a link?"
5. Treat audit commands as fallible. If a command fails, times out, or returns partial output, record the command, exit state, and fallback used in that dimension's findings doc. If a test runner hangs for more than 60 seconds without useful output, stop that run and record it instead of retrying in a loop.
6. Do not mutate shared systems during the audit inventory. Supabase pushes, function deploys, GitHub comments/PR creation, and external-service writes wait for the approved fix-wave workflow.

## Severity rubric

| Severity | Definition | Example |
| --- | --- | --- |
| **P1** | Latent correctness risk or actively misleading code | Dead code that *looks* live and gets "fixed"; duplicated logic already diverged between copies |
| **P2** | Maintainability debt with a clear owner-fix | 700-line component doing 3 jobs; service bypassing the replication layer outside core flows |
| **P3** | Hygiene | Unused exports, stale TODOs, dead feature flags, orphaned test fixtures |

Every fix-wave finding gets: file:line, severity, evidence, verification status (see Phase 2), and proposed fix (delete / extract / consolidate / keep-with-comment). Phase 1 may record broad clusters, but Phase 2 must narrow any P1/P2 cluster to actionable file:line evidence before implementation.

---

## Phase 1 — Inventory sweep (finders)

Eight independent check dimensions. Each produces a findings table in `docs/audits/2026-06-code-quality/` (one file per dimension). Dimensions are independent — parallelizable as subagents, or run sequentially inline. [EXPANDED] Each dimension doc must include the exact commands or scripts used, excluded paths, known false-positive classes, and any command failures or fallbacks from Phase 0.

### 1a. Oversized files (~178 real findings in the 2026-06-12 finder run)

`find apps packages -name '*.ts' -o -name '*.tsx' | grep -vE '(node_modules|\.test\.|\.spec\.)' | xargs wc -l | awk '$1>500'`, excluding generated files (Supabase types, anything with a `// generated` header). For each: is it one concern that's just long (acceptable, e.g. a template registry) or multiple concerns (extract per CLAUDE.md rule 4)? Don't mechanically split — `EnrollmentCard.tsx` (691 lines) already has an extraction note in OPEN-TODOS; cross-reference existing todos to avoid duplicate findings.

### 1b. Dead code & unused exports

Highest-false-positive dimension — every finding requires Phase 2 verification. Tooling: `npx knip` if config exists or is cheap to add; otherwise targeted grep per suspect export. Special cases from project history: the `ImpersonationService` deletion (576 lines, 2026-06-09) and PR #576 collaboration-cluster deletion show this repo accumulates whole dead subsystems — look for more (services with no route/UI consumer, hooks with no caller, exported constants nothing imports). Check liveness *across packages* (an export consumed only by another workspace package is live) and in tests-only (suspect: production code kept alive solely by its own test).

### 1c. Duplication clusters

Both copies still working ≠ harmless — divergence is how the "Entry count 80 vs 81" class of bug starts. Look for: (1) the four generated Supabase type files (baseline smell); (2) repeated query/mapping logic across `services/database/*/reads.ts` (entries/judges/dogs reads are each ~720-line siblings); (3) per-feature re-implementations of shared primitives — the FilterBar/EntryFiltersCard divergence and four ad-hoc 3-dot menus are *known* instances already in OPEN-TODOS (cross-reference, don't re-file); find the unknown ones. (4) copy-pasted email templates (Magazine/Gazette confirmation emails are 832/793-line siblings).

### 1d. Replication-layer bypasses

Grep core-flow code (show data, entries, classes, scoring) for direct `supabase.from(...)` reads/writes that should route through `@myk9/replication` per the offline-first rule. Exclusions: auth, one-shot admin surfaces, edge-function calls, and the documented PostgREST fallbacks inside `withReplicationFallback` services. Each hit: is this surface required to work offline at a show? If yes → P2 finding.

### 1e. Type escapes & schema drift

Enumerate the 32 `as any` sites: each is either (a) a real type gap worth fixing, (b) a boundary coercion with a reason — the myK9Q numeric/string boundary coercions are *deliberate* per project memory, do not "fix" — or (c) lazy. Also grep for `String(...)`/`Number(...)` coercions at DB boundaries and status/enum strings written without a matching CHECK-constraint trace.

### 1f. TODO/FIXME/HACK triage (24 markers)

Each becomes: fix-now (small), file-as-todo (real but not small → OPEN-TODOS), or delete-the-comment (stale/no longer true). Zero markers should survive the audit untriaged.

### 1g. Test coverage gaps (targeted, not %-driven)

Not chasing a coverage number. Find: (1) modules with complex pure logic and no sibling test (rank by cyclomatic-ish heuristics: exported functions with branching, in files with no `.test.` sibling); (2) the highest-risk untested paths — fee calculation, scoring math, replication conflict resolution, RBAC checks; (3) test files asserting nothing meaningful (snapshot-only or render-without-assert).

### 1h. Config & flag debt

Dead feature flags (flag checked but permanently true/false everywhere, e.g. flags whose rollout completed — `showConflictSurfacing` is now `true`; is the `false` branch still needed pre-launch?), env vars read but never set, `VITE_*` vars set but never read, stale `package.json` scripts.

### INTENT guardrail (applies to all dimensions)

Before filing any finding, check for `// INTENT:` comments (96 sites) and `docs/INTENT.md`. Code that looks wrong but carries INTENT is **not a finding**. A finding that would *touch* an INTENT site must say so explicitly.

### Out-of-scope discovery handling [ADDED]

If the sweep finds a credible security, auth/RLS, payment, migration-safety, or runtime-health issue, do not fold it into this audit's fix waves. File a short pointer in the relevant dimension doc with evidence and route it to `/security-audit`, `migration-auditor`, or `/audit-pages` as appropriate. Only include it in `SUMMARY.md` as an out-of-scope handoff item.

---

## Phase 2 — Verification pass (kill false positives)

Every P1/P2 finding gets independently verified before triage; P3s get spot-checked. Verification is adversarial: the verifier's job is to **refute** the finding.

- **Dead code:** prove liveness absence across *all* workspaces — `grep -rn` the symbol in apps/, packages/, supabase/functions/, *and* docs (per the grep-docs-before-deletion rule), check dynamic import patterns, route registries, and re-export barrels. Follow the route-liveness rule: "B covers it" claims must prove B is actually reachable.
- **Duplication:** confirm the copies are genuinely the same concern (not coincidentally-similar code that will diverge for good reasons).
- **Replication bypass:** confirm the surface actually needs offline support before flagging.
- **Verify against git refs, not the working tree** (concurrent agents may have stale state — per project feedback rule).
- **Tool uncertainty:** [ADDED] if the finder used a fallback because tooling failed or was unavailable, verify at least one representative sample with an independent method before confirming the finding.

Output: each finding marked `confirmed` / `refuted` / `needs-human` with one-line evidence. Refuted findings stay in the doc (struck through) so the next audit doesn't re-find them.

## Phase 3 — Triage & fix waves

1. Compile confirmed findings into `docs/audits/2026-06-code-quality/SUMMARY.md` — single severity-ordered table.
2. Human pass: user approves the fix list (some findings are judgment calls — e.g. "consolidate 4 type files" touches every import).
   - [ADDED] Fix-list approval is not shared-system mutation approval. Confirm separately before GitHub PR creation/comments/merge, Supabase pushes, function deploys, external-service writes, or any push to `main`.
3. Fix in waves, one PR per cohesive cluster (not per finding, not one mega-PR):
   - Wave A: pure deletions (dead code, stale TODOs, dead flags) — lowest risk, biggest line-count win.
   - Wave B: consolidations (duplication clusters, type-file unification).
   - Wave C: extractions (oversized files) — only the multi-concern ones.
   - Wave D: replication-bypass reroutes + targeted test additions from 1g.
4. Each wave goes through the standard workflow: implement → `/simplify` → `/commit` → PR → `/review` (+ Codex review for anything touching behavior, per the default-ON rule) → merge → `/cleanup`.
5. Anything deferred gets a real OPEN-TODOS entry with TO-DOS.md context — no silent drops (avoid-deferring-followups rule: prefer bundling into the waves).

### Rollback and recovery [ADDED]

- Keep each wave revertable as a single PR. Do not mix pure deletions, behavior changes, and generated-type rewrites in one branch.
- For deletion waves, record the symbol-level grep proof in the PR body so a revert decision is evidence-based.
- For consolidations/extractions, preserve public exports or add deliberate migration commits within the same wave; if import churn becomes broad enough to obscure review, split the wave before continuing.
- For replication reroutes, keep the old path visible in the diff until assertion-first tests prove the new call target. If tests reveal semantic drift, stop the wave and move the item back to `needs-human`.

## Phase 4 — Testing (required)

- **Per Wave A (deletions):** full `pnpm typecheck` + `pnpm lint` + affected unit tests; grep docs for deleted symbols; run any `readFileSync` source-text pin tests (known repo pattern).
- **Per Wave B/C (consolidations/extractions):** unit tests for every extracted module (CLAUDE.md: phase isn't complete until tests written and passing); re-point `vi.mock()` paths in sibling tests when imports move (known footgun).
- **Per Wave D:** assertion-first tests for rerouted writes (`expect(replicatedXTable.method).toHaveBeenCalledWith(...)` red-first); new tests for the 1g gaps ride in this wave.
- **Audit-level regression:** after all waves, `pnpm typecheck` (25/25 packages), `pnpm lint` clean, `cd apps/myk9show && pnpm test` green, and re-run the Phase 1a/1e/1f counts to record the delta in SUMMARY.md.
- **Command failure handling:** [ADDED] if a required suite hangs or fails for a pre-existing reason, stop after one focused attempt, capture the failing command and useful output, and mark the wave blocked or partially verified in the PR notes.

## Phase 5 — Codify as a repeatable skill

After one full execution, distill what worked into `.claude/skills/code-quality-audit/SKILL.md` modeled on `security-audit` (two modes: full sweep / targeted dimension). Bake in: the generated-file exclusions, the INTENT guardrail, the false-positive verification step, and the baseline-delta table so each run measures drift since the last. Re-run cadence: before each launch milestone.

**CI ratchets [ADDED 2026-06-12]:** alongside the skill, turn the mechanical baseline metrics into CI regression gates so the fixed counts cannot regrow between audits. A small script (in `scripts/`, run from the existing Quality Checks job) fails the build if a metric exceeds its recorded baseline and provides an intentional update command when a PR improves it: files >500 lines (excluding the generated-file list), `as any` count, TODO/FIXME/HACK count, and direct `supabase.from(...)` calls in the protected core-flow files Wave D rerouted. Set the ratchet baselines *after* the fix waves land — they encode the post-audit state, not the pre-audit one. Judgment-heavy dimensions (duplication, intent, oversized-file concern-counting) stay with the periodic skill run; ratchets only take the mechanical counts.

**Implemented 2026-06-13:** `code-quality-audit` now exists under `.claude/skills/`. `scripts/qa/code-quality-ratchet.ts` records the post-Wave-D baselines for oversized source files, `as any`, TODO/FIXME/HACK markers, and protected replication-path `supabase.from(...)` calls. The command is wired into the CI Quality Checks job as `pnpm qa:code-quality-ratchet`; intentional improvements can lower the baseline with `pnpm qa:code-quality-ratchet:update`.

---

## Execution options

- **Option 1 — inline, sequenced (default):** run dimensions 1a–1h one at a time in a normal session, verify, then fix waves. Slower wall-clock, cheapest, fully reviewable as it goes. Dimensions can be split across multiple sessions; the findings docs are the durable state.
- **Option 2 — multi-agent workflow (opt-in):** one finder agent per dimension in parallel, then adversarial verifier agents per P1/P2 finding (the review→verify pipeline pattern). Best for the first deep pass; token-heavy — requires explicit user opt-in ("run it as a workflow").

Either way, Phases 3–5 are the same. Fix waves are *not* parallelized across agents touching the same files.
