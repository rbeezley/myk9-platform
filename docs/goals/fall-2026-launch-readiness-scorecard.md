# Fall 2026 Launch Readiness Scorecard

## Purpose

This scorecard defines what "ready for fall launch" means for myK9.

It turns the long-term goal into observable criteria, evidence, and follow-up work. `OPEN-TODOS.md` remains the task backlog; this document is the measurement frame for deciding what belongs in that backlog and what should be prioritized next.

## Launch Scope

### Must Be Polished

- Secretary experience
- Exhibitor experience
- Scent-sport workflows for AKC Scent Work, UKC Nose Work, and ASCA Scent Detection

### Must Be Functional

- Site admin experience for the platform owner
- User/account troubleshooting
- Show visibility and operational oversight

### May Be Bare-Bones For Fall

- Judge experience
- Steward experience
- Non-scent sports
- Advanced analytics and post-fall optimization features

## Launch-Ready Definition

myK9 is launch-ready when:

- a secretary can run a real scent-work show end-to-end without developer help
- an exhibitor can find, enter, pay for, receive updates, check in, and view results without getting stuck
- core show-day flows work offline or degrade safely
- reports and forms required for scoped scent workflows are printable and verified
- no P0 or P1 launch blockers remain open
- 2-3 real non-technical users complete the primary journeys unassisted
- `main` stays deployable with relevant tests, typecheck, and smoke checks passing

## Scoring Model

Each dimension receives one status:

| Status | Meaning |
| --- | --- |
| Green | Ready for launch. Evidence exists, and no P0/P1 gaps remain. |
| Yellow | Usable, but has P2 gaps, unverified assumptions, or limited test evidence. |
| Red | Not launch-ready. Blocks a golden path, risks data loss, or requires developer intervention. |
| Unknown | Not measured yet. Treat as Yellow until evidence proves otherwise. |

Launch requires:

- all Primary dimensions Green
- no Red dimensions
- no open P0/P1 issues
- real-user testing completed with no confusion-level findings outstanding

## Severity Definitions

| Severity | Definition | Launch Impact |
| --- | --- | --- |
| P0 | Data loss, security exposure, payment failure, score/result corruption, or show-day outage | Blocks launch |
| P1 | Golden-path task cannot be completed without developer help or brittle workaround | Blocks launch |
| P2 | Important friction, confusion, missing state, poor recovery, or incomplete verification | Launch risk; must be explicitly accepted |
| P3 | Polish, copy, speed, convenience, or post-launch enhancement | Does not block launch |

## Primary Scorecard

