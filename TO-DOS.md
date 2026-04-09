# TO-DOS

Items to address in future sessions.

---

## Outstanding from Code Quality Sprint (2026-02-15)

- [ ] **Make E2E CI jobs blocking once tests are stable** — Investigated 2026-02-27: CI broken due to GitHub Actions billing. myK9Q 1/10 E2E passing (missing test passcodes). myK9Show E2E ~0% (AI-generated artifacts need triage). Next steps: (1) fix billing/wait for reset, (2) decide passcode seeding strategy, (3) triage myK9Show E2E files.

---

## Production Readiness (when real users are on production URL)

- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch. Add a deploy step at the end of the GitHub Actions CI workflow that only runs after all tests pass (`vercel deploy --prod`). Keep auto-deploy for PR preview URLs. Requires `VERCEL_TOKEN` secret and Vercel CLI in CI.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as a required status check. No direct pushes to main in production.

---

## Report Generation Phase 2 — Access Application Reports (2026-04-06)

Port 6 reports from the Access application (mySWT). Phase 1 infrastructure (report engine, preview iframe, print dialog) is complete (PR #46). 6 stub entries exist in `reportRegistry.ts` with `enabled: false`. Access screenshots are in `docs/mySWT/`. Design spec: `docs/superpowers/specs/2026-04-06-report-generation-design.md`.

- [ ] **Show Catalog** — Full catalog of entries for a show/trial. Scope: show, trial.
- [ ] **Result Catalog** — Published results formatted for distribution. Scope: show, trial.
- [ ] **Judge's Schedule** — Per-judge schedule across trials/classes for the show. Scope: show.
- [ ] **Trial Secretary Report** — AKC-required trial secretary report. Scope: trial. Reference: `docs/mySWT/akc_trial_secretary_report.png`.
- [ ] **Judge's Certification Report** — AKC judge certification form. Scope: trial. Reference: `docs/mySWT/akc_judge_certification.png`.
- [ ] **Trial Chairman Report** — AKC trial chairman report. Scope: trial. Reference: `docs/mySWT/akc_trial_chair.png`.

---

## AKC Electronic Results XML Export — 2026-04-09 08:25

- **Build AKC XML results export for myK9Show** — Generate and email the AKC-format `electres.xml` results file so trial secretaries can submit results electronically directly from myK9Show. **Problem:** Trial secretaries currently use a Microsoft Access application (mySWT) to produce this XML file and email it to AKC. The goal is to replicate this workflow natively in myK9Show. **Files:** `docs/mySWT/mod_XML.bas` (VBA source — XML structure reference), `docs/mySWT/Norwegian Elkhound Association of America-Results_20260409082032.xml` (sample output — AKC schema `http://www.akc.org` / `electres.xsd`), `apps/myk9show/src/lib/reports/reportRegistry.ts`, `apps/myk9show/src/pages/secretary/ReportsPage/index.tsx`. **Solution:** (1) Build a TypeScript XML generator that produces the same `<sender>/<event>/<class>/<results>` structure (namespace `http://www.akc.org`, schema version 1.0). Map fields from existing entry/dog/owner queries — key fields: `akcDogRegnum`, `catalogNumber`, `courseTime`, `actionCode`, `resultCode`, placings, owner address, AKC JR handler info. (2) Surface as a "Export to AKC" action on the ReportsPage or trial settings page — generates the XML file and triggers download. (3) Add optional mailto link pre-filled with AKC's submission email address so the secretary can attach and send. No new migration needed if we use existing entry data.
