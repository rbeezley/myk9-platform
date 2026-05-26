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
| Secretary golden path | A secretary can create/configure a show, manage entries, run show day, score classes, print/export results, and close out without dead ends. | Browser walkthrough with realistic show data; focused tests for changed flows; real-user test. | Unknown |
| Exhibitor golden path | An exhibitor can find a show, enter a dog, pay, receive updates, understand show-day status, and view results. | Browser walkthrough; payment/entry test data; real-user test. | Unknown |
| Show-day reliability | Scoring, class status, run order, check-in, scratches, move-ups, late entries, announcements, and wrap-up work under real show pressure. | End-to-end show-day rehearsal; targeted regression tests; no P0/P1 show-day bugs. | Unknown |
| Offline-first behavior | Core ringside and secretary workflows either work offline or fail with clear recovery. No lost scores, duplicate placements, or silent sync failures. | Offline/reconnect tests; replication queue inspection; staging rehearsal. | Unknown |
| Data correctness | Entries, dogs, people, payments, scores, placements, reports, and submissions remain consistent across apps and sync boundaries. | Unit/integration tests; SQL spot checks; staging fixture audit. | Unknown |
| Reports and official forms | Required AKC/UKC/ASCA scent-work reports/forms print correctly on representative hardware. | Report fixture tests; PDF/form verification; venue printer test. | Unknown |
| UX clarity | Non-technical users know what to do next, can recover from mistakes, and do not need developer explanation. | Silent task-based user testing; confusion log; resolved P1/P2 UX findings. | Unknown |
| Operational readiness | Deploys, migrations, environment config, monitoring, rollback, and support paths are documented enough for launch. | Deployment checklist; migration history; staging smoke; support/runbook docs. | Unknown |
| Admin minimum | The platform owner can manage users, inspect shows, troubleshoot access, and recover from common operational issues. | Admin walkthrough; role/RLS checks; support scenarios. | Unknown |
| Test and CI health | Relevant tests pass consistently, `main` is deployable, and known flaky/hanging tests are documented. | `pnpm typecheck`; focused unit/e2e tests; CI status; known-issues list. | Unknown |

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

## Current Next Step

Run a first scorecard audit:

1. Start with Secretary golden path.
2. Walk the current app with realistic scent-work show data.
3. Mark each scorecard dimension Green, Yellow, Red, or Unknown.
4. Convert the top Red/Yellow findings into `OPEN-TODOS.md`.
5. Use the fall 2026 launch-readiness goal to prioritize the next PR.
