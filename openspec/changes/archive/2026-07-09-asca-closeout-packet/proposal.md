## Why

ASCA Scent Detection is a fall-required secretary closeout gap: the official source PDFs are in the repo, but myK9Show does not expose ASCA closeout artifacts through Reports. This blocks launch readiness for ASCA clubs because the secretary cannot assemble the registry packet from the existing workflow.

## What Changes

- Add ASCA Scent Detection official form templates to the organization-form registry.
- Add Reports actions for ASCA Trial Report, Trial Roster, Score Sheet, Gross Receipts, Post-Event Evaluation, and Entry Form packet preservation.
- Fill the ASCA closeout PDFs where the official source PDFs expose AcroForm fields and myK9 has reliable derived data.
- Preserve non-fillable official PDFs as static packet downloads instead of inventing unsupported overlays.
- Update secretary responsibility tracking with ASCA packet evidence and remaining launch gates.

Non-goals:

- No new ASCA closeout page, wizard, dialog, or duplicated workflow.
- No ASCA XML/export path; ASCA submission remains the official online upload path already documented on Submit Results.
- No manual-only fields will be guessed; forms may leave registry/operator-entered fields blank.

Duplication answer: this does not duplicate an existing page. The existing Reports page is already the closeout artifact surface, and Submit Results is already the submission guidance/history surface. A link alone is not enough because the missing capability is generating or preserving the ASCA official PDFs from the Reports workflow.

## Capabilities

### New Capabilities

- `asca-closeout-packet`: ASCA Scent Detection official closeout forms are available from the existing Reports workflow with registry-appropriate static or fillable PDF behavior.

### Modified Capabilities

- None.

## Impact

- `apps/myk9show/src/features/organization-forms/*`
- `apps/myk9show/src/lib/reports/reportRegistry.ts`
- `apps/myk9show/src/pages/secretary/ReportsPage/*`
- Focused organization-form and Reports-page tests
- Secretary responsibility tracking docs for S7.3
