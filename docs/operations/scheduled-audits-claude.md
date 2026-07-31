# Scheduled Audits — Claude Code Tasks

> **Status:** Reference

Version-controlled prompts for the Claude Code scheduled tasks that run alongside the Codex
scheduled-task set. Edit here first, then push the change into the scheduler with
`update_scheduled_task` — never edit only in the scheduler UI, or the two drift and no one can
diff them. Each task's stored prompt names this file as its source of truth.

Live task definitions are under `~/.claude/scheduled-tasks/<taskId>/SKILL.md` (not in this repo).

## Two kinds of task here

The Codex set has 13 nightly tasks. Duplicating all of them doubles finding intake without adding
triage throughput, and for deterministic checks (migration drift, coverage, commit review,
performance regression, capacity rehearsal) a second model produces either the same answer or a
wrong one that now needs arbitration.

So the tasks below fall into two categories, and the distinction decides how each is scheduled:

**Complements (tasks 1–3) run alongside Codex.** Claude runs where a second model's *judgment*
diverges usefully — security and role UX — plus one reconciliation task whose entire job is
comparing the two models' output. A finding both models flag is high-confidence; a finding only one
flags is where the signal is. That comparison only works if both write into the same ledger with a
source tag. These are deliberately at a *different cadence* from their Codex counterparts.

**Substitutes (task 4) replace Codex.** When the Codex budget runs out, a stream stops entirely.
A substitute is a deliberate clone — same cadence, same scope, same window — enabled only while its
Codex counterpart is dark, and disabled again when it returns. Differentiating a substitute would
defeat it: the point is continuity of the *same* coverage, not a second opinion. The two must never
run concurrently; see "Failover discipline" below.

## Shared contract — applies to all four tasks

Every prompt below inherits these rules. They are repeated inside each prompt so the tasks stay
self-contained when pasted into a scheduler.

- **Audit-only.** Never edit source, never open a PR, never merge, never push. Report only.
- **Source tag.** Every finding carries `source: claude` so `claude-findings-reconcile` can
  distinguish it from Codex findings.
- **No Linear writes without approval.** `quality-finding-lifecycle` already gates this — prepare
  drafts, request one batch approval, and preserve unapproved drafts in the report.
- **Deduplicate before creating.** Reconcile against `docs/qa/findings.md`, prior reports, and open
  Linear issues by workflow/route/symptom, not title.
- **A blocked check is a coverage gap, not a pass.** Say so explicitly.
- **Never emit credentials, tokens, PII, or connection strings** into a report or Linear draft.

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

| Task                          | Cadence          | Time (local) | Rationale                                        |
| ----------------------------- | ---------------- | ------------ | ------------------------------------------------ |
| `claude-findings-reconcile`   | Weekly, Thursday | 6:00 AM      | Must land before Codex's Friday 6:00 AM review    |
| `claude-security-audit`       | Weekly, Saturday | 3:00 AM      | Clear of Codex judge-ux-walk (Sat 12:15 AM)       |
| `claude-role-ux-walk`         | Weekly, Sunday   | 3:00 AM      | Clear of Codex club-admin-ux-walk (Sun 12:15 AM)  |
| `claude-daily-commit-review`  | Daily            | 7:00 AM      | Substitute — mirrors the Codex daily commit review |

Only the first row's timing is load-bearing: `claude-findings-reconcile` must run *before* the
Codex "Weekly quality findings review" so that review consumes an already-reconciled, deduplicated
picture instead of two competing scorecards. If a launch-day clump reorders things, this is the one
to re-run manually in the right order. The other two only need to not collide with a Codex job
touching the same staging surface.

The scheduler adds a few minutes of deterministic jitter at dispatch, so actual fire times land
slightly after the stated minute. Harmless here — it widens the gap from the Codex jobs.

### Pausing and unpausing

