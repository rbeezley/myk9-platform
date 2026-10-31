---
name: orchestrate
description: Use when the user says /orchestrate or /opsx-orchestrate, asks to "orchestrate" work, to run or "work through" a list of Linear MYK9 issues to merge unattended or overnight, to implement an OpenSpec change or remediation plan "using sub-agents", "with a cheaper model", or "as the orchestrator", or wants the loop where sub-agents write the code and the main agent reviews until satisfied. Not for docs/plan-*.md files (use ship-it).
---

# Orchestrate

**You are the orchestrator and reviewer. Implementer sub-agents on a cheaper model write the
code.** Quality comes from your review gate, not from the implementer, so keep your own context
small (reports, diffs, checklists) and be strict at the gate. A bad report means you re-dispatch;
don't try to salvage it.

In a cloud checkout (or to resume a run another session started), follow [`docs/operations/cloud-agent-workflow.md`](../../../docs/operations/cloud-agent-workflow.md): `scripts/cloud/setup.sh`, `pnpm cloud:preflight --role=<role>`, the `claude/`/`codex/` branch prefix, and the PR handoff ledger (`scripts/cloud/handoff-cli.ts read --pr=<n>`). On the Mac nothing in it is required.

## Inputs: pick the mode

| Input                                                    | Mode                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| An OpenSpec change id (`openspec/changes/<id>/`)         | **OpenSpec mode** below. Resume from the first incomplete phase.                         |
| A description of new design-level work                   | Run `opsx:propose` yourself (proposal quality is orchestrator work), then OpenSpec mode. |
| One or more `MYK9-<n>` ids, or "run the queue / tonight" | **Linear run mode**: read `references/linear-issue-run.md` before the first issue.       |

Both modes share the model routing, dispatch protocol and review gate below. Linear run mode
hands everything after an accepted issue to **`ship-pr`** (review tier, gate, watcher,
squash-merge from the main checkout, cleanup). OpenSpec mode ships each batch as its own section
describes, and cleans up only after archive.

## Model routing

Dispatch by role: `subagent_type: "implementer"` or `"verifier"`. Each role's file in
`.claude/agents/` sets its default model and tools and holds every standing rule for that
kind of work, so a correction to how a role behaves is an edit to that file, not a longer
prompt or a new LESSON. Pass `model` only to move one dispatch off its role's default, per
this table.

| Work                                                                                               | Model                                                                                    |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Mechanical: copy/text-only edits, renames, formatting, reading a CI log, checking "already fixed?" | `haiku`                                                                                  |
| Bug fixes and features, including offline/replication/sync, RLS/auth, state machines               | `sonnet`                                                                                 |
| Money (payments, refunds, fees, money guards), or a batch that failed two sonnet review rounds     | `opus`, **only after the owner says yes**. In an unattended run, hold the issue instead. |

Never dispatch migrations blind. After an implementer writes one, run the `migration-auditor`
agent on it before your own review. Migrations are never pushed in an orchestrated run.

