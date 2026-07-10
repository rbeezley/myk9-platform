# secretary-check-payment-recording Specification

## Purpose
Ensure check numbers entered in payment-update flows persist to enrollments.check_number, matching entry-creation behavior, so check reconciliation never silently loses post-creation payments.

## Requirements
### Requirement: Check numbers persist through payment-update flows

Recording a check payment through the payment-update dialogs (paid-in-full by check, partial payment by check) SHALL persist the entered check number to `enrollments.check_number`, in addition to any display reference, matching the behavior of the entry-creation payment path.

#### Scenario: Mark as paid by check records check number

- **WHEN** a secretary marks an enrollment paid in full by check and enters a check number
- **THEN** the enrollment update writes that value to `check_number` (not only `payment_reference`)

#### Scenario: Partial check payment records check number

- **WHEN** a secretary records a partial payment by check with a check number
- **THEN** the enrollment update writes that value to `check_number`

#### Scenario: Non-check payments leave check number untouched

- **WHEN** a payment update is recorded with a non-check method
- **THEN** `check_number` is not overwritten with unrelated reference text
