# Workflow & Development Process Consolidation Plan

> **Status:** Active

Goal: make the development environment self-navigating. Today the project has ~80 skills, a long CLAUDE.md, a large memory index, and several overlapping review/audit/planning paths. The cost is decision friction: every session re-derives "which skill/review/plan-format applies here." This plan consolidates, documents the decision paths once, and prunes what's redundant.

Guiding principle (same as the app itself): **consolidate, don't duplicate.** Deletions are a feature.

---

## Phase 1 — The Playbook doc (highest value, do first) — DONE 2026-07-13

Shipped as [`docs/PLAYBOOK.md`](PLAYBOOK.md).

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

## Phase 3 — Skills audit & consolidation — DONE 2026-07-13

Inventory all project skills (`.claude/skills/`, plugins are read-only) and classify: **keep / merge / delete / never-triggered**.

Known overlap candidates to evaluate:
- `frontend-design-shadcn` vs plugin `frontend-design:frontend-design` — keep one.
- `code-review` vs `engineering:code-review` vs `review` vs `security-review` — document the winner per situation in PLAYBOOK, consider deleting the local duplicate.
- `handoff` appears twice; `skill-creator` appears twice (local + plugin).
- `deploy` vs `db-push` — check for content overlap; merge if >50% shared.
- `codebase-health` already consolidated three skills — use it as the template for the merge procedure.
- Audit family: `audit-pages` / `qa-feature` / `UX-Audit` / `IA-Review` / `role-journey-ux-audit` — likely all keep, but their descriptions should cross-reference each other so the wrong one doesn't trigger.

For each merge/delete, grep docs and skills for references before removing (per `feedback_grep_docs_before_deletion`).

### Phase 3a — Inventory & overlap detection: DONE 2026-07-13

29 project skills in `.claude/skills/` + 6 project commands in `.claude/commands/` were inventoried against the full available-skills list (project + plugin + built-in). Note: `.agents/skills/` and `.agents/agents/` are Codex's separate skill set — out of scope per `[[project_skills_dir_layout]]` ("don't symlink-dedupe").

### Phase 3b — Keep/merge/delete decisions: DONE 2026-07-13 (Opus)

Each finding below was verified before deciding (`frontend-design-shadcn` diffed against the plugin source at `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design`; `writing-concisely` grepped for project-specific content and inbound references). **No skills were deleted or merged** — the two real findings were resolved by fixing, not removing.

| Finding | Evidence | Decision |
| --- | --- | --- |
| `frontend-design-shadcn` (project) vs `frontend-design:frontend-design` (plugin) | Diff vs plugin source shows the project copy is the plugin skill **plus three real additions**: a "Workflow" design-thinking bullet, a "shadcn/ui Project Setup" section, and an "Output & Integration Patterns" section (email/calendar/share deep-link recipes) not present in the plugin. Two defects in that added content: (1) the setup section listed "Component library: Radix or Base UI" and shipped a `base=radix` example preset URL — **contradicting CLAUDE.md § Architecture Decisions ("Base UI — NOT Radix")**; (2) the frontmatter `name:` was `frontend-design`, mismatching its directory `frontend-design-shadcn`. | **KEEP + FIX** (done this PR). Real added value justifies keeping the project copy; the plugin can't be removed from this repo anyway. Fixed the Radix contradiction (now instructs Base UI, cites CLAUDE.md, drops the `base=radix` preset) and aligned frontmatter `name:` → `frontend-design-shadcn`. Did not guess the Base UI `base=` URL param — annotated to confirm against the shadcn init UI rather than substitute an unverified value. |
| `writing-concisely` (project) vs `anthropic-skills:writing-clearly-and-concisely` (plugin) | Vendored copy with zero project-specific content (grep for myk9/supabase/exhibitor/secretary — empty). Ships a 901-line `signs-of-ai-writing.md` companion. Referenced by name in `release-notes/SKILL.md` ("Follow `writing-concisely`") and `docs/archive/plans/2026-06-09-stripe-connect-implementation.md`. | **KEEP as-is.** Names differ from the plugin (`writing-concisely` vs `writing-clearly-and-concisely`) so there is no hard trigger collision; it is invoked by name from another skill and a doc. Deleting would require re-pointing those references and trusting the plugin matches the companion file's depth — cost exceeds benefit for a benign leaf duplicate. Drift risk (vendored copy going stale vs the plugin) accepted and noted here. |
| `skill-creator:skill-creator` vs `anthropic-skills:skill-creator` | Both plugin-namespaced — two plugins register the same local name. | **Note only — not a repo action.** Cannot edit a plugin from this repo. If ambiguous triggering shows up, disable one plugin at the environment level. |
| `handoff` (project `.claude/commands/handoff.md`) vs built-in `handoff` skill | Project command has 132 lines of real myK9-specific logic (explicit "don't duplicate CLAUDE.md/memory context", structured output template); the built-in `handoff` "compacts the current conversation." Same bare name, different behavior. | **KEEP project version, do not rename.** The 132 lines earn their place; renaming a `/handoff` the user may invoke by muscle memory is more disruptive than the collision. Follow-up (not blocking): note in PLAYBOOK which `handoff` fires when. |