`create_scheduled_task` has no `enabled` flag, so creating a task paused is two steps: create it
with its `cronExpression`, then `update_scheduled_task` with `enabled: false`. Creating it as
"ad-hoc" instead (omitting the cron entirely) also prevents automatic runs, but throws away the
schedule — prefer create-then-disable so unpausing is a single toggle.

All four tasks are currently **paused** — tasks 1–3 for token cost, task 4 because a substitute is
paused by definition until its Codex counterpart goes dark.

### Failover discipline (task 4)

`claude-daily-commit-review` is a substitute, not a complement. Two rules:

1. **Never enabled at the same time as the Codex daily commit review.** Both stamp the same
   `daily-commit-review` row in `docs/qa/audit-boundary.md`, and concurrent runs over the same range
   mint competing IDs for one defect. Enable Claude only after confirming Codex is dark; disable it
   before Codex resumes.
2. **The handoff is manual and lossy.** Nothing detects that the Codex budget ran out — you notice a
   missing report and flip the switch, so a gap day is likely. That is acceptable for a backup, but
   the gap must be *reported*, not silently absorbed: the boundary cursor makes the uncovered range
   visible, and the first Claude run names it.

The cursor is what makes the handoff work in either direction. Both automations read the row to
compute their window and stamp it on exit, so whichever one runs next resumes the other's thread
instead of starting a private one. The Codex daily prompt needs the matching read/stamp step added
on its side — the cursor only works if both ends honor it.

### Before unpausing: pre-approve the tools

Tool approvals are stored on the task after a run and auto-applied to later runs. Until then a run
will stall on a permission prompt at 3 AM with no one watching. `claude-security-audit` needs
Supabase MCP; `claude-role-ux-walk` needs browser control.

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

Use the `security-audit` skill in full mode (`--full`) and the `quality-finding-lifecycle` skill
for all finding handling. Start from a clean checkout of `main`; record the baseline SHA in the
report.

Scope — cover every category in the security-audit checklist, and give extra weight to the traps
this repo has actually hit:

1. RLS policies and table-level GRANTs on every table added or altered in the last 7 days.
2. Column-level ACLs, not just table ACLs. Verify against the applied database via
   `pg_class.relacl` AND `pg_attribute.attacl` — a correct-looking migration file is not proof, and
   `information_schema.role_table_grants` returns empty over MCP so it cannot prove absence.
3. PostgREST embedded relations. A table reachable only via `table(col,...)` or `table!inner(...)`
   still needs table-level SELECT for the embedding role; revoking it turns a null embed into a
   hard 42501 that fails the whole request. Grep for embeds, not just `.from('table')`.
4. Anon exposure. This project carries ALTER DEFAULT PRIVILEGES granting anon full CRUD on every
   newly created public table — omitting a GRANT does NOT keep anon out. Any new table without an
   explicit REVOKE is a finding.
5. Edge function authorization. Functions deploy with `--no-verify-jwt` and handle auth internally,
   so every function must be checked for its own auth gate.
6. RBAC gaps between roles that can manage a show and roles that only appear at one — judge and
   steward are not in `can_manage_show`.
7. Stripe: webhook signature verification, key handling, and refund/transfer paths.

Verification rules:
- Verify against the applied staging database, not migration text.
- Verify anon behavior in a cold, unauthenticated session — a logged-in probe proves nothing about
  the anon surface.
- Do not run anything destructive. Read-only queries only. Use rolled-back transactions if a write
  is needed to prove an authz claim.

Output:
- Write the report to `docs/security-audit-YYYY-MM-DD.md` using the security-audit report format.
- Tag every finding `source: claude` and assign canonical P0-P3 severity from
  `docs/goals/fall-2026-launch-readiness-scorecard.md`, preserving the source label separately.
- Compare against the previous Claude security report in `docs/` and mark each finding
  new / unchanged / resolved. A merge is not resolution — require the stated exploit-path or SQL
  replay before marking resolved.
