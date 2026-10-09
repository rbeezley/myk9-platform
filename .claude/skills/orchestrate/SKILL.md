---
name: orchestrate
description: Use when the user says /orchestrate or /opsx-orchestrate, asks to "orchestrate" work, to run or "work through" a list of Linear MYK9 issues to merge unattended or overnight, to implement an OpenSpec change or remediation plan "using sub-agents", "with a cheaper model", or "as the orchestrator", or wants the loop where sub-agents write the code and the main agent reviews until satisfied. Not for docs/plan-*.md files (use ship-it).
---

# Orchestrate

**You are the orchestrator and reviewer. Implementer sub-agents on a cheaper model write the
code.** Quality comes from your review gate, not from the implementer, so keep your own context
small (reports, diffs, checklists) and be strict at the gate. A bad report means you re-dispatch;
don't try to salvage it.

## Inputs: pick the mode

| Input                                                    | Mode                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| An OpenSpec change id (`openspec/changes/<id>/`)         | **OpenSpec mode** below. Resume from the first incomplete phase.                         |
| A description of new design-level work                   | Run `opsx:propose` yourself (proposal quality is orchestrator work), then OpenSpec mode. |
| One or more `MYK9-<n>` ids, or "run the queue / tonight" | **Linear run mode**: read `references/linear-issue-run.md` before the first issue.       |

Both modes share the model routing, dispatch protocol and review gate below. Both hand
everything after an accepted, committed batch to **`ship-pr`** (review tier, gate, watcher,
squash-merge from the main checkout, cleanup). Never restate or shortcut those rules here.

## Model routing

Pass `model` explicitly on every Agent call.

| Work                                                                                               | Model                                                                                    |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Mechanical: copy/text-only edits, renames, formatting, reading a CI log, checking "already fixed?" | `haiku`                                                                                  |
| Bug fixes and features, including offline/replication/sync, RLS/auth, state machines               | `sonnet`                                                                                 |
| Money (payments, refunds, fees, money guards), or a batch that failed two sonnet review rounds     | `opus`, **only after the owner says yes**. In an unattended run, hold the issue instead. |

Never dispatch migrations blind. After an implementer writes one, run the `migration-auditor`
agent on it before your own review. Migrations are never pushed in an orchestrated run.

**Concurrency cap: 3 heavy jobs at once.** This counts sub-agents, resumed agents (SendMessage),
Codex reviews and your own full test or Playwright runs. Lightweight `gh` watchers don't count.
Count before every spawn or resume, and queue the work when you're at 3.

## Dispatch protocol

Every implementer runs in **its own worktree** (`isolation: "worktree"`, or a worktree you made
for that issue). Two implementers never share a worktree or a branch. After you dispatch,
confirm the worktree with `git worktree list`.

The dispatch prompt is self-contained and has these parts, in order:

1. Worktree absolute path and the exact task text: the `tasks.md` items verbatim, or the Linear
   issue's description and acceptance criteria verbatim.
2. Pointers: change artifacts or linked plan, relevant `docs/INTENT.md` sections and
   `// INTENT:` comments, and the files you expect it to touch.
3. Project rules: TypeScript only, files under 500 lines, the replication layer is never
   bypassed in core flows, shadcn/ui on Base UI, tests for new logic, assertion-first for
   value-sensitive bugs, the custom render from `src/test/utils/testUtils.tsx`.
4. Scope fence: "Change only what the task requires. No opportunistic refactors. Do not touch
   `tasks.md`, migrations or Linear. Do not deploy, push, open a PR, spawn sub-agents, run a
   review or post a `Review gate:` comment. Do not run the full app suite; run the affected
   test files. Run `pnpm exec prettier --write` on every file you touch. Never commit
   `AGENTS.md`: `turbo` rewrites it on every `pnpm typecheck`, so `git restore AGENTS.md` before
   each commit. Commit `wip:` before any verification that takes longer than a minute. Use
   bounded waits only (the Bash tool's timeout, or `for i in $(seq 1 40)`; macOS has no
   `timeout` command), never open-ended `sleep` loops, and wait for your tests to finish before
   you end your turn."
