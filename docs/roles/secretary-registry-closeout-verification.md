# Secretary Registry Closeout Verification

**Date:** 2026-07-08
**Status:** Current-state verification for secretary responsibility rows S7.1, S7.2, S7.3, and S7.5.
**OpenSpec change:** `openspec/changes/registry-closeout-verification`
**Source plan:** [`secretary-responsibility-verification-plan.md`](secretary-responsibility-verification-plan.md)

## Purpose

This document verifies the registry closeout part of the secretary responsibility plan:

- S7.1: AKC Scent Work reports, official forms, labels, and XML.
- S7.2: UKC Nosework closeout materials.
- S7.3: ASCA Scent Detection closeout materials.
- S7.5: electronic/manual registry submission and preservation of club artifacts.

It separates official registry sources, local source PDFs, myK9 app surfaces, and remaining remediation so future implementation slices can stay focused.

## Official Source Inventory

| Registry             | Official source checked                                                                                                             | Closeout/form artifacts identified                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AKC Scent Work       | AKC downloadable forms page and existing AKC coverage doc.                                                                          | Entry Form Template, Class Transfer Form, Judge's Report, Judge's Score Sheet, Trial Secretary Report, Trial Chair Report, Certification Page, electronic XML submission.                           |
| UKC Nosework         | UKC Nosework Forms & Rules page.                                                                                                    | Nosework Report, Judges Book: Element Trial, Judges Book: Handler Discrimination, Trial Score Sheet, Nosework Entry, paperwork prep/submission guidance, rules and trial manual.                    |
| ASCA Scent Detection | ASCA Rules & Forms page, Scent Detection program page, Scent Detection rules PDF, and Online Event Sanctioning/Results Upload page. | Scent Entry Form, Scent Score Sheet, Scent Trial Report, Scent Trial Roster, Post-Event Evaluation, Gross Receipts, Judge Conduct Evaluation, Secretary's Checklist, online results/payment upload. |

Official source URLs used:

- AKC downloadable forms: <https://www.akc.org/downloadable-forms/>
- UKC Nosework Forms & Rules: <https://www.ukcdogs.com/nosework-forms-rules>
- ASCA Rules & Forms: <https://asca.org/asca/business-office/rules-forms/>
- ASCA Scent Detection: <https://asca.org/competitive-programs/scent-detection/>
- ASCA Online Event Sanctioning and Results Upload: <https://asca.org/online-event-sanctioning/>

## Current Code Inventory

### Existing Closeout Surfaces

- Reports page: `/shows/:showId/reports`.
- Submit Results page: `/shows/:showId/submit-results`.
- Generic report registry: `apps/myk9show/src/lib/reports/reportRegistry.ts`.
- Official PDF templates and URLs: `apps/myk9show/src/features/organization-forms/organizationFormTemplates.ts`.
- Official PDF report routing: `apps/myk9show/src/features/organization-forms/officialPdfReports.ts`.
- Official PDF Reports-page action hook: `apps/myk9show/src/pages/secretary/ReportsPage/useAKCOfficialPdfAction.ts`.
- AKC XML formatter: `packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts`.

### Local Official PDFs

| Registry | Local source PDFs                                                                                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AKC      | `docs/AKC-forms/SW-EntryForm.pdf`, `SW-CertificationPage.pdf`, `SW-JudgeReport.pdf`, `SW-Scoresheet.pdf`, `SW-TCReport.pdf`, `SW-TSReport.pdf`, `SW-Transfer.pdf`                                                                                                                                    |
| UKC      | `docs/UKC-forms/NW-Entry.pdf`, `NW-ChangeEntry.pdf`, `NW-TrialReport.pdf`                                                                                                                                                                                                                            |
| ASCA     | `docs/rulebooks/asca-scent-detection-forms/ASCA_Scent-Entry-Form.pdf`, `ASCA_SD-Scoresheet.pdf`, `ASCA_Scent-Trial-Report.pdf`, `ASCA_SD-Trial-Roster.pdf`, `ASCA_ScentDetectionGrossReceiptsReport.pdf`, `ASCA_scentpostevaluationform.pdf`, `ASCA_Scent-Sanction.pdf`, `ASCA_Scent-Match-Form.pdf` |

## Coverage Matrix

