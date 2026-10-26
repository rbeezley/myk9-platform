# Linear run mode

Carries a list of `MYK9-<n>` issues, one by one, from Todo to merged, with Linear left accurate.
The model routing, dispatch protocol and review gate are in `../SKILL.md`. Everything from
"accepted and committed" to "merged and cleaned up" belongs to `ship-pr`. This file adds only
what an issue queue needs: selection, holds, Linear state and the run summary.

## Run start (the only pause)

1. **Where you sit.** The orchestrator runs from the main checkout
   (the first `git worktree list --porcelain` entry) on a clean, pulled `main`. It never edits
   files there. Every issue gets its own worktree. Don't start the run from an `EnterWorktree`
   session: that isolation refuses git in the main checkout, which the merge step and the
   per-issue `git worktree add` need. `ExitWorktree` (keep) first.
2. **Selection.**
   - The owner named ids: that list, in that order.
   - No list: use **Ready for an agent** and its exact connector fallback from
     `docs/agents/issue-tracker.md`. That contract is the only selection predicate. Rank by
     priority, then by fit with `docs/goals/fall-2026-launch-readiness.md` (secretary and
     show-day reliability first), then closest to done. Propose the top 3 with one line each and
     wait for one yes. This is the only question the run asks. If no Ready/fallback candidate is eligible (all
     held, or human-only), say so and ask for ids. Never fall back to Backlog yourself.
   - **Continuous mode** applies when the owner says "overnight", "unattended", "keep going" or
     "until the queue is empty". Your one question then also states the limits, and the owner's
     yes covers all of them: the approved list first, then refills, an issue cap (default 8),
     a stop time (default 07:00 local), and how many issues may be in flight at once on the
     cloud lane (default 4; see **Lanes**). Record the limits in the ledger header.
3. **Preflight.** One `get_issue` call proves the Linear connector works. If it's down, stop: a
   run that can't write Linear can't leave it accurate. Check that `codex --version` answers; if
   it doesn't, say before starting that any `independent`-tier PR will wait unmerged.
   For the cloud lane, `claude --version` must answer in the Terminal panel and the CLI must be
   signed in to claude.ai (`claude auth login`, a one-time owner step); the first dispatch is
   the real test, since it prints a session URL within a minute or fails in the open.
   Review Blocked work under the shared restoration/ownership rules before selecting new work;
   a past capability hold is not proof that the capability is still unavailable now.
4. **Ledger.** Keep `<scratchpad>/orchestrate-run.md` with one row per issue: id, premise,
   approach, tier, lane, worktree or cloud session URL, branch, PR, outcome and reason, plus
   the Mac heavy-job count at each spawn. Update it at every state change, so a compacted
   context or a crash can resume from it.
5. **Continuous mode only: keep the Mac awake.** Call `request_keep_awake` (the `ccd_host` tool)
   so the machine can't sleep mid-merge. If it's unavailable, say so before starting.

## Per-issue loop

**Continuous mode: check the stop conditions before EVERY issue**, approved or refill. End the
run (go to Run end) when any of these holds:

- the issue cap is reached (each issue attempted counts, held ones included);
- it's past the stop time. Never start an issue after the stop time; an in-flight one finishes
  or follows the shared asynchronous-merge boundary/handoff protocol;
- the last two issues both ended in a hold. That pattern means something systemic (a red `main`,
  Codex down, a broken connector), and more attempts would only burn budget.

Issues run in parallel only when their expected file sets are disjoint. How many run at once
depends on the lane: the Mac's 2-heavy-job cap governs the local lane and every review, and the
cloud in-flight limit governs the cloud lane.

## Lanes

Triage decides where each issue's implementer runs and records `lane: local` or `lane: cloud`
in the ledger row. The orchestrator stays on the Mac either way: triage, the premise and
approach, the review gate, the Codex review, the merge and the close-out never move.

| Lane      | Implementer runs in                                        | Counts toward the Mac cap                                     | Default for                                                                                                                                |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **local** | A worktree under `$MAIN/.claude/worktrees`, as a sub-agent | Yes: the implementer, its suites, verifiers, `/simplify`      | Anything that needs the Mac: an E2E or browser repro, `apps/myk9show/.env.local`, staging credentials, a dev server, a migration, Ops work |
| **cloud** | A Claude cloud session started with `claude --cloud`       | No for the implementer; yes for its Codex review and verifier | Code-plus-unit-test work whose acceptance a cloud checkout can prove: a bug with a failing test, a refactor, copy, a typed data-path fix   |

