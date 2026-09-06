# Scheduled Audits — Claude Code Tasks

> **Status:** Reference

Version-controlled prompts for the Claude Code scheduled tasks that run alongside the Codex
scheduled-task set. Edit here first, then push the change into the scheduler with
`update_scheduled_task` — never edit only in the scheduler UI, or the two drift and no one can
diff them. Each task's stored prompt names this file as its source of truth.

Live task definitions are under `~/.claude/scheduled-tasks/<taskId>/SKILL.md` (not in this repo).

**The parity contract is mechanical.** An installed `SKILL.md` is the fenced prompt block below, byte
for byte, with a YAML frontmatter block (`name` / `description`) prepended — nothing else differs.
Everything a run needs, including its `Working directory:` line, lives inside the fenced block, so
there is no "explained difference" left to argue about. Verify with:

```bash
pnpm qa:prompt-parity
```

It covers the three tasks here and the three walks in
[`scheduled-task-walks.md`](scheduled-task-walks.md). It is local-only — the installed files are
machine-local, never reach CI, and the check reports `SKIPPED` per task on a machine without them.
Its tests do run in CI, and they pin the rule this contract exists for: **no prompt may state the
live or dark state of another automation as a fact.** MYK9-408 shipped a daily-review prompt
asserting the Codex stream was "paused for token budget" months after it resumed, and telling the run
to assume Codex had not run; MYK9-391 pointed a walk at a login fixture that had been deleted. A
premise that can go stale does not belong in a prompt — the boundary row already tells a run what is
uncovered.

## Two kinds of task here

The Codex set has 13 nightly tasks. Duplicating all of them doubles finding intake without adding
triage throughput, and for deterministic checks (migration drift, coverage, commit review,
performance regression, capacity rehearsal) a second model produces either the same answer or a
wrong one that now needs arbitration.

So the tasks below fall into two categories, and the distinction decides how each is scheduled:

**Complements (tasks 1–2) run alongside Codex.** Claude runs where a second model's _judgment_
diverges usefully — security and role UX — plus one reconciliation task whose entire job is
comparing the two models' output. A finding both models flag is high-confidence; a finding only one
flags is where the signal is. That comparison only works if both write into the same ledger with a
source tag. These are deliberately at a _different cadence_ from their Codex counterparts.

**Substitutes (task 3) replace Codex.** When the Codex budget runs out, a stream stops entirely.
A substitute is a deliberate clone — same cadence, same scope, same window — enabled only while its
Codex counterpart is dark, and disabled again when it returns. Differentiating a substitute would
defeat it: the point is continuity of the _same_ coverage, not a second opinion. The two must never
run concurrently; see "Failover discipline" below.

## Shared contract — applies to all three tasks

Every prompt below inherits these rules. They are repeated inside each prompt so the tasks stay
self-contained when pasted into a scheduler.

- **Audit-only, with one exception.** Never edit source, never open a PR, never merge. The single
  repo write permitted is committing and pushing the task's **own report** (plus the boundary or
  findings ledger where the prompt names one) — docs-only, direct to `main`, inside the carve-out in
  CLAUDE.md § Auto Mode. Verify the commit's filelist before pushing.
- **Source tag.** Every finding carries `source: claude` so `claude-findings-reconcile` can
  distinguish it from Codex findings.
- **A blocked check is a coverage gap, not a pass.** Say so explicitly.
- **Never emit credentials, tokens, PII, or connection strings** into a report or Linear issue.

### Findings go to Linear — and there is no approval gate

Linear is the sink for every finding. These runs are **unattended**, so a "prepare drafts and
request one batch approval" step means nothing is ever filed and the finding dies with the
worktree. That was the actual behaviour until 2026-09-01. File directly instead.

- **Every confirmed P0/P1 product defect gets its own Linear issue** (team **MyK9-platform**),
  filed without asking. Labels: `p0`/`p1`, `source:claude`, and the task's own tag.
- **P2/P3 become sub-issues of ONE parent per run**, titled `<Task> <YYYY-MM-DD> — P2/P3 findings`.
  One row on the board, each child still individually linkable and closable. This is what keeps
  "one inbox" from becoming a firehose: the constraint is your triage attention, not storage.
