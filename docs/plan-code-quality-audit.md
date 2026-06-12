# Plan: Proactive Code-Quality Audit

**Created:** 2026-06-10 · **Status:** Draft — not yet executed
**Goal:** A repeatable, repo-wide static-quality sweep that finds maintainability debt the diff-scoped skills (`/code-review`, `/simplify`, `/harden`) never see, verifies findings to kill false positives, and fixes them in severity order. Pre-launch (no real users) is the cheapest moment: fixes can be deletions and refactors with no backwards-compat shims.

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

## Severity rubric

| Severity | Definition | Example |
| --- | --- | --- |
| **P1** | Latent correctness risk or actively misleading code | Dead code that *looks* live and gets "fixed"; duplicated logic already diverged between copies |
| **P2** | Maintainability debt with a clear owner-fix | 700-line component doing 3 jobs; service bypassing the replication layer outside core flows |
| **P3** | Hygiene | Unused exports, stale TODOs, dead feature flags, orphaned test fixtures |

Every finding gets: file:line, severity, evidence, verification status (see Phase 2), and proposed fix (delete / extract / consolidate / keep-with-comment).

---

## Phase 1 — Inventory sweep (finders)

Eight independent check dimensions. Each produces a findings table in `docs/audits/2026-06-code-quality/` (one file per dimension). Dimensions are independent — parallelizable as subagents, or run sequentially inline.

### 1a. Oversized files (~177 real findings)

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

---

## Phase 2 — Verification pass (kill false positives)

Every P1/P2 finding gets independently verified before triage; P3s get spot-checked. Verification is adversarial: the verifier's job is to **refute** the finding.

- **Dead code:** prove liveness absence across *all* workspaces — `grep -rn` the symbol in apps/, packages/, supabase/functions/, *and* docs (per the grep-docs-before-deletion rule), check dynamic import patterns, route registries, and re-export barrels. Follow the route-liveness rule: "B covers it" claims must prove B is actually reachable.
- **Duplication:** confirm the copies are genuinely the same concern (not coincidentally-similar code that will diverge for good reasons).
- **Replication bypass:** confirm the surface actually needs offline support before flagging.
- **Verify against git refs, not the working tree** (concurrent agents may have stale state — per project feedback rule).

Output: each finding marked `confirmed` / `refuted` / `needs-human` with one-line evidence. Refuted findings stay in the doc (struck through) so the next audit doesn't re-find them.

## Phase 3 — Triage & fix waves

1. Compile confirmed findings into `docs/audits/2026-06-code-quality/SUMMARY.md` — single severity-ordered table.
2. Human pass: user approves the fix list (some findings are judgment calls — e.g. "consolidate 4 type files" touches every import).
3. Fix in waves, one PR per cohesive cluster (not per finding, not one mega-PR):
   - Wave A: pure deletions (dead code, stale TODOs, dead flags) — lowest risk, biggest line-count win.
   - Wave B: consolidations (duplication clusters, type-file unification).
   - Wave C: extractions (oversized files) — only the multi-concern ones.
   - Wave D: replication-bypass reroutes + targeted test additions from 1g.
4. Each wave goes through the standard workflow: implement → `/simplify` → `/commit` → PR → `/review` (+ Codex review for anything touching behavior, per the default-ON rule) → merge → `/cleanup`.
5. Anything deferred gets a real OPEN-TODOS entry with TO-DOS.md context — no silent drops (avoid-deferring-followups rule: prefer bundling into the waves).

## Phase 4 — Testing (required)

- **Per Wave A (deletions):** full `pnpm typecheck` + `pnpm lint` + affected unit tests; grep docs for deleted symbols; run any `readFileSync` source-text pin tests (known repo pattern).
- **Per Wave B/C (consolidations/extractions):** unit tests for every extracted module (CLAUDE.md: phase isn't complete until tests written and passing); re-point `vi.mock()` paths in sibling tests when imports move (known footgun).
- **Per Wave D:** assertion-first tests for rerouted writes (`expect(replicatedXTable.method).toHaveBeenCalledWith(...)` red-first); new tests for the 1g gaps ride in this wave.
- **Audit-level regression:** after all waves, `pnpm typecheck` (25/25 packages), `pnpm lint` clean, `cd apps/myk9show && pnpm test` green, and re-run the Phase 1a/1e/1f counts to record the delta in SUMMARY.md.

## Phase 5 — Codify as a repeatable skill

After one full execution, distill what worked into `.claude/skills/code-quality-audit/SKILL.md` modeled on `security-audit` (two modes: full sweep / targeted dimension). Bake in: the generated-file exclusions, the INTENT guardrail, the false-positive verification step, and the baseline-delta table so each run measures drift since the last. Re-run cadence: before each launch milestone.

---

## Execution options

- **Option 1 — inline, sequenced (default):** run dimensions 1a–1h one at a time in a normal session, verify, then fix waves. Slower wall-clock, cheapest, fully reviewable as it goes. Dimensions can be split across multiple sessions; the findings docs are the durable state.
- **Option 2 — multi-agent workflow (opt-in):** one finder agent per dimension in parallel, then adversarial verifier agents per P1/P2 finding (the review→verify pipeline pattern). Best for the first deep pass; token-heavy — requires explicit user opt-in ("run it as a workflow").

Either way, Phases 3–5 are the same. Fix waves are *not* parallelized across agents touching the same files.
