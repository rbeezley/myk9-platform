# Merge queue: test a PR once against current `main`, then do not test it again (MYK9-2239)

> **Status:** Active

Tracking: MYK9-2239. Rejected alternative: MYK9-2238 (cancel superseded `main` runs; it would bring back the 2026-09 gap that #2110 closed). Related: MYK9-2237 (#4215, PRs stay drafts during review so PR CI runs once), MYK9-2240 (the deploy job refuses a pinned commit that would roll production back).

## Why

Every squash merge into `main` reruns full CI (about 14 jobs) on a change its PR already passed. Several merges close together queue behind each other on the shared runners. On 2026-11-19 the `main` run for #4162's merge (`b35c67184`) was created at 15:31 UTC and its first job started at 16:00. An uncontended run takes about 14 minutes; that day's took 40 to 56, which delayed a deploy. The deploy picker (`scripts/qa/pick-deploy-commit.sh`) ships only a commit with a green `main` CI run, so a slow `main` run is a slow deploy.

A merge queue tests each PR on top of the current `main` (and on top of any PRs queued ahead of it) just before it merges. The commit that lands is already tested, so `main` need not test it again.

## What it does and does not save

- **Saved:** the full `main` push run after each merge, and the wait for it. A queued PR lands on `main` already green, so the deploy picker can ship it at once.
- **Gained:** a PR is tested against the `main` it actually lands on. Today two PRs that each pass alone can break `main` together; the queue catches that before the merge.
- **Not saved:** total runner minutes stay about the same. Each PR still runs CI on its own head (a PR must pass the required checks before it may join the queue), then once more in the queue. The run moves from after the merge to before it. Cutting PR CI itself (for example, running the browser smoke only in the queue) is a separate decision, listed under follow-ups.

## Phase 0: eligibility (owner, read-only)

GitHub has offered merge queues for public repositories owned by an **organization**, and for private ones on GitHub Enterprise Cloud. `rbeezley/myk9-platform` is owned by a **personal account** (`owner.type: User`). Before anything else, the owner opens Settings → Rules → Rulesets → `main-required-checks` → edit, and checks whether **Require merge queue** appears in the rule list.

- **It appears:** go on to Phase 1.
- **It does not:** a merge queue needs the repository to move to an organization (free for public repositories). That is a bigger change: Vercel, Supabase, Linear and Codex integrations, Actions secrets and variables, and every clone's remote URL. Decide that separately; the repository-file changes in this plan are inert without a queue and can wait on the branch or close.

## Design

### CI (`.github/workflows/ci.yml`)

1. **Trigger.** Add `merge_group: { types: [checks_requested] }`. A merge-group run checks out the queue commit (`gh-readonly-queue/main/pr-<n>-<sha>`), which is this PR squashed on top of `main` and anything queued ahead.
2. **Job conditions.** Every job condition that today reads `github.event_name == 'push' || github.event.pull_request.draft == false` also admits `merge_group`. The two conditions that keep fork PRs away from secrets (`head.repo.full_name == github.repository`) also admit `merge_group`: only someone with write access can queue a PR.
3. **Diff bases.** A merge-group payload has no `before` and no `pull_request`. Steps that diff against a base fall back to `github.event.merge_group.base_sha` (smoke scope, backup scope, bulk-PII guard, migration version guard). PR labels do not exist on a merge group, so `run-smoke`/`skip-smoke` do not apply there; the queue decides smoke from the changed files.
4. **Concurrency.** Merge-group runs join `main` runs in the per-SHA, never-cancelled group (#2110's rule): a queue run cancelled mid-flight would leave the PR without a verdict. The group key carries the event name, so the queue run and the later `main` push run for the same SHA never share a group.
5. **The `main` push run.** It stays, because direct-to-`main` docs commits and admin bypasses still need a verdict, and because the deploy picker reads `main` push runs. Its first job, **Queue verdict**, asks whether a merge-group CI run for exactly this SHA concluded `success`, waiting up to 30 minutes for one still in progress (non-required jobs can still be running when the queue merges). If yes, every other job is skipped and the run concludes green in about a minute. If there is no such run, it failed, or the query itself fails, the full suite runs. Failing toward "run the tests" means a wrong answer costs runner time, never a false green.

   This plan does not rely on `main` landing on exactly the SHA the queue tested (GitHub's docs do not say so outright): if the SHAs differ, the lookup finds nothing and the full suite runs. The throwaway-PR test (Phase 3) records which happens.

6. **Deploy picker.** No change. `pick-deploy-commit.sh` still asks for a successful `main` push run per commit. A queued merge produces one within about a minute; a direct push produces one when its full run passes.

### Review gate (`.github/workflows/review-gate.yml`)

`Review gate` is a required commit status pinned to the PR head SHA. The merge-group commit has a different SHA, so nothing would ever post `Review gate` on it, and the queue would time out on every PR.

A new workflow, `.github/workflows/review-gate-queue.yml` (job **Mirror review gate to the merge queue**, script `scripts/qa/merge-queue-review-gate.sh`), runs on `merge_group`. It lives in its own file because `review-gate.yml`'s tests parse that file as a single job. It reads the PR number and PR head SHA from the queue ref (`gh-readonly-queue/main/pr-<n>-<sha>`), reads the latest `Review gate` status on that PR head, and posts `success` on the merge-group SHA only if that status is `success`; any other state (failure, pending, missing) posts `failure`. Anything it cannot read or validate posts `failure` (the queue then drops the PR, which is the safe side). It checks out the queue's base commit (the `main` the PR is queued onto), never the queue commit, so the script it runs is `main`'s, not the PR's. (The workflow file itself comes from the queue commit, as with every `merge_group` workflow; a PR can only join the queue once its own head carries a green `Review gate`, so a reviewed change to this file is the only way to alter it.) If the mirror step itself fails, a fallback step posts `failure` so the queue drops the PR at once instead of waiting out its timeout.

Mirroring rather than re-evaluating is deliberate: the evidence is pinned to the PR head, the PR head is exactly what the queue squashes, and `review-gate.ts` stays the only evaluator. The window this leaves: evidence withdrawn after a PR joins the queue turns the PR head red but not a merge-group run already mirrored. Removing the PR from the queue (the PR page's "Remove from queue") closes it.

### How every session merges

- `gh pr merge <n> --squash` on a branch that requires a merge queue **joins the queue** when the required checks have passed. It does not merge at once. (`gh` ignores the method flag; the queue's own merge method applies, and the settings below make it squash.)
- If the required checks have **not** passed, the same command **arms auto-merge** instead. Standing approvals never cover auto-merge, so Step 5 still runs the check watcher first and merges only on exit 0 or a read exit 5.
- A new script, `scripts/qa/wait-pr-merged.sh <pr>`, waits for the outcome: exit 0 merged (prints the merge commit), 1 removed from the queue without merging, 3 timeout (not a verdict). `gh pr view --json state` alone cannot tell "still queued" from "dropped".
- The standing-approval merge entry is unchanged in substance: the tripwire runs right before `gh pr merge`, and the queue only adds a re-test against current `main`. Whether that delay is acceptable under standing approvals is the owner's call; until the owner says otherwise, an unattended run waits on `wait-pr-merged.sh` and reports its exit.
- `watch-pr-checks.sh` needs no change: it reads the required contexts from the ruleset and watches the PR head, which is still what gates entry to the queue.

**ship-pr Step 5 changes in its own PR, merged after this one and BEFORE the queue is turned on (Phase 2).** Both changes it makes also work with the queue off (the waiter returns on its first read after an immediate merge), so landing it first means no PR, that one included, is ever merged under instructions that cannot see the queue. Codex review of #4219 settled what it must do:

- **Pin the checked head.** Read one full 40-hex head SHA, stop if it is not one, and pass it to the watcher (`watch-pr-checks.sh <pr> <sha>`), with the watcher as the last command of that tool call so its exit code is what the caller sees. Write that same SHA literally into `gh pr merge <n> --squash --match-head-commit <sha>`; a shell variable does not survive into a separate tool call. Without the pin, a push after the watcher exits leaves an unchecked head, and on a queue branch `gh pr merge` on a pending head arms auto-merge instead of failing.
- **Call the waiter by the feature worktree's path.** Step 5 runs `gh pr merge` from the primary checkout, which may predate `wait-pr-merged.sh` until Step 7.

## Settings change (owner only; not done by any session)

In the `main-required-checks` ruleset (id `17085332`), add the rule **Require merge queue**:

| Setting                                           | Value           | Why                                                                                     |
| ------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| Merge method                                      | Squash          | The only method this repo allows.                                                       |
| Build concurrency                                 | 5               | Up to five queued PRs test at once, each on top of the ones ahead.                      |
| Minimum group size                                | 1               | Never wait for company.                                                                 |
| Maximum group size                                | 1               | One PR per `main` commit, so every `main` commit has its own tested run (#2110's goal). |
| Wait time to meet minimum group size              | 0 minutes       | Irrelevant at minimum 1.                                                                |
| Require all queue entries to pass required checks | On (`ALLGREEN`) | A failed entry is dropped, never merged behind a green one.                             |
| Status check timeout                              | 60 minutes      | Contended runs took up to 56 minutes on 2026-11-19.                                     |

Required status checks stay as they are (`Quality Checks`, `Test`, `A11y smoke`, `E2E PR Smoke`, `Review gate`). Leave **Require branches to be up to date** off: the queue does that job. Bypass actors stay as they are.

API form, for reference:

```json
{
  "type": "merge_queue",
  "parameters": {
    "merge_method": "SQUASH",
    "max_entries_to_build": 5,
    "min_entries_to_merge": 1,
    "max_entries_to_merge": 1,
    "min_entries_to_merge_wait_minutes": 0,
    "grouping_strategy": "ALLGREEN",
    "check_response_timeout_minutes": 60
  }
}
```

**Order: (0) the owner's read-only eligibility check (Phase 0), before the ship-pr Step 5 PR is written; (1) merge this PR; (2) merge the ship-pr Step 5 PR; (3) refresh open worktrees; (4) turn the queue on.** With the files merged and no queue, nothing changes: `merge_group` never fires, and the Queue verdict job finds no queue run and runs the full suite as today. Turning the queue on before (1) would block every merge, because no workflow would report the required checks on a queue commit; turning it on before (2) would leave sessions merging with a one-shot `gh pr view` that cannot tell "queued" from "dropped". Step (3): a session shipping a branch that predates the Step 5 PR still reads the old `ship-pr` from its own worktree and would treat a queued PR as merged, so before (4) every open session merges `origin/main` into its branch (or finishes first) and reloads Step 5. This PR may merge before (0): it is inert without a queue, so if the answer is no the cost is unused CI wiring, which the owner can keep for a later move to an organization or revert.

## Phases

1. **Repository files (this PR).** CI trigger, job conditions and Queue verdict job; review-gate mirror job and its script; `wait-pr-merged.sh`; tests. Draft PR, `independent` review.
2. **ship-pr Step 5 PR (a session), then the owner turns the queue on.** Phase 0 has already passed (the Step 5 PR is not written until it has). A session lands the Step 5 change described under "How every session merges" and merges it; open sessions refresh their worktrees (Order step 3); only then does the owner make the ruleset change above.
3. **Testing on a throwaway PR** (a docs-only change, for example a one-line edit to this plan):
   - PR CI and the review gate go green on the PR head as today.
   - `gh pr merge <n> --squash --match-head-commit <sha>` reports that the PR joined the queue.
   - A `merge_group` CI run starts; the `Mirror review gate to the merge queue` job posts `Review gate` on the queue SHA with the PR head's state.
   - The PR merges; `wait-pr-merged.sh` exits 0 and prints the merge commit.
   - Record whether the `main` commit SHA equals the queue run's `head_sha`.
   - The `main` push run's Queue verdict job finds the queue run and the run concludes `success` within a few minutes, with every other job skipped.
   - `bash scripts/qa/pick-deploy-commit.sh` (locally, with `gh` authenticated) picks that commit.
   - A negative check: queue a second throwaway PR whose Review gate is red on its head (remove the evidence after it is queued, or queue with a deliberately failing check) and confirm the queue drops it and `wait-pr-merged.sh` exits 1.
4. **Close-out.** Comment the results on MYK9-2239, flip this plan to Complete and archive it.

Unit tests in Phase 1 cover what can run locally: the concurrency expression (`scripts/qa/ci-concurrency.test.ts`), and in `scripts/qa/merge-queue.test.ts` (wired as `pnpm qa:merge-queue:test` in Quality Checks) the event conditions on every job, the merge-group diff bases, `ci-queue-verdict.sh`, `merge-queue-review-gate.sh` and `wait-pr-merged.sh`, each run for real against a stubbed `gh`.

Cost note: the Queue verdict job runs only on `main` pushes, so PR and queue runs get no extra serial job (on a contended day a serial job would add a second runner wait to every PR).

## Known costs

- **Superseded queue runs are not cancelled.** When an entry ahead fails, GitHub rebuilds the entries behind it on new SHAs; the old runs keep going to a verdict nobody reads. Accepted, for the same reason `main` runs are never cancelled.
- **Queue verdict can wait.** The queue merges once the required checks pass; non-required jobs (types drift, build) may still be running, and the `main` push run's Queue verdict waits up to 30 minutes for the whole queue run. A cheaper rule (check only the required check runs) would change what "tested" means; measure in Phase 3 first.

## Rollback

Delete the merge-queue rule from `main-required-checks` (one click, or the API). Merges go back to immediate squash merges, and the `main` push run goes back to the full suite on its own, because Queue verdict finds no queue run. The repository files need no revert.

## Follow-ups (not in this plan)

- **Lighter PR CI.** With the queue testing every PR against current `main`, the PR run could skip the browser smoke (`A11y smoke`, `E2E PR Smoke`), which would then run only in the queue. A skipped job counts as passing for a required check, so PRs could still join the queue. This is where runner minutes would actually drop. Owner decision; measure Phase 3 first.
