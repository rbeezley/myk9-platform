# Plan — Phase E Organization PDF Form Fill

**Date:** 2026-05-20
**Status:** Current phase.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

Replace organization-report HTML stand-ins with official AKC / UKC fillable PDF output so a secretary can submit closeout paperwork without retyping show data.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): after the show, the software should make closeout feel smooth and complete, not like a second round of data entry.

## PR 1 — Form Template Foundation

Deliverables:

- Add `pdf-lib` to myK9Show.
- Register the official AKC / UKC PDF templates now stored under `docs/AKC-forms` and `docs/UKC-forms`.
- Add a reusable AcroForm helper that lists fields and fills text, checkbox, and radio fields from typed values.
- Add the first concrete mapping for the AKC Scent Work Trial Secretary Report (`SW-TSReport.pdf`).

Tests:

- Assert each mapped official PDF exists and exposes the required AcroForm fields.
- Assert AKC Trial Secretary Report values map to exact field names.
- Fill the real AKC PDF in test and reload it to prove the official fields receive the expected values.

## Next PRs

- Wire the Reports UI to download the filled AKC Trial Secretary Report while keeping the HTML report as preview.
- Add AKC Judge Report and Trial Chairman Report field builders.
- Add UKC Nosework Trial Report field builder.
- Surface missing-data warnings before download when a required official field cannot be populated.
