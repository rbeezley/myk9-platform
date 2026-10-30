# Audit Boundary Cursor

> **Status:** Reference

Shared review cursor for the recurring audit streams. This file answers **"through which commit have
we already looked?"** — a different question from `docs/qa/findings.md`, which answers "what is
broken."

## Why this file exists

Each scheduled automation records its own review boundary in its own private memory. That works
while a single automation owns a stream and runs every period. It breaks the moment a stream is
handed off — a Codex daily task pausing for token budget and a Claude failover covering the gap,
say. The relieving automation cannot read the paused one's memory, so it re-reviews from scratch and
re-mints IDs for findings that were already filed; when the original automation resumes it reads its
own stale memory and re-reviews the same window a third time.

A shared registry is not a shared cursor. This file is the cursor.

## Contract

Any automation that reviews a **commit range** must, in this order:

1. **Read** the row for its stream. Its review window starts at `Last reviewed SHA` (exclusive). If
   the row says `unset`, fall back to the stream's default window (e.g. the previous 24 hours) and
   say so in the report.
2. **Review** that range.
3. **Stamp** the row: new `Last reviewed SHA`, window end, which automation ran, and the run date.
   Stamp it even on a clean run that found nothing — an unstamped clean run is indistinguishable
   from a run that never happened.

Do not stamp a range you did not actually finish reviewing. If a run is cut short, stamp the last
commit you genuinely covered, not the one you intended to reach. Over-stamping silently deletes
coverage; under-stamping only costs a re-review.

A gap between one run's window end and the next run's window start is a **coverage gap** and must be
named in the report, not quietly absorbed.

## Streams

`Last reviewed SHA` is the newest commit on `main` that has been reviewed for that stream. Dates are
UTC.

| Stream                | Last reviewed SHA                          | Window end           | Run by                     | Run date   |
| --------------------- | ------------------------------------------ | -------------------- | -------------------------- | ---------- |
| `daily-commit-review` | `792773bfbcb8a9102c75ec1830eeb21c2095b620` | 2026-10-30T04:29:04Z | codex-daily-commit-review | 2026-10-30 |

If this row is ever `unset`, nobody has verified which commits the Codex daily stream has actually
covered; the first run of either automation on this stream must take its default window and stamp a
real boundary.

