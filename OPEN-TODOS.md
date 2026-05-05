# Open Todos

Active work items only. Resolved items and full context live in TO-DOS.md.

---

## North Star — Phase 2: Walk the Golden Paths

- [ ] **Phase 2 re-walk** — First pass complete 2026-05-03. Do a second end-to-end walk for secretary and exhibitor paths before Phase 3 hand-off. Exit: both paths complete without a blocker.
- [ ] **Build `/exhibitor/check-in/:entryId` page** — Route + `ClassCheckIn.tsx` UI exist but use mock data. Needs: (1) page component reading `useParams<{ entryId }>()` + Supabase fetch, (2) "Check In" CTA on `/exhibitor/show-day`. Files: `apps/myk9show/src/components/exhibitor/ClassCheckIn.tsx`, `apps/myk9show/src/pages/ShowDayPage.tsx`, `apps/myk9show/src/types/exhibitor-types.ts`.
- [ ] **Secretary Task Timeline View** — Add Timeline toggle to Tasks tab on secretary dashboard. Plan: `docs/plans/2026-05-02-secretary-task-timeline-view-plan.md`. No migration required for v1.

## North Star — Phase 3: Real-User Testing

- [ ] **Phase 3 — Real-User Testing** — Recruit 2–3 non-technical test users (one secretary, one or two exhibitors). Hand them written tasks, watch silently, fix every hesitation. Full plan: `docs/plans/strategy/2026-04-11-north-star-fall-2026.md`.

## Health Records

- [ ] **Import Records button** — "Import Records" button on the Health Timeline has no onClick handler. Plan and implement: define supported import formats (CSV? PDF from vet portals?), build import flow. File: `HealthTimeline.tsx` line 272.
- [ ] **Export Timeline button** — "Export Timeline" button has no onClick handler. Plan and implement: decide on export format (PDF, CSV, JSON), generate and download a file of the dog's health events. File: `HealthTimeline.tsx` line 276.
- [ ] **Wire up edit for all health record types** — Edit dialogs exist for VetVisit, Vaccination, Medication, and Allergy but are not reachable from the UI. Requires: (1) fix field name mismatches between the edit dialogs (built against mock types) and the live DB types (`reason` vs `title`, `visit_date` vs `date`, `vet_name` vs `vetName`, etc.), (2) import and call the existing `useUpdate*Mutation` hooks from `useHealthDatabase.ts` in `HealthRecordsSection.tsx`, (3) add `onEditItem` callback through `TraditionalViewProps` → row-level Edit button in `HealthRecordsTraditionalView.tsx`. OFA Screenings and Genetic Tests have no edit dialogs at all — decide whether to build or defer. Files: `HealthRecordsSection.tsx`, `HealthRecordsTraditionalView.tsx`, `VetVisits/EditVetVisitDialog.tsx`, `Vaccinations/EditVaccinationDialog.tsx`, `Medications/EditMedicationDialog.tsx`, `Allergies/EditAllergyDialog.tsx`.

## Training Journal

- [ ] **View Progress Report** — Plan and implement the "View Progress Report" button in the Training Journal Quick Actions card. Should show a breakdown of sessions by skill/sport tag, assessment distribution (breakthrough/solid/needs_work/regression), and training time trends over time. Files: `apps/myk9show/src/components/dogs/DogDetails/TrainingJournal/EnhancedTrainingJournal.tsx`.
- [ ] **Set Training Goals** — Plan and implement the "Set Training Goals" button in the Training Journal Quick Actions card. Should allow users to define and track specific training goals (e.g., "earn NW1 by September"). Files: same as above; may require a new `training_goals` table (migration needed).

## Phase 3 Polish (found during Phase 2 walk, 2026-05-03)

- [ ] **Show cards: no personalized badge for logged-in users** — Cards always show generic status ("Accepting Entries") even when user already entered. Needs `userHasEntriesForShow` wired into browse show cards.
- [ ] **Entry date missing label on MyEntriesPage** — Calendar icon date is the entry close date but has no label clarifying that. Minor polish.

## Route & Page Audit Findings

- [ ] **Admin / judge / club-admin interior audit** — Routes under `/admin/*`, `/judge/*`, `/club-admin/*` not walked end-to-end. Need a pass as SITE_ADMIN (and JUDGE for `/judge/*`) to surface 400s, broken UI, or missing data.
- [ ] **`/results/dashboard` Base UI button warning** — Not reproducible on page load; may only fire on specific interactions. Re-investigate next time it surfaces with a repro path. Files: components rendered by `/results/dashboard`.

## People & Clubs CRUD

- [ ] **People CRUD full audit** — End-to-end audit: create, read, update, delete people as secretary + admin; monitor console/network. Files: `apps/myk9show/src/features/people/`. Full context in TO-DOS.md § "People CRUD + Test Clubs Audit — 2026-04-25".
- [ ] **Clubs full CRUD audit** — Walk create, read, update, delete, list, detail as site admin; capture console/network errors. Files: `apps/myk9show/src/pages/clubs/`. Full context in TO-DOS.md § "Clubs Full CRUD Audit and Fix — 2026-04-25".

## Payments & Email

- [ ] **Stripe Integration** — No Stripe integration exists. Entry fees need Stripe Connect (club's connected account + platform convenience fee via `application_fee_amount`). Includes club Stripe onboarding flow + webhook. Full context in TO-DOS.md § "Stripe Integration + Exhibitor Payments Page — 2026-04-30".
- [ ] **Exhibitor Payments page** — `/exhibitor/payments` list view: date, show name, amount, Stripe reference, status, receipt link. Blocked on Stripe integration above. Files: `apps/myk9show/src/pages/`.

## Pre-Launch Housekeeping

- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch; add deploy step to GitHub Actions after all tests pass. Requires `VERCEL_TOKEN` secret.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as required status check. No direct pushes to main in production.
- [ ] **Make E2E CI jobs blocking** — Skipped historically due to billing issues + unstable test suite. Revisit once tests are stable.
- [ ] **Pre-load AKC & UKC Judge Directory** — Import judge directories into `people` + `judge_qualifications` before launch. Format TBD; check akc.org and ukc.org for CSV/XML export.

---

## Feature Flags — Enable When Ready

- [ ] **Enable competitions + statistics tabs on Dog Details** — Flip `competitionsTab: true` and `statisticsTab: true` in `apps/myk9show/src/config/features.ts`. Both depend on show entry data; enable once show registration + entry system is live. File: `apps/myk9show/src/config/features.ts`.

## Post-Fall (parked — do not pick up before Phase 3 exit)

- [ ] **Prevent Duplicate Rows in Core Tables** — Uniqueness constraints on people/dogs/clubs. Requires duplicate-audit + merge migration before adding constraints. Full context in TO-DOS.md.
- [ ] **Configurable Exhibitor Convenience Fee** — Per-show override + site-admin default. Full context in TO-DOS.md.
- [ ] **Role-Mode Icon Switcher for Sidebar Nav** — Replace labelled section groups with icon-mode switcher (Claude Desktop pattern). Brainstorm before implementing. Full context in TO-DOS.md.
- [ ] **Queue-based Offline Dog Create** — Extend MutationManager to `dogs` table; replace rollback pattern with enqueue. Full context in TO-DOS.md.
- [ ] **Review awesome-design-md for Design Consistency** — Evaluate against current dual approach (shadcn/ui + semantic CSS).
- [ ] **Research Claude Code Managed Agents for AskQ** — Evaluate managed agents API for the AskQ feature. Full context in TO-DOS.md.