- Append the compact lifecycle ledger to automation memory.
- Prepare Linear drafts for confirmed non-duplicate P0/P1 findings and request one batch approval.
  Do not create, update, or close any Linear issue without that approval.

Do not edit source. Do not open a PR. Do not merge or push anything.
```

## Task 2 — `claude-role-ux-walk`

**Cadence:** Weekly, Sunday 3:00 AM. Rotates through five roles.

**Rotation without state:** the role is derived from the ISO week number so the task needs no
persistent pointer and no scheduler-side state to drift. Over ~2.5 weeks each role gets one Codex
walk and one Claude walk, which is the comparison you want — not two walks of the same role in the
same week.

```
Run a persona-driven UX walk of ONE myK9Show role in a real browser.

Pick the role deterministically from the current ISO week number:
  week mod 5 == 0 → exhibitor
  week mod 5 == 1 → secretary
  week mod 5 == 2 → judge
  week mod 5 == 3 → club-admin
  week mod 5 == 4 → site-admin
State the computed week number and chosen role at the top of the report so the rotation is
auditable.

Use the `role-journey-ux-audit` skill, which pulls in `UX-Audit` for methodology, `audit-pages` for
the route inventory, and `quality-finding-lifecycle` for findings.

Before walking, read `docs/INTENT.md` and establish the target feeling for this role. A finding is
not just "this is broken" — it is also "this is technically fine but it does not feel the way
INTENT.md says it should for this role." Codex's walk will not have this framing; that difference
is the point of running a second one.

Persona: elderly, nontechnical, first-time user unless INTENT.md says otherwise for this role.
Viewports: fully walk mobile and desktop, then use tablet as a responsive-difference pass.

Also hold this phase constraint while judging: the project is pre-launch, consolidating rather than
expanding. Per CLAUDE.md, a duplicated surface is a finding and a missing link between two existing
surfaces is a better fix than a new affordance. Do NOT recommend new pages, sheets, or dialogs
where a deep-link with pre-applied filters into an existing surface would do. If you propose a new
surface anyway, you must answer explicitly: "Does this duplicate an existing page? If so, why is
duplication justified instead of a link?"

Safe mutation boundary: use the seeded e2e accounts (`e2e-*@test.myk9.com`; the `*@myk9t.com`
named accounts cannot log in). Create and edit demo records freely, but do not delete other
records, do not touch payment or payout flows, and do not run anything against production.

Also verify: re-walk any finding from this role's last two walks (Claude or Codex) that is marked
fixed, and confirm the fix actually holds in the browser.

Output:
- Write the report to `docs/audits/YYYY-MM-DD-<role>-ux-walk-claude.md`.
- Tag every finding `source: claude`, assign canonical P0-P3 severity, and mark each
  new / unchanged / resolved against prior runs.
- Include a coverage matrix of routes walked vs. routes skipped. A skipped route is a coverage gap,
  not a pass.
- Append the compact lifecycle ledger to automation memory.
- Prepare Linear drafts for confirmed non-duplicate P0/P1 findings and request one batch approval.

This skill never fixes source during the walk. Audit only — no edits, no PR, no merge, no push.
```

## Task 3 — `claude-findings-reconcile`

**Cadence:** Weekly, Thursday 6:00 AM — the day before the Codex Friday consolidation.

**This task finds nothing new.** If it produces a novel finding, it has exceeded its scope. Its
only job is to turn two models' independent output into one ranked, deduplicated, confidence-scored
picture — and to catch findings that were marked fixed but were never actually proven.

```
Reconcile this week's audit output from BOTH Claude and Codex scheduled tasks into a single
picture. Do not perform any new audit. Do not go looking for new bugs. If you find yourself
investigating a fresh issue, stop and note it as a one-line pointer instead.

Use the `quality-finding-lifecycle` skill and the `launch-readiness-triage` skill.