- **These are NOT issues:** coverage gaps, harness or probe bugs, and corrections to your own
  measurement. They belong in the report body. MYK9-275 and MYK9-281 were both probe bugs filed as
  defects — each cost a triage slot and pointed the next run at an app problem that did not exist.
- **Deduplicate before filing, always with `includeArchived: true`.** Match on workflow, route,
  object and symptom — never on title. Auto-archive is still on as a team setting, so a default
  query reads shipped work as never-seen and re-files it. If an issue already exists, comment on it
  rather than opening a second one.
- **A failed Linear write is a reportable failure, never a silent skip.** If filing fails, put the
  finding's full text at the top of the report and say plainly that it is unfiled, so it is
  recoverable from the committed doc alone.

**If Team Triage gets enabled** (it is not configured on `MyK9-platform` as of 2026-09-01), file
into Triage instead of straight onto the board. That restores an approval seam without blocking an
unattended run — you accept or decline asynchronously, from a phone, and nothing reaches the main
board until you do. Update this contract in the same pass if that happens.

## Schedule

**These do not run like the Codex tasks.** Codex scheduled tasks execute server-side and fire at
their stated time regardless of what your machine is doing. Claude Code scheduled tasks run
**locally, and only while the desktop app is open**. If the app is closed when a task comes due, it
does not skip — it fires on next launch.

That single difference undermines the obvious design. An overnight time only works if the machine
is awake with the app running overnight; otherwise all three queue up and fire in a clump the next
morning, possibly concurrently, which is exactly the staging-load collision the stagger was meant
to prevent.

So treat the times below as an **ordering preference, not a guarantee**, and pick times you are
plausibly at the keyboard for rather than times that are merely quiet.

| Task                         | Cadence          | Time (local) | Rationale                                          |
| ---------------------------- | ---------------- | ------------ | -------------------------------------------------- |
| `claude-findings-reconcile`  | Weekly, Thursday | 6:00 AM      | Must land before Codex's Friday 6:00 AM review     |
| `claude-security-audit`      | Weekly, Saturday | 3:00 AM      | Clear of Codex judge-ux-walk (Sat 12:15 AM)        |
| `claude-daily-commit-review` | Daily            | 7:00 AM      | Substitute — mirrors the Codex daily commit review |

Only the first row's timing is load-bearing: `claude-findings-reconcile` must run _before_ the
Codex "Weekly quality findings review" so that review consumes an already-reconciled, deduplicated
picture instead of two competing scorecards. If a launch-day clump reorders things, this is the one
to re-run manually in the right order. The other one only needs to not collide with a Codex job
touching the same staging surface.

The scheduler adds a few minutes of deterministic jitter at dispatch, so actual fire times land
slightly after the stated minute. Harmless here — it widens the gap from the Codex jobs.

### Pausing and unpausing

`create_scheduled_task` has no `enabled` flag, so creating a task paused is two steps: create it
with its `cronExpression`, then `update_scheduled_task` with `enabled: false`. Creating it as
"ad-hoc" instead (omitting the cron entirely) also prevents automatic runs, but throws away the
schedule — prefer create-then-disable so unpausing is a single toggle.

Use the owning schedulers for current enablement: Claude `list_scheduled_tasks` and
the Codex automation view. This document does not track live scheduler state.
The 2026-09-05 owner decision was to disable `claude-daily-commit-review`, preserving
Codex as the daily-review owner (MYK9-408). Do not repeat or reverse that decision
without a new owner instruction; verify current state before a manual handoff.

### Failover discipline (task 3)

`claude-daily-commit-review` is a substitute, not a complement. Two rules:

1. **Never enabled at the same time as the Codex daily commit review.** Both stamp the same
   `daily-commit-review` row in `docs/qa/audit-boundary.md`, and concurrent runs over the same range
   mint competing IDs for one defect. Enable Claude only after confirming Codex is dark; disable it
   before Codex resumes.
