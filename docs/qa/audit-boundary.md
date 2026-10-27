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

| Stream                | Last reviewed SHA                          | Window end           | Run by                    | Run date   |
| --------------------- | ------------------------------------------ | -------------------- | ------------------------- | ---------- |
| `daily-commit-review` | `956f6ce018c583381e9e42013bcf4e33074b2de4` | 2026-10-26T04:30:41Z | codex-daily-commit-review | 2026-10-26 |

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

### Adding a stream

Add a row only for an audit whose scope is a commit range. Streams scoped to _current state_ — a
full-surface security audit, a role UX walk, the weekly reconcile — have no meaningful cursor; their
run-to-run comparison is report-against-previous-report, and adding them here implies a precision
they do not have.

## Related

- `docs/qa/findings.md` — what is broken (the registry).
- `docs/operations/scheduled-audits-claude.md` — the Claude-side task prompts.
- `.claude/skills/quality-finding-lifecycle/SKILL.md` — the finding evidence contract.
