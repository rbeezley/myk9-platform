## Context

The canonical closeout surfaces already exist:

- Reports page: generates registry forms and printable packets.
- Submit Results page: handles electronic AKC XML, manual submission records, and submission history.

Adding another "closeout" destination would duplicate those surfaces. This change keeps the work on Submit Results and links back to Reports for packet preparation.

Official source checks used for this slice:

- AKC downloadable forms page lists AKC Scent Work forms already covered by the current Reports/AKC XML workflow.
- UKC Nosework Forms & Rules lists Nosework event forms, a paperwork prep/submission guide, and the trial manual.
- ASCA Online Event Sanctioning and Results Upload lists Scent Detection online results/payment upload.

## Approach

### Submission Options

Replace the page's formatter-only organization model with a small local submission option model:

- AKC Scent Work: electronic XML option backed by the existing AKC formatter.
- UKC Nosework: manual closeout option with no XML formatter.
- ASCA Scent Detection: portal/manual closeout option with no XML formatter.

The selector remains one control on Submit Results. For UKC/ASCA, the page hides XML-only actions and keeps "Mark as submitted" as the record-preservation action.

### Guidance Panel

Add a compact guidance panel below the action helper. It should:

- explain the registry-specific submission path in plain language
- link to Reports for packet generation where myK9 has forms
- link to official registry resources in a new tab
- tell the secretary what the "Mark as submitted" record preserves

This is guidance, not a separate checklist workflow; it should not create another completion model.

### Preservation

Manual UKC/ASCA submissions use the existing `result_submissions` mutation with:

- `organization`: `UKC` or `ASCA`
- `sport_type`: `nosework` or `scent_detection`
- `xml_payload`: `null`
- `status`: `submitted`

The submission history already distinguishes `submitted` from in-app emailed `sent`.

## Duplication Check

Does this duplicate an existing page? No. The implementation updates the existing Submit Results page and links to the existing Reports page for forms. A plain link alone is not enough because S7.5 is specifically about knowing how to submit and preserve artifacts after reports are generated.

## Testing

- Helper tests for option selection and guidance content.
- Submit Results tests for UKC/ASCA selector options, hidden XML-only actions, guidance copy, Reports links, official links, and manual record persistence.
- Existing AKC tests must remain green.
