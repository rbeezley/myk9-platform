---
name: role-journey-ux-audit
description: Runs an audit-only, persona-driven browser walk of one myK9Show role across requested viewports, safely exercises major paths, verifies recent fixes, and tracks findings across runs. Use for exhibitor, secretary, judge, club-admin, site-admin, steward, or public journey audits, especially elderly-novice usability reviews and scheduled role walks.
---

# Role Journey UX Audit

Use `quality-finding-lifecycle` for findings. Reuse `UX-Audit` for usability methodology,
`audit-pages` for the current route inventory, and the browser-control skill available in the
session. This skill never fixes source during the walk.

## Inputs

Establish the role, persona, requested viewports, required CRUD/actions, recent-PR window, safe
mutation boundary, and report destination from the calling prompt. Default persona is an elderly,
nontechnical first-time user. If viewports are unspecified, fully walk mobile and desktop, then use
tablet as a responsive-difference pass.

For a judge or `/at-show` walk, registry is an input dimension: walk one show per registry (AKC, UKC,
ASCA; a show never mixes them) and open a scoresheet in each, including a trial with a blank trial
type and a show cloned from one. The AKC class-name fallback hides a missing trial type, so an
AKC-only walk cannot catch it (MYK9-1574).

Fixtures must not be too clean (MYK9-1768). For a steward, judge, or secretary walk, also use: a
dog entered in both sections of a combined A/B class, a multi-day show with a trial that is not
today, and, for AskQ, a club-appointed (club-scoped) secretary, never a show-scoped fixture. Single-section
classes and a trial dated today hide the 2026-11-08 owner-test escapes.

Example invocation: “Use `role-journey-ux-audit` for the secretary role on desktop and tablet,
including safe show and entry CRUD.”

## Preflight

1. Read `AGENTS.md`, `docs/INTENT.md`, the role's route inventory, relevant tests, prior role
   reports/memory, current findings/Linear issues, and current main. Query Linear with
   `includeArchived: true` — Done issues auto-archive off the free tier's active set, and this
   audit's whole premise is that closed findings recur (`docs/agents/issue-tracker.md` § Querying).
   If `audit-pages` lacks the role (including steward) or an `/at-show` surface, derive coverage
   from the current router and role E2E specs; list the resulting routes and any uncertainty.
2. Start the documented dev server only if needed; record whether the run used current main.
3. Resolve the requested role through the exported `TEST_USERS` entry in
   `apps/myk9show/src/test/e2e/helpers/testUsers.ts` and its documented private environment
   variables. For a secretary walk, use `TEST_USERS.SECRETARY`, which resolves
   `E2E_SECRETARY_EMAIL` and `E2E_SECRETARY_PASSWORD` (including the helper's canonical fallback)
   rather than copying an address into the audit prompt. Never print, log, or copy resolved
   credential values into commands, reports, screenshots, or automation memory.
4. Export the private app environment without echoing it, then run the existing executable preflight
   for the requested role before opening the browser. For a secretary walk, run
   `pnpm exec tsx scripts/verify-e2e-auth-preflight.ts secretary` from `apps/myk9show`; do not
   reproduce its credential resolution in audit prose or shell arguments.
5. If the helper resolves no password, rejects an unsupported override, or the real sign-in fails,
   record an `environment coverage gap` naming the missing variable or failed preflight without
   exposing its value. Do not substitute another identity, recreate an account, rotate credentials,
   or diagnose the product flow from that failed authentication.
6. Follow the real two-step sign-in flow. Verify the active role and scope after authentication.

The canonical admin account can carry both site-admin and club-admin capabilities. Never use global
site-admin access as proof of club-admin authorization or isolation. Mark contaminated checks
`blocked` and name the single-role fixture required.

## Walk

For every major route and requested viewport:

1. State the persona's goal and expected next action.
2. Attempt the path with browser control; capture evidence for serious findings.
3. Verify the action and persisted state rather than trusting a toast or navigation.
4. Probe loading, empty, error, retry, cancellation, interruption, and recovery states.
5. Check focus, keyboard/touch operation, target size, readability, labels, jargon, feedback,
   destructive-action clarity, responsive reflow, and whether the user knows scope and next step.
6. Search for the existing surface before recommending UI. Prefer consolidation or deep links over
   duplicated workflows.
7. Walk one record the persona does NOT own — a show or club they hold no grant in, reached by URL
   from Find Shows or the People directory. Every staff control offered there is a finding: the
   server's predicates are club-scoped, so it will refuse what the client offered. Steps 1-6 walk
   the persona's own data and cannot surface this class on their own.
8. Never-synced offline (MYK9-1520): go offline, then cold-reload `/at-show/<X>` and one of its
   class pages, in both states a device can be in. (a) The show is saved but its classes and
   entries never synced: every list must say it is not on this device ("Classes not on this
   device yet", "Entries are not on this device") with a way to retry; "No classes" or "No
   Entries Yet" is a finding. (b) Nothing about the show is saved: the whole page must say
   "This show isn't saved on this device"; the lists never mount, so do not look for list
   copy there. Assert the expected text is visible before trusting any absence. Steps 1-6 run
   online with the show already saved, so they cannot surface this class.
9. Steward/judge on `/at-show` and secretary on the Check-in desk, as a person who does not know
   which part of the card to tap (MYK9-1768). Drive by what a novice would touch (the dog's name, the
   card body), not by accessible name or test id.
   a. Status looks tappable at rest (MYK9-1763). At 375px, before tapping anything, screenshot an
   entry list and record whether the check-in control reads as a control (border, fill, chevron)
   distinct from the card body. Persona check: "where would a first-time steward tap to change
   check-in?"
   b. Mis-tap recovery (MYK9-1762). Tap a dog's name, then Cancel on the scoresheet without scoring.
   Assert the dog is back in the running order with its previous check-in, not "In ring" with
   Resume, and that the Show Map does not show it in the ring (MYK9-1761).
   c. Pull visibility on a combined A/B list (MYK9-1764). With a dog entered in both sections, pull
   one section's entry. Assert the screen makes obvious which entry was pulled and where it went,
   and that the "Not running" group looks expandable.
   d. Desk on a multi-day show (MYK9-1765). On a show with a trial that is not today, open the
   Check-in desk and set Conflict and Pulled on that trial's entry. Expected (owner decision):
   allowed, and the row names its day.
10. AskQ golden questions (MYK9-1774/1775/1776). For each role's guide (exhibitor, judge/steward, club
    admin, secretary) ask one money question and one how-to question, from a show page, signed in as
    the real role (a club-appointed secretary, not a show-scoped fixture). Check that the answer:
    names only the show's registry and never asks which; follows the guide's path (exhibitor: My
    Shows → Leave class… → Pull; refund is club-discretion, entry fee only, service fee never
    refunded); never offers another role's action (e.g. "Remove entry" to an exhibitor); states no
    deadline or amount absent from the guide or the show's data; shows no Markdown syntax (`#`,
    `**`, `---`); and shows a verified guide excerpt. Record the required and forbidden phrases per
    question in the walk notes.
