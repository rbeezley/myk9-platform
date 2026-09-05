# Secretary Entry Trust Remediation Plan

> **Status:** Complete — metadata reconciled 2026-09-05.
> Existing explicit Done 2026-07-07, PR #1189, tests/CI/OpenSpec closure recorded in plan.


**Date:** 2026-07-06
**Source audit:** [Secretary UX audit](../secretary-ux-audit.md)
**Priority frame:** Fall 2026 launch readiness, secretary/show-day reliability first
**Primary user lens:** Retired trial secretary with low computer confidence

**Status:** Done 2026-07-07 — shipped in PR [#1189](https://github.com/rbeezley/myk9-platform/pull/1189) (`fix(secretary): preserve mail-in entry trust`). Handler identity, enrollment-backed payment display, secretary receipt return, entry correction action, armband copy, empty-state CTA, Add Person title, and club permission copy are implemented with focused tests, CI green, and OpenSpec archived.

## Problem

The secretary workflow is mostly complete, but the post-entry chain breaks trust:

- The mail-in wizard showed Grace Hollis as handler, while Entry Management later showed `Test Secretary`.
- Secretary payment was recorded in the wizard, but accepted entry rows still showed `Payment Due`.
- There is no plain `Edit entry` correction action for handler, class, payment, or notes.
- The mail-in receipt exits to the public show page instead of back to Entry Management.

These are launch-readiness issues because a secretary needs to trust what they just entered before show day.

## Duplication Check

Does this duplicate an existing page? No.

Entry Management is already the correct secretary surface. The remediation should tighten the existing registration wizard, Entry Management cards/table, and existing edit/payment controls. Do not create a second entry-management page, a separate secretary correction center, or another mail-in wizard.

There is already an `EntryEditDialog` in `apps/myk9show/src/components/entries/EntryEditDialog.tsx`; before adding any new correction UI, verify whether it can be reused or adapted for secretary corrections.

## Candidate Code Areas

- `apps/myk9show/src/features/registration/submitShowRegistration.ts`
- `apps/myk9show/src/utils/registrationToEntries.ts`
- `apps/myk9show/src/pages/RegistrationWizardPage/submitPaymentStep.ts`
- `apps/myk9show/src/pages/RegistrationWizardPage.tsx`
- `apps/myk9show/src/hooks/useEntryManagementData.ts`
- `apps/myk9show/src/utils/entryManagementUtils.ts`
- `apps/myk9show/src/utils/enrollmentGrouping.ts`
- `apps/myk9show/src/components/entries/management/EnrollmentCard.tsx`
- `apps/myk9show/src/components/entries/management/EntryRowActionMenu.tsx`
- `apps/myk9show/src/components/entries/management/ArmbandDialog.tsx`
- `apps/myk9show/src/components/entries/EntryEditDialog.tsx`

## Phase 1: Reproduce and Pin the Data Contract

Goal: prove the exact source of the handler/payment mismatch before changing behavior.

Tasks:

- Trace mail-in submission for on-behalf entries from wizard state through `submitShowRegistration`.
- Confirm whether submitted entries are missing `handler_id`, using stale handler text, or being read back from the wrong person relation.
- Confirm whether non-card secretary payments intentionally leave `entries.payment_status = pending` while `enrollments.payment_status` is paid.
- Decide the source of truth for Entry Management payment display:
  - Enrollment-level status for mail-in/enrollment cards.
  - Entry-level status for standalone or online webhook entries.
- Capture the expected behavior in tests before the fix.

Acceptance:

- A failing test shows the handler selected in the wizard is the handler shown in Entry Management.
- A failing test shows a secretary-recorded check/cash/paid payment does not render as `Payment Due` on the enrollment card.

## Phase 2: Fix Handler Display

Goal: the handler shown in Entry Management must match the handler assigned during the mail-in wizard.

Likely implementation:

- Ensure `registrationToEntries` / `submitShowRegistration` passes both handler name and handler id into the database submission path.
- Ensure `submitShowEntries` persists `handler_id` if the RPC/API supports it; if it only accepts `handlerName`, update the contract instead of relying on legacy text.
- In `useEntryManagementData`, keep the fallback order explicit:
  - joined `handler_person`
  - legacy `entry.handler`
  - `Not specified`

Acceptance:

- A secretary-created entry for an exhibitor-owned dog displays the selected exhibitor/handler, not the signed-in secretary.
- Online entries still display handler names correctly.
- Existing legacy entries with only handler text still display that text.

## Phase 3: Fix Payment Trust

Goal: a secretary payment entered during mail-in registration must read as paid, or the UI must clearly explain why money is still due.

Likely implementation:

- Verify `createShowRegistration` stores `payment_status`, `payment_reference`, `total_amount`, and `paid_amount` correctly for `secretary_payment`, check, and cash.
- Use `getEffectivePaymentStatus` consistently for enrollment cards and payment filters where enrollment status is authoritative.
- Avoid double-counting: enrollment totals remain authoritative for enrollment-backed groups; entry totals remain authoritative for standalone entries.
- Update receipt/payment copy so `Secretary Payment` does not say payment is still pending.

Acceptance:

- Entry Management enrollment group shows `Paid` for a secretary-recorded payment.
- Payment filters/counts agree with the visible badge.
- Refund and partial payment flows still work for enrollment groups.

## Phase 4: Add One Clear Correction Path

Goal: a secretary can correct common entry mistakes without hunting through specialized actions.

Tasks:

- Add an `Edit entry` action to the existing Entry Management row/card action menu.
- Prefer adapting `EntryEditDialog` if its deadline/permission model can support secretary edits safely.
- Initial correction scope:
  - handler
  - jump height where applicable
  - notes/special requests if already stored
  - pull/withdraw existing class entry
- Do not add duplicate class-transfer or payment UI if existing row/enrollment controls already handle it; link or focus the existing control instead.

Acceptance:

- The row action menu has a plainly named `Edit entry` action.
- A secretary can change a handler and see the row update after save.
- The action is disabled or explains why when an entry can no longer be edited.

## Phase 5: Repair Small Confidence Breaks

Goal: remove confusing moments that make the app feel less predictable.

Tasks:

- `ArmbandDialog`: rename `Next` to `Use next available` and keep one commit action, `Assign armband`.
- Mail-in receipt: make `Return to Entry Management` the primary action for secretary-created entries.
- Receipt copy: change `Your entry is submitted` to `Mail-in entry submitted` for secretary/on-behalf modes.
- Empty Entry Management state: add inline `Add mail-in entry` CTA.
- Add Person panel: title should be `Add Person` in create mode, not `Edit User`.
- Club pages: if secretaries cannot edit clubs, show a plain permissions message.

Acceptance:

- No success screen leaves a secretary wondering where to go next.
- The armband dialog has no competing save-like actions.
- Secretary-only copy uses secretary language, not exhibitor-first language.

## Phase 6: Testing

Unit/component tests:

- `registrationToEntries.test.ts`: preserves `handlerId` and handler name for mail-in/on-behalf entries.
- `submitShowRegistration.test.ts` or existing equivalent: sends handler id/name and payment method/details to the submission layer.
- `useEntryManagementData.test.ts`: maps joined handler person before legacy handler text and preserves legacy fallback.
- `enrollmentGrouping.test.ts` / `entryManagementUtils.test.ts`: enrollment payment status drives mail-in group payment display.
- `EnrollmentCard.test.tsx`: paid enrollment does not show `Payment Due`.
- `EntryRowActionMenu.test.tsx`: renders `Edit entry` and wires its callback.
- `ArmbandDialog.test.tsx`: `Use next available` fills only the value; `Assign armband` is the only commit action.
- `EntryReceipt.test.tsx` or RegistrationWizard page test: secretary receipt copy and primary return action.

E2E verification:

- Use `e2e-secretary@test.myk9.com` on `localhost:5173`.
- Create a person, dog, show, trial, class, and mail-in entry.
- Select a non-secretary handler during registration.
- Record secretary/check payment.
- Verify Entry Management shows the selected handler and paid status.
- Edit handler or jump height from `Edit entry`.
- Assign/change armband and verify the visible row updates.
- Finish from receipt via `Return to Entry Management`.

Run:

```bash
cd apps/myk9show && pnpm test -- registrationToEntries useEntryManagementData enrollmentGrouping EntryRowActionMenu ArmbandDialog EntryReceipt
cd apps/myk9show && pnpm test:e2e -- --grep "secretary"
```

If the full E2E suite hangs for more than 60 seconds without useful output, stop and report the hang per repo guidance.

## Recommended Order

1. Handler display contract.
2. Payment display/source-of-truth contract.
3. Receipt return/copy.
4. `Edit entry` correction action.
5. Armband and small confidence fixes.

This order protects the show-day data first, then improves the secretary's sense of control around that data.