Cloud lane limits: at most 4 issues in flight at once (the owner's yes at run start covers the
number), and the Mac count still includes every Codex review of a cloud PR, so reviews queue
behind the cap even when four implementers are running. Cloud sessions have no `.env.local`,
no staging passwords, no Codex and no Linear; anything an issue needs from that list keeps it
local. The owner's rule from 2026-09-26 holds: **never message a cloud session**. A review
round is a fresh session (below), and the Mac reads results from the PR, never from the
session.

Why `claude --cloud` and not the app's `start_session` with a cloud target: the picker behind
`start_session` is only available while it is on screen (`list_start_targets` reports
`not_on_screen` otherwise), so an unattended run cannot rely on it. `claude --cloud` is a
terminal command the run can type itself; it produced PR #2937 (MYK9-1122) on 2026-10-12.

### 1. Triage (orchestrator, before any state change)

- `get_issue` with `includeRelations: true`. Read the **full** description, acceptance
  criteria, linked plan or OpenSpec change, and the latest comments. If the issue names an
  OpenSpec change, run it in OpenSpec mode instead.
- **Already fixed?** If the fix may already be on `main`, dispatch the `verifier` against
  `main` with each acceptance criterion as an item. The root then
  fresh-reads the full issue and checks every criterion, including production/acceptance proof.
  Record the evidence and apply the shared closeout contract; code on main or the helper's
  report alone cannot establish Done.
- **True, and fixed how?** Run "Verify, then weigh" from `../SKILL.md`: reproduce the claim
  on `main`, check it against archived issues and INTENT, and write the `premise:` and
  `approach:` ledger fields. Route rejected premises through the shared disposition table.
- **Pre-work stops:** use the **Dispositions and holds** table in
  `docs/agents/issue-tracker.md`, including its state, label, owner and resume record.
  Evaluate every pre-work trigger in that table before dispatch, including money/owner approval,
  owner-only acceptance actions and unknown ownership checks. Run `pnpm qa:inflight <expected paths>`;
  exits 1 and 2 both stop dispatch. Check In Progress issues naming those paths and `list_sessions`
  too. A held issue is not proof its unmerged work can be overwritten.
- Choose the executor from the full issue/runbook: Ops work follows its operational procedure,
  not a generic code implementer solely because it is Todo. For implementation work, pick the
  tier and the lane (see **Lanes**), and write both in the ledger row.

### 2. Start

**Local lane:**

```bash
MAIN="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
N=<n>; SLUG=<3-5-word-kebab>
BRANCH="claude/myk9-$N-$SLUG"  # codex/ when Codex implements; the prefix declares authorship
WT="$MAIN/.claude/worktrees/myk9-$N"
git -C "$MAIN" fetch origin main
git -C "$MAIN" worktree add "$WT" -b "$BRANCH" origin/main
(cd "$WT" && bash scripts/bootstrap-worktree.sh)
```

Keep the `cd` inside the subshell: a bare `cd` moves the orchestrator's own working directory
into the issue worktree. `git -C "$WT" status --short` must be empty afterwards.

Then `save_issue` → **In Progress**. Write the ledger row.

**Cloud lane:** no worktree yet. `save_issue` → **In Progress**, write the ledger row with
`lane: cloud` and the branch name (same `claude/myk9-$N-$SLUG` form), then write the prompt to
`<scratchpad>/cloud-myk9-$N.md` with the Write tool and dispatch it from the Terminal panel:

```
run_in_terminal  title: "cloud myk9-<n>"
command: claude --cloud "$(cat '<scratchpad>/cloud-myk9-<n>.md')"
```

`claude --cloud` needs a TTY, which is why it goes through the panel and not the Bash tool.
Read the tab (`read_terminal`, `wait_for_output_ms` up to 60000) until it prints the session
name, URL and teleport id; record the URL in the ledger row. Nothing in the tab after that is
needed; close it with `stop_terminal_tab` once the URL is recorded. If nothing prints within a
minute, or it prints a sign-in error, the dispatch failed: re-dispatch once, then hold the
issue through the shared table as a capability hold.

The prompt has the dispatch protocol's three parts (task text, premise and approach,
pointers), preceded by this cloud preamble, filled in:

