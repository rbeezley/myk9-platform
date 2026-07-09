## 1. Template Registry

- [x] 1.1 Add ASCA Scent Detection official PDFs to `OrganizationFormRegistry`, template ids, source paths, and runtime URLs.
- [x] 1.2 Add template inventory tests proving ASCA source PDFs exist and required fillable fields are present.

## 2. PDF Builders

- [x] 2.1 Add ASCA Gross Receipts values for derivable club/date fields while leaving location and uncertain fee fields blank.
- [x] 2.2 Add ASCA Post-Event Evaluation values for derivable club/date/entry-count fields while leaving narrative/signature fields blank.
- [x] 2.3 Add focused PDF tests that reload the real ASCA PDFs and assert mapped field values.

## 3. Reports Integration

- [x] 3.1 Add ASCA report ids to the existing report registry without creating a new Reports surface.
- [x] 3.2 Route ASCA official PDF configs through `officialPdfReports.ts`, using static mode for non-fillable PDFs.
- [x] 3.3 Gate ASCA official PDF actions to ASCA trials and hide them for AKC/UKC trials.
- [x] 3.4 Add Reports-page tests proving ASCA actions appear for ASCA trials and do not leak to other registries.

## 4. Tracking And Verification

- [x] 4.1 Update secretary responsibility docs with S7.3 implementation evidence and remaining print/source gates.
- [x] 4.2 Run focused organization-form and Reports tests.
- [x] 4.3 Run `pnpm --filter @myk9/show typecheck`, `pnpm --filter @myk9/show lint`, OpenSpec validation, and `git diff --check`.
- [x] 4.4 Open PR, pass CI/review, merge, then archive the OpenSpec change.
