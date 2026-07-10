---
name: opsx-orchestrate
description: Orchestrate an OpenSpec change end-to-end using cheaper-model implementer sub-agents while the main (expensive) model stays as reviewer/gatekeeper. Use when the user says /opsx-orchestrate, asks to "orchestrate" an implementation, asks to implement an OpenSpec change or remediation plan "using sub-agents", "with a cheaper model", or "as the orchestrator", or wants the review-and-loop pattern where sub-agents do the work and the main agent reviews until satisfied. Wraps opsx:ship — do not use for non-OpenSpec plans (use ship-it for docs/plan-*.md files).
---

# OPSX Orchestrate

Run the `opsx:ship` pipeline, but split roles: **you are the orchestrator/reviewer**; the
actual code edits are done by **implementer sub-agents on a cheaper model**. Quality comes
from your review gate, not from the implementer — so keep your own context small (reports,
diffs, checklists) and be strict at the gate.

Why this shape: the orchestrator's judgment is the expensive, scarce resource. Spending it
reading full implementation trails wastes it; spending it on diffs and acceptance checks is
where it pays. The implementer is cheap and replaceable — if a report is bad, re-dispatch
rather than salvage.

## Inputs

- An OpenSpec change id (`openspec/changes/<id>/`) — resume from the first incomplete phase.
- Or a description of new work — run `opsx:propose` first (yourself, not a sub-agent:
  proposal quality is orchestrator work).

## Role split across opsx:ship phases

Follow the `opsx:ship` phase pipeline (branch safety → propose → verify artifacts → apply →
verify implementation → PR → archive → cleanup). The split:

| Phase | Who |
|---|---|
| Branch safety, propose, verify artifacts | Orchestrator |
| **Apply (implementation tasks)** | **Implementer sub-agents (cheap model)** |
| Review gate per task/batch | Orchestrator |
| Verify implementation, PR, review fixes | Orchestrator dispatches; reviews everything |
| Merge, archive, cleanup | Orchestrator |

## Model tiering

- Default implementer: `model: "sonnet"`.
- Escalate a single dispatch to `model: "opus"` when the task involves: replication/offline
  internals, RLS/auth, payment flows, tricky state machines, or a task that already failed
  two review rounds on sonnet.
- Never dispatch migrations blind — after an implementer writes a migration, run the
  `migration-auditor` agent on it before your own review.

## Dispatch protocol

Group `tasks.md` items into coherent batches (one file-cluster or one requirement per
batch; independent batches may run as parallel agents). For each batch, dispatch an Agent
with a self-contained prompt containing:

1. Worktree absolute path and the exact task text from `tasks.md` (verbatim).
2. Pointers to the change artifacts (`proposal.md`, `design.md`, delta specs) and any
   `// INTENT:` constraints or `docs/INTENT.md` sections that apply.
3. Project rules the implementer must honor: TypeScript only, files <500 lines, replication
   layer never bypassed, shadcn/ui, tests required for new components/hooks/utils,
   assertion-first for value-sensitive bugs.
4. Explicit scope fence: "Change only what the task requires. Do not refactor
   opportunistically. Do not touch tasks.md, migrations, or deploy anything."
5. The required report format (below).

**Required report-back format** (tell the implementer its final message must contain
exactly this — it reports data to you, not prose to a user):

```
FILES: <paths touched>
APPROACH: <2-4 sentences>
TESTS: <commands run + pass/fail counts, verbatim tail of output>
TYPECHECK: <pass/fail>
CONCERNS: <anything ambiguous, skipped, or smelly — "none" is acceptable only if true>
```

## Review gate (per batch)

Do not trust the report — verify. For each returned batch:

1. `git diff` the touched files yourself. Read the actual code, not the summary.
2. Checklist — all must pass before checking off tasks in `tasks.md`:
   - [ ] Diff does only what the task says (no scope creep, no drive-by refactors)
   - [ ] Matches the design/spec deltas, not just the task title
   - [ ] `// INTENT:` comments and role feeling (docs/INTENT.md) preserved
   - [ ] No new surface duplicating an existing page (consolidation rule)
   - [ ] Tests exist for new logic and the reported test run is plausible — re-run the
         focused tests yourself if anything is value-sensitive
   - [ ] `pnpm typecheck` clean (run it; don't trust the report on the final batch)
   - [ ] No direct Supabase reads where replication is required; no files pushed over 500 lines
3. If it fails: send the same agent (SendMessage, keeps its context) a numbered list of
   defects and re-review. **Max 3 rounds per batch** — after that, either escalate the
   dispatch to opus with a rewritten prompt, or implement that batch yourself. Don't loop
   a cheap model past the point where doing it yourself is cheaper.
4. Only the orchestrator updates `tasks.md` checkboxes — a checkbox means *reviewed and
   accepted*, not *implementer says done*.
5. Commit a checkpoint after each accepted batch.

## Finishing

Resume `opsx:ship` phases 4+ as the orchestrator: run `opsx:verify`, fix CRITICAL findings
(small fixes yourself; substantial ones re-dispatched), then PR / review / merge / archive /
cleanup per the pipeline. All Auto Mode shared-system gates (db push, deploys, merges)
remain yours and still require the usual confirmation.

### Second-opinion fallback

The PR phase's Codex second opinion (per CLAUDE.md) can fail on quota or CLI errors. Do not
skip the second opinion — substitute a Claude one: dispatch a fresh `model: "opus"` sub-agent
with no implementation context, prompted adversarially ("find reasons this diff is wrong;
review against the PR ref, not the working tree") plus the review-gate checklist above.
This loses cross-model diversity but keeps fresh-context independence, which is most of the
value. Note in the PR body that the second opinion was Claude-substituted.

## Final report

The `opsx:ship` final report, plus orchestration stats: batches dispatched, model per
batch, review rounds per batch, and anything you ended up implementing yourself (that's a
signal to improve future dispatch prompts).
