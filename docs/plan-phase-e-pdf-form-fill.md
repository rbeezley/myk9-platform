# Plan — Phase E Organization PDF Form Fill

**Date:** 2026-05-20
**Status:** Current phase.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

Replace organization-report HTML stand-ins with official AKC / UKC fillable PDF output so a secretary can submit closeout paperwork without retyping show data.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): after the show, the software should make closeout feel smooth and complete, not like a second round of data entry.

## PR 1 — Form Template Foundation

**Status:** Shipped in PR #252.

Deliverables:

- Add `pdf-lib` to myK9Show.
- Register the official AKC / UKC PDF templates now stored under `docs/AKC-forms` and `docs/UKC-forms`.
- Add a reusable AcroForm helper that lists fields and fills text, checkbox, and radio fields from typed values.
- Add the first concrete mapping for the AKC Scent Work Trial Secretary Report (`SW-TSReport.pdf`).

Tests:

- Assert each mapped official PDF exists and exposes the required AcroForm fields.
- Assert AKC Trial Secretary Report values map to exact field names.
- Fill the real AKC PDF in test and reload it to prove the official fields receive the expected values.

## PR 2 — AKC Trial Secretary PDF Download

**Status:** Shipped in PR #253.

Deliverables:

- Keep `TrialSecretaryReport.tsx` as the on-screen HTML preview.
- Add a Reports toolbar action that downloads the official AKC Trial Secretary PDF for one selected trial.
- Reuse the same trial-scoped `ReportProps` builder for preview and PDF download.
- Load/fill the official PDF template on demand so `pdf-lib` does not join the initial Reports chunk.

Tests:

- Assert the Reports controls expose the official PDF action only when supplied and keep it disabled until one trial is selected.
- Assert trial-scoped report props are shared by preview and PDF generation.
- Assert the AKC Trial Secretary PDF filename contract.

## PR 3 — AKC Judge + Trial Chairman Field Builders

**Status:** Shipped in PR #255.

Deliverables:

- Add typed field constants for `SW-JudgeReport.pdf` and `SW-TCReport.pdf`.
- Add value builders for safe, already-known metadata: event number, event date, club name, judge names, and the Judge Report event type.
- Keep human-completed contact, comment, reportable-problem, and signature fields untouched until the missing-data warning/download slice.

Tests:

- Assert AKC Judge Report values map to exact field names and fill the real official PDF.
- Assert AKC Trial Chairman Report values map to exact field names and fill the real official PDF.
- Keep the template inventory test backed by the new field constants.

## PR 4 — Missing-Data Warnings Before Download

**Status:** Shipped in PR #257.

Deliverables:

- Compare each official form's `requiredFields` against the values the current builder can populate.
- Surface missing official fields in the Reports toolbar before download while still allowing the secretary to download and complete the PDF manually.
- Keep the warning helper generic so AKC Judge, AKC Trial Chairman, and UKC builders can reuse the same contract as their download buttons land.
- Preserve the calm Trial Secretary closeout intent: warnings should say what still needs review, not block routine paperwork.

Tests:

- Assert missing-field detection for AKC Trial Secretary, AKC Judge, and AKC Trial Chairman builders.
- Assert readable labels for official PDF field names.
- Assert the Reports toolbar displays missing fields without disabling the official PDF action.

## PR 5 — UKC Nosework Trial Report Field Builder

**Status:** Shipped in PR #258.

Deliverables:

- Add typed field constants for `NW-TrialReport.pdf`.
- Add a value builder for safe known metadata and totals: event date, club name, UKC online count/subtotal, pre-entry count/subtotal, day-of-show count/subtotal, total entries, and grand total due.
- Keep UKC online entries at zero until the product tracks a dedicated UKC-hosted online-entry source; `entries.payment_method` is only the myK9 collection method.
- Carry day-of-show entry metadata through report props so official closeout totals can split pre-entry vs day-of-show rows.

Tests:

- Assert UKC Nosework values map to exact official field names.
- Fill the real UKC PDF in test and reload it to prove the official fields receive expected values.
- Keep the template inventory test backed by the new field constants.

## PR 6 — Remaining Official PDF Download Wiring

**Status:** Shipped in PR #265.

Deliverables:

- Replace the single AKC Trial Secretary download special case with a shared official-PDF config.
- Download AKC Judge Report and AKC Trial Chairman Report PDFs from their existing builders.
- Download the UKC Nosework Trial Report when the selected show is UKC.
- Keep `pdf-lib` lazy-loaded through the download path.
- Reuse missing-field warnings for every official PDF action.

Tests:

- Assert report ids resolve to the expected official PDF template.
- Assert UKC shows use the UKC trial report rather than the AKC Trial Secretary Report.
- Assert official filenames are sanitized consistently across forms.

## PR 7 — Official PDF Registry Detection

**Status:** Shipped in PR #267.

Deliverables:

- Route official PDF selection from `trials.registry_id` instead of the show-level organization label.
- Carry the trial registry id through shared Reports props so preview and official PDF flows share the same trial-scoped data.
- Preserve AKC as the default when older trial rows do not expose a registry id.

Tests:

- Assert UKC trial registry ids select the UKC Nosework Trial Report even when the show organization label is AKC.
- Assert legacy UKC show labels no longer override an AKC trial registry id.
- Assert `buildTrialReportProps` carries the trial registry id into the shared report props.

## PR 8 — UKC Online Entry Source Flag

**Status:** Current slice.

Deliverables:

- Add a dedicated `entries.entry_source` lane so official reports can distinguish myK9-collected entries from UKC-hosted online entries.
- Keep existing myK9 entries defaulted to `myk9`, including day-of and desk-payment rows.
- Populate UKC Nosework Trial Report online-entry count/subtotal only when `entry_source = 'ukc_online'`.
- Preserve the previous guardrail: `entries.payment_method` remains a payment collection method, not a source-of-entry signal.

Tests:

- Assert UKC Nosework counts split UKC-hosted online, myK9 pre-entry, and day-of-show rows.
- Assert `paymentMethod: 'online'` alone does not count as a UKC-hosted online entry.
- Assert report data mapping carries `entry_source` into shared `ReportProps`.

## Next PRs

- Finish Phase E bookkeeping after PR 8 lands and confirm whether any non-scent-work organization forms should move into a separate future phase.
