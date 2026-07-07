## 1. Reproduce and Pin Data Contracts

- [x] 1.1 Trace secretary mail-in/on-behalf submission from wizard state through `registrationToEntries`, `submitPaymentStep`, and `submitShowRegistration`.
- [x] 1.2 Add assertion-first failing tests proving selected handler id/name survives registration conversion and submission payloads.
- [x] 1.3 Add assertion-first failing tests proving enrollment-backed paid secretary payments do not render as `Payment Due`.
- [x] 1.4 Confirm standalone online and legacy handler-only entries keep their existing display behavior.

## 2. Handler Trust Fix

- [x] 2.1 Update registration conversion/submission code to pass handler id and handler display text through the supported persistence contract.
- [x] 2.2 Update Entry Management data mapping to prefer joined `handler_person`, then legacy `entry.handler`, then `Not specified`.
- [x] 2.3 Add or update focused tests for `registrationToEntries`, `submitShowRegistration`, and `useEntryManagementData`.

## 3. Payment Trust Fix

- [x] 3.1 Verify secretary payment fields for check, cash, waived, and already-received submissions are persisted on the enrollment/entry records already owned by the current submission path.
- [x] 3.2 Update enrollment grouping/card/filter utilities to use enrollment payment status for enrollment-backed groups and entry payment status for standalone entries.
- [x] 3.3 Add or update focused tests for `enrollmentGrouping`, `entryManagementUtils`, and `EnrollmentCard` paid/due display.

## 4. Secretary Receipt and Correction Path

- [x] 4.1 Update secretary/on-behalf receipt copy to say `Mail-in entry submitted` and make `Return to Entry Management` the primary action.
- [x] 4.2 Preserve exhibitor self-service receipt copy and next steps.
- [x] 4.3 Add an `Edit entry` action to the existing Entry Management row/card action menu and wire it to the existing/adapted correction dialog where editable.
- [x] 4.4 Ensure non-editable entries disable or hide the edit action with plain secretary-facing copy.
- [x] 4.5 Ensure failed correction saves leave the visible row unchanged and show plain retry-oriented feedback.
- [x] 4.6 Add or update focused tests for receipt behavior, `EntryRowActionMenu`, correction success, and correction failure.

## 5. Small Secretary Confidence Fixes

- [x] 5.1 Rename the armband helper action to `Use next available` and keep `Assign armband` as the only commit action.
- [x] 5.2 Add an inline `Add mail-in entry` CTA to the empty Entry Management state that starts the existing secretary registration flow.
- [x] 5.3 Fix Add Person create mode title to `Add Person`.
- [x] 5.4 Add plain permissions copy for club surfaces that secretaries cannot edit.
- [x] 5.5 Add or update focused tests for `ArmbandDialog`, empty Entry Management state, Add Person title, and club permissions copy where test coverage exists.

## 6. Verification and Shipping

- [x] 6.1 Run `pnpm openspec validate "secretary-entry-trust-remediation" --type change --strict`.
- [x] 6.2 Run focused myK9Show tests for changed files, including registration conversion/submission, Entry Management mapping/grouping/card/action tests, armband dialog, and receipt tests.
- [x] 6.3 Run targeted typecheck or broader checks if touched contracts cross package or app boundaries.
- [x] 6.4 Run secretary E2E verification for the mail-in path if the local suite is usable; stop and report if it hangs for more than 60 seconds without useful output.
- [ ] 6.5 Update relevant tracking docs when the remediation is complete.
- [ ] 6.6 Open a PR with `Tracked in openspec change: secretary-entry-trust-remediation`, wait for CI/review, and merge before archiving.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This change touches entry submission, payment display, offline-sensitive Entry Management flows, and secretary correction behavior.
