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

| Row  | Registry responsibility                                         | Verified state                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                 | Remediation                                                                                                                                                                                                                              |
| ---- | --------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S7.1 | AKC Scent Work required reports, forms, labels, and XML.        | Implementation complete; launch evidence still open. | AKC official PDFs are registered and routed through organization forms. Entry form, score sheet, transfer form, certification page, judge/secretary/chair reports have focused tests. AKC XML formatter exists in `packages/secretary`.                                                                                                                                  | Re-check current AKC forms before launch and print representative packets. Recipient mismatch RESOLVED 2026-07-13: confirmed `eresults@akc.org`, set in `send-results` `SUBMISSION_EMAILS`.                                              |
| S7.2 | UKC Nosework closeout materials.                                | Implementation partial; launch evidence still open.  | UKC Trial Report official PDF is registered, filled, and tested. UKC Entry and Change Entry PDF fills are wired through Reports with focused tests. Element Judges Book, Handler Discrimination Judges Book, and Trial Score Sheet official PDFs are registered as static packet downloads.                                                                              | Add UKC paperwork submission guidance, run representative print/PDF checks, and decide whether static judges book/score sheet PDFs need drawn field overlays after secretary workflow review.                                            |
| S7.3 | ASCA Scent Detection closeout materials.                        | Implementation partial; launch evidence still open.  | ASCA official PDF templates are registered. Reports exposes ASCA Entry Form, Trial Report, Trial Roster, and Score Sheet static packet downloads for ASCA trials, plus Gross Receipts and Post-Event Evaluation fills for derivable club/date/count fields. Focused tests cover template inventory, PDF fill behavior, report routing, and ASCA-only Reports visibility. | Verify local ASCA source PDFs and ASCA result-code vocabulary against current official sources before launch, decide whether Secretary Checklist/Judge Conduct Evaluation belong in the packet, and run representative print/PDF checks. |
| S7.5 | Submit electronic registry results and preserve club artifacts. | Verified partial; guidance remediation implemented.  | AKC XML preview/download/send path exists. Submit Results now exposes UKC Nosework and ASCA Scent Detection manual closeout guidance, official registry links, UKC Reports deep-linking, and manual submission history records without unsupported XML generation.                                                                                                       | Keep AKC XML recipient verification as a launch blocker. Run launch print/PDF evidence for UKC and ASCA packet preservation before marking the row complete.                                                                             |

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

- ASCA organization-form typing/templates now include Entry Form, Trial Report, Trial Roster, Score Sheet, Gross Receipts, and Post-Event Evaluation.
- Reports now exposes ASCA packet actions only for ASCA trials.
- Gross Receipts fills derivable club/date fields and leaves location and ambiguous fee-grid fields blank.
- Post-Event Evaluation fills derivable club/date, dog/handler count, qualifying run, non-qualifying run, and excusal fields while leaving narrative/signature fields blank.
- Focused PDF fill, template inventory, official PDF routing, static download, report registry, and Reports-page visibility tests are in place.
- Verify local ASCA source PDFs and ASCA result-code vocabulary against current ASCA Rules & Forms links before launch.
- Decide whether the Secretary's Checklist and Judge Conduct Evaluation are required packet downloads or secretary reference material.
- Run print/PDF checks on the ASCA closeout packet before marking launch-ready.

### Batch C: Submission Guidance And Artifact Preservation

Goal: secretaries know exactly what to send or upload after the show, and can preserve the club packet.

- Resolve AKC electronic submission recipient before real send.
- For ASCA, keep Submit Results guidance for the official online results/payment upload path and run packet preservation checks now that ASCA Reports actions are wired.
- For UKC, keep the manual/paperwork guidance in Submit Results and run representative packet print/PDF checks before launch-ready status.
- Add tests around registry-specific submission copy and action visibility.

## Status Updates For Source Matrix

- S7.1 remains `Partially covered` until launch evidence is recorded, but implementation coverage is no longer the blocker.
- S7.2 remains `Partially covered`: UKC Trial Report, Entry, Change Entry, judges book templates, and trial score sheet template are now wired through Reports, while submission guidance and print evidence remain open.
- S7.3 is now `Partially covered`: ASCA packet actions are wired through Reports for static official PDFs and safe fillable fields. Remaining gates are source-form/result-code verification, possible Secretary Checklist/Judge Conduct Evaluation packet decisions, and representative print/PDF evidence.
- S7.5 remains `Partially covered`: AKC XML exists, and UKC/ASCA submission guidance/manual history records are implemented. Remaining gates are AKC recipient verification and representative closeout artifact/print evidence.

## Testing Phase For Future Implementation

Every implementation slice from this verification must include:

- organization-form template inventory tests for mapped official PDFs
- focused PDF fill tests that reload the real PDF and assert field values
- Reports-page action visibility tests for selected trial registry
- registry-specific submission/guidance tests when Submit Results copy or actions change
- manual PDF open/print checks before launch sign-off
