# Workflow & Development Process Consolidation Plan

> **Status:** Active

Goal: make the development environment self-navigating. Today the project has ~80 skills, a long CLAUDE.md, a large memory index, and several overlapping review/audit/planning paths. The cost is decision friction: every session re-derives "which skill/review/plan-format applies here." This plan consolidates, documents the decision paths once, and prunes what's redundant.

Guiding principle (same as the app itself): **consolidate, don't duplicate.** Deletions are a feature.

---

## Phase 1 — The Playbook doc (highest value, do first)

Create `docs/PLAYBOOK.md`: a single decision-tree document that answers "I want to do X — what's the exact sequence?" One page per scenario, each a short numbered recipe naming the skills/commands in order. Scenarios to cover:

1. **New feature (design-level)** — `opsx:explore` → `opsx:propose` → `opsx:apply`/`opsx-orchestrate` or `opsx:ship` → `opsx:verify` → `opsx:archive`. When to use opsx vs a `docs/plan-*.md` (the OpenSpec carve-out rule, restated plainly).
2. **New feature (small, no spec needed)** — `superpowers:brainstorming` → TDD → implement → `/simplify` → `/harden` → `/commit` → PR → `/review` (+ `/codex:review` if user-visible behavior) → merge → `/cleanup`. This is the existing 8-step workflow from memory; write it down in the repo.
3. **Bug / troubleshooting** — `superpowers:systematic-debugging` + `debugging-patterns`; the seed-data/RBAC collapse rule (survey all tables first); assertion-first testing for value-sensitive bugs; `incident-triage` for prod/staging fires vs local bugs.
4. **Which review when** — lift the existing table from CLAUDE.md, expand with: `security-audit`, `migration-auditor` agent, `code-review-extensions` triggers, `harden` vs `simplify` ordering, when Codex review is a gate (default-ON for user-visible behavior per memory).
5. **Database change** — migration checklist: `supabase migration list` first, GRANTs template, `db-push`/`deploy` skills, migration-auditor agent, verify on live.
6. **UX work** — `UX-Audit` vs `IA-Review` vs `role-journey-ux-audit` vs `qa-feature` vs `audit-pages` — one paragraph each on when; read `docs/INTENT.md` first.
7. **Docs-only change** — direct-to-main flow, scope list, `MYK9_ALLOW_PRIMARY_COMMIT` note.
8. **Session hygiene** — worktree rules, branch cleanup order (worktree remove before `branch -D`), `cleanup` skill, todo updates.

Each recipe ends with a "common mistakes" line pulled from the relevant feedback memories, so the lessons live in the repo, not only in Claude's memory.

## Phase 2 — CLAUDE.md slim-down

CLAUDE.md is load-bearing but has accumulated narrative. Restructure:

- Keep in CLAUDE.md: hard rules only (worktree/merge rules, migration GRANTs, Auto Mode gates, comms style, pointers).
- Move to PLAYBOOK.md: "Which review when" table, debugging guidance, workflow prose — replace with one link line each.
- Move worktree/merge/branch-hygiene detail to `docs/reference/git-workflow.md` (CLAUDE.md keeps the 5 hard rules + link).
- Result target: CLAUDE.md under ~120 lines. (Requires a PR — CLAUDE.md is out of docs-direct-to-main scope.)

## Phase 3 — Skills audit & consolidation

Inventory all project skills (`.claude/skills/`, plugins are read-only) and classify: **keep / merge / delete / never-triggered**.

Known overlap candidates to evaluate:
- `frontend-design-shadcn` vs plugin `frontend-design:frontend-design` — keep one.
- `code-review` vs `engineering:code-review` vs `review` vs `security-review` — document the winner per situation in PLAYBOOK, consider deleting the local duplicate.
- `handoff` appears twice; `skill-creator` appears twice (local + plugin).
- `deploy` vs `db-push` — check for content overlap; merge if >50% shared.
- `codebase-health` already consolidated three skills — use it as the template for the merge procedure.
- Audit family: `audit-pages` / `qa-feature` / `UX-Audit` / `IA-Review` / `role-journey-ux-audit` — likely all keep, but their descriptions should cross-reference each other so the wrong one doesn't trigger.

For each merge/delete, grep docs and skills for references before removing (per `feedback_grep_docs_before_deletion`).

## Phase 4 — Memory hygiene

Run `anthropic-skills:consolidate-memory`: merge duplicate/stale entries, delete memories now superseded by PLAYBOOK.md (once a lesson is codified in the repo, the memory should become a one-line pointer or be removed). Target: index short enough to scan in one screen per section.

## Phase 5 — Testing / validation

Process docs can't have unit tests; validation is behavioral:

1. **Cold-session walkthrough**: in a fresh session, ask "add a small feature to X" and "debug Y" and confirm Claude reaches the right recipe via PLAYBOOK.md without prompting.
2. **Skill-trigger spot check**: for each merged/renamed skill, issue its trigger phrase in a fresh session and confirm the right skill loads (skill-creator's eval tooling can help).
3. **Link check**: every skill/doc named in PLAYBOOK.md exists (`grep` + `ls` sweep).
4. Fix any misses by adjusting descriptions/trigger words, re-test.

## Execution notes

- Order: Phase 1 alone delivers most of the value; Phases 2–4 can be separate sessions/PRs.
- Phase 1 and the git-workflow reference are docs-only → direct to main. Phase 2 (CLAUDE.md) and Phase 3 (`.claude/**`) require PRs.
- Register this plan in `docs/README.md`; flip to Complete and archive when Phases 1–5 land.
