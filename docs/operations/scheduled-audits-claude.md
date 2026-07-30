# Scheduled Audits — Claude Code Tasks

> **Status:** Reference

Version-controlled prompts for the Claude Code scheduled tasks that run alongside the Codex
scheduled-task set. Edit here first, then push the change into the scheduler with
`update_scheduled_task` — never edit only in the scheduler UI, or the two drift and no one can
diff them. Each task's stored prompt names this file as its source of truth.

Live task definitions are under `~/.claude/scheduled-tasks/<taskId>/SKILL.md` (not in this repo).

## Why only three

The Codex set has 13 nightly tasks. Duplicating all of them doubles finding intake without adding
triage throughput, and for deterministic checks (migration drift, coverage, commit review,
performance regression, capacity rehearsal) a second model produces either the same answer or a
wrong one that now needs arbitration.

Claude runs only where a second model's *judgment* diverges usefully — security and role UX — plus
one reconciliation task whose entire job is comparing the two models' output. A finding both models
flag is high-confidence; a finding only one flags is where the signal is. That comparison only
works if both write into the same ledger with a source tag.

## Shared contract — applies to all three tasks

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

| Task                        | Cadence          | Time (local) | Rationale                                     |
| --------------------------- | ---------------- | ------------ | --------------------------------------------- |
| `claude-findings-reconcile` | Weekly, Thursday | 6:00 AM      | Must land before Codex's Friday 6:00 AM review |
| `claude-security-audit`     | Weekly, Saturday | 3:00 AM      | Clear of Codex judge-ux-walk (Sat 12:15 AM)    |
| `claude-role-ux-walk`       | Weekly, Sunday   | 3:00 AM      | Clear of Codex club-admin-ux-walk (Sun 12:15 AM) |

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

All three tasks are currently **paused**.

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

## Maintenance

- When a Codex task changes scope, revisit whether the Claude counterpart still adds a differing
  view or has become redundant. Redundant tasks should be deleted, not left running.
- If `claude-findings-reconcile` reports agreements approaching 100% for several weeks, the two
  models have converged and one of the paired tasks can be retired.
- If the reconcile report is consistently the only one anyone reads, that is the signal to cut
  detection cadence further rather than add more.
- Two older tasks predate the Codex set and are superseded by it —
  `overnight-proactive-qa-from-main` and `nightly-commit-review`, both manual-only and unrun since
  2026-06-08. Delete them rather than leaving them in the list implying coverage they no longer
  provide.