Inputs — read everything produced or modified in the last 7 days:
- `docs/qa/findings.md` and `docs/qa/quality-scorecard.md`
- `docs/audits/` reports dated in the window
- `docs/security-audit-*.md` and `docs/security-review-*.md` in the window
- automation memory ledgers from every scheduled task, Claude and Codex
- open Linear issues in team MyK9-platform
- `git log main` for the window, to check what actually merged

Produce four sections:

1. AGREEMENTS — findings both models independently reported. Deduplicate by workflow, route,
   object, files, symptom, and reproduction, NOT by title; the two models will word the same defect
   differently. Mark these high-confidence and rank them first. One underlying defect across
   multiple roles or viewports is ONE finding with a coverage matrix, not several.

2. DISAGREEMENTS — where the two models materially differ. This is the highest-value section.
   Cover: findings only one model reported; the same finding given different severities; and cases
   where one model called something resolved and the other still sees it. For each, say which
   reading you believe and cite the evidence that decides it. Where the evidence does not decide
   it, say so and name the specific proof that would.

3. FALSE CLOSURES — findings marked fixed or resolved whose closure proof never actually ran, or
   whose "proof" was only that a PR merged. A merge is not resolution. Roughly a quarter of this
   project's open todos have historically already shipped, and the inverse error is just as common,
   so check both directions: closed-but-not-fixed and open-but-already-shipped. Verify the fix site
   in `main` by grep rather than trusting a branch diff.

4. SCORECARD DELTA — reconcile the merged picture against
   `docs/goals/fall-2026-launch-readiness-scorecard.md`. Report P0/P1/P2/P3 counts, what moved this
   week, and what is now blocking launch. Call out any launch gate with no evidence behind it at
   all — the checklist has historically been missing load and backup/DR gates entirely, so verify
   gate coverage rather than assuming the gate list is complete.

Output:
- Write the report to `docs/qa/reconcile-YYYY-MM-DD.md`.
- Update `docs/qa/findings.md` in place: merge duplicate rows into their canonical ID, correct
  statuses that section 3 disproved, and preserve registry status values (`open`, `in-progress`,
  `fixed`, `deferred`) — do not overwrite them with lifecycle transition labels.
- End with a ranked "top 5 to fix next" list with a one-line justification each, so Friday's Codex
  consolidation starts from a decision rather than a pile.
- Append the compact lifecycle ledger to automation memory.
- Prepare Linear drafts only for P0/P1 findings that section 2 promoted to high-confidence and that
  have no existing issue. Request one batch approval.

Do not edit source outside `docs/`. Do not open a PR. Do not merge or push.
```

## Task 4 — `claude-daily-commit-review` (failover)

**Cadence:** Daily, 7:00 AM. **Paused unless the Codex daily commit review is dark.**

**Why this one is a clone, not a differentiated view:** tasks 1–3 exist to disagree with Codex. This
one exists to *be* Codex for a few days. Narrowing its scope to "what Claude sees differently" would
leave the ordinary regression coverage — the actual reason the stream exists — unrun during exactly
the window it is meant to protect. Same window, same scope, same output shape.

Four things differ from the Codex prompt, all mechanical: it reads `CLAUDE.md` rather than
`AGENTS.md`; it reads and stamps the shared boundary cursor instead of relying on private memory; it
runs in its own worktree; and its Linear step is drafts-only, because a scheduled run is
non-interactive and there is nobody to give batch approval at 7 AM.

```
Review the commits merged into myk9-platform since the last recorded review boundary.

You are the FAILOVER for the Codex daily commit review. Assume Codex has not run. Produce the
ordinary regression review, not a second opinion — this is substitute coverage, not a differing view.

Work in a dedicated git worktree off a clean checkout of `main`, never the primary checkout.

Window: read the `daily-commit-review` row in `docs/qa/audit-boundary.md`. Start from
`Last reviewed SHA` (exclusive) through current `main`. If the row is `unset`, review the previous
24 hours and say so. If there is a gap between that row's window end and the start of your window,
report it as a coverage gap — do not silently absorb it.

