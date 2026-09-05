# Playbook — "I want to do X, what's the sequence?"

A decision tree for common scenarios in this repo. Each recipe is a short numbered sequence naming the exact skill/command to invoke, in order. When in doubt, start here before improvising a workflow.

See also: [`CLAUDE.md`](../CLAUDE.md) for hard rules (worktrees, merges, migrations, Auto Mode gates).

---

## 1. New feature (design-level / spans multiple files or a schema change)

1. `opsx:explore` — think through the idea, investigate the problem, clarify requirements before committing to an approach.
2. `opsx:propose` — creates the OpenSpec change (`openspec/changes/<id>/`) with proposal, design, specs, and `tasks.md` in one step. This **is** the plan — do not also write a `docs/plan-*.md` for the same work.
3. Implement: `opsx:apply` (direct) or `opsx-orchestrate` (cheaper-model sub-agents implement, you stay as reviewer/gatekeeper) or `opsx:ship` (full end-to-end: propose → implement → PR → review → merge → archive, autonomous).
4. `opsx:verify` — confirm implementation matches the change artifacts before archiving.
5. `opsx:archive` — closes out the change. `tasks.md` must show a testing phase completed (config's task rules enforce this).

**When to use `docs/plan-*.md` instead:** multi-change roadmaps, audits whose findings are the deliverable, and living reference material (token tables, specs — promote these to `openspec/specs/` via `opsx:sync` instead). If a `docs/` plan already exists when the change is created, add `> Tracked in openspec change: <id>` under its status line.

**Duplication check first (always):** before any new page/sheet/dialog — search for the existing surface. If it looks like it duplicates an existing page, add a link, don't reimplement. See CLAUDE.md § "Current development phase."

## 2. New feature (small, no spec needed — a component, a bugfix-sized addition)

1. `superpowers:brainstorming` — explore intent/requirements before implementation (required before creative work).
2. `superpowers:test-driven-development` — write the test first.
3. Implement.
4. `/simplify` — constructive cleanup pass (3 parallel agents: efficiency, quality, reuse). Auto-fixes safe wins.
5. `/harden` — adversarial stress-test (3 parallel agents try to break it: edge cases, state corruption, security holes).
6. `/commit`
7. Open PR.
8. `/review` (own-branch review) — and `/codex:review` alongside it if the diff changes **user-visible behavior**: RLS, migrations, payment flows, auth, RBAC seed data, gates, state, ranking, hook shape. Default ON for those; skip on docs/trivial fixes.
9. Fix findings, merge.
10. `cleanup` skill — worktree/branch hygiene, stale todos.

This is the canonical 8-step loop: implement → simplify → commit → PR → review → fix → merge → cleanup.

## 3. Bug / troubleshooting

1. `superpowers:systematic-debugging` — the default entry point for any bug, test failure, or unexpected behavior, before proposing fixes.
2. `debugging-patterns` — pattern lookup table (React, Zustand, Supabase, TypeScript) to use alongside systematic-debugging in Phase 1 (root cause) and Phase 2 (pattern analysis) to quickly categorize the symptom.
3. **Seed-data / RBAC / config bugs specifically:** collapse the ceremony — go straight to Phase 1 Step 4 (gather evidence across all layers at once). Query every related table in one batch: role table(s), permission/config table(s), join/link table(s) — for RBAC: `roles`, `permissions`, `role_permissions` together, before writing any `INSERT`.
4. **Value-sensitive bugs** (an enum string landing in a DB column, a key in a response object, a header in an HTTP call): write the `expect(...).toHaveBeenCalledWith(...)` assertion first, run it red, then fix — proves the wrong value, catches silent overwrites that visual inspection misses.
5. If it's production/staging actively misbehaving (not a local dev bug): use `incident-triage` instead — errors spiking, `/admin/health` red, high CPU, sign-in/scoring/payment failures, especially during a live show weekend.
6. After the fix: run the colocated test for the file you edited, then grep all callers by function name (not just filename) for anything else the behavior change touches.

## 4. Which review, when

| Situation                                                        | Use                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uncommitted working diff, pre-commit                             | `/code-review` (cleanup order: `/simplify` → `/harden` → commit)                                                                                                    |
| Open GitHub PR                                                   | `/review`                                                                                                                                                           |
| Shipping a branch or PR to `main`                                | `ship-pr` — runs the independent gate (Codex for Claude-authored, Claude for Codex-authored) at Step 4, **before** merge; a same-harness subagent is never the gate |
| Commits already on `main` / a finished phase, no PR              | `phase-review` skill                                                                                                                                                |
| High-stakes or user-visible behavior change                      | Add `/codex:review` (non-Claude second opinion) — default ON for RLS/migrations/payment/auth/RBAC/gates/state/ranking/hook-shape changes                            |
| Whole-branch, multi-agent deep review                            | `/code-review ultra` (user-triggered, billed)                                                                                                                       |
| PR touches `package.json` / auth / RLS / migrations / list views | Also load `code-review-extensions` checklists (dependency, security, migration, performance sections)                                                               |
| New/changed Supabase migration before `db push`                  | `migration-auditor` agent — checks missing GRANTs, missing RLS, O(N) policy anti-patterns, missing pre-queries, enum/CHECK mismatches                               |
| Pre-launch or major release                                      | `security-audit` skill (full mode)                                                                                                                                  |

Run Codex review **before** merging, not after — it's a gate, not a follow-up.

**If Codex is genuinely unavailable** (usage limit, outage, auth failure — not merely
slow or inconvenient), the sanctioned fallback is **adversarial subagents, plural**,
one per PR or per lens, run in parallel and prompted to _find bugs, not approve_
("assume the author was overconfident"; "report only defects with a concrete failure
scenario"). A skill's built-in `code-reviewer` step is **not** the fallback — that
substitution is a recorded lapse and stays banned.

The fallback is second-best and must be labelled as such: say in the PR body that the
gate did not run and what ran instead, keep the PR a draft when nothing is
time-pressured, and re-run Codex once it is available — against the merge commit, with
a follow-up issue, if the PR already landed. On #1536 two clean subagent rounds still
missed a P1 that Codex caught.

## 5. Database change

1. `supabase migration list` — check remote migration state before writing a new one (never assume local is authoritative).
2. If the migration references existing rows (permissions, roles, etc.), **query the target table first** to confirm the referenced values exist.
3. Every `CREATE TABLE public.<name>` needs explicit `GRANT`s to `anon`/`authenticated`/`service_role` — see the template in `CLAUDE.md` § "Database Migrations." Supabase no longer auto-exposes new public tables to the Data API.
4. Run migration commands from the worktree linked to Supabase, not the main repo.
5. Dispatch the `migration-auditor` agent before `db push`.
6. `db-push` skill (or `deploy` skill for the full deploy including edge functions/Vault secrets) to actually push.
7. Confirm live: check `supabase migration list` again post-push, or query the new table/column directly.

## 6. UX work

Read [`docs/INTENT.md`](INTENT.md) first — every UX change must preserve the target feeling for that role. Don't remove/change behavior behind an `// INTENT:` comment without explicit approval.

| Situation                                                                                                           | Use                                                       |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Deep-dive a single role's end-to-end journey, multi-viewport, persona-driven, regression-diffed against prior run   | `role-journey-ux-audit`                                   |
| General UX review of a page/feature — mental model, IA, affordances, cognitive load, state coverage, flow integrity | `UX-Audit` (6-pass, produces severity-rated findings doc) |
| Navigation/routes/tabs feel fragmented, "why are there 3 places to do X"                                            | `IA-Review` (structural audit + phased remediation plan)  |
| Real-browser walk of an existing feature, fixing bugs at the root cause mid-walk, leaves a Playwright spec behind   | `qa-feature`                                              |
| Sweep for console/network errors after a refactor, before release                                                   | `audit-pages`                                             |

`role-journey-ux-audit` and `UX-Audit` overlap (both persona/6-pass style) — prefer `role-journey-ux-audit` when the ask names a specific role and wants viewport + regression diffing; use `UX-Audit` for a single page/feature review.

## 7. Docs-only change

**In scope for direct-to-`main`, no PR:**

- `docs/**/*.md` (including `docs/plans/`, `docs/superpowers/`, `docs/ux-audits/`, etc.)
- `apps/*/docs/**/*.md`
- Top-level tracking docs: `README.md`, `CONTEXT.md`, `DESIGN.md`, `PRODUCT.md`, `TECHNICAL_DEBT.md`, `DEFERRED-WORK.md`, `INTENT.md` (additions/clarifications only)
- `packages/*/README.md`, `supabase/functions/*/README.md`

**Out of scope — still needs a PR:** `CLAUDE.md`, `AGENTS.md`, `.claude/**`, `.github/**`, any commit that also touches non-doc files, deletions/rewrites of plans authored by others.

Flow: commit on `main` (or fast-forward a feature commit into `main`), push directly. Verify the commit's filelist matches the in-scope list before pushing — if anything outside it is staged, open a PR instead.

## 8. Session hygiene / wrapping up

1. `cleanup` skill — checks stale worktrees, uncommitted changes, unpushed migrations, stale todos.
2. Worktree + branch teardown order matters: **remove the worktree before `git branch -D`** (reverse order orphans the shell cwd or fails).
3. Defer worktree removal to the _final_ cleanup command if the current shell is inside that worktree.
4. Always run `gh pr merge` from the main repo directory, never from inside a feature worktree.
5. After a merge: `git checkout main && git pull --ff-only`, `git fetch --prune`, then `git branch --list <branch>` to check if the local survived (recent `gh` deletes both remote+local on `--delete-branch`; older versions/manual merges don't — use `git branch -D` in that case, not `-d`, since squash rewrites SHAs).
6. Update tracking after completing each task, not in a batch at the end: move the Linear issue (team **MyK9-platform**) to its new state. See CLAUDE.md § Workflow for when a finding also belongs in `docs/qa/findings.md` or `TECHNICAL_DEBT.md`.

---

## Common mistakes (pulled from project feedback memory)

- **Bash matcher no-cd-prefix**: `cd "..." && git branch -D ...` doesn't match a `Bash(git branch:*)` allow rule — bash already persists cwd between calls, drop the `cd`.
- **Merge is not deploy**: merging a PR never pushes migrations or deploys functions — verify with `supabase migration list` / `db push` / `deploy` separately.
- **Stacked PR base-delete**: merging a stacked PR's base with `--delete-branch` closes the dependent PR — cherry-pick onto a fresh branch instead.
- **Review against git ref, not working tree**: when reviewing a PR, `git show origin/main:<file>` or the PR ref — not your local working tree, which may have drifted.
- **Rebuild package for app tests**: app vitest runs against a package's built `dist/` — rebuild with `pnpm --filter @myk9/<pkg> build` after editing a shared package, or tests silently run stale code.
- **Typecheck cache masks new files**: incremental `app.tsbuildinfo` can false-PASS after adding new files — clear the cache when auditing typecheck coverage.
- **Verify merged before audit**: `git log main | grep <sha>` before treating a branch as merged.
- **Grep docs before deletion**: code grep misses prose — `grep --include="*.md"` before deleting anything referenced in docs.