**Checked and found NOT to be problematic overlap (no action needed):**

| Pair | Why it's fine |
| --- | --- |
| `deploy` vs `db-push` | Not duplicated — `deploy`'s "Pushing migrations" section explicitly says "Invoke the `db-push` skill — it owns the password/linking procedure" and only adds the umbrella concerns (edge functions, Vault secret parity, post-deploy verification) that `db-push` doesn't cover. Correct composition, not overlap. |
| `role-journey-ux-audit` vs `UX-Audit` vs `IA-Review` vs `qa-feature` vs `audit-pages` | Already disambiguated with a one-line-each table in `docs/PLAYBOOK.md` § 6 (Phase 1). Genuinely different scopes (persona/viewport-driven vs single-page 6-pass vs structural-IA vs live-bug-fixing-walk vs console/network sweep). |
| `opsx-orchestrate` vs `opsx:ship` | Self-documented as an intentional wrapper ("Wraps opsx:ship — do not use for non-OpenSpec plans"), not accidental duplication. |
| `debugging-patterns` vs `superpowers:systematic-debugging` | Explicitly designed to be used alongside each other (pattern lookup table feeds Phase 1/2 of the debugging skill), already cross-referenced in PLAYBOOK § 3. |
| `verify` vs `verify-plan` | Similar names but different purposes — `verify` exercises runtime behavior of a code change; `verify-plan` checks an implementation *plan's* completeness before code is written. Naming is close enough to risk a wrong pick, but not a content duplicate — no merge needed, just watch for it. |
| `ship-it` vs `ship-pr` | Different entry points — `ship-it` starts from a plan file with zero human input until final merge; `ship-pr` ships an already-existing branch/PR (handles review-comment triage too). Tail end overlaps (both review, merge, cleanup) but the divergent starting conditions justify keeping both. |

| `codebase-health` (project) vs `engineering:tech-debt` (plugin) | Was deferred in Phase 3a. Project skill already consolidated three former skills (code-quality-audit, hotspots, improve) and is myK9-specific (churn hotspots, static-debt drift for *this* repo). Plugin is namespaced (`engineering:tech-debt`), so no bare-name collision. | **KEEP both.** A project-specific health skill outranks a generic plugin for this repo's audits, and the namespace prevents invocation ambiguity. No merge. |

**Outcome:** Phase 3 required **one code change** — the `frontend-design-shadcn` Radix fix + name alignment. Everything else is keep-as-is. No skill was deleted or merged; the "consolidation" here was correcting a latent contradiction, not removing surface area. The `handoff`-in-PLAYBOOK note is the only optional follow-up.

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