Use the `quality-finding-lifecycle` skill as the authoritative finding contract. Follow CLAUDE.md
(not AGENTS.md — this is the Claude-side task), including reading `docs/INTENT.md` before any
UX-facing review and verifying actual TypeScript schemas and interfaces instead of guessing.

Identify bugs, regressions, security issues, broken tests, missing high-risk tests, and UX or
product-intent violations introduced by those commits.

Before reporting a candidate, read the complete relevant implementation and check subsequent
commits, merged PRs, current `main`, `docs/qa/findings.md`, this automation's prior memory, and
Linear for an existing fix or duplicate. Exclude already-fixed candidates and reference existing
findings or Linear issues instead of creating duplicates. Run focused verification when practical.
Treat test, harness, environment, and inconclusive failures separately from confirmed product
defects.

Assign every finding a stable ID, reusing an existing QA or Linear ID when available; otherwise
`NCR-YYYY-MM-DD-NN`. Record the full evidence record the lifecycle skill requires: status, canonical
P0-P3 severity from `docs/goals/fall-2026-launch-readiness-scorecard.md` with the source label kept
separately, first/last seen, consecutive-run count, baseline SHA, affected role/workflow, exact file
and line references, reproduction or proof, user impact, confidence, and the proof required for
closure. Tag every finding `source: claude`.

Never mark a finding resolved from a code change alone — a merge is not resolution; require passing
focused proof. Promote the same confirmed finding after two consecutive runs instead of repeatedly
presenting it as new.

Output:
- Report only unresolved or newly resolved items, grouped by canonical severity. If nothing remains,
  say so clearly.
- Include counts for new, unchanged, resolved, duplicate, rejected, and blocked findings; fixes
  found in subsequent commits; existing QA/Linear references; Linear drafts prepared; checks run;
  baseline SHA; window covered; and verification limits.
- Prepare Linear-ready drafts for confirmed non-duplicate P0/P1 findings — problem statement,
  evidence, expected vs. actual, impact, likely root cause, recommended approach, acceptance
  criteria, required proof, and relevant commits/PRs/files/related issues. This run is
  non-interactive, so batch approval is unavailable: preserve every draft in the report and memory
  and create nothing. Do not create, update, or close any Linear issue.
- Keep P2 and P3 findings report-only unless recurring or worsening.
- Stamp the `daily-commit-review` row in `docs/qa/audit-boundary.md` with the newest commit you
  actually reviewed, the window end, `claude-daily-commit-review`, and the run date. Stamp it even
  on a clean run. Do not stamp a range you did not finish.
- Append the compact lifecycle ledger to automation memory so the next run — Claude or Codex — can
  compare state.

Do not modify application code. Do not open a PR. Do not merge or push anything. The only file this
task may write outside its report is the boundary row in `docs/qa/audit-boundary.md`.
```

## Maintenance

- When a Codex task changes scope, revisit whether the Claude counterpart still adds a differing
  view or has become redundant. Redundant tasks should be deleted, not left running.
- A substitute must track the task it substitutes for. When the Codex daily commit review changes
  scope, update task 4 in the same pass — a stale clone is worse than no backup, because it reports
  coverage it is no longer providing. If that Codex stream is retired outright, delete task 4 rather
  than leaving an orphan backup for a stream that no longer exists.
- If `claude-findings-reconcile` reports agreements approaching 100% for several weeks, the two
  models have converged and one of the paired tasks can be retired.
- If the reconcile report is consistently the only one anyone reads, that is the signal to cut
  detection cadence further rather than add more.
- Two older tasks predate the Codex set and are superseded by it —
  `overnight-proactive-qa-from-main` and `nightly-commit-review`, both manual-only and unrun since
  2026-06-08. Delete them rather than leaving them in the list implying coverage they no longer
  provide.
