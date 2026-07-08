## Why

Secretary row S7.5 remains partially covered: AKC electronic XML exists, but UKC and ASCA closeout submission guidance is not visible in the app. Secretaries need calm, registry-specific next steps after generating forms so they can submit results and preserve club artifacts without guessing.

This supports fall 2026 launch readiness by reducing post-show uncertainty on a high-stress secretary workflow.

## What Changes

- Add registry-specific closeout guidance to the existing Submit Results page.
- Add UKC Nosework guidance that points secretaries to Reports for the packet and to UKC's official paperwork prep/submission resources.
- Add ASCA Scent Detection guidance that points secretaries to ASCA's online results/payment upload path.
- Allow UKC and ASCA manual submission records to be logged in the existing submission history, without inventing unsupported XML.
- Update secretary closeout tracking docs with the implemented evidence and remaining launch gates.

Non-goals:

- Do not add a new closeout page, wizard, dashboard, or duplicate Reports surface.
- Do not create UKC or ASCA electronic XML formatters until official formatter requirements are known.
- Do not mark representative print/PDF checks complete in this slice.

## Capabilities

### New Capabilities

- `registry-closeout-submission-guidance`: Registry-specific submission guidance and manual artifact preservation on Submit Results.

### Modified Capabilities

- None.

## Impact

- `apps/myk9show/src/pages/secretary/ResultsSubmissionPage/`
- `apps/myk9show/src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx`
- `docs/roles/secretary-registry-closeout-verification.md`
- `docs/roles/secretary-responsibility-coverage.md`
- `docs/roles/secretary-responsibility-verification-plan.md`