2. **The handoff is manual and lossy.** Nothing detects that the Codex budget ran out — you notice a
   missing report and flip the switch, so a gap day is likely. That is acceptable for a backup, but
   the gap must be _reported_, not silently absorbed: the boundary cursor makes the uncovered range
   visible, and the first Claude run names it.

The cursor is what makes the handoff work in either direction. Both automations read the row to
compute their window and stamp it on exit, so whichever one runs next resumes the other's thread
instead of starting a private one. The Codex daily prompt needs the matching read/stamp step added
on its side — the cursor only works if both ends honor it.

### Before unpausing: pre-approve the tools

Tool approvals are stored on the task after a run and auto-applied to later runs. Until then a run
will stall on a permission prompt at 3 AM with no one watching. `claude-security-audit` needs
Supabase MCP. (`role-intent-walk`, which needs browser control, moved to
[`scheduled-task-walks.md`](scheduled-task-walks.md) — the same pre-approval rule applies to it.)

Run each task manually once, while watching, before enabling it. That grants the approvals and
doubles as a check that the prompt produces the report you actually want.

---

## Task 1 — `claude-security-audit`

**Cadence:** Weekly, Saturday 3:00 AM.

**Why weekly, not daily:** Codex already runs a daily security audit. A second daily run mostly
re-reports the same standing state. Weekly gives an independent full-surface read at a cadence
where divergence is meaningful rather than noisy.

```
Run a full-surface security audit of the myK9 platform.

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

Use the `security-audit` skill in full mode (`--full`) and the `quality-finding-lifecycle` skill for all finding handling. Start from a clean checkout of `main`; record the baseline SHA in the report.

Scope — cover every category in the security-audit checklist, and give extra weight to the traps this repo has actually hit:

1. RLS policies and table-level GRANTs on every table added or altered in the last 7 days.
2. Column-level ACLs, not just table ACLs. Verify against the applied database via `pg_class.relacl` AND `pg_attribute.attacl` — a correct-looking migration file is not proof, and `information_schema.role_table_grants` returns empty over MCP so it cannot prove absence.
3. PostgREST embedded relations. A table reachable only via `table(col,...)` or `table!inner(...)` still needs table-level SELECT for the embedding role; revoking it turns a null embed into a hard 42501 that fails the whole request. Grep for embeds, not just `.from('table')`.
4. Anon exposure. This project carries ALTER DEFAULT PRIVILEGES granting anon full CRUD on every newly created public table — omitting a GRANT does NOT keep anon out. Any new table without an explicit REVOKE is a finding.
5. Edge function authorization. Functions deploy with `--no-verify-jwt` and handle auth internally, so every function must be checked for its own auth gate.
6. RBAC gaps between roles that can manage a show and roles that only appear at one — judge and steward are not in `can_manage_show`.
7. Stripe: webhook signature verification, key handling, and refund/transfer paths.

Verification rules:
- Verify against the applied staging database (project ref sojmvhhwsjxmfistvzbe), not migration text.
- Verify anon behavior in a cold, unauthenticated session — a logged-in probe proves nothing about the anon surface.
- Do not run anything destructive. Read-only queries only. Use rolled-back transactions if a write is needed to prove an authz claim.

Output:
- Write the report to `docs/security-audit-YYYY-MM-DD.md` using the security-audit report format.
- Tag every finding `source: claude` and assign canonical P0-P3 severity from `docs/goals/fall-2026-launch-readiness-scorecard.md`, preserving the source label separately.
- Compare against the previous Claude security report in `docs/` and mark each finding new / unchanged / resolved. A merge is not resolution — require the stated exploit-path or SQL replay before marking resolved.
- Append the compact lifecycle ledger to automation memory.
- **File findings to Linear directly — there is no approval step.** This run is unattended; a "prepare drafts and request batch approval" gate means nothing is ever filed and the finding dies with the worktree. Every confirmed non-duplicate P0/P1 gets its own issue (team **MyK9-platform**), labelled `p0`/`p1`, `source:claude`, `audit:security`. Group P2/P3 as sub-issues of ONE parent titled `Security audit <YYYY-MM-DD> — P2/P3 findings`.
- **Dedupe before filing, always with `includeArchived: true`** — match on table/route/symptom, never on title. Auto-archive is on as a team setting, so a default query reads shipped work as never-seen and re-files it. If an issue exists, comment on it instead of opening a second.
- **Do NOT file coverage gaps or probe/harness bugs as issues.** They go in the report body. A probe bug filed as a defect costs a triage slot and points the next run at a problem that does not exist.
- **A failed Linear write is a reportable failure, never a silent skip.** Put the finding's full text at the top of the report and say plainly that it is unfiled.
- **Commit the report and push it to `main`.** Docs-only, inside the direct-to-`main` carve-out in CLAUDE.md § Auto Mode. Verify the commit's filelist contains only the report file before pushing. A report left in the worktree is lost when the worktree is removed.
- Never emit credentials, tokens, PII, or connection strings into the report or a Linear issue.

Do not edit source. Do not open a PR. Do not merge. The report file is the only repo write this task may make.

Prompt source of truth: docs/operations/scheduled-audits-claude.md — edit there first, then update this task.
```


