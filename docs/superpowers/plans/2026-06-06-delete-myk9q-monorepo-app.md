# Delete myK9Q Monorepo App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the unused monorepo `apps/myk9q` app while preserving myK9Show and shared ringside packages.

**Architecture:** myK9Show is now the canonical app for show-day ringside flow via `/at-show` and `packages/ringside`. The standalone monorepo myK9Q app is deleted from source, CI, scripts, and workspace metadata; historical code remains available through git history. The separate myK9Qv3 repository and production `myk9q.com` deployment are out of scope and must not be touched.

**Tech Stack:** TypeScript monorepo, pnpm workspaces, Turborepo, GitHub Actions, Vercel project metadata outside repo.

---

## Scope Boundary

- Do delete `apps/myk9q` from this repository.
- Do remove root commands, CI jobs, bootstrap env copy, and local helper script references that require `apps/myk9q`.
- Do update tracking docs so future agents know the monorepo app is gone.
- Do keep `packages/ringside`, `packages/scoring-ui`, `packages/replication`, and other shared packages that myK9Show still uses.
- Do not modify or delete the separate myK9Qv3 repository.
- Do not modify `myk9q.com`, `my-k9-q-react`, or any production myK9Qv3 deployment.
- Do not delete the `myk9-platform-myk9q` Vercel project in this plan; that is a shared-system mutation requiring separate explicit approval.

## Task 1: Remove myK9Q Workspace App

**Files:**
- Delete: `apps/myk9q/`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: Delete the monorepo app directory**

Run:

```bash
rm -rf apps/myk9q
```

Expected: `test -d apps/myk9q` fails.

- [x] **Step 2: Remove root myK9Q commands**

Edit `package.json` to remove only `dev:q` and `build:q`; keep all other existing scripts.

- [x] **Step 3: Refresh pnpm lockfile**

`pnpm install --lockfile-only` was blocked by existing registry/package-version drift around `@types/react@19.2.16`, so the `apps/myk9q` importer block was removed surgically from `pnpm-lock.yaml`.

## Task 2: Remove CI And Local Script References

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/bootstrap-worktree.sh`
- Modify: `scripts/test-all.sh`

- [x] **Step 1: Rename and narrow package test job**

In `.github/workflows/ci.yml`, rename `test-packages-and-q` to `test-packages`, update comments to packages-only, remove the `Test myK9Q` step, and update the umbrella `test` job dependency to `needs: [test-packages, test-show]`.

- [x] **Step 2: Remove disabled myK9Q E2E block**

Delete the commented `e2e-myk9q` block. Keep the commented `e2e-myk9show` block intact.

- [x] **Step 3: Stop bootstrap from copying deleted app env**

In `scripts/bootstrap-worktree.sh`, keep only `apps/myk9show/.env` in `ENV_FILES`.

- [x] **Step 4: Narrow `scripts/test-all.sh` to myK9Show**

Update the usage comment to `app = myk9show | all`, and remove the branch that runs tests from `apps/myk9q`.

## Task 3: Update Project Instructions And Tracking

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `OPEN-TODOS.md`
- Modify: `docs/plans/2026-05-17-unify-myk9show-myk9q.md`

- [x] **Step 1: Update root agent instructions**

Remove root command examples for `pnpm dev:q`, `cd apps/myk9q && pnpm test`, and `cd apps/myk9q && pnpm test:e2e`. Replace deployment notes with:

```markdown
- **myK9Show staging:** myk9-platform-myk9show.vercel.app (auto-deploys from `main`)
- **Legacy production myK9Qv3:** myk9q.com (separate repo, untouched)
```

Update offline-first wording to describe myK9Show and shared ringside packages, not two monorepo apps.

- [x] **Step 2: Update unification tracking**

In `OPEN-TODOS.md`, mark the platform unification todo complete for repo Phase 6 deletion and note that separate myK9Qv3/`myk9q.com` remains untouched. Keep any future Vercel project deletion as a separate approval-gated external operation if needed.

- [x] **Step 3: Update canonical unification plan**

In `docs/plans/2026-05-17-unify-myk9show-myk9q.md`, add an implementation status note under Phase 6.

## Task 4: Verification

**Files:**
- Verify generated state across repository.

- [x] **Step 1: Confirm app directory and workspace importer are gone**

Run:

```bash
test ! -d apps/myk9q
rg -n '"@myk9/q"|apps/myk9q|dev:q|build:q|test:q' package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .github scripts
```

Expected: no active build/test/workspace references remain. Historical docs references may still exist outside this command.

- [x] **Step 2: Run focused monorepo verification**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test:packages
pnpm --filter @myk9/show test
```

Stop any test command that hangs for more than 60 seconds and report it.

Result: `pnpm typecheck`, `pnpm lint`, and `pnpm test:packages` passed. `pnpm --filter @myk9/show test` completed with 8,336 passing tests, 9 skipped tests, and 1 existing environment-dependent failure in `src/test/debug-database.test.ts` from `fetch failed` timing out while checking live database connectivity.

- [x] **Step 3: Confirm shared ringside still builds through myK9Show**

Run:

```bash
pnpm build:show
```

Expected: myK9Show builds with `packages/ringside` still present.

- [x] **Step 4: Review final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: deletion and reference cleanup only; no changes to separate repositories or production `myk9q.com`.