| Dimension | Ready Means | Evidence | Status |
| --- | --- | --- | --- |
| Secretary golden path | A secretary can create/configure a show, manage entries, run show day, score classes, print/export results, and close out without dead ends. | Browser walkthrough with realistic show data; focused tests for changed flows; real-user test. | **Green** (gated on real-user test, Lane 1.7) — Post-remediation re-walk passed. Setup → entry management → reports → results control → submit results walked against the Heartland seed (docs [`02`](../audits/2026-06-ux-journeys/02-secretary-journey.md)/[`04`](../audits/2026-06-ux-journeys/04-secretary-rewalk-2026-06-17.md)/[`05`](../audits/2026-06-ux-journeys/05-showday-walk-2026-06-17.md)); Lane 1.5 time-to-task re-measure 2026-06-18 ([`SUMMARY.md`](../audits/2026-06-ux-journeys/SUMMARY.md#phase-6--time-to-task-re-measure-lane-15)). **All three documented Green-blockers resolved:** F1 role grants codified (`seed-demo.sql` §10, [#804](https://github.com/rbeezley/myk9-platform/pull/804); verified live — `secretary@myk9t.com` → `/secretary/dashboard`), F2 over-count fixed (pending count **3** not 7, verified live), F3 move-up picker constrained ([#808](https://github.com/rbeezley/myk9-platform/pull/808), verified live). Pull/no-show, move-up, announcement (2 clicks compose / 3–4 send), check-in (1 click), armband labels (F5), Submit Results (F4-XML plain-English summary + Send-to-AKC gated). No P0/P1 on the secretary path; ringside (judge/steward S1–S3) tracked under Show-day reliability. |
| Exhibitor golden path | An exhibitor can find a show, enter a dog, pay, receive updates, understand show-day status, and view results. | Browser walkthrough; payment/entry test data; real-user test. | **Green** (gated on real-user test, Lane 1.7) — Post-remediation re-walk passed (steps 1–8). 2026-06-15: find→enter→pay (P1-01 class seed; [#767](https://github.com/rbeezley/myk9-platform/pull/767)/[#768](https://github.com/rbeezley/myk9-platform/pull/768)). 2026-06-16: confirmation/status surface coherent. **All three residuals-for-Green cleared:** Finding A placement on My Entries ([#775](https://github.com/rbeezley/myk9-platform/pull/775)/[#776](https://github.com/rbeezley/myk9-platform/pull/776); verified live 2026-06-18 — Q + "1st" PlacementPill + 38.5s on the hub card), Finding B public class-results staleness + anon over-broad read ([#779](https://github.com/rbeezley/myk9-platform/pull/779) + mig `20260616120000`), P1-04 refund/withdrawn cross-role agreement (live two-context PASS 2026-06-18 — "Withdrawn · Refunded $30" across all surfaces, [#800](https://github.com/rbeezley/myk9-platform/pull/800)). Lane 1.5 re-measure 2026-06-18 ([`SUMMARY.md`](../audits/2026-06-ux-journeys/SUMMARY.md#phase-6--time-to-task-re-measure-lane-15)): entry dead end gone (UX-P1-01), own result now 0-click on the hub, UX-P2-04/P2-05 verified. No P0/P1; residuals are P3/UX-Low (P1-04w-1/w-2). At-show ring-status/dogs-ahead tracked under Show-day reliability. |
| Show-day reliability | Scoring, class status, run order, check-in, scratches, move-ups, late entries, announcements, and wrap-up work under real show pressure. | End-to-end show-day rehearsal; targeted regression tests; no P0/P1 show-day bugs. | Yellow — Show-day walk 2026-06-17 ([`05-showday-walk`](../audits/2026-06-ux-journeys/05-showday-walk-2026-06-17.md)): **secretary half coherent** (status, scratches/pull, move-ups, announcements walked). S1 public-results deep-link fixed + S2/S3 ringside (judge assignment / passcode) seeds added ([#819](https://github.com/rbeezley/myk9-platform/pull/819)). **Gaps:** ringside judge/steward phases not yet fully re-walked end-to-end; S4 (withdrawn entry counted live: 9 vs 8 / "2/3 complete") + S5 (Saturday trial badge contradiction) open minor findings; no full offline/reconnect show-day rehearsal yet. |
| Offline-first behavior | Core ringside and secretary workflows either work offline or fail with clear recovery. No lost scores, duplicate placements, or silent sync failures. | Offline/reconnect tests; replication queue inspection; staging rehearsal. | Yellow — Strong code+test evidence: replication-core extracted with direct tests (Wave C — mutation ordering, queue capacity, localStorage backup, OCC empty-update, conflict row-state), replication-conflict mutation baseline 77.24% ([`plan-dynamic-qa-infrastructure.md`](../archive/plan-dynamic-qa-infrastructure.md)), failed-mutation persistence + synchronous backup hardened (pre-launch audit). **Gap:** no live offline→reconnect staging rehearsal of the full ringside/secretary loop yet (the remaining Lane 1 live cross-role latency walk, deferred pending a read strategy). |
| Data correctness | Entries, dogs, people, payments, scores, placements, reports, and submissions remain consistent across apps and sync boundaries. | Unit/integration tests; SQL spot checks; staging fixture audit. | Yellow — Mutation testing on the money/scoring math: cart fee 87.50%, placement 85.67%, ScoreValidator 68.81% ([`plan-dynamic-qa-infrastructure.md`](../archive/plan-dynamic-qa-infrastructure.md) Phase 2); placement-completion trigger verified live (Lane 1.5 — exhibitor 1st/2nd Q ranked correctly); Nationals vs Regular ranking discriminator fixed ([#758](https://github.com/rbeezley/myk9-platform/pull/758)/[#760](https://github.com/rbeezley/myk9-platform/pull/760)); class-section NULL→"A" data bug fixed ([#822](https://github.com/rbeezley/myk9-platform/pull/822)). **Gap:** ScoreValidator survivors documented; no broad cross-app staging fixture reconciliation audit yet. |
| Reports and official forms | Required AKC/UKC/ASCA scent-work reports/forms print correctly on representative hardware. | Report fixture tests; PDF/form verification; venue printer test. | Yellow — Reports render in-app and were exercised live 2026-06-18 (Check-in Sheet preview auto-renders; full report inventory with human labels — F5; Armband Labels, Score Sheet, Results Sheet, etc.). Submit Results electronic-submission (AKC XML) gated + previewable (F4-XML). **Gap:** "Print testing on venue hardware" still OPEN in `OPEN-TODOS.md` (label printer + laser margin/scaling) — not yet verified on representative hardware. |
| UX clarity | Non-technical users know what to do next, can recover from mistakes, and do not need developer explanation. | Silent task-based user testing; confusion log; resolved P1/P2 UX findings. | Yellow — UX Journey Audit complete (recon + exhibitor + secretary + seams + synthesis, docs [`00`–`05`](../audits/2026-06-ux-journeys/) + [`SUMMARY.md`](../audits/2026-06-ux-journeys/SUMMARY.md)): all 23 findings remediated as link/tighten/repair (no new surfaces), gate APPROVED, Phase 6 time-to-task re-measure shows numbers moved with no regression. **Gap:** the actual silent task-based real-user testing + confusion log is **Lane 1.7** (not yet run) — this is the dimension's primary missing evidence. |
| Operational readiness | Deploys, migrations, environment config, monitoring, rollback, and support paths are documented enough for launch. | Deployment checklist; migration history; staging smoke; support/runbook docs. | Yellow — Error observability live in production (Sentry SDK + PII scrubber + role-surface boundaries, [#723](https://github.com/rbeezley/myk9-platform/pull/723); end-to-end verified); launch-milestone QA checklist codified ([`launch-milestone-qa-checklist.md`](../launch-milestone-qa-checklist.md)); monthly dependency-audit cron; migration lineage tracked. July 11 lineage and FORCE-RLS remediation are merged, with SA-021 live-verified; health observability is live with the external Sentry route still operator-gated; SA-023/028/030 merged in #1285 pending runtime evidence; SA-024 merged in #1286 pending Edge/runtime evidence; SA-025 merged in #1287 pending migration/Edge deployment and runtime evidence; and SA-029 has aligned-secret and rollout evidence with repository review/merge/deployment still pending. **Gaps:** Stripe go-live runbook + treasurer onboarding guide open (Lane 4); CI-gated Vercel deploys + E2E-blocking not yet enabled (Lane 3); rollback path not yet rehearsed. |
| Admin minimum | The platform owner can manage users, inspect shows, troubleshoot access, and recover from common operational issues. | Admin walkthrough; role/RLS checks; support scenarios. | Green (gated on live spot-check) — **Code+docs walkthrough done 2026-06-25** against the lighter bar (available **or** documented). All 5 capabilities clear it: (1) shows/users + (2) access/role fixes are full in-app SITE_ADMIN surfaces (`/admin/dashboard`, `/admin/users`, `/admin/permissions/*`, `/admin/role-requests`); (3) payments/sync in-app (`/admin/payouts`, `/admin/sync`) with failed-charge detail documented to the Stripe dashboard; (4) app health/support documented in [`docs/operations/`](../operations/) + `/admin/health`/`/admin/support`; (5) soft-delete restore in-app (`/admin/deleted-items`, SECURITY DEFINER RPCs / #790). The two SQL-only gaps — **user impersonation** (no UI; scaffolding only) and **arbitrary field repair** — are **explicitly accepted for fall** and documented in the new [`admin-support-runbook.md`](../operations/admin-support-runbook.md). **Residual:** a live happy-path click-through is still recommended but is blocked on a working SITE_ADMIN staging login (the named `admin@myk9t.com` account has no auth row). |
| Test and CI health | Relevant tests pass consistently, `main` is deployable, and known flaky/hanging tests are documented. | `pnpm typecheck`; focused unit/e2e tests; CI status; known-issues list. | **Green** — Dynamic QA Phase 7 final regression green on a clean worktree (typecheck ✅, lint ✅, packages 11/11, app suite ~927 files / ~9061 tests, 0 fail); test-isolation campaign complete and `--sequence.shuffle` enabled in CI ([#749](https://github.com/rbeezley/myk9-platform/pull/749)/[#752](https://github.com/rbeezley/myk9-platform/pull/752)/[#755](https://github.com/rbeezley/myk9-platform/pull/755)/[#761](https://github.com/rbeezley/myk9-platform/pull/761), 18-seed sweep SHUFFLE-CLEAN); bundle-budget + a11y-smoke CI gates ([#738](https://github.com/rbeezley/myk9-platform/pull/738)/[#750](https://github.com/rbeezley/myk9-platform/pull/750), A11y smoke now a required check); code-quality ratchet baselines. Known watch-item: ~30 wall-clock perf asserts (reactive only). |

## Golden Path Criteria

### Secretary

Ready when a secretary can:

1. Create or open a show.
2. Configure club, registry, trials, classes, rings, judges, and run order.
3. Publish or share entry information.
4. Manage entries, dogs, people, payments, waitlist, scratches, move-ups, and day-of additions.
5. Use the show workbench to understand what needs attention.
6. Print required sheets, labels, and official forms.
7. Run check-in and ring operations.
8. Enter or receive scores.
9. Confirm placements and class completion.
10. Produce results, reports, and closeout artifacts.
11. Recover safely from offline/reconnect conditions.

Pass threshold:

- no dead ends
- no duplicate/conflicting implementations for the same task
- no developer-only recovery steps
- no unexplained destructive actions
- no P0/P1 findings

### Exhibitor

Ready when an exhibitor can:

1. Find an eligible show.
2. Understand whether the show is right for their dog.
3. Enter a dog in the right classes.
4. Pay or understand payment status.
5. Receive confirmation and show-day updates.
6. Know where/when to appear.
7. Understand check-in, scratches, move-ups, and results.
8. View results after the show.

Pass threshold:

- no unclear payment or entry state
- no missing confirmation/recovery path
- no dead-end navigation
- no P0/P1 findings

### Admin

Ready when the platform owner can:

1. See active shows and users.
2. Resolve common access and role problems.
3. Inspect failed payments, messages, submissions, or sync issues.
4. Confirm migrations/deployments are healthy.
5. Escalate or manually repair launch-critical data issues.

Pass threshold:

- core support actions are available or documented
- no privileged action depends on ad hoc database spelunking unless explicitly accepted for fall

## Evidence Requirements

Each Green score should link to at least one of:

- PR that fixed or verified the area
- test command and passing result
- plan or audit document
- staging walkthrough notes
- real-user testing notes
- screenshot/video artifact
- SQL verification note
- print test note

If evidence does not exist, the status should remain Yellow or Unknown.

## Measurement Cadence

### Weekly

- Review each scorecard dimension.
- Promote verified Green items.
- Convert Red/Yellow gaps into `OPEN-TODOS.md` tasks.
- Pick the next highest-impact launch-readiness slice.

### Monthly

- Re-walk secretary and exhibitor golden paths.
- Review P0/P1/P2 counts.
- Confirm the backlog still maps to launch readiness.
- Update this scorecard if the launch scope changes.

### Pre-Launch

- Run a full show-day rehearsal with realistic data.
- Complete real-user testing with 2-3 non-technical users.
- Verify print workflows on representative venue hardware.
- Confirm no P0/P1 issues remain.
- Confirm migration/deployment/support runbooks are current.

## How Gaps Become Tasks

When a readiness check fails:

1. Record the failed criterion.
2. Assign severity.
3. Add or update an `OPEN-TODOS.md` item.
4. Link to any existing plan or create a focused plan if the work is non-trivial.
5. Implement in a small PR.
6. Update this scorecard only after verification evidence exists.

Template:

```md
- [ ] **[P1] Secretary cannot complete <workflow>** — Readiness gap from `docs/goals/fall-2026-launch-readiness-scorecard.md`. Expected: <launch criterion>. Actual: <observed failure>. Evidence: <link/log/screenshot>. Plan: <doc or needed>.
```

## Suggested North Star Metric

For fall launch readiness:

```text
Weekly successful golden-path rehearsals completed without P0/P1 findings.
```

Supporting measures:

- P0/P1 open issue count
- Secretary golden-path completion rate
- Exhibitor golden-path completion rate
- Offline/reconnect scoring success rate
- Required report/form print success rate
- Real-user task completion without assistance
- Number of Yellow/Unknown scorecard dimensions remaining

## Scorecard Close-Out — 2026-06-18 (Lane 1.6)

> Historical close-out snapshot. Use the 2026-07-10 reconciliation below and the Go-Live
> Runbook for current launch sequencing; do not treat this June status narrative as a current
> sign-off.

Post-remediation status after the Lane 1.5 time-to-task re-measure:

| Status | Dimensions |
| --- | --- |
| **Green** | Secretary golden path*, Exhibitor golden path*, Test and CI health, Admin minimum† |
| **Yellow** | Show-day reliability, Offline-first behavior, Data correctness, Reports and official forms, UX clarity, Operational readiness |
| **Unknown** | _(none)_ |
| **Red** | _(none)_ |

*Both golden paths are Green on walkthrough + audit evidence with no open P0/P1; they remain
**gated on real-user testing (Lane 1.7)** before the overall launch gate ("real-user testing
completed with no confusion-level findings") can close.

†Admin minimum is Green on a **code+docs walkthrough** (2026-06-25) against its lighter bar, with the
two SQL-only gaps accepted for fall + documented in [`admin-support-runbook.md`](../operations/admin-support-runbook.md);
a live happy-path spot-check is still recommended, blocked only on a working SITE_ADMIN staging login.

**No Red dimensions, no Unknown dimensions, and no open P0/P1.** The launch gate (all Primary Green +
no Red + no P0/P1 + real-user testing done) is **not yet met** — the remaining work is the Yellow gaps,
all already tracked in `OPEN-TODOS.md` / the lane plan. The single biggest remaining launch gate is
**real-user testing (Lane 1.7)**, which also supplies the missing UX-clarity evidence.

### Next steps (in launch order)

**Real-user testing is deferred to the final pre-launch gate** (decision 2026-06-18) so users test a
near-final product — see [`plan-launch-execution-lanes.md`](../plan-launch-execution-lanes.md#final-pre-launch-gate-runs-last--after-lanes-24--launch-affecting-lane-5).
The golden-path rows stay Green-gated-on-real-user-test until then.

1. Close the Yellow gaps via the lanes: Secretary Operational UX (Lane 2), Pre-Launch Hardening
   (Lane 3 — `--success` token, E2E stability/blocking, CI-deploys, judge directory), Payments
   Go-Live (Lane 4), Architecture/Data (Lane 5).
2. ~~Run the **Admin** functional walkthrough (QA-Program step 4) to clear the last Unknown~~ — **DONE
   2026-06-25** (code+docs walk; row now Green†). Optional fast-follow: a live happy-path spot-check
   once a SITE_ADMIN staging login exists.
3. **Final gate — real-user testing** (2–3 non-technical users): closes the overall launch criterion
   + the UX-clarity dimension. Run after #1.

## Current Reconciliation — 2026-07-10

The scorecard statuses above remain evidence-based, not forecasts. The launch gate is still open:
six Primary dimensions are Yellow, and the June close-out predated current launch remediation.

Before human testing, complete or explicitly accept the remaining agent-owned work tracked in
`OPEN-TODOS.md`: exhibitor entry-state and touch-target fixes, the remaining
`exhibitor-elderly-ux-remediation` tasks, `ux-contrast-token-system`, and the code/CI close-out
of the current exhibitor and secretary UX changes. Also merge and deploy
`security-audit-remediation` (SA-018–023, SA-026, SA-027).

The final evidence pass must additionally reconcile cross-app data correctness and operational
readiness; the earlier Phase 4 checklist did not explicitly cover those two Yellow rows. The
canonical current sequence and evidence slots are in
[`docs/operations/go-live-runbook.md`](../operations/go-live-runbook.md) and
[`docs/operations/go-live-phase-4-evidence-checklist.md`](../operations/go-live-phase-4-evidence-checklist.md).
