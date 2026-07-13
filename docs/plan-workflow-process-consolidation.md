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

### Phase 3a — Inventory & overlap detection: DONE 2026-07-13 (decisions pending)

29 project skills in `.claude/skills/` + 6 project commands in `.claude/commands/` were inventoried against the full available-skills list (project + plugin + built-in). Note: `.agents/skills/` and `.agents/agents/` are Codex's separate skill set — out of scope per `[[project_skills_dir_layout]]` ("don't symlink-dedupe").

**Confirmed duplicates / name collisions (need an owner decision — keep/merge/delete/rename):**

| Finding | Evidence | Recommendation |
| --- | --- | --- |
| `frontend-design-shadcn` (project) vs `frontend-design:frontend-design` (plugin) | Project skill's own frontmatter `name:` field is literally `frontend-design` (not `frontend-design-shadcn`), and its description is verbatim identical to the plugin's. It's the plugin skill with one added section ("shadcn/ui Project Setup"). **That added section defaults to `Radix` as a suggested component library** — directly contradicting CLAUDE.md § Architecture Decisions ("Base UI via shadcn/ui — NOT Radix, Radix stagnated after WorkOS acquisition"). | Fix the Radix contradiction regardless of the merge decision (correctness bug, independent of consolidation). Then either delete the project copy and rely on the plugin (losing the shadcn section) or keep the project copy as the canonical one and accept the plugin as permanent shadow duplicate — can't remove a plugin's skill from here. |
| `writing-concisely` (project) vs `anthropic-skills:writing-clearly-and-concisely` (plugin) | Project skill's own H1 is literally "Writing Clearly and Concisely" — same title as the plugin skill, same "Strunk's rules + AI-writing-patterns-to-avoid" structure. | Almost certainly the same source skill vendored twice. Same constraint as above — plugin can't be deleted from this repo; decide whether the project copy still earns its keep (e.g., if it's been customized) or should be deleted so only the plugin version triggers. |
| `skill-creator:skill-creator` vs `anthropic-skills:skill-creator` | Both are plugin-namespaced (not project-owned) — two different plugins register a skill with the identical local name `skill-creator`. Not fixable by editing this repo. | Environment-level note only, not a repo action — flag to disable one of the two plugins if the duplication causes ambiguous triggering. |
| `handoff` (project `.claude/commands/handoff.md`) vs built-in `handoff` skill | Two skills register the literal same name `handoff` with different descriptions: project's is "Generate a handoff document with resume prompt for continuing work in a fresh session" (confirmed by reading the file's frontmatter); a second, unnamespaced `handoff` skill in the available-skills list reads "Compact the current conversation into a handoff document for another agent to pick up" — a built-in, not plugin-namespaced. | The project version has 132 lines of real myK9-specific logic (explicit "don't duplicate CLAUDE.md/memory context" instruction, structured output template) — not a lazy copy. Keep it, but the identical bare name is a discoverability risk (`/handoff` is ambiguous about which fires). Consider renaming the project command's invocation, or documenting in PLAYBOOK which one wins. |

**Checked and found NOT to be problematic overlap (no action needed):**

| Pair | Why it's fine |
| --- | --- |
| `deploy` vs `db-push` | Not duplicated — `deploy`'s "Pushing migrations" section explicitly says "Invoke the `db-push` skill — it owns the password/linking procedure" and only adds the umbrella concerns (edge functions, Vault secret parity, post-deploy verification) that `db-push` doesn't cover. Correct composition, not overlap. |
| `role-journey-ux-audit` vs `UX-Audit` vs `IA-Review` vs `qa-feature` vs `audit-pages` | Already disambiguated with a one-line-each table in `docs/PLAYBOOK.md` § 6 (Phase 1). Genuinely different scopes (persona/viewport-driven vs single-page 6-pass vs structural-IA vs live-bug-fixing-walk vs console/network sweep). |
| `opsx-orchestrate` vs `opsx:ship` | Self-documented as an intentional wrapper ("Wraps opsx:ship — do not use for non-OpenSpec plans"), not accidental duplication. |
| `debugging-patterns` vs `superpowers:systematic-debugging` | Explicitly designed to be used alongside each other (pattern lookup table feeds Phase 1/2 of the debugging skill), already cross-referenced in PLAYBOOK § 3. |
| `verify` vs `verify-plan` | Similar names but different purposes — `verify` exercises runtime behavior of a code change; `verify-plan` checks an implementation *plan's* completeness before code is written. Naming is close enough to risk a wrong pick, but not a content duplicate — no merge needed, just watch for it. |
| `ship-it` vs `ship-pr` | Different entry points — `ship-it` starts from a plan file with zero human input until final merge; `ship-pr` ships an already-existing branch/PR (handles review-comment triage too). Tail end overlaps (both review, merge, cleanup) but the divergent starting conditions justify keeping both. |

**Not evaluated (out of scope for this pass):** `codebase-health` vs `engineering:tech-debt` (plugin) — flagged in the original candidate list but not read in detail; worth a follow-up pass since both could plausibly trigger on "audit tech debt."

**Next step:** owner (or Fable) reviews the two real duplicate/collision findings above and the deferred `codebase-health` check, and makes the keep/merge/delete/rename call. Nothing has been deleted or merged in this pass — inventory only.

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