**Concurrency cap: 2 heavy jobs at once** (owner, 2026-10-13, after four agents plus Codex
reviews needed a reboot). This counts sub-agents, resumed agents (SendMessage), verifiers that
run a suite or a browser, Codex reviews and your own full test or Playwright runs. Lightweight
`gh` watchers don't count. Count before every spawn or resume, and queue the work when you're
at 2. No size exemption: a "small" fix's agent counts like any other. Implementers running
in Claude cloud sessions (Linear run mode's cloud lane) don't count, since they use no Mac
CPU; the Codex review and any verifier run for their PRs do.

## Verify, then weigh (before any worktree, state change or dispatch)

An issue or task is a claim, written at one moment by one reader. Nothing is spent on it until
all three of these are done and recorded in the ledger row (`premise:`, `approach:` and
`size:`).

1. **Reproduce the claim on current `main`.** Dispatch the `verifier` with what the issue
   names (the e2e spec, the browser at the stated route and width, the SQL, the failing test)
   and read its verbatim output; read the code the issue blames yourself. Then check the
   premise against what already exists: `list_issues` with `includeArchived: true` on the
   route or symptom (a Done issue may hold the opposite decision), the `// INTENT:` comments
   and `docs/INTENT.md` section for that surface, and the consolidation rule in CLAUDE.md.
   Record one of:
   - `confirmed` — proceed.
   - `partly true: <what holds>` — the dispatch carries only the criteria that still hold, and
     the triage comment names the ones dropped and why.
   - `not reproducible` or `by design: <issue or INTENT citation>` — apply the **Dispositions
     and holds** table in `docs/agents/issue-tracker.md` before moving on. Do not dispatch an
     implementer against a rejected premise or leave it eligible for automatic re-selection.
2. **Weigh at least one alternative to the fix the issue suggests.** The Recommendation is one
   reader's idea; the acceptance criteria are the contract. Write the `approach:` line before
   dispatch: the fix chosen, the alternative considered, and why. The alternatives to try first,
   in this order: do nothing and close with evidence; fix the data or seed, not the UI; change
   the copy, not the code; link to the surface that already does it, not a new page; fix the
   root cause the repro exposed, not the symptom. If the chosen approach changes what the
   criteria ask for, route the unresolved product decision through that same table.
3. **Size it: one concern per PR.** Review findings scale with PR size, and every fix round adds
   code the next round reads, so a broad PR rarely converges inside the 3-round cap (Wave 3,
   2026-10-31: 7 of 9 reviewed PRs needed an override; MYK9-1506 bundled about ten class-card
   features into one PR). If the criteria that survive step 1 cover more than one independent
   concern (separate UI controls, separate data paths, separate surfaces), split before dispatch:
   `save_issue` one sub-issue per concern with `parentId` set to the original, each carrying its
   own criteria, and dispatch each as its own PR. The parent stays open until its last child
   merges. Rule of thumb: a PR's criteria must fit one review read; more than about 3 criteria
   on different files means split. Record `size: one concern` or `size: split into MYK9-a, MYK9-b`
   (or `size: kept whole: <reason>` when the concerns cannot land apart).

`docs/agents/issue-tracker.md` owns selection, dispositions, hold routing and evidence labels.
Use it for every stop/resume/closeout rather than adding workflow-specific mappings here.

In OpenSpec mode the proposal and design are where the weighing happened; reproduce only for a
task that fixes a reported defect. Why this gate exists: the 2026-10-20 usability walk's first
draft of a Find Shows finding asked to reverse MYK9-952, a Done decision that 13 E2E specs
depend on; only an archived-issue search caught it (`docs/qa/usability-walk-new-user-2026-10-20.md`).

## Dispatch protocol

Where the implementer works depends on the mode. Two implementers never work in one worktree at
the same time.

- **OpenSpec mode:** in the change's own worktree, where its artifacts already live, one batch
  at a time.
- **Linear run mode, local lane:** each issue gets its own worktree and branch, created by the
  orchestrator (see `references/linear-issue-run.md`). After you dispatch, confirm it with
  `git worktree list`.
- **Linear run mode, cloud lane:** the implementer is a Claude cloud session started with
  `claude --cloud` through `scripts/cloud/dispatch-cloud-session.sh` from the Bash tool (never
  the Terminal-panel tool, which the auto-mode classifier can stop on a dialog); the prompt is
  the same three parts below, preceded
  by the cloud preamble in `references/linear-issue-run.md` § Lanes, which tells the session to
  read `implementer.md` as its own rules. It cannot be messaged: its PR is its report, and a
  review round is a fresh session.

Dispatch with `subagent_type: "implementer"`. Its role file, `.claude/agents/implementer.md`,
carries the project rules, the scope fence, the verification discipline and the report
format, so the prompt carries only what is specific to this task, in order:

1. Worktree absolute path and the exact task text: the `tasks.md` items verbatim, or the Linear
   issue's description and acceptance criteria verbatim (minus any criterion triage dropped).
2. **Premise and approach**, copied from the ledger row: what was reproduced and where, the
   fix chosen, the alternative rejected and why. The implementer builds the decided thing, not
   the issue's Recommendation.
3. Pointers: change artifacts or linked plan, relevant `docs/INTENT.md` sections and
   `// INTENT:` comments, and the files you expect it to touch.

Do not restate the role's rules in the prompt. If a rule is missing, or an implementer keeps
breaking one, fix the role file. The implementer ends with a
`FILES / APPROACH / TESTS / TYPECHECK / CONCERNS` report; a report you cannot verify means
re-dispatch, not salvage.

## Review gate (per batch or per issue)

Don't trust the report. Verify it. Run every check below inside the implementer's worktree
(`(cd "$WT" && pnpm typecheck)`), never from wherever you sit: from the main checkout these
commands check `main`, not the proposed change.

1. `git -C <worktree> diff origin/main...HEAD` plus the uncommitted diff. Read the actual code.
2. Checklist (all must pass):
   - [ ] Does only what the task or criteria say (no scope creep, no drive-by refactors)
   - [ ] Implements the `approach:` recorded at triage. A diff that took a different route
         needs the alternatives re-weighed, not a silent acceptance
   - [ ] Meets every acceptance criterion or spec delta, not just the title
   - [ ] `// INTENT:` comments and the role feeling (`docs/INTENT.md`) preserved
   - [ ] No new surface that duplicates an existing page (the consolidation rule)
   - [ ] Tests exist for new logic. If anything is value-sensitive, re-run the focused tests yourself
   - [ ] `pnpm typecheck` clean (run it yourself on the final round)
   - [ ] No direct Supabase reads where replication is required, and no file pushed over 500 lines
   - [ ] `pnpm format:check:changed` clean, and the diff carries no stray or unrelated files
   - [ ] A layout or behavior fix is proven by the real artifact, not by a class or source-text
         assertion. Dispatch the `verifier` with the issue's repro (e2e spec, browser at the
         stated width) against the branch worktree and against `main` as a control that must
         fail, and read its output, not its summary