## Task 2 — `claude-findings-reconcile`

**Cadence:** Weekly, Thursday 6:00 AM — the day before the Codex Friday consolidation.

**This task finds nothing new.** If it produces a novel finding, it has exceeded its scope. Its
only job is to turn two models' independent output into one ranked, deduplicated, confidence-scored
picture — and to catch findings that were marked fixed but were never actually proven.

```
Reconcile this week's audit output from BOTH Claude and Codex scheduled tasks into a single picture.

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

Do not perform any new audit. Do not go looking for new bugs. If you find yourself investigating a fresh issue, stop and note it as a one-line pointer instead.

Use the `quality-finding-lifecycle` skill and the `launch-readiness-triage` skill.

Inputs — read everything produced or modified in the last 7 days:
- `docs/qa/findings.md` and `docs/qa/quality-scorecard.md`
- `docs/audits/` reports dated in the window
- `docs/security-audit-*.md` and `docs/security-review-*.md` in the window
- automation memory ledgers from every scheduled task, Claude and Codex
- open Linear issues in team MyK9-platform
- `git log main` for the window, to check what actually merged

Produce four sections:

1. AGREEMENTS — findings both models independently reported. Deduplicate by workflow, route, object, files, symptom, and reproduction, NOT by title; the two models will word the same defect differently. Mark these high-confidence and rank them first. One underlying defect across multiple roles or viewports is ONE finding with a coverage matrix, not several.

2. DISAGREEMENTS — where the two models materially differ. This is the highest-value section. Cover: findings only one model reported; the same finding given different severities; and cases where one model called something resolved and the other still sees it. For each, say which reading you believe and cite the evidence that decides it. Where the evidence does not decide it, say so and name the specific proof that would.

3. FALSE CLOSURES — findings marked fixed or resolved whose closure proof never actually ran, or whose "proof" was only that a PR merged. A merge is not resolution. Roughly a quarter of this project's open todos have historically already shipped, and the inverse error is just as common, so check both directions: closed-but-not-fixed and open-but-already-shipped. Verify the fix site in `main` by grep rather than trusting a branch diff.

4. SCORECARD DELTA — reconcile the merged picture against `docs/goals/fall-2026-launch-readiness-scorecard.md`. Report P0/P1/P2/P3 counts, what moved this week, and what is now blocking launch. Call out any launch gate with no evidence behind it at all — the checklist has historically been missing load and backup/DR gates entirely, so verify gate coverage rather than assuming the gate list is complete.

Output:
- Write the report to `docs/qa/reconcile-YYYY-MM-DD.md`.
- Update `docs/qa/findings.md` in place: merge duplicate rows into their canonical ID, correct statuses that section 3 disproved, and preserve registry status values (`open`, `in-progress`, `fixed`, `deferred`) — do not overwrite them with lifecycle transition labels.
- End with a ranked "top 5 to fix next" list with a one-line justification each, so the Friday Codex consolidation starts from a decision rather than a pile.
- Append the compact lifecycle ledger to automation memory.
- **File to Linear directly — no approval step.** For each P0/P1 that section 2 promoted to high-confidence and that has no existing issue (checked with `includeArchived: true`), open an issue in team **MyK9-platform** labelled `p0`/`p1`, `source:claude`, `audit:reconcile`.
- **Where section 3 disproved a closure, REOPEN the existing issue** with the disproving evidence — do not file a new one. A false closure and a new defect are different events and must not collapse into the same row.
- **Commit and push `docs/qa/reconcile-YYYY-MM-DD.md` plus your `docs/qa/findings.md` edits to `main`.** Docs-only, per CLAUDE.md § Auto Mode; verify the filelist.
- Never emit credentials, tokens, or PII into the report.

Do not edit source outside `docs/`. Do not open a PR. Do not merge.

Prompt source of truth: docs/operations/scheduled-audits-claude.md — edit there first, then update this task.
```