```
You are the implementer for MYK9-<n> in rbeezley/myk9-platform, running in a Claude Code
cloud session. Read `.claude/agents/implementer.md` first and follow it as your own rules;
the differences below come from running in the cloud and win where they conflict.

1. Setup: `MYK9_TOOLS_DIR=/usr/local/bin bash scripts/cloud/setup.sh`, then
   `pnpm cloud:preflight --role=implementer`. A missing tool is a BLOCKER you report in the
   PR body, never a pass. `pnpm typecheck` needs the environment's NODE_OPTIONS heap flag.
2. Branch `claude/myk9-<n>-<slug>` from `origin/main`. Commit with the Claude Co-Authored-By
   trailer on every commit; the branch prefix and the trailers are cross-checked.
3. In this session `gh api` works but `gh pr`, `gh issue` and `gh api --paginate` do not
   (the proxy rejects GraphQL). Push with `git push -u origin HEAD`. Open the PR ONLY when
   the work is done and the affected tests and typecheck pass, as a READY (non-draft) PR via
   `gh api repos/rbeezley/myk9-platform/pulls -f title=... -f head=<branch> -f base=main
   -F draft=false -F body=@<file>` (`-F` reads the file; `-f` would send the filename as the
   body). The PR's existence is how the Mac learns you finished.
   Follow `.github/pull_request_template.md`; put the implementer report
   (FILES / APPROACH / TESTS / TYPECHECK / CONCERNS) under Test plan, verbatim, because you
   cannot message the orchestrator. Reference the issue as `Fixes MYK9-<n>`.
4. Never: post a `Review gate:` comment, run a review, merge, touch Linear, run
   `supabase db push` or `supabase functions deploy`, spawn sub-agents, or message anyone.
5. If Linear or GitHub is unreachable, proceed from the task text below; it is complete.
6. Wait for every test you started before ending your turn. A hang over 30 s is reported
   under CONCERNS, not retried.
```

Dispatch the next cloud issue only after this one's URL is recorded, and only while the
in-flight count is under the limit. Cloud dispatches do not touch the Mac heavy-job count.

### 3. Implement and review

**Local lane:** dispatch per `../SKILL.md` with `$WT` as the worktree path. Don't pass
`isolation`: the worktree already exists, and the implementer works only under `$WT`.
Afterwards, confirm with `git -C "$WT" status` that the changes landed there and that `$MAIN`
is still clean. Run the review gate, with a maximum of 3 rounds.

**Cloud lane:** wait for the PR, then review it in a local worktree.

- **Watch for the PR**, bounded: every 60 s, up to 15 min at first
  (`gh pr list --head "$BRANCH" --state open --json number,isDraft,headRefOid --jq '.[]'`;
  `.[]`, never `.[0]`, which turns an empty list into a false hit). Two deadlines, both
  counted from the dispatch time in the ledger and both applying in every mode, continuous or
  not. **Branch deadline, 15 min:** if the branch never appears on `origin`, the session
  failed before it started; re-dispatch once (same prompt file, new session), then hold.
  **PR deadline, 90 min:** a cloud session installs and builds before it works, so keep
  watching at the same interval, but a branch with commits and no PR at 90 min is a hold
  (In Progress, with the branch and the session URL named, per the shared table), and so is
  the run's stop time if it comes first. Polling never runs without one of these endpoints.