| Row  | Registry responsibility                                         | Verified state                                       | Evidence                                                                                                                                                                                                                                                                                    | Remediation                                                                                                                                                                                        |
| ---- | --------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S7.1 | AKC Scent Work required reports, forms, labels, and XML.        | Implementation complete; launch evidence still open. | AKC official PDFs are registered and routed through organization forms. Entry form, score sheet, transfer form, certification page, judge/secretary/chair reports have focused tests. AKC XML formatter exists in `packages/secretary`.                                                     | Re-check current AKC forms before launch, print representative packets, and resolve the `results@akc.org` vs `eresults@akc.org` recipient mismatch before real send.                               |
| S7.2 | UKC Nosework closeout materials.                                | Implementation partial; launch evidence still open.  | UKC Trial Report official PDF is registered, filled, and tested. UKC Entry and Change Entry PDF fills are wired through Reports with focused tests. Element Judges Book, Handler Discrimination Judges Book, and Trial Score Sheet official PDFs are registered as static packet downloads. | Add UKC paperwork submission guidance, run representative print/PDF checks, and decide whether static judges book/score sheet PDFs need drawn field overlays after secretary workflow review.      |
| S7.3 | ASCA Scent Detection closeout materials.                        | Verified gap in app wiring; source PDFs present.     | ASCA source PDFs exist locally and ASCA registry/class config exists, but `OrganizationFormRegistry` currently supports only AKC and UKC, and no ASCA official PDF templates or report routes are registered.                                                                               | Add a focused ASCA closeout plan for Trial Report, Trial Roster, Score Sheet, Gross Receipts, Post-Event Evaluation, Secretary Checklist, and online results/payment upload instructions.          |
| S7.5 | Submit electronic registry results and preserve club artifacts. | Verified partial.                                    | AKC XML preview/download/send path exists. ASCA official site offers online results/payment upload; UKC source inventory points to paperwork submission guidance. No UKC/ASCA electronic formatter or portal guidance surface was found.                                                    | Keep AKC XML recipient verification as a launch blocker. For UKC/ASCA, preserve downloadable packets and add operator guidance for manual/portal submission rather than inventing unsupported XML. |

## Remediation Plan

### Batch A: UKC Closeout Packet

Goal: make UKC Nosework closeout no worse than the current AKC/UKC Trial Report baseline, without duplicating Reports.

- Verify whether the local `docs/UKC-forms/NW-Entry.pdf`, `NW-ChangeEntry.pdf`, and `NW-TrialReport.pdf` match current UKC source files.
- Add missing current UKC source PDFs where launch-required: Nosework Report if distinct from local Trial Report, Judges Book: Element Trial, Judges Book: Handler Discrimination, Trial Score Sheet, and paperwork prep/submission guidance if PDF-based.
- Decide which artifacts should be official PDF fills versus generic printable reports.
- Add organization-form mappings and focused PDF fill tests for each official fill selected.
- Add Reports-page tests proving UKC trial selection exposes only UKC-appropriate official actions.
- Run print/PDF checks on the UKC closeout packet before marking launch-ready.

### Batch B: ASCA Closeout Packet

Goal: wire ASCA Scent Detection official closeout artifacts into existing Reports/Submit Results surfaces.

- Verify local ASCA source PDFs against current ASCA Rules & Forms links.
- Extend organization-form typing/templates to include `ASCA`.
- Prioritize official PDF fills: Trial Report, Trial Roster, Score Sheet, Gross Receipts, and Post-Event Evaluation.
- Decide whether the Secretary's Checklist is a static downloadable reference or a generated report.
- Add focused PDF fill tests and template inventory tests.
- Add Reports-page tests proving ASCA trial selection exposes ASCA actions and hides AKC/UKC-only actions.
- Run print/PDF checks on the ASCA closeout packet before marking launch-ready.

### Batch C: Submission Guidance And Artifact Preservation

Goal: secretaries know exactly what to send or upload after the show, and can preserve the club packet.

- Resolve AKC electronic submission recipient before real send.
- For ASCA, add Submit Results guidance for the official online results/payment upload path and preserve the generated packet locally/downloadably.
- For UKC, verify whether submission remains paper/email/manual and document the exact operator steps in the closeout surface.
- Add tests around registry-specific submission copy and action visibility.

## Status Updates For Source Matrix

- S7.1 remains `Partially covered` until launch evidence is recorded, but implementation coverage is no longer the blocker.
- S7.2 remains `Partially covered`: UKC Trial Report, Entry, Change Entry, judges book templates, and trial score sheet template are now wired through Reports, while submission guidance and print evidence remain open.
- S7.3 remains a fall-required gap for app behavior, with source PDFs already present in the repo.
- S7.5 remains `Partially covered`: AKC XML exists, UKC/ASCA submission guidance and artifact preservation still need registry-specific remediation.

## Testing Phase For Future Implementation

Every implementation slice from this verification must include:

- organization-form template inventory tests for mapped official PDFs
- focused PDF fill tests that reload the real PDF and assert field values
- Reports-page action visibility tests for selected trial registry
- registry-specific submission/guidance tests when Submit Results copy or actions change
- manual PDF open/print checks before launch sign-off