## Task 3 — `claude-daily-commit-review` (failover)

**Cadence:** Daily, 7:00 AM. **Paused unless the Codex daily commit review is dark.**

**Why this one is a clone, not a differentiated view:** tasks 1–2 exist to disagree with Codex. This
one exists to _be_ Codex for a few days. Narrowing its scope to "what Claude sees differently" would
leave the ordinary regression coverage — the actual reason the stream exists — unrun during exactly
the window it is meant to protect. Same window, same scope, same output shape.

Four things differ from the Codex prompt, all mechanical: it reads `CLAUDE.md` rather than
`AGENTS.md`; it reads and stamps the shared boundary cursor instead of relying on private memory; it
runs in its own worktree; and it files findings to Linear without an approval step, because a
scheduled run is non-interactive and there is nobody to approve anything at 7 AM.

```
Review the commits merged into myk9-platform since the last recorded review boundary.

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

You provide manual failover for the daily commit-review stream. Check coverage before choosing the review window; do not assume whether another reviewer has run. Produce the ordinary regression review of uncovered commits, not a second opinion of an already reviewed range.

Read the boundary row, its stamp commit and matching report. Verify the report's reviewed range and coverage count against git rev-list for that range. A boundary-only stamp without a matching report does not prove coverage: report the evidence gap rather than silently accepting it or restamping the range. If no commits remain uncovered, report that fact without a duplicate stamp.

Work in a dedicated git worktree off a clean checkout of `main`, never the primary checkout.

Window: read the `daily-commit-review` row in `docs/qa/audit-boundary.md`. Start from `Last reviewed SHA` (exclusive) through current `main`. If the row is `unset`, review the previous 24 hours and say so. If there is a gap between that row's window end and the start of your window, report it as a coverage gap — do not silently absorb it.

Use the `quality-finding-lifecycle` skill as the authoritative finding contract. Follow CLAUDE.md (not AGENTS.md — this is the Claude-side task), including reading `docs/INTENT.md` before any UX-facing review and verifying actual TypeScript schemas and interfaces instead of guessing.

Identify bugs, regressions, security issues, broken tests, missing high-risk tests, and UX or product-intent violations introduced by those commits.

Before reporting a candidate, read the complete relevant implementation and check subsequent commits, merged PRs, current `main`, `docs/qa/findings.md`, this automation's prior memory, and Linear for an existing fix or duplicate. Exclude already-fixed candidates and reference existing findings or Linear issues instead of creating duplicates. Run focused verification when practical. Treat test, harness, environment, and inconclusive failures separately from confirmed product defects.

Assign every finding a stable ID, reusing an existing QA or Linear ID when available; otherwise `NCR-YYYY-MM-DD-NN`. Record the full evidence record the lifecycle skill requires: status (new, unchanged, resolved, duplicate, rejected, blocked), canonical P0-P3 severity from `docs/goals/fall-2026-launch-readiness-scorecard.md` with the source label kept separately, first/last seen, consecutive-run count, baseline SHA, affected role/workflow, exact file and line references, reproduction or proof, user impact, confidence, and the proof required for closure. Tag every finding `source: claude`.

Never mark a finding resolved from a code change alone — a merge is not resolution; require passing focused proof. Promote the same confirmed finding after two consecutive runs instead of repeatedly presenting it as new.

Output:
- Report only unresolved or newly resolved items, grouped by canonical severity. If nothing remains, say so clearly.
- Include counts for new, unchanged, resolved, duplicate, rejected, and blocked findings; fixes found in subsequent commits; existing QA/Linear references; Linear drafts prepared; checks run; baseline SHA; window covered; and verification limits.
- For each confirmed non-duplicate P0/P1 finding, write the full record — problem statement, evidence, expected vs. actual, impact, likely root cause, recommended approach, acceptance criteria, required proof, and relevant commits/PRs/files/related issues — and **FILE it directly as a Linear issue** (team **MyK9-platform**), labelled `p0`/`p1`, `source:claude`, `audit:commit-review`. This run is non-interactive and nobody is available to approve a batch at 7 AM; an approval gate here means nothing is ever filed. Dedupe with `includeArchived: true`.
- Group P2/P3 as sub-issues of ONE parent titled `Commit review <YYYY-MM-DD> — P2/P3 findings`, unless a finding is recurring or worsening, in which case promote it to its own issue.
- **Do NOT file harness, environment, or inconclusive failures as defects** — they are already tracked separately above and belong in the report body.
- **A failed Linear write is a reportable failure, never a silent skip.**
- Stamp the `daily-commit-review` row in `docs/qa/audit-boundary.md` with the newest commit you actually reviewed, the window end, `claude-daily-commit-review`, and the run date. Stamp it even on a clean run that reviewed commits; an empty uncovered window creates no duplicate stamp. Do not stamp a range you did not finish.
- Append the compact lifecycle ledger to automation memory so the next run — Claude or Codex — can compare state.

A skipped, blocked, or contaminated check is a coverage gap, not a pass. Never emit credentials, tokens, PII, or connection strings into the report or a Linear draft.

Do not modify application code. Do not open a PR. Do not merge. Commit and push the report and the `docs/qa/audit-boundary.md` row to `main` (docs-only, per CLAUDE.md § Auto Mode; verify the commit's filelist contains nothing else) — those two files are the only repo writes this task may make.

Prompt source of truth: docs/operations/scheduled-audits-claude.md — edit there first, then update this task.
```

