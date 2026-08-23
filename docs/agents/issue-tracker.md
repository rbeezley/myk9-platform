# Issue Tracker

Linear tracks this project's work. Workspace slug `myk9-platform`, issue prefix `MYK9`
(e.g. MYK9-21).

## Access

Via MCP: the official marketplace `linear` plugin (`/plugin install linear@claude-plugins-official`),
a remote HTTP server at `https://mcp.linear.app/mcp` plus an OAuth grant. Authorization is
per-environment — check `/mcp` in the current session rather than assuming a prior session's
grant carries over.

## Querying — archived issues are the closed backlog

The workspace runs on Linear's **free tier (250 non-archived issues)**, and the way it stays under
that cap is auto-archive (Team settings → **Workflows & automations** → "Auto-archive closed issues,
cycles, and projects" — *not* Issue statuses, which is only the status list), which moves closed issues
out of the active set once its window elapses. Archived issues still exist — searchable,
restorable, and `get_issue`-able by id — but they are **invisible to a default `list_issues` call**,
which sends `includeArchived: false`.

That default is right for "what is open" and **wrong for every reconciliation query**. Any search
whose purpose is *"has this already been filed / fixed / rejected?"* must pass
`includeArchived: true`, or it reads an empty result as "never seen" and re-files work that is
already Done. Closed issues here demonstrably recur — the overnight audits reopened six previously
Done issues on 2026-08-20 — so a duplicate is not a harmless extra row; it re-runs the remediation.

| Query intent | `includeArchived` |
| --- | --- |
| What's open / what to work on next | `false` (default) |
| Dedupe a new finding against prior ones | **`true`** |
| Check whether a fix already shipped | **`true`** |
| Reconcile an audit ledger across runs | **`true`** |
| Resolve a specific `MYK9-<n>` cited in code or docs | **`true`** |

`get_issue` by id is unaffected — it resolves archived issues without a flag. Prefer it whenever
you already know the id (and remember the LESSONS rule: never close from a `list_issues` result,
because it truncates acceptance criteria).

Archiving is automatic and cannot be triggered per-issue; Team settings → Workflows & automations
sets the window. The *Auto-close stale issues* automation on that same page is a different thing and
is currently on (6 months → Canceled): it closes **open** issues, so the deliberately parked Backlog
items here — Stripe live-mode cutover, 10DLC registration, DR posture — are on a path to Canceled
around 2027-01. Cycles are off and there are no projects, so none of Linear's auto-close exemptions
protect them. Do not "free up room" by deleting issues — deletion is permanent
after 30 days and orphans the ~197 distinct `MYK9-<n>` ids cited across ~737 files in this repo.

## Conventions

- Branch names encode the issue id: `codex/myk9-6-offline-fixture`, `codex/myk9-15`.
- OpenSpec proposals cite the tracking issue, e.g. `Tracking: [MYK9-21](https://linear.app/myk9-platform/issue/MYK9-21/...)`.
- Priority is importance, not readiness — an Urgent issue can sit deliberately in Backlog
  pending a blocker (e.g. sandbox testing). Don't propose starting a "Backlog" issue as
  unblocked just because its prerequisites merged; ask before reordering.
- Issues encode dependency chains as Linear issue-links — a single "In Progress" issue with
  unstarted downstream links is usually correct sequencing, not neglect.

## Division of labor with OpenSpec

Linear holds *state* (status, priority, sequencing). `openspec/changes/<id>/` holds *content*
and is cited in the issue body as "Source of truth" with spec + task-section pointers. They
are not duplicating — an OpenSpec change *is* the plan; don't also author a `docs/plan-*.md`
for the same work.

## PRs as a request surface

Off. External PRs are not currently pulled into the triage queue from this tracker.
