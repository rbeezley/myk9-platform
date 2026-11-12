# Nightly commit review controller

The nightly Codex commit review used to stop early (0/N reviewed) until the owner said "continue". The controller (`scripts/qa/commit-review/`, MYK9-1891) now owns the loop. The Codex run only starts it and reports its result.

## How it works

`pnpm qa:commit-review:run` (from the repo root):

1. Exits `2` at once if `<runsDir>/PAUSE` exists. Nothing is launched or written.
2. Takes `<runsDir>/controller.lock` (pid, host, start, heartbeat). A live owner makes the second dispatch exit `3`. A lock is recovered only when its heartbeat is older than 15 minutes AND its pid is not alive on this host (another host: heartbeat age alone); the takeover is logged.
3. Reads the `daily-commit-review` cursor from `origin/main` (after a fetch). It resumes the newest unfinished record frozen from that cursor, or freezes a new one (`origin/main` at that moment, inventory from `git rev-list --reverse`). The target never grows during a run.
4. Loops: validate the record from git, then
   - `complete` / `complete-empty`: exit `0`.
   - `blocked` (inconsistent record, failed publication, unfiled finding): exit `1` with the blocker report.
   - `incomplete` with commits left: launch `codex exec` (or `codex exec resume <session>` once a session id is stored in the record) telling the worker to review only the remaining SHAs and record each through `mark-reviewed`.
   - all commits reviewed but not published: run `publish-check`; if the report and cursor already read back on `origin/main`, record `readback-ok` without publishing again, otherwise launch a publication-only worker.
5. Progress means more commits reviewed, a longer contiguous reviewed prefix, or publication moving forward. After a failed or no-progress attempt it waits 30 s, 2 min, then 5 min (capped). Per invocation, 3 consecutive no-progress attempts or 12 attempts in total block the run with a report, never silently. A rerun continues the same record and session with fresh counters.
6. Permanent errors (not logged in, 401/403, missing `codex` binary, missing instructions file) block immediately. Anything else non-zero is treated as transient.

The controller never reviews, files issues, writes the report or stamps the cursor. The worker does, under the existing one-report-and-cursor docs-only commit contract. Only the controller-verified record can say complete, and the cursor can only be stamped to the reviewed target. A cursor that moves while commits are unreviewed (the Claude failover stamped it) blocks the run as superseded instead of overwriting.

### Exit codes

| Code | Meaning                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 0    | Complete; every commit reviewed, report and cursor read back on `origin/main`                                   |
| 1    | Blocked; the output names the failed operation, exact error, recovery attempts, unreviewed SHAs and next action |
| 2    | Paused by the owner (`PAUSE` file)                                                                              |
| 3    | Another controller holds the lock                                                                               |

### Other commands

- `pnpm qa:commit-review:validate publish-check --record <path> [--apply]` reads both files back on `origin/main` (report `docs/qa/codex-daily-commit-review-<run date>.md` names the target SHA; the cursor row is at the target or a descendant). `--apply` records `readback-ok`; it writes nothing when already recorded.
- Pause: `touch <runsDir>/PAUSE`; resume: delete it. Stop a run for good by pausing and then deleting the record.
- Flags for `run`: `--dir`, `--repo`, `--instructions-file`, `--max-attempts`, `--max-no-progress`, `--stale-minutes`. `COMMIT_REVIEW_CODEX_ARGS` adds extra `codex exec` flags (for example a sandbox mode).

`<runsDir>` defaults to `~/.codex/automations/nightly-commit-review/runs`.

## Connecting the automation (orchestrator, after merge)

1. Save today's full automation prompt (everything in `prompt = "..."`) as `~/.codex/automations/nightly-commit-review/worker-instructions.md`. The controller appends it to every worker prompt.
2. Replace the `prompt` in `automation.toml` with the text below. Schedule, branch convention and cadence gates stay as they are.

```
Start by running `pnpm qa:commit-review:run` from /Users/richardbeezley/AI Projects/myk9-platform and wait for it to finish; do not review commits yourself. It freezes the target, launches and resumes the review workers, retries transient failures, and only reports complete after the report and cursor read back on origin/main. Its exit status and printed summary are this run's result: 0 complete, 1 blocked (relay the printed blocker report verbatim: failed operation, exact error, recovery attempts, unreviewed SHAs, next action), 2 paused by the owner, 3 another controller is already running (report that and stop). Never start a second review for the same window and never advance the cursor outside the controller's workers. Close with the run summary and the issue ids it lists.
```

## Rolling back

Restore the previous `prompt` from `automation.toml` history (the old prompt is kept verbatim in `worker-instructions.md`). The record format is backward compatible: the controller only adds an optional `controller` field, so part 1 tooling still reads every record.
