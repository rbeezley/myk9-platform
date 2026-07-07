## Context

The secretary mail-in workflow already exists in myK9Show and should remain the single path for on-behalf entries. The problem is continuity: the selected handler, recorded payment, and next action can drift or read as exhibitor-first once the secretary lands in Entry Management.

This work touches multiple existing surfaces: the registration wizard submission path, Entry Management data mapping/grouping, row/card actions, the existing `EntryEditDialog`, `ArmbandDialog`, receipt UI, Add Person panel, and club permissions copy. The role intent from `docs/INTENT.md` is "That was easy" for trial secretaries, so the implementation should make the data look trustworthy and the next action obvious without adding new screens.

Core show-day entry data must keep using established replicated/offline-aware query and mutation layers. This remediation should not introduce direct Supabase reads or writes in core Entry Management flows when a replication-backed or existing service path already exists.

## Goals / Non-Goals

**Goals:**

- Preserve the handler selected during secretary/on-behalf registration through submission, persistence, read mapping, and Entry Management display.
- Display enrollment-backed payment state from the enrollment source of truth so paid mail-in entries do not look unpaid on the card/table.
- Give secretaries one obvious `Edit entry` correction action from the existing row/card action surface.
- Adjust receipt, armband, empty-state, Add Person, and club-permissions copy so secretary workflows feel predictable and task-oriented.
- Capture the data contracts in failing tests before each behavior fix where the bug is value-sensitive.

**Non-Goals:**

- Create a new correction center, entry-management page, mail-in wizard, or payment workflow.
- Broaden edit scope beyond common correction actions already supported by existing data and permission models.
- Change Stripe authority, payout calculations, or online payment reconciliation rules.
- Replace the Entry Management architecture or refactor unrelated status/classification systems.

## Decisions

### Use existing Entry Management as the correction hub

Add or wire `Edit entry` through `EntryRowActionMenu`/card actions and adapt `EntryEditDialog` if its deadline and permission model can support secretary edits. This keeps the correction path where the secretary is already verifying entries.

Alternative considered: create a dedicated correction page or dialog. Rejected because it duplicates Entry Management and fragments the secretary workflow.

### Treat handler identity as structured data with explicit fallback

Registration conversion/submission should preserve both `handlerId` and handler display text when available. Entry Management mapping should prefer joined `handler_person`, then legacy `entry.handler`, then `Not specified`.

Alternative considered: display only legacy handler text. Rejected because it cannot reliably distinguish the signed-in secretary from the selected exhibitor/handler and is brittle for future edits.

### Use enrollment payment status for enrollment-backed groups

When entries are grouped under an enrollment, `getEffectivePaymentStatus` and related grouping/card utilities should treat the enrollment as authoritative for display badges, filters, and counts. Standalone entries continue to use entry-level payment fields.

Alternative considered: force each entry row to mirror enrollment payment fields during display. Rejected because it risks double-counting and hides the existing enrollment-level source of truth.

### Keep receipt return behavior source-aware

Secretary/on-behalf receipt states should use secretary language, make `Return to Entry Management` primary, and route back to the relevant Entry Management surface. Exhibitor self-service receipts keep exhibitor-first copy and public/show-page next steps.

Alternative considered: one generic receipt for all roles. Rejected because it sends secretaries away from their operational workflow and weakens trust immediately after submission.

### Small copy fixes stay on existing surfaces

The armband action rename, empty-state mail-in CTA, Add Person create-mode title, and club permissions message should be local copy/control fixes. They should not introduce new navigation levels or additional dialogs.

Alternative considered: broader IA cleanup. Rejected because this change is scoped to post-entry trust remediation.

## Risks / Trade-offs

- Handler persistence contract may stop at an RPC/API boundary -> Verify the actual submission function signature before changing payloads; update both caller and callee tests if the contract supports `handler_id`.
- Enrollment and entry payment fields can diverge -> Keep source-of-truth selection explicit and test enrollment-backed and standalone groups separately.
- Existing `EntryEditDialog` may have exhibitor/deadline assumptions -> Reuse only the safe pieces; if secretary edit semantics differ, constrain the dialog through props rather than creating a parallel correction surface.
- Offline-first expectations can regress if direct reads/writes are added -> Use existing Entry Management data services and mutation paths, and add focused tests around data mapping rather than bypassing replication.
- Receipt copy could regress exhibitor flows -> Gate secretary copy/return by workflow mode/source and preserve existing exhibitor receipt tests.
