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

Example invocation: “Use `role-journey-ux-audit` for the secretary role on desktop and tablet,
including safe show and entry CRUD.”

## Preflight

1. Read `AGENTS.md`, `docs/INTENT.md`, the role's route inventory, relevant tests, prior role
   reports/memory, current findings/Linear issues, and current main.
   If `audit-pages` lacks the role (including steward) or an `/at-show` surface, derive coverage
   from the current router and role E2E specs; list the resulting routes and any uncertainty.
2. Start the documented dev server only if needed; record whether the run used current main.
3. Resolve credentials from `apps/myk9show/src/test/e2e/helpers/testUsers.ts` and `.env.local`.
   Never print credentials and never use legacy `*@myk9t.com` fixtures as login accounts.
4. Follow the real two-step sign-in flow. Verify the active role and scope after authentication.

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

Exercise required CRUD without approval only against an isolated local Supabase fixture or through
an established non-persisting interception. Every write to hosted/shared Supabase—including seeded
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

## Boundaries

- Audit only: no source edits, fixes, plans, OpenSpec changes, commits, or PRs.
- Request one batch approval before any Linear create/update/close.
- Close browser contexts and stop only a dev server started by this run.
- Use `qa-feature` instead when the request is to reproduce and fix a known bug end-to-end.