5. The report format below, as its final message.

```
FILES: <paths touched>
APPROACH: <2-4 sentences>
TESTS: <commands run + pass/fail counts, verbatim tail of output>
TYPECHECK: <pass/fail>
CONCERNS: <anything ambiguous, skipped, or smelly; "none" only if true>
```

## Review gate (per batch or per issue)

Don't trust the report. Verify it.

1. `git -C <worktree> diff origin/main...HEAD` plus the uncommitted diff. Read the actual code.
2. Checklist (all must pass):
   - [ ] Does only what the task or criteria say (no scope creep, no drive-by refactors)
   - [ ] Meets every acceptance criterion or spec delta, not just the title
   - [ ] `// INTENT:` comments and the role feeling (`docs/INTENT.md`) preserved
   - [ ] No new surface that duplicates an existing page (the consolidation rule)
   - [ ] Tests exist for new logic. If anything is value-sensitive, re-run the focused tests yourself
   - [ ] `pnpm typecheck` clean (run it yourself on the final round)
   - [ ] No direct Supabase reads where replication is required, and no file pushed over 500 lines
   - [ ] `pnpm format:check:changed` clean, and the diff carries no stray files (`AGENTS.md`'s
         turbo block, scratch files)
   - [ ] A layout or behavior fix is proven by the real artifact, not by a class or source-text
         assertion. Run the issue's repro (e2e spec, browser at the stated width) on the branch,
         and once on `main` as a control that must fail
3. On failure, send the same agent (SendMessage, which keeps its context) a numbered defect list
   and re-review. **Max 3 rounds.** After that, escalate (see Model routing) or implement it
   yourself. A cheap model looping past the point where you'd be faster is waste.
4. Only you tick `tasks.md` boxes or move Linear state. A tick means _reviewed and accepted_.
5. Once accepted, ship it through `ship-pr` from the implementer's worktree before you start the
   next batch or issue that touches the same files. `ship-pr` Step 7 removes the worktree; one
   created by `isolation: "worktree"` is locked and needs `git worktree remove -f -f`.

## OpenSpec mode

Follow the `opsx:ship` phase pipeline (branch safety → propose → verify artifacts → apply → verify
implementation → PR → archive → cleanup).

| Phase                                    | Who                                            |
| ---------------------------------------- | ---------------------------------------------- |
| Branch safety, propose, verify artifacts | Orchestrator                                   |
| **Apply (implementation tasks)**         | **Implementer sub-agents**                     |
| Review gate per batch                    | Orchestrator                                   |
| Verify implementation, PR, review fixes  | Orchestrator dispatches and reviews everything |
| Merge, archive, cleanup                  | Orchestrator                                   |

Group `tasks.md` items into coherent batches (one file cluster or one requirement each) and run
them **one at a time**. Ship each batch as its own PR before you dispatch the next: one PR per
batch (shared rules, Gates § 3), because the reviewer reads the whole net diff, so one PR for N
batches costs roughly N times the review rounds (#2210: 63 files, 8 rounds). Before the LAST
batch's PR, run `opsx:verify` on the integrated tree and fix CRITICAL findings in that PR, never
after the merge. Batches that can't compile or pass CI on their own ship together, and the PR
says so. After the last merge, archive and clean up.

## Shared-system authority

- Merging: OpenSpec mode needs the usual confirmation. In Linear run mode, starting the run
  authorizes the squash-merge of each PR once its review gate and required checks are green.
- Never in either mode: `supabase db push`, `supabase functions deploy`, Deploy myK9Show. Work
  that needs one stops short of it and says so.
- The `independent` floor is met only by the other harness (`pnpm qa:codex-review --post`).
  A same-harness reviewer never substitutes. If Codex is unavailable, the PR waits, open and
  unmerged, and the run reports it.

## Final report

Per mode: the `opsx:ship` final report, or the Linear run summary from
`references/linear-issue-run.md`. Add orchestration stats: units dispatched, model per unit,
review rounds per unit, and anything you implemented yourself. That last item tells you how to
improve future dispatch prompts.
