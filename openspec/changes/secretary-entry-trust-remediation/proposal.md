## Why

Original request: `/opsx:ship docs/plan-secretary-entry-trust-remediation.md`

The secretary mail-in entry workflow currently breaks trust after submission: the handler and payment state shown in Entry Management can disagree with what the secretary just entered, and the receipt can send the secretary away from the operational surface they need next. This is a fall 2026 launch-readiness issue because show-day secretaries need Entry Management to feel calm, correct, and hard to mess up.

## What Changes

- Preserve the selected handler identity through mail-in/on-behalf registration submission and Entry Management display, with a documented fallback for legacy entries that only have handler text.
- Make Enrollment-backed Entry Management payment badges, filters, and counts use the effective enrollment payment state when that is the authoritative source.
- Keep secretary receipt copy and return actions aligned with mail-in/on-behalf workflows so successful submission returns to Entry Management.
- Add one plain `Edit entry` correction path through the existing Entry Management action menu, reusing/adapting `EntryEditDialog` where safe instead of creating a separate correction center.
- Repair small trust breaks in existing secretary surfaces, including armband dialog copy, empty Entry Management call-to-action, Add Person create-mode title, and club permission copy.

Non-goals:

- No new Entry Management page, correction dashboard, mail-in wizard, or duplicated payment workflow.
- No class-transfer or payment-management reimplementation when an existing row, enrollment, or wizard control already owns that work.
- No change to Stripe online-payment authority or payout behavior beyond preserving/displaying the already-recorded secretary payment state.

## Capabilities

### New Capabilities

- `secretary-entry-trust`: Secretary mail-in/on-behalf entries preserve handler and payment trust from registration through Entry Management, receipt return, and common correction actions.

### Modified Capabilities

- None.

## Impact

- Registration submission and conversion utilities:
  - `apps/myk9show/src/features/registration/submitShowRegistration.ts`
  - `apps/myk9show/src/utils/registrationToEntries.ts`
  - `apps/myk9show/src/pages/RegistrationWizardPage/submitPaymentStep.ts`
  - `apps/myk9show/src/pages/RegistrationWizardPage.tsx`
- Entry Management data, grouping, display, and actions:
  - `apps/myk9show/src/hooks/useEntryManagementData.ts`
  - `apps/myk9show/src/utils/entryManagementUtils.ts`
  - `apps/myk9show/src/utils/enrollmentGrouping.ts`
  - `apps/myk9show/src/components/entries/management/EnrollmentCard.tsx`
  - `apps/myk9show/src/components/entries/management/EntryRowActionMenu.tsx`
  - `apps/myk9show/src/components/entries/management/ArmbandDialog.tsx`
  - `apps/myk9show/src/components/entries/EntryEditDialog.tsx`
- Tests for registration conversion/submission, Entry Management data mapping, enrollment grouping/payment display, row action menu, armband dialog behavior, and receipt copy/return path.
