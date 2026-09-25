# Scheduled walk prompts

> **Status:** Reference

The prompts the scheduled walks run live here, in the repo, so every change is reviewed (MYK9-733). The installed scheduled task is only a pointer that reads its file from `origin/main` at run time.

| Walk                  | File                                               | Roles                         | Cadence                      |
| --------------------- | -------------------------------------------------- | ----------------------------- | ---------------------------- |
| `secretary-task-walk` | [`secretary-task-walk.md`](secretary-task-walk.md) | secretary                     | weekly, Wednesday 3:05 AM    |
| `exhibitor-task-walk` | [`exhibitor-task-walk.md`](exhibitor-task-walk.md) | exhibitor                     | weekly, Sunday 3:05 AM       |
| `role-intent-walk`    | [`role-intent-walk.md`](role-intent-walk.md)       | judge, club-admin, site-admin | weekly, Friday 3:00 AM       |
| `show-day-walk`       | [`show-day-walk.md`](show-day-walk.md)             | secretary → judge → exhibitor | weekly, Monday 3:05 AM (new) |

Why the walks exist, how they divide the roles, and how they relate to the Codex walks: [`docs/operations/scheduled-task-walks.md`](../../operations/scheduled-task-walks.md).

## Why the prompts moved here

They used to live only in `~/.claude/scheduled-tasks/<name>/SKILL.md`, with a copy in `scheduled-task-walks.md` kept in step by hand and checked by `pnpm qa:prompt-parity`. The installed copy drifted anyway, both ways: on 2026-09-24 the installed secretary and exhibitor prompts carried hand fixes the repo never saw (labels that do not exist in Linear, a report picker claim, a mixed-registry claim, fixed seed dates, a payment that can never coexist with a full teardown), while the repo carried the MYK9-558 retarget to the lean seed that the installed exhibitor prompt never received. Both halves were merged into these files. MYK9-391 and MYK9-408 were earlier cases of the same class.

## The pointer

Each installed task's `SKILL.md` is its YAML frontmatter plus the pointer block under that walk's heading in `scheduled-task-walks.md`, byte for byte. `pnpm qa:prompt-parity` still checks that, so a hand edit to the installed file is still caught. The pointer:

1. fetches `origin/main`,
2. reads `docs/qa/walks/<name>.md` **as it is on `origin/main`** (`git show origin/main:docs/qa/walks/<name>.md`), not from a working tree, which may be on a stale branch,
3. follows it as the whole prompt, and
4. stops and reports if the file cannot be read, rather than walking from memory or an older copy.

Changing a walk is now a normal reviewed change to its file here. The pointer itself changes only when the mechanism does.

## Each file has two parts

- **Part 1 — The job, the boundary and the output (stable).** What to walk, the safe mutation boundary, the credentials, the output and Linear filing rules, and the hard constraint. It changes through a reviewed PR only.
- **Part 2 — Known mechanics (expected to churn).** Measured facts about the app, the fixtures and the open issues: routes, selectors, measurement traps, the issues to re-verify, the prior reports to re-walk. It goes stale by design.

## How a run's corrections come back

Every walk ends its report with a **Prompt corrections** section: each statement in its own file that the run found stale, with the evidence. Then:

- **A correction below the `# Part 2` line the walk applies itself**, in the same docs-only commit as its report, pushed to `main` under the docs-only direct-to-`main` carve-out (CLAUDE.md § Auto Mode). `docs/qa/**` is inside that carve-out; `.claude/**` would not be, which is one reason these files live here and not beside the skills. The walk verifies the commit holds only its report and its own walk file, and that the diff changes nothing above the `# Part 2` line. A correction that waits for a human is re-derived by every run in between, which is the cost the Known-mechanics sections exist to avoid.
- **A correction above the line is listed in the report only.** The job, the boundary and the filing rules are exactly what an unattended run must not rewrite for itself; a human changes them through a PR.
- **Nothing in Part 2 may relax Part 1.** If a measured mechanic conflicts with the boundary, the boundary wins and the conflict is reported.

Reviewing a walk's own Part 2 edits: they arrive on `main` as part of a walk-report commit (`docs(audits): …`); `git log -p -- docs/qa/walks/` lists them.

## Installing or changing a pointer

Installing a task is a change to machine-local scheduler configuration, so a human does it:

1. Merge the change here.
2. Copy the pointer block (without its fence) from the walk's section in `scheduled-task-walks.md` into `~/.claude/scheduled-tasks/<name>/SKILL.md`, below its YAML frontmatter. A new walk (`show-day-walk`) needs its task created in the scheduler first, with the cadence in the table above.
3. Run `pnpm qa:prompt-parity`; every installed walk reports `OK`.
4. Run the walk once from the pointer and confirm its report names the `origin/main` SHA it read the file at.