3. `independent` floor only: before the first Codex run, dispatch one read-only `sonnet` lens
   on `git diff origin/main...HEAD` to find defects (never approve), fix what you agree with,
   and commit. It posts nothing and is not gate evidence; it counts as one Mac heavy job. The PR
   body records `pre-pass: N findings fixed`, and `Codex rounds: M` at the end (`ship-pr` Step 4).
4. On failure, send the same agent (SendMessage, which keeps its context) a numbered defect list
   and re-review. **Max 3 rounds.** After that, escalate (see Model routing) or implement it
   yourself. A cheap model looping past the point where you'd be faster is waste.
   Reviewer output tagged `[pre-existing P<n>]` is code the branch did not touch. It never
   blocks and never goes to the implementer: file it (reconcile with `includeArchived: true`
   first) and keep the batch's scope. Check the tag yourself; a defect in lines the diff
   changed is a normal finding whatever it is labelled.
5. Only you tick `tasks.md` boxes or move Linear state. A tick means _reviewed and accepted_.
6. Once accepted, ship it before you start the next batch or issue that touches the same
   files. How depends on the mode: see the OpenSpec section below, or `ship-pr` per
   `references/linear-issue-run.md`.

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
them **one at a time**. Commit a checkpoint after each accepted batch, then **ship that batch
before dispatching the next**: open its PR, run the OTHER harness's review with the flag that
posts the gate (`pnpm qa:codex-review --post` from Claude Code), record the gate, merge, and
start the next batch from the merged `main`. Before the LAST batch's PR is opened, run
`opsx:verify` against the integrated tree and fix CRITICAL findings in that PR, never after the
merge. One PR per batch (shared rules, Gates § 3): the reviewer reads the whole net diff, so one
end-of-change PR of N batches costs roughly N times the review rounds and hides cross-batch
interactions until the end (#2210: 63 files, 8 rounds). Batches that can't compile or pass CI
on their own ship together, and the PR says so. After the last merge, archive and clean up per
the pipeline.

## Shared-system authority

- Merging: OpenSpec mode needs the usual confirmation. In Linear run mode, starting the run
  authorizes the squash-merge of each PR once its review gate and required checks are green.
- Never in either mode: `supabase db push`, `supabase functions deploy`.
- Deploy myK9Show: only under
  [`docs/agents/standing-approvals.md`](../../../docs/agents/standing-approvals.md) (`status: ACTIVE`, read fresh, and `pnpm qa:prelaunch-tripwire` exit 0 right before,
  through the `deploy` skill). Otherwise, or when the tripwire stops it, work that
  needs one stops short of it, parks the issue `needs:operator` with the reason, and says so.
- Owner questions go to Linear (`needs:decision` / `needs:operator`) and the run moves on; it does
  not wait in chat.
- The `independent` floor is met only by the other harness (`pnpm qa:codex-review --post`).
  A same-harness reviewer never substitutes. If Codex is unavailable, the PR waits, open and
  unmerged, and the run reports it.

## Final report

Per mode: the `opsx:ship` final report, or the Linear run summary from
`references/linear-issue-run.md`. Add orchestration stats: units dispatched, model per unit,
review rounds per unit, splits made at sizing (step 3 of "Verify, then weigh") and convergence
overrides used, and anything you implemented yourself. That last item tells you how to
improve future dispatch prompts.