> **Provenance of the 2026-09-15 stamp.** The 88 commits from `c660131f5` to `738a5a6cf` were
> covered in two parts. The first 23 (through `de90d1b0b`) were reviewed by Codex on 2026-09-12 and
> 2026-09-13. Their reports and registry entries were restored to `main` on 2026-09-19 under
> [MYK9-501](https://linear.app/myk9-platform/issue/MYK9-501), after the deleted retained
> worktree's staged blobs were recovered from Git's object database. Their commit inventories are
> also reproduced in `docs/qa/claude-daily-commit-review-2026-09-15.md`. The remaining 65
> (`de90d1b0b..738a5a6cf`) were reviewed by `claude-daily-commit-review` on 2026-09-15. Restoring
> the reports did not advance this cursor or stamp any newer commit.

> **Provenance of the 2026-10-23 stamp.** The 124 commits from `10eb6bb12` to `a3a371c51` were
> covered in two parts. The first 20 (through `90030fbf7`) were reviewed by
> `codex-daily-commit-review` on 2026-10-23; its report was never committed and survives only as
> an untracked file in `/private/tmp/myk9-ncr-20261023`, which is the retention gap
> [MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343) owns. Its coverage was honoured
> here, not re-reviewed: `git rev-list --count 10eb6bb12..90030fbf7` returns exactly the 20
> commits its inventory enumerates. The remaining 104 (`90030fbf7..a3a371c51`) were reviewed by
> `claude-daily-commit-review` on 2026-10-23 and reported in
> `docs/qa/claude-daily-commit-review-2026-10-23.md`. That run supersedes the 82-commit remainder
> [MYK9-1344](https://linear.app/myk9-platform/issue/MYK9-1344) owns.

> **Provenance of the 2026-10-24 stamp.** The 27 commits from `a3a371c51` to `afc542b6d` were
> covered in two parts. The first 3 (through `378292962`, all documentation) were reviewed by
> `codex-daily-commit-review` on 2026-10-24; its report was never committed and survives only as
> an untracked file in `/private/tmp/myk9-ncr-20261024`, which is the same retention gap
> [MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343) owns. Its coverage was honoured
> here, not re-reviewed: `git rev-list --count a3a371c51..378292962` returns exactly the 3 commits
> its inventory enumerates. The remaining 24 (`378292962..afc542b6d`) were reviewed by
> `claude-daily-commit-review` on 2026-10-24 and reported in
> `docs/qa/claude-daily-commit-review-2026-10-24.md`.

> **Provenance of the 2026-10-25 stamp.** The 13 commits from `afc542b6d` to `b7dc2d608` were
> covered in two parts. The first 2 (through `c5ad65a10`, both documentation) were reviewed by
> `codex-daily-commit-review` on 2026-10-25; its report was never committed and survives only as
> an untracked file in `/private/tmp/myk9-ncr-20261025`, which is the same retention gap
> [MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343) owns, now recurring for a third
> day. Its coverage was honoured here, not re-reviewed:
> `git rev-list --count afc542b6d..c5ad65a10` returns exactly the 2 commits its inventory
> enumerates. The remaining 11
> (`c5ad65a10..b7dc2d608`) were reviewed by `claude-daily-commit-review` on 2026-10-25 and reported
> in `docs/qa/claude-daily-commit-review-2026-10-25.md`.

> **Retention gap closed, 2026-10-26 ([MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343)).**
> The Codex reports for 2026-10-20 through 2026-10-25 that the notes above describe as untracked
> are now on `main` under their original names in `docs/qa/`, published verbatim from the
> automation's backup. The 2026-10-18 and 2026-10-19 Codex reports, covering the 43 commits
> `0952bffb2..3fab98f7d`, were lost with their worktrees and could not be recovered; that exact
> range was re-reviewed fresh and is reported as replacement evidence in
> `docs/qa/claude-daily-commit-review-2026-10-18-19-replacement.md`. None of this moved the cursor.
> From 2026-10-27 the Codex automation commits its report together with its row stamp, directly to
> `main`, before removing its worktree.

> **Provenance of the 2026-10-27 stamp.** The 47 commits from `956f6ce01` to `4d5a839e6` were
> reviewed in one pass by `claude-daily-commit-review` on 2026-10-27 and reported in
> `docs/qa/claude-daily-commit-review-2026-10-27.md`. The previous row's coverage was verified,
> not assumed: `docs/qa/codex-daily-commit-review-2026-10-26.md` states its window as exclusive
> `b7dc2d608` through inclusive `956f6ce01`, and `git rev-list --count b7dc2d608..956f6ce01`
> returns exactly the 2 commits its inventory enumerates. This window starts at that commit, so
> there is no gap. The historical Oct 18-19 evidence gap
> [MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343) owns was closed inside this
> window by `9ab650fc5` and `551c4bf7f`, not absorbed by this stamp.

> **Provenance of the 2026-10-28 stamp.** The 28 commits from `0d9e4bb16` to
> `e1b2ddecd` were reviewed in one pass by `claude-daily-commit-review` on 2026-10-28 and
> reported in `docs/qa/claude-daily-commit-review-2026-10-28.md`. The previous row's
> coverage was verified, not assumed: `docs/qa/codex-daily-commit-review-2026-10-27.md`
> (committed in `96e1618eb`) states its window as exclusive `4d5a839e6` through inclusive
> `0d9e4bb16`, and `git rev-list --count 4d5a839e6..0d9e4bb16` returns exactly the 3 commits
> its inventory enumerates. This window starts at that commit, so there is no gap. That
> report's own header describes itself as retained locally because its `pnpm qa:inflight`
> overlap gate exited 2; it was in fact committed to `main` with its cursor stamp, so the row
> and the report agree either way.

> **Provenance of the 2026-10-29 stamp.** The 21 commits from `542b6fa47` to `20ada6552` were
> reviewed in one pass by `claude-daily-commit-review` on 2026-10-29 and reported in
> `docs/qa/claude-daily-commit-review-2026-10-29.md`. The previous row's coverage was verified,
> not assumed: `docs/qa/codex-daily-commit-review-2026-10-28.md` states its window as exclusive
> `e1b2ddecd` through inclusive `542b6fa47`, and `git rev-list --count e1b2ddecd..542b6fa47`
> returns exactly the 6 commits its inventory enumerates. That row was a real stamp (row plus
> report plus matching count), not a boundary-only one, so it was honoured rather than
> re-reviewed. This window starts at the commit it stamped, so there is no gap. `origin/main` was
> re-fetched after the review and had not moved, so this stamp is the tip actually reviewed.

### Adding a stream

Add a row only for an audit whose scope is a commit range. Streams scoped to _current state_ — a
full-surface security audit, a role UX walk, the weekly reconcile — have no meaningful cursor; their
run-to-run comparison is report-against-previous-report, and adding them here implies a precision
they do not have.

> **Provenance of the 2026-10-30 stamp.** The 33 commits from `35c77a6c1` to `1e863d802` were
> reviewed in one pass by `claude-daily-commit-review` and reported in
> `docs/qa/claude-daily-commit-review-2026-10-30.md`. The previous row's stamp was verified before
> it was honoured: `docs/qa/codex-daily-commit-review-2026-10-29.md` is on `main` as `4b4584c68`,
> its claimed interval `(20ada6552, 35c77a6c1]` is the one documentation commit it enumerates, and
> it in turn adopted the 21-commit Claude inventory for `(542b6fa47, 20ada6552]` after counting it.
> No coverage gap: this window begins exactly at the previous window's end.


## Related

- `docs/qa/findings.md` — what is broken (the registry).
- `docs/operations/scheduled-audits-claude.md` — the Claude-side task prompts.
- `.claude/skills/quality-finding-lifecycle/SKILL.md` — the finding evidence contract.