- **Review worktree:** when the PR exists,
  `git -C "$MAIN" fetch origin "$BRANCH" && git -C "$MAIN" worktree add "$WT" "$BRANCH"`, then
  `(cd "$WT" && bash scripts/bootstrap-worktree.sh)`. From here the review gate is the one in
  `../SKILL.md`, run inside `$WT`: read the diff, the checklist, the `verifier` for any repro,
  `pnpm typecheck` yourself on the final round. The PR body's report is the implementer's
  report; treat it the same way (verify, don't trust).
- **Findings:** you cannot send them to the session that wrote the code. Either fix them
  yourself in `$WT` when the defect list is short (this is you implementing, and it counts in
  the run stats), or start a **fresh** cloud session with the same preamble and a prompt of
  the form "check out `<branch>`, fix these findings (file:line each), push, do not open a new
  PR". Never push to the branch while a cloud session for it may still be running: a fix
  session is finished when its push lands (`git -C "$MAIN" fetch origin "$BRANCH"` shows the
  new head). The fetch moves only the remote-tracking ref, so before re-reviewing bring the
  review worktree to that head: `git -C "$WT" merge --ff-only "origin/$BRANCH"` on a clean
  tree (`git -C "$WT" status --short` empty; a refused fast-forward means the Mac and the
  session both wrote, which is the rule above being broken, so stop and hold). Then re-run
  the gate on the head the worktree is now at. **Max 3 rounds** across both routes, as on the
  local lane.
- **The branch's owner is the cloud session until its PR exists.** Before the PR, the Mac
  never fetches it into a worktree to "help".

**Mid-work stops** (leave the PR as a draft or open no PR, then apply the shared disposition
table and its complete hold record):

- the diff turns out to touch money, or needs an owner decision;
- a second review finding on the same path, or a finding in code the previous fix introduced
  (the convergence rule). Post the restructure proposal, not another patch;
- a test runner hangs for more than 30s, or required CI is still red after two fix attempts;
- the implementer failed 3 review rounds and escalation would need Opus.

The table covers every trigger above. Check **Blocked work** at resume; a held issue must not
disappear merely because its priority is Medium/Low or its implementation is unfinished.

**E2E repro runs** need the main checkout's `apps/myk9show/.env.local` (bootstrap doesn't copy
it): `set -a; . "$MAIN/apps/myk9show/.env.local"; set +a`, then run the spec pinned to its own
port (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port> PLAYWRIGHT_PORT=<port>`) so it doesn't
attach to another worktree's dev server. Never print the env values. When the `verifier` runs
the spec, put that sourcing line and the port in its prompt.

### 4. Ship

**Local lane:** first un-commit the implementer's `wip:` commits, so that `ship-pr`'s
`/simplify` and `/commit` (which scope from uncommitted changes) see the whole diff:
`git -C "$WT" reset --soft "$(git -C "$WT" merge-base origin/main HEAD)"`. Use the merge base,
never `origin/main` itself, which may have moved. Then run `ship-pr` from `$WT` (Steps A–C, 3a,
4, 5). **Cloud lane:** the PR already exists and its commits are the implementer's, so there
is nothing to un-commit; run `ship-pr`'s existing-PR path from the review worktree (Steps 1–3,
then 3a, 4, 5). This run's authorization covers the push, the PR and the squash-merge on both
lanes. Additions specific to the run:

- **PR references:** use the shared linking contract: final implementation uses `Fixes`;
  partial PRs and documentary follow-ups use `Ignore`. The root reconciles every merge.
- **Step A (simplify):** under 150 changed lines, your line-by-line review read is the simplify
  pass, so don't spend three more agents on it. Larger diffs run `/simplify`.
- **Ratchet:** `pnpm qa:code-quality-ratchet` from `$WT` when the diff adds lines to an
  existing file.
- **`adversarial` floor:** dispatch two `sonnet` lenses (read only, distinct bug-finding
  angles) in parallel. Fix or evidence every finding, then **re-run both lenses on the new
  head**: `post-review-gate.sh` posts "all findings addressed" only over a clean final log.
  Pass the wrappers' current `scripts/qa/review-verdict.sh` contract to each lens. A valid clean
  opening is `No actionable defects found.` The final log must contain no finding bullets or
  findings JSON, including fixed findings; preserve earlier findings/dispositions in separate history.
- **Migration in the diff:** carry it through the PR and review gate (`migration-auditor`
  is one adversarial lens), then **do not merge** in this run. Route the owner's merge/deploy
  action through the shared table. Never push a migration from an unmerged branch.
- **Codex unavailable on an `independent` floor:** leave the PR open and route the unavailable
  reviewer through the shared table. No same-harness substitute, no owner override from an agent.
- **Watcher exit 3:** follow ship-pr Path B and the shared **Asynchronous merge protocol**;
  an approved stop-time handoff records the named next executor and resume action.
- **Read the watcher's own exit code** (`…; echo "WATCH_EXIT=$?"`), never a wrapper's. If
  the failed check is `Review gate` and its status predates your gate comment, the
  comment-triggered run hasn't finished yet. Re-run the watcher once before treating it as red.
- **Watcher exit 1:** a fix attempt, which counts toward the two-red-CI hold. Exit 2 means a new
  head, so re-run the gate.

### 5. Close out (worktree still exists)

A merge now queues the linked issue In Review under the team's automation. Always reconcile
the actual state and evidence explicitly after a fresh read:

1. `gh pr view <n> --json state,mergeCommit` shows `MERGED`.
2. A fresh `get_issue` (a nightly job may have appended criteria). Check every criterion against
   the merged diff and the tests that ran.
3. Apply the shared disposition/evidence contract to the post-merge state and pending labels.
   Never accept automatic Done while any criterion remains owed.
4. Comment on the issue:

```markdown
**What changed** — <2-4 bullets>
**Checks run** — <commands and results; review gate line; CI watcher verdict>
**PR** — <url> (merged <sha> | open: <why>)
**Risks / remaining work** — <or "none">
**Acceptance criteria** — <each criterion: met (evidence) | owed (what, by whom)>
**Run notes** — implementer <model>, <N> review rounds, judgement calls: <list or "none">
```

Then `ship-pr` Step 7 from `$MAIN`. A worktree that was created locked needs
`git worktree remove -f -f "$WT"`. Worktree removal is the last command for that issue.

## Refill (continuous mode)

When the approved list is finished, don't end the run. Pick the next issue yourself, without
asking:

1. **Re-query fresh.** Read **Ready for an agent** again (or its documented Todo/filter fallback), rather than reusing the run-start
   list, because the board changes overnight. Rank by the same rules, and drop every issue
   already attempted this run, whatever its outcome. Never read Backlog. If nothing eligible is
   left, the run ends.
2. **Pick the top-ranked eligible issue** and run the per-issue loop, starting with the stop
   check and then Triage, whose holds still apply. Mark it `refill` in the ledger, so the
   summary separates the issues the owner approved from the ones the run chose.

## Run end

1. **Leftovers:** `git worktree list` shows only the expected worktrees (merge-pending ones are
   listed in the summary). `gh pr list --author @me --state open` shows only PRs the summary
   names. `ps -eo pid,etime,command | grep -E 'sleep|vitest'` finds no orphans. Every cloud
   session the ledger names ended in a PR or a recorded hold, and no `cloud myk9-<n>` Terminal
   tab is left open (`list_terminal_tabs`). Dismiss any background-task chips that the run
   absorbed.
2. **Summary**, as the final message (and a push notification when the owner is away):

```markdown
| Issue    | Outcome            | PR    | Reason / owed                                      |
| -------- | ------------------ | ----- | -------------------------------------------------- |
| MYK9-123 | merged · Done      | #2870 | —                                                  |
| MYK9-456 | merged · In Review | #2871 | browser walk of /at-show scoring                   |
| MYK9-789 | held · Todo        | —     | money-code approval question; shared table applied |
| MYK9-321 | held · Todo        | —     | not reproduced; owner premise decision owed        |
| MYK9-654 | held · In Progress | #2872 | draft PR paused for an owner restructure decision  |
```

Follow it with the orchestration stats from `../SKILL.md` and one line listing every judgement
call made without asking. In continuous mode, add one line naming the stop condition that ended the
run, and mark each `refill` issue in the table (e.g. `MYK9-321 (refill)`).

## Common mistakes

| Mistake                                                     | Instead                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Treating an automated status as acceptance proof            | Fresh-read all criteria and reconcile the actual post-merge state      |
| Dispatching the issue's criteria without reproducing them   | Reproduce on `main` first; hold what you cannot see                    |
| Building the issue's Recommendation as written              | Weigh an alternative; the criteria are the contract, not the fix       |
| Picking raw Todo or Backlog without eligibility checks      | Ready or its qualified fallback; judge risk from the diff at ship time |
| Handing a refund fix to sonnet "because it's small"         | Money is held, whatever its size                                       |
| Letting the implementer push, open the PR or post the gate  | The orchestrator owns every shared-system write                        |
| Retrying a red CI a third time                              | Hold after two attempts; unfinished code stays In Progress             |
| Removing a merge-pending worktree                           | Keep it; named executor reconciles merge/evidence before cleanup       |
| Ending an overnight run when the approved list is done      | Refill from Ready/qualified fallback until an approved stop condition  |
| Reusing run-start Ready results for refills                 | Re-query and requalify; the board changes overnight                    |
| Messaging a cloud session, or pushing to its branch early   | Read its PR; a review round is a fresh session after its push lands    |
| Treating cloud implementers as free of the Mac cap entirely | Their Codex reviews and verifier runs still count; queue those at 2    |
| Sending an E2E-proven issue to the cloud lane               | No `.env.local` or staging there; it stays local                       |
