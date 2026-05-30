# Investigation (SUPERSEDED) — myK9Q / myK9Show repo coupling

> # ⛔ SUPERSEDED — DO NOT ACT ON THE SPLIT PATH
> **Confirmed 2026-05-30:** the long-term direction is **unify and eventually
> delete `apps/myk9q`**, per [`docs/plans/2026-05-17-unify-myk9show-myk9q.md`](2026-05-17-unify-myk9show-myk9q.md)
> (Phase 6 = delete myK9Q). You do not split an app you are deleting, so the
> **repo-extraction path in §5 is dead on arrival** and must not be executed.
>
> What remains useful here is the **coupling investigation only** (§1: no
> cross-app source imports; the 9-package shared graph; the shared Supabase
> backend incl. `view_myk9q_entries`). The "stay in the monorepo" conclusion
> (§3) still holds — and is reinforced, since deleting myK9Q makes splitting
> moot. The shipped worktree guard (PR #451) is plan-agnostic infra and is
> unaffected. Source of truth for what to actually build = the unify plan.

**Status:** SUPERSEDED — kept for the coupling investigation; split path void.
**Date:** 2026-05-30
**Author:** Claude (Opus 4.8), fact-finding session
**Original framing (now void):** Let two teams work on myK9Q and myK9Show without stepping on each other while sharing data — premised on two *long-lived* apps. That premise is contradicted by the unify plan.

> ⚠️ This doc also supersedes an earlier draft of mine that contained several factual errors (it undercounted shared packages, claimed replication had no tests, and claimed packages had no build step). All corrected below.

---

## 0. TL;DR — recommendation

**Do not split the repo. Enforce team boundaries inside the existing monorepo with `CODEOWNERS` + branch protection + Turbo's affected-filtering.**

Reasoning: your goal is "don't collide," not "hard access walls." The two apps are coupled through **nine interconnected shared packages** (all co-used by *both* apps) plus **one shared Supabase backend** (including a DB view literally named `view_myk9q_entries` that myK9Show reads). Splitting into two repos converts that in-process coupling into a cross-repo **publish-and-version treadmill across 9 packages** — high coordination cost, exactly the kind of friction that *causes* teams to step on each other. The monorepo already gives near-zero-cost isolation for the stated goal.

**If the goal ever hardens** to true access separation (outside contractors, separate orgs, independent release cadence), §5 documents the full repo-extraction path (Strategy A: publish the shared packages to GitHub Packages). That path is real but is ~2–3 weeks of plumbing and a permanent coordination tax — only worth it for a different goal than the one you stated.

---

## 1. Current state (verified)

### 1.1 Monorepo
- pnpm workspaces (`apps/*`, `packages/*`), Turborepo, `pnpm@9.15.9`, Node ≥20.
- **Apps:** `apps/myk9q` (`@myk9/q`), `apps/myk9show` (`@myk9/show`). Both have their own `vercel.json` and deploy as separate Vercel projects.
- **Packages (12):** `core`, `email`, `notifications`, `pwa-update`, `replication`, `ringside`, `scoring`, `scoring-ui`, `secretary`, `supabase`, `test-utils`, `ui`.

### 1.2 Cross-app **code** coupling — effectively none
- `apps/myk9q/src` importing `myk9show` → 0 (one marketing `href="https://myk9show.com"`).
- `apps/myk9show/src` importing `myk9q` → 0 source imports. (The hits are DB-type references to `view_myk9q_entries` — see 1.5.)
- The apps never import each other's code. **All sharing happens through shared packages + the shared DB.**

### 1.3 Shared packages myK9Q depends on — **nine**, every one also used by myK9Show
myK9Q runtime `@myk9/*` deps: `core, pwa-update, replication, ringside, scoring, scoring-ui, secretary, supabase, ui`.
myK9Show adds only `email` + `notifications` on top of the same nine.

Import-site counts (myK9Q): `ringside` 58 · `scoring-ui` 41 · `replication` 34 · `secretary` 14 · `core` 11 · `scoring` 6 · `ui` 4 · `pwa-update` 2.

### 1.4 The shared packages form a connected graph (not independent units)
**Runtime/peer edges** (what actually couples the shipped bundles):
```
ringside    -> core, scoring-ui, ui
scoring-ui  -> core, ui
core, scoring, secretary, supabase, replication, ui, pwa-update -> (runtime leaf)
```
**Dev/test edges** (additional coupling at build/test time): nearly every package dev-depends on `test-utils`; `replication` dev-depends on `core` + `supabase`; `supabase` dev-depends on `core`.

`ringside` (myK9Q's heaviest import at 58 sites) transitively pulls `scoring-ui → core + ui`, so its real footprint is `ringside + scoring-ui + core + ui`. Combined with the other direct deps, you cannot extract one package cleanly — they move as a cluster, and `test-utils` ties the whole test layer together.

Package facts (corrected): they **already build** via `tsup` to `dist/` with `.js` + `.d.ts`; `main`/`types`/`exports` point at `dist`. CI builds them with `pnpm -r --filter='./packages/*' build`. They are **well tested** — 116 package test files total (`replication` alone: MutationManager + stress, ConflictResolver + merge, ConflictManager, DatabaseManager lifecycle/multi-tab, ReplicatedTable/Cache/Batch, syncReplicatedTable, mutation-utils). `replication`'s `ConflictResolver` carries a header: *"Ported from @myk9/q to shared package."* — i.e. these packages exist precisely to be the shared substrate.

### 1.5 Shared Supabase backend
- One project `sojmvhhwsjxmfistvzbe`: `config.toml`, **231 migrations**, ~21 edge functions (`validate-passcode`, `send-*`, `push-trigger-*`, `ask-myk9q`, `ask-myk9show`, `admin-*`, `generate-premium`, `resend-webhook`, …).
- myK9Q calls edge function **`validate-passcode`** (via `functions.invoke`); it owns none.
- **DB-level cross-app coupling:** myK9Show's generated types reference a view **`view_myk9q_entries`** in ~20 places — a myK9Q-named DB object that myK9Show reads. The shared schema is genuinely two-app shared, not cleanly partitionable.

### 1.6 Build / CI / deploy
- No root `tsconfig`; each app self-contained (`moduleResolution: bundler`, `strict`, `noUnusedLocals`, `@/*` alias only). myK9Q's `vite.config.ts` source-aliases `@myk9/ringside` to package source for dev/test (note the deliberate regex-anchored alias so the `/styles` subpath still resolves via exports).
- CI (`.github/workflows/ci.yml`): `quality` (typecheck+lint) → `test` (build packages, then per-app `turbo run test --filter`) → `build`. Turbo remote cache gives **affected-filtering for free** — a PR touching one app makes the other app's tasks cache hits. E2E jobs are commented out (GHA minutes).

---

## 2. The real trade-off

| | Monorepo + CODEOWNERS (**recommended**) | Two repos + published packages (Strategy A) |
|---|---|---|
| Meets "just avoid collisions" | ✅ Fully | ✅ (overkill) |
| Hard access boundaries | ❌ (everyone can read all) | ✅ |
| Shared contract stays in lockstep | ✅ Automatic (one tree) | ⚠️ Only via version discipline across 9 pkgs |
| Coordination cost per shared-pkg change | ~0 (one PR) | bump → publish → upgrade in consumer repo |
| Setup cost | hours | ~2–3 weeks |
| Risk to a working app | minimal | real (9-pkg graph, shared DB view, 231 migrations) |
| Reversible | trivially | painful |

Your stated goal lands entirely in column 1. Column 2 only wins when the *requirement* is access separation — which you said it is **not**.

---

## 3. Recommended plan — isolate teams inside the monorepo

### Phase A — Ownership boundaries (½ day)
- Add `.github/CODEOWNERS`: `apps/myk9q/**` → Team Q; `apps/myk9show/**` → Team Show; `packages/**` + `supabase/**` → shared owners (both leads), so changes to the shared substrate require a cross-team review. This is the actual "don't step on each other" mechanism.
- Turn on branch protection: required CODEOWNERS review, required CI (`quality`, `test`, `build`).

### Phase B — Make collisions structurally unlikely (½–1 day)
- Document the rule already implied by CLAUDE.md memory `feedback_work_in_worktree_not_main_repo`: **each agent/dev works in a worktree**, never the shared main checkout. Add it to CONTRIBUTING.
- Confirm Turbo affected-filtering is doing its job (it is, per CI) so the two teams' PRs don't serialize on each other's test suites.
- Optional: split CI into per-app required checks so a red myK9Show test doesn't block a myK9Q-only PR from showing green on its own surface (Turbo already isolates the *work*; this isolates the *signal*).

### Phase C — Reduce the shared-edit surface (ongoing, optional)
- The collision hot-spots are the 9 shared packages. Where a change is truly app-specific, prefer putting it in the app, not the shared package, to keep `packages/**` edits rare and deliberate (each one is a cross-team touch).
- Keep `view_myk9q_entries` and the edge-function contracts documented as shared interfaces so neither team breaks the other at the DB layer.

### Phase D — Tests / verification
- No code migration, so "tests" here = prove the boundary works: open a throwaway PR touching only `apps/myk9q`, confirm it requires only Team Q review and that myK9Show tasks are Turbo cache hits. Then one touching `packages/core` and confirm it requires shared review.

**Exit criteria:** two teams can land app-local PRs without cross-review or CI contention; shared-substrate changes (`packages/**`, `supabase/**`) require explicit cross-team sign-off.

---

## 4. Risks of the recommended path
| Risk | Mitigation |
|------|-----------|
| A team edits a shared package and surprises the other | CODEOWNERS forces cross-review on `packages/**` + `supabase/**` |
| Shared-repo agent `git add -A` sweeps another's files | Worktree-per-task rule (Phase B); already a known hazard in this repo |
| CI signal coupling (one app's red blocks the other) | Per-app required checks (Phase B optional step) |
| Goal later changes to hard access separation | §5 is ready to execute |

---

## 5. IF the goal becomes hard access separation — repo-extraction path (Strategy A)

Keep this for later; do **not** execute now.

**Decision among A/B/C:** **A (publish to GitHub Packages)** is the only safe option.
- **C (vendor/copy) rejected:** would fork 9 interconnected packages + the offline-sync contract over a *shared* DB → silent divergence and show-day data corruption.
- **B (git subtree) viable as interim** but ugly across 9 packages.

**Sequenced phases:**
1. **Decisions/prereqs** — GitHub Packages access; `.npmrc` `@myk9:registry` auth; env-var inventory (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_UNIFIED_RINGSIDE_ENABLED`, replication debug flags).
2. **Versioning infra in-monorepo** — add `changesets`; give the 9 packages real semver; add a publish workflow. They already build to `dist`, so packaging work is small; the work is the *release process*. Both apps still consume `workspace:*` (no behavior change).
3. **Publish + validate** — publish first versions; flip **myK9Show** to consume the published versions to prove the registry round-trip on the app you're *not* moving.
4. **Stand up `myk9q` repo** — move `apps/myk9q/**` (decide history-preserving via `git filter-repo` vs clean import); swap all 9 `workspace:*` → `^x.y.z`; bring Prettier/ESLint base, `.npmrc`, `.env.example`, its own `vercel.json`, and a single-app `ci.yml`; point at the same Supabase project.
5. **Cross-repo contract** — backend stays in platform repo (your decision). Document the protocol: schema/edge-fn or sync-contract change → bump the relevant package(s) → publish → myK9Q upgrades. The `Database` type ships with `@myk9/replication`/`@myk9/supabase`, so a schema change that affects myK9Q = a package bump it must consume. Document `view_myk9q_entries` + `validate-passcode` as frozen shared interfaces.
6. **Remove `apps/myk9q` from platform repo** — update root scripts (`dev:q`, `build:q`, `test:packages` filters), Turbo, docs, memory. **Verify myK9Show untouched:** `pnpm typecheck && pnpm build && pnpm test && pnpm lint` green; Vercel deploy unaffected.
7. **Ownership hardening** — CODEOWNERS + branch protection in both repos; who can publish `@myk9/*`; optional Renovate in myk9q to surface new package releases.

**Effort:** ~10–15 working days, dominated by the release process for 9 packages and validating the shared-DB contract across two repos. **Permanent cost:** every shared-substrate change becomes a multi-repo publish/upgrade.

---

## 6. Open question back to you
You answered "just avoid collisions," which is why §3 (stay in monorepo) is the recommendation. **Confirm that's acceptable**, or tell me a constraint I'm missing (e.g. an outside contractor who must not see myK9Show source) that would justify the §5 split. I'll stop here either way until you decide.
