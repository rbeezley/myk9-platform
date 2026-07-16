# Issue Tracker

Linear tracks this project's work. Workspace slug `myk9-platform`, issue prefix `MYK9`
(e.g. MYK9-21).

## Access

Via MCP: the official marketplace `linear` plugin (`/plugin install linear@claude-plugins-official`),
a remote HTTP server at `https://mcp.linear.app/mcp` plus an OAuth grant. Authorization is
per-environment — check `/mcp` in the current session rather than assuming a prior session's
grant carries over.

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