## Maintenance

- The Linear contract above is shared with three tasks documented separately, in
  [`scheduled-task-walks.md`](scheduled-task-walks.md) — `secretary-task-walk`, `exhibitor-task-walk`
  and `role-intent-walk`. They are walks with no Codex counterpart, so the complement/substitute
  taxonomy above does not apply to them. Changing the contract means editing it here, in that file,
  and in all six live `SKILL.md` files, or they drift — run `pnpm qa:prompt-parity` afterwards, which
  is the only thing that will tell you a live file was missed.
- `claude-role-ux-walk` was **retired on 2026-09-01** and is no longer in this file. Its five-role
  rotation duplicated the two roles that now have dedicated weekly walks while starving the three
  that have none, and its "second opinion to a paired Codex walk" premise died when the Codex stream
  was paused. It was replaced by `role-intent-walk` (judge / club-admin / site-admin), documented in
  `scheduled-task-walks.md`.
- `branch-janitor` is deliberately exempt: its "suspected dead, confirm to delete" output is a
  confirm-list, not a defect, and has no issue shape. Do not route it to Linear.
- When a Codex task changes scope, revisit whether the Claude counterpart still adds a differing
  view or has become redundant. Redundant tasks should be deleted, not left running.
- A substitute must track the task it substitutes for. When the Codex daily commit review changes
  scope, update task 3 in the same pass — a stale clone is worse than no backup, because it reports
  coverage it is no longer providing. If that Codex stream is retired outright, delete task 3 rather
  than leaving an orphan backup for a stream that no longer exists.
- If `claude-findings-reconcile` reports agreements approaching 100% for several weeks, the two
  models have converged and one of the paired tasks can be retired.
- If the reconcile report is consistently the only one anyone reads, that is the signal to cut
  detection cadence further rather than add more.
- Two older tasks predate the Codex set and are superseded by it —
  `overnight-proactive-qa-from-main` and `nightly-commit-review`, both manual-only and unrun since
  2026-06-08. Delete them rather than leaving them in the list implying coverage they no longer
  provide.
