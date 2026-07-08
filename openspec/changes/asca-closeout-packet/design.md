## Context

The secretary closeout workflow already centers on `/shows/:showId/reports` for generated artifacts and `/shows/:showId/submit-results` for submission guidance/history. AKC and UKC official PDFs are registered in `organizationFormTemplates.ts`, routed through `officialPdfReports.ts`, and exposed by `useAKCOfficialPdfAction`.

ASCA Scent Detection has local source PDFs under `docs/rulebooks/asca-scent-detection-forms/`, but no app wiring. PDF field inspection shows:

- Static/non-fillable: Trial Report, Trial Roster, Score Sheet, Sanction.
- Fillable: Entry Form, Gross Receipts, Post-Event Evaluation, Match Form.

The fall launch goal is secretary reliability, not a new ASCA workflow surface. The implementation should therefore extend the existing report registry and official PDF action path.

## Goals / Non-Goals

**Goals:**

- Register ASCA official PDFs in the existing organization-form template registry.
- Expose ASCA packet actions from the existing Reports page for ASCA trials only.
- Fill straightforward closeout fields where the PDF has AcroForm fields and the data is derivable from current report props.
- Preserve non-fillable ASCA official PDFs as static downloads.
- Keep secretary tracking docs current for S7.3.

**Non-Goals:**

- No new ASCA page, modal, wizard, or separate closeout screen.
- No ASCA XML generation or direct ASCA upload.
- No drawn overlays for non-fillable PDFs in this slice.
- No guessed values for human-entered fields such as signatures, comments, facility notes, or ASCA-only fee decisions.

## Decisions

1. **Extend Reports, do not add a closeout page.**
   - Rationale: Reports is already the artifact surface for AKC and UKC closeout packets.
   - Alternative considered: a dedicated ASCA closeout page. Rejected because it fragments secretary closeout work and duplicates Reports.

2. **Use static official downloads for non-fillable ASCA PDFs.**
   - Rationale: Trial Report, Trial Roster, Score Sheet, and Sanction have no AcroForm fields. Static preservation is honest and useful now.
   - Alternative considered: draw custom overlays. Deferred because overlay mapping needs visual print verification and is higher risk.

3. **Fill only straightforward fields in fillable closeout PDFs.**
   - Rationale: Gross Receipts and Post-Event Evaluation have fillable fields for club/date and clearly named counts that can be derived from current report data. Operator narrative fields, signatures, location values not present in the Reports data contract, and ambiguous fee-grid fields should stay blank.
   - Alternative considered: leave all fillable ASCA forms static. Rejected for fields myK9 can reliably derive without adding user burden.

4. **Gate ASCA official actions by trial registry.**
   - Rationale: Existing mixed-registry support uses `trial.registryId`; show organization labels are not reliable enough.
   - Alternative considered: show-level organization gate. Rejected because a show can contain registry-specific trials.

## Risks / Trade-offs

- **Risk:** Static official PDFs may still require manual completion. -> **Mitigation:** Labels and docs describe them as packet preservation; future overlays can be added after print verification.
- **Risk:** ASCA gross receipt fees may depend on ASCA rules outside current data. -> **Mitigation:** Fill date/club fields and leave uncertain fee fields blank unless verified.
- **Risk:** Report picker becomes crowded with registry-specific forms. -> **Mitigation:** Reuse existing report categories and registry gating; do not add another navigation surface.
- **Risk:** PDF fields can change when ASCA updates source files. -> **Mitigation:** Template inventory tests assert required field names exist in local PDFs.
