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

## Refactor Replication Query Layer — Structural Cleanup (2026-04-07)

- [ ] **Extract `withReplicationFallback()` helper** — The try-replication / catch-fallback-to-PostgREST pattern is duplicated verbatim across 40+ functions in `showQueries.ts`, `trialQueries.ts`, `classQueries.ts`, `entry-query-lookups.ts`, `entry-query-search.ts`, `dogQueries.ts`, `armbandQueries.ts`, and `waitlistQueries.ts`. **Problem:** Each function contains ~10 lines of identical boilerplate (try/catch, `startTime`, `logQuery`, `createDatabaseError`). A bug fix or logging change must be applied to 40+ locations. **Solution:** Extract a generic `withReplicationFallback<T>(replicationFn, postgrestFn, table, operation)` wrapper in `apps/myk9show/src/services/database/replicationUtils.ts` that handles timing, error creation, and logging. Each query function collapses to a single `return withReplicationFallback(...)` call. ~800 LOC reduction estimated.

---

## Avery Labels Follow-up — Post-Migration Cleanup (2026-04-08)

- [ ] **Wire VenueWifiCard save mutation** — Connect the VenueWifiCard to a Supabase update mutation so secretaries can actually save venue WiFi info. **Problem:** Card currently shows "Coming soon" with disabled inputs because `onSave` is omitted — no data persists. **Files:** `apps/myk9show/src/components/secretary/VenueWifiCard.tsx`, `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx:113-116`. **Solution:** Create a mutation that updates `venue_wifi_network` and `venue_wifi_password` on the shows table. Pass as `onSave` prop in ShowSettingsPage. Load current WiFi values from the show record to pre-populate the card inputs (currently hardcoded to empty strings).

---

## Report Generation Phase 2 — Access Application Reports (2026-04-06)

Port 6 reports from the Access application (mySWT). Phase 1 infrastructure (report engine, preview iframe, print dialog) is complete (PR #46). 6 stub entries exist in `reportRegistry.ts` with `enabled: false`. Access screenshots are in `docs/mySWT/`. Design spec: `docs/superpowers/specs/2026-04-06-report-generation-design.md`.

- [ ] **Show Catalog** — Full catalog of entries for a show/trial. Scope: show, trial.
- [ ] **Result Catalog** — Published results formatted for distribution. Scope: show, trial.
- [ ] **Judge's Schedule** — Per-judge schedule across trials/classes for the show. Scope: show.
- [ ] **Trial Secretary Report** — AKC-required trial secretary report. Scope: trial. Reference: `docs/mySWT/akc_trial_secretary_report.png`.
- [ ] **Judge's Certification Report** — AKC judge certification form. Scope: trial. Reference: `docs/mySWT/akc_judge_certification.png`.
- [ ] **Trial Chairman Report** — AKC trial chairman report. Scope: trial. Reference: `docs/mySWT/akc_trial_chair.png`.
