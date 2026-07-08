# Secretary AKC Scent Work Official Forms Coverage

**Date:** 2026-07-08
**Status:** Current-state coverage matrix for fall 2026 launch readiness.
**Scope:** AKC Scent Work forms and submission artifacts a trial secretary may need to prepare, fill, print, or submit from myK9Show.

## Purpose

myK9Show should handle official organization paperwork the same way the existing Microsoft Access / mySWT workflow does: fill every official PDF field that can be derived from the database, leave human-only fields editable, and clearly show the secretary what still needs review before submission.

This matrix separates three things that are easy to blur together:

- whether the official source form exists in the repo
- whether myK9Show renders an equivalent report
- whether myK9Show fills the official AKC PDF through the `organization-forms` pipeline

## Current AKC Source

The AKC downloadable forms page lists current AKC Scent Work forms, including Entry Form Template, Class Transfer Form, Judge's Report, Judge's Score Sheet, Trial Secretary Report, and Trial Chair Report.

Source: <https://www.akc.org/downloadable-forms/>

Local official-form PDFs currently stored under `docs/AKC-forms/`:

- `SW-EntryForm.pdf`
- `SW-CertificationPage.pdf`
- `SW-JudgeReport.pdf`
- `SW-Scoresheet.pdf`
- `SW-TCReport.pdf`
- `SW-TSReport.pdf`
- `SW-Transfer.pdf`

## Coverage Matrix

| AKC Scent Work artifact                        | Local official PDF                        | Current myK9Show surface                | Official PDF fill status   | Remaining work                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ----------------------------------------- | --------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trial Secretary Report                         | `docs/AKC-forms/SW-TSReport.pdf`          | Reports -> Trial Secretary Report       | Wired                      | Launch-verify against current AKC PDF. Field builder fills club, trial date, event number, run/payment totals, and leaves Trial Secretary editable.                                                                                                                                                                                                      |
| Judge's Report                                 | `docs/AKC-forms/SW-JudgeReport.pdf`       | Reports -> AKC Judge's Report           | Wired                      | Launch-verify against current AKC PDF. Field builder fills event type, event number, event date, club name, and judge name; Location and Judge Email remain secretary review fields.                                                                                                                                                                     |
| Trial Chair Report                             | `docs/AKC-forms/SW-TCReport.pdf`          | Reports -> Trial Chairman Report        | Wired                      | Launch-verify against current AKC PDF. Field builder fills dates, event numbers, club name, and judge names; Trial Chair remains a secretary review field.                                                                                                                                                                                               |
| Entry Form Template                            | `docs/AKC-forms/SW-EntryForm.pdf`         | Reports -> AKC Scent Work Entry Form    | Wired                      | The app renders an in-app printable entry form and fills the official AKC PDF for either one selected dog or an all-dogs packet, because AKC may request paper-form artifacts even for online entries. Remaining work: launch verification against current AKC expectations.                                                                             |
| Judge's Score Sheet                            | `docs/AKC-forms/SW-Scoresheet.pdf`        | Reports -> Score Sheet                  | Partially wired            | The app fills the official two-up landscape AKC score sheet PDF for one selected class, writing Date, Event #, Class, Arm #, Call Name, Breed, and Time Limit(s) on the left/right half-sheets. The scoring and fault fields remain handwritten by design.                                                                                               |
| Class Transfer Form                            | `docs/AKC-forms/SW-Transfer.pdf`          | Reports -> AKC Scent Work Transfer Form | Wired as prefilled helper  | Exhibitor-facing paper helper for move-up requests. The app fills the selected dog/class, club, date, breed, sex, owner, AKC number, and secretary fields; requested move-to class/date/time/authorization fields stay editable for the exhibitor or secretary to complete. The authoritative move-up remains the show-day move-up workflow in myK9Show. |
| Certification Page - Judge and Trial Secretary | `docs/AKC-forms/SW-CertificationPage.pdf` | Reports -> Judge's Certification Report | Wired                      | Required by user decision. The app fills the official AKC PDF with one page per judge, judge-specific qualifying counts, and trial-wide secretary totals. Signature fields remain handwritten.                                                                                                                                                           |
| Electronic results XML                         | Not a PDF                                 | Submit Results                          | Wired, with launch blocker | XML preview/download/send exists. Confirm the real AKC recipient email before launch because code currently uses `results@akc.org` while user-facing docs say `eresults@akc.org`.                                                                                                                                                                        |

## Current Implementation Evidence

- Official PDF templates are registered in `apps/myk9show/src/features/organization-forms/organizationFormTemplates.ts`.
- Official PDF report routing is handled in `apps/myk9show/src/features/organization-forms/officialPdfReports.ts`.
- Official PDFs are downloaded from the Reports page and kept editable through `apps/myk9show/src/features/organization-forms/officialPdfDownload.ts`.
- Missing required PDF fields are surfaced in the Reports toolbar before download.
- AKC Scent Work electronic results XML is generated by `packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts` and used by the Submit Results page.

## Recommended Build Order

1. **Entry Form Template official PDF fill.** Selected-dog PDF fill and all-dogs packet output are wired. Launch-verify against current AKC expectations.
2. **Judge's Score Sheet official PDF fill.** Initial class-scoped two-up PDF fill is wired for the header fields secretaries need prefilled. Launch-verify printed alignment on representative hardware.
3. **Class Transfer Form official PDF fill.** Selected-dog/class prefill is wired as an exhibitor-facing helper. Later tie it to move-up request/history data if myK9Show stores exhibitor-submitted move-up requests before the secretary applies them.
4. **Certification Page official PDF fill.** Required and wired with one page per judge. Launch-verify printed alignment and compare totals against closeout packet expectations.
5. **AKC recipient email verification.** Resolve `results@akc.org` vs `eresults@akc.org` in code and docs before any real send from myK9Show.

## Verification Checklist

- Compare each local PDF with the current AKC downloadable form before launch.
- Run the organization-form template inventory tests after every mapped PDF change.
- Fill each official PDF in an automated test and reload it to prove field values land in the real AcroForm fields.
- Manually download each official PDF from Reports in a seeded AKC Scent Work show and open it in a PDF viewer that secretaries actually use.
- Print at least one closeout packet, one entry form, one score sheet, and one transfer form on representative venue hardware.
