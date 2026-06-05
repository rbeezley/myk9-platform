# myK9 Development Agents

These are reusable agent prompts for delegated development work in this repo.

A **skill** tells the active assistant how to perform a kind of work: TDD, cleanup, UX audit, PR shipping, and similar workflows.

An **agent** owns a bounded delegated mission and returns an artifact: findings, changed files, verification results, or a release-readiness decision. Use agents when parallel review or execution would reduce risk without fragmenting ownership.

## How To Use

When dispatching a sub-agent, paste or attach the relevant agent file and provide the concrete scope: branch, diff, files, PR number, plan section, or bug report. Keep the task narrow.

Do not ask two agents to edit the same files in parallel. For code changes, give each worker a disjoint write scope and tell them they are not alone in the codebase.

## Initial Agents

- `offline-reliability-reviewer.md` - reviews data paths for offline-first, replication, sync, and schema-name risks.
- `ux-consolidation-reviewer.md` - reviews UX work for intent preservation and duplicate surface area.
- `show-day-workflow-qa.md` - checks secretary, ring, scoring, and class-status flows against launch-readiness priorities.
- `db-migration-sanity.md` - checks migrations and seed/config fixes before shared database writes.
- `pr-finish.md` - performs final PR readiness checks, verification, tracking-doc sync, and branch hygiene review.

## Default Launch Frame

All agents must prioritize `docs/goals/fall-2026-launch-readiness.md`: secretary/show-day reliability, offline tolerance, scoring correctness, class status accuracy, next-action clarity, and calm operation for non-technical users.