11. Print geometry (MYK9-1771/1772). For each printable report (armband and result labels on each
    template, judge setup cheat sheet, other report pages), print-preview under Chrome Margins:
    Default AND None, and compare the first row/header's top and left inset with the real sheet
    geometry (Avery 18262 has a 0.83 in unlabeled top strip). Never assume Chrome honors `@page`
    margins; Chrome remembers the last Margins choice across reports. Hermetic specs for this land
    with the MYK9-1771/1772 PRs: point at them, do not duplicate them.

Exercise required CRUD without approval only against an isolated local Supabase fixture or through
an established non-persisting interception: `scripts/qa/readonly-walk.ts` (`installReadOnlyGuard`
refuses every write, `answerLocally` answers a draft save in the browser, `cutOffBackend` before
any scoring tap). Every write to hosted/shared Supabase—including seeded
or disposable rows—requires explicit approval. Never delete shared fixtures or mutate real
permissions, ownership, payouts, payment accounts, production data, or other consequential state
without explicit approval. Use read-only verification or mark the path blocked when approval is
absent.

## Recent changes

Inspect relevant PRs merged during the requested window and re-walk affected behavior. Record each
as `verified`, `failed`, `blocked`, or `not applicable` with browser evidence; tests alone are not
browser verification.

## Findings and report

Report only browser-reproduced product behavior as confirmed. Treat locator mistakes as walk errors,
intentional behavior documented by `docs/INTENT.md` or `// INTENT:` as non-findings, and environment
failures separately. One issue across viewports is one lifecycle finding with a viewport matrix.

Return an executive role-confidence assessment; scope, viewports, role validity, records/actions;
finding counts and transitions; ordered findings; consolidation observations; recent-PR results;
Linear drafts awaiting approval; top improvements; blocked coverage; and next proof. Scheduled runs
write the compact lifecycle ledger to automation memory. Write a repository report only when the
calling prompt explicitly requests one.

## Escaped bugs

When a finding is a bug an earlier walk or spec should have caught, apply "Escaped bugs" in
`docs/agents/issue-tracker.md`: the finding or Linear draft carries the `verifier gap:` line and
names where the class-level check belongs (a new step in **Walk**, a wider viewport/role matrix in
**Inputs**, or the area spec per `docs/qa/e2e-suite-map.md`). The fix PR makes that change; the
audit only records it.

## Boundaries

- Audit only: no source edits, fixes, plans, OpenSpec changes, commits, or PRs.
- Request one batch approval before any Linear create/update/close.
- Close browser contexts and stop only a dev server started by this run.
- Use `qa-feature` instead when the request is to reproduce and fix a known bug end-to-end.
