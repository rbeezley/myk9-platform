# Exhibitor Elderly UX Outstanding Handoff

**Date:** 2026-07-07  
**Source PR:** [#1188](https://github.com/rbeezley/myk9-platform/pull/1188)  
**PR status:** Merged at 2026-07-07 12:11 UTC  
**OpenSpec change:** `openspec/changes/exhibitor-elderly-ux-remediation`  
**Primary plan:** `docs/plan-exhibitor-elderly-ux-remediation.md`

## What Shipped In PR #1188

- Closed public show entry paths now stop advertising normal entry after close.
- Direct closed-show registration URLs are blocked before dog/class selection.
- Post-close entry cards explain why normal edits are unavailable and route to the existing show-team message surface.
- Blank/invalid dog measurements no longer save or display as `NaN` or accidental zero.
- Onboarding completion now updates local profile state and redirects completed exhibitors to `/shows`.
- Onboarding no longer asks for unsaved address or notification preferences.
- Dogs setup is optional, and the empty Add Dog cancel path no longer leaves a blocking backdrop.
- `/onboarding` uses a quieter shell while preserving account access.
- Email/password sign-in copy now reads like account sign-in after email classification.

Verification recorded in the PR/plan:

- Focused closed-entry/dog-measurement Vitest: 14 files, 155 tests passed.
- Focused onboarding/account/header/sign-in/EditPanel Vitest: 9 files, 83 tests passed.
- `pnpm typecheck` passed.
- `pnpm openspec validate --changes exhibitor-elderly-ux-remediation` passed.

## Still Outstanding

### 1. Payment Confidence

OpenSpec tasks: `2.1` through `2.5`.

Need to:

- Identify the existing My Shows fee-summary and cart/payment data source for unpaid exhibitor balances.
- Add an amount-due section to My Payments using the same source.
- Link My Shows fee summaries to My Payments or the existing cart/checkout handoff with relevant context.
- Separate gross paid, refunds, and net paid in payment history.
- Add focused tests proving My Shows and My Payments display the same amount due and preserve the existing checkout handoff.

Important constraint: My Payments is the canonical payment-status surface. Do not build a new payment dashboard or duplicate checkout.

### 2. Exhibitor Show-Day Trust

OpenSpec tasks: `3.1` through `3.5`.

Need to:

- Inventory the current exhibitor show-day route, data source, and class/ringside empty states.
- Default exhibitor show-day navigation to the user's dogs today.
- Show entered dog, class, armband/confirmation, check-in state, and next action when available.
- Replace contradictory "No Entries Yet" states with running-order-not-posted guidance when owned entries exist.
- Keep full class/ringside lists secondary.
- Add focused tests for owned entries, empty running-order states, and secondary class-list access.

Important constraint: show-day persistent data must continue through established offline-first query/mutation paths. Do not add direct Supabase reads to core show-day flows.

### 3. Exhibitor Check-In Language

OpenSpec tasks: `4.1` through `4.5`.

Need to:

- Inventory current check-in status labels and role-specific render paths.
- Add a typed exhibitor label-to-internal-status mapping for:
  - "I am here"
  - "I am not there yet"
  - "I have a conflict - tell the secretary"
- Apply plain labels only to exhibitor-facing controls.
- Preserve staff operational labels for secretary, judge, and gate steward flows.
- Add focused mapping and role-specific label tests.

Important constraint: do not rename internal statuses globally.

### 4. Dog Profile Clarity

OpenSpec tasks still open: `5.3` through `5.7`.

Already done: measurement trust fixes `5.1` and `5.2`.

Need to:

- Group Edit Dog fields into "Basics" and "More details" within the existing dog profile surface.
- Add date-of-birth helper text and mixed-breed/registration guidance near relevant fields.
- Collapse premium dog tabs behind one "More for this dog" area.
- Remove duplicate registration add affordances that appear on the same surface.
- Add focused tests for grouping, helper text, registration guidance, and duplicate affordance removal.

Important constraint: do not create a separate simple dog editor.

### 5. Final Verification And Archive

OpenSpec tasks still open: `7.3` and `7.7`.

Need to:

- Run focused exhibitor Playwright/browser coverage when seed data supports it:
  - open show
  - closed show
  - existing show-day entry
  - amount due
  - elderly low-tech pass using visible labels only
- Keep the OpenSpec change active until the remaining remediation PRs are merged or explicitly deferred.
- Archive `exhibitor-elderly-ux-remediation` only after final required implementation PRs are merged and evidence is recorded.

Shared-system note: staging Supabase account creation/reset for browser verification requires explicit confirmation before the write.

## Suggested Next PR Order

1. Payment Confidence: finish amount-due alignment first so money-path trust is testable.
2. Show-Day Trust and Check-In Language: these are both day-of-show confidence work and likely touch related status surfaces.
3. Dog Profile Clarity: polish the existing dog profile surface without adding a new editor.
4. Final browser re-walk and OpenSpec archive once all required remediation work is merged or deferred.

## Local State Note

The original worktree still had one untracked file from earlier audit work:

- `docs/exhibitor-onboarding-ux-audit.md`

Do not assume it was included in PR #1188 unless it is deliberately reviewed, staged, and committed later.
