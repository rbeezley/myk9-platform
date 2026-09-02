# Bug audit — pre-flight

Run these before dispatching the first reviewer. Each one exists because skipping it cost real time
on 2026-09-01/02.

## 1. Working tree

- Work in a **worktree**, never the primary checkout. Bootstrap it (`bash scripts/bootstrap-worktree.sh`)
  so `node_modules`, `.env` and built packages exist — reviewers need `pnpm vitest` and `tsc` to
  confirm findings.
- Rebuild `@myk9/supabase` before believing any generated-DB-type error: a stale
  `packages/supabase/dist/index.d.ts` produces false failures that look like your bug.

## 2. Baseline

Record the commit every finding is stated against, and put it in each issue:

```bash
git rev-parse --short HEAD && git fetch -q origin main && git rev-parse --short origin/main
```

A finding filed against a stale base can already be fixed on `main`.

## 3. In-flight work — by FILE, not by title

```bash
gh pr list --state open --json number,title,files \
  --jq '.[] | select(.files[].path | test("<path-fragment>")) | "#\(.number) \(.title)"'
```

Run this for any file you are about to change, and **re-run it right before pushing**. On
2026-09-02 a PR titled *"fix(scoring): stop moved and not-accepted entries blocking class
completion"* had already rewritten an E2E spec I then fixed independently; its title gave no hint.
The window was about ten minutes.

The same check catches the **migration-version collision**: two branches picking the same timestamp
both pass every local check, because `migrationVersionUniqueness` only reads its own tree, and the
second to merge dies at `INSERT INTO supabase_migrations.schema_migrations` with no filename in the
error. Pick the timestamp against `origin/main` **and** against open PRs.

## 4. Linear reconciliation setup

Pull the backlog **once**, with archived included, and keep it in the scratchpad:

```
list_issues(team: "MyK9-platform", limit: 250, includeArchived: true)
```

Closed issues auto-archive on a 30-day window, so a default query returns empty for work that
shipped last month. An empty reconciliation result is only trustworthy when the flag was set;
otherwise the correct status is `blocked`, not `new`.

Prefer `get_issue` by id whenever you already know it — it resolves archived issues without the flag
and, unlike `list_issues`, does not truncate the description (which is where acceptance criteria
live).

## 5. Refresh the known-deliberate list

Before copying the reviewer brief, re-check its "do NOT report" section against the current tree.
Every entry should still be true, and anything settled since the last run should be added. A stale
list costs a whole scope in re-reported non-defects.

Candidates to re-verify each run: inert props tracked in an issue, deliberate omissions in
`SECURITY DEFINER` functions pinned by a behavioural test, decided-against features whose empty
data structure looks like dead code, and read-only-by-design surfaces.
