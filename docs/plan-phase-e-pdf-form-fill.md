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

**Status:** Current slice.

Deliverables:

- Compare each official form's `requiredFields` against the values the current builder can populate.
- Surface missing official fields in the Reports toolbar before download while still allowing the secretary to download and complete the PDF manually.
- Keep the warning helper generic so AKC Judge, AKC Trial Chairman, and UKC builders can reuse the same contract as their download buttons land.
- Preserve the calm Trial Secretary closeout intent: warnings should say what still needs review, not block routine paperwork.

Tests:

- Assert missing-field detection for AKC Trial Secretary, AKC Judge, and AKC Trial Chairman builders.
- Assert readable labels for official PDF field names.
- Assert the Reports toolbar displays missing fields without disabling the official PDF action.

## Next PRs

- Add UKC Nosework Trial Report field builder.
