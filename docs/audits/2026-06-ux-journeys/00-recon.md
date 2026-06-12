# UX Journey Audit Recon

**Date:** 2026-06-12
**Scope:** Phase 1 recon for exhibitor and secretary journeys
**Status:** Draft

## Source Inventory

| Source | Purpose | Checked |
| --- | --- | --- |
| `docs/INTENT.md` | Role feelings and UX guardrails | Yes |
| `docs/goals/fall-2026-launch-readiness-scorecard.md` | Canonical golden-path steps | Yes |
| `docs/ux-audits/phase-1-summary.md` | April exhibitor findings | Yes |
| `docs/ux-audits/phase-2-summary.md` | April secretary findings | Yes |
| `docs/plan-show-map-workbench-collapse.md` | Intended secretary workbench boundary | Yes |
| `docs/plan-secretary-show-day-ux-consolidation.md` | Intended secretary routing boundary | Yes |
| `apps/myk9show/src/routes/` | Current route map | Yes |
| Light browser checks | Route existence and redirects | Yes |

Route inventory confirms the current app treats `/at-show/:showId` as the day-of class picker, `/exhibitor/entries` as the exhibitor show hub, `/secretary/dashboard` as the cross-show secretary home, and `/shows/:showId` / `/shows/:showId/show-desk` as the canonical single-show workbench and Show Desk surfaces. `/secretary/shows/:showId` is a legacy redirect. The consolidation plans define Show Desk as the operational hub and Entry Management as the bulk entry surface.

## Prior Finding Disposition

| Finding | April surface | Current status | Evidence | Follow-up phase |
| --- | --- | --- | --- | --- |
| Mock credit card form collects fake data, never submits to Stripe | Registration Wizard | fixed | `PaymentStep` now shows secure-checkout copy instead of card fields; covered by `apps/myk9show/src/test/components/phase3-5-payment-components.test.tsx` and `apps/myk9show/src/test/e2e/registration/exhibitorSelfRegistration.spec.ts`. | Phase 2 exhibitor money-path sweep |
| Zero loading feedback during payment-to-confirmation | Registration Wizard | fixed | `apps/myk9show/src/test/components/RegistrationWorkflow.simple.test.tsx` asserts `isSubmitting` wraps async submission and is passed to `WizardNavigation` as `isLoading`. | Phase 2 exhibitor money-path sweep |
| `UpcomingShowsSection` injects mock competitions when store is empty | Dog Detail | fixed | `apps/myk9show/src/components/dogs/DogDetails/Competitions/UpcomingShows/UpcomingShowsSection.tsx` renders an empty state when `competitions.length === 0`; `apps/myk9show/src/test/components/UpcomingShowsSection.test.tsx` asserts mock/fake data is not injected. | Phase 2 exhibitor dog-profile pass |
| Error states show as empty lists | Cross-cutting | needs-browser-confirmation | April finding spans My Entries, Show Details, and Show Day; current code has changed enough that static evidence should be paired with actual failed-query route walks. | Phase 2 exhibitor state-coverage pass |
| Show Day `onNavigate` not wired | Show Day | obsolete | `/exhibitor/show-day` now redirects via `LegacyShowDayRedirect` to `/at-show/:showId` or `/exhibitor/entries`; replacement cards in `ShowDayHero` pass `onClassNavigate` to `NextUpCard` and `ClassTimelineCard`. | Phase 2 phone-at-ringside pass |
| "Add Achievement" dialog unreachable / "Add Past Result" no-op | Dog Detail | fixed | `apps/myk9show/src/components/dogs/DogDetails/Competitions/CompetitionsTabs.tsx` wires the add button to `setAddPastResultOpen(true)` and `setAddAchievementOpen(true)`, then passes both dialog states into the child sections. | Phase 2 exhibitor dog-profile pass |
| No entry status badge in Show Details hero | Show Details | fixed | `apps/myk9show/src/pages/ShowDetailsPage.tsx` adds the non-secretary `entryStatus.label` to hero badges. | Phase 2 exhibitor show-details pass |
| Register button silently disappears when entries close | Show Details | fixed | `apps/myk9show/src/pages/ShowDetailsPage.tsx` passes `entryStatus.description` as `closedMessage`; `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx` covers closed-entry button behavior. | Phase 2 exhibitor show-details pass |
| Title progress absent from Dashboard / buried on Dog Detail | Cross-cutting | needs-browser-confirmation | Static code shows newer Dog Detail title-progress surfaces, including `RollingTitleProgress` and a sidebar `TitleProgressCard`, but the exhibitor dashboard replacement still needs a browser journey check. | Phase 2 exhibitor dog-profile/dashboard pass |
| 62% of Dog Detail tabs are premium-gated | Dog Detail | still-open | Current canonical surface is `/dogs/:id`: `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx` still locks Title Progress, Statistics, Health Records, Training Journal, and Pedigree for non-premium exhibitors. | Phase 2 exhibitor dog-profile pass |
| Pipeline hardcoded scoring/review booleans | Pipeline Dashboard | obsolete | `apps/myk9show/src/routes/secretaryRoutes.tsx` documents Secretary Dashboard as replacing old PipelineDashboard; class review now lives under canonical `/shows/:showId/results-control` and trial detail `/secretary/pipeline/:trialId`. | Phase 3 secretary journey audit |
| Scratch/move-up takes 4-5 taps | Day-of Operations | needs-browser-confirmation | Day-of Operations has been redirected/collapsed toward Show Desk, and `showMapActions.ts` marks Show Desk as the canonical operational surface; actual tap count must be verified in the replacement flow. | Phase 3 secretary show-day operations pass |
| No "Clone from Previous Show" | Show Creation Wizard | fixed | `apps/myk9show/src/components/shows/wizard/steps/ShowDetailsStep.tsx` includes `CloneFromShowCombobox`; e2e coverage asserts the "Select a past show to clone" affordance in `apps/myk9show/src/test/e2e/entities/showWizardUI.spec.ts` and `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`. | Phase 3 secretary show-setup pass |
| CSV export missing owner/contact/reg columns | Entry Management | fixed | `apps/myk9show/src/hooks/useEntryManagementActions.ts` exports `Registration #`, owner first/last name, email, and phone headers via `buildExportRow`. | Phase 3 secretary entry-management pass |
| "Send Email" bulk button does nothing | Entry Management | fixed | Current canonical Entry Management uses enrollment-level email flow: `EnrollmentCard.tsx` opens an email dialog and calls `onSendDecisionEmail` from the dialog's `Send Email` button. | Phase 3 secretary entry-management pass |
| Check-in status clickable but looks static | Entry Management | fixed | `apps/myk9show/src/components/entries/management/EntryListCard.tsx` renders check-in status as a button with clickable styling; `EntryListCard.test.tsx` asserts `cursor-pointer` and border affordance. | Phase 3 secretary entry-management pass |
| Results Control query failure skeletons forever | Results Control | fixed | `apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx` derives `isError` from all settings queries and renders a destructive alert with `Retry`. | Phase 3 secretary results-control pass |
| No effective-settings summary after overrides | Results Control | needs-browser-confirmation | `SettingsOverrideCard` accepts resolved `currentSettings` and displays inherited labels, and `SecretaryClassDashboard` reads `useClassEffectiveSettings`; browser verification should confirm the summary is visible after override edits. | Phase 3 secretary results-control pass |
| Event number validation blocks wizard despite optional copy | Show Creation Wizard | fixed | `TrialConfigurationStep.tsx` now makes event number required only for AKC and changes placeholder copy between "Required: AKC event number" and "Optional event number". | Phase 3 secretary show-setup pass |
| Pipeline pushed below fold by stats/announcements | Pipeline Dashboard | obsolete | Old Pipeline Dashboard was replaced by Secretary Dashboard and canonical single-show Show Desk; any fold-order review belongs on `/secretary/dashboard` and `/shows/:showId/show-desk`. | Phase 3 secretary journey audit |

## Exhibitor Journey Map

| Scorecard step | Current surface | Route/component | Evidence | Audit notes |
| --- | --- | --- | --- | --- |
| 1. Find an eligible show. | Browse Shows / public show list | `/shows` via `PublicRoutes`; `/browse-shows` and `/shows/browse` redirect to `/shows` | Static route evidence | Phase 2 should test cold-start discoverability from landing/search, not just route existence. |
| 2. Understand whether the show is right for their dog. | Show Details overview, trials, classes, and styled public landing | `/shows/:id`, tabs for `overview`, `trials`, `classes`, `results`; styled landing path for non-entered exhibitors | Static route evidence; `ShowDetailsPage` derives show classes, entry status, and trial stats | Verify dog-fit clarity in Phase 2, especially class eligibility, closed-entry messaging, and premium/download expectations. |
| 3. Enter a dog in the right classes. | Registration Wizard from Show Details | `/shows/:showId/register` via `RegistrationWizardPage`; Show Details CTA navigates to registration | Static route evidence | Confirm class-selection copy and edit/re-entry behavior in the exhibitor registration walkthrough. |
| 4. Pay or understand payment status. | Registration Wizard payment step and My Entries receipt/status surfaces | `/shows/:showId/register`; `/exhibitor/entries` / `/my-entries` via `MyEntriesPage` | Static route evidence; payment code paths and receipt dialog exist | Keep Stripe handoff, pending states, receipts, and failed/retry recovery in the exhibitor money-path sweep. |
| 5. Receive confirmation and show-day updates. | My Entries plus registration completion/receipt path | `/exhibitor/entries`, `/my-entries`, registration completion path after wizard submit | Static route evidence; April email/payment findings need Phase 2 confirmation | Keep payment and email state checks in the exhibitor money-path sweep. |
| 6. Know where/when to appear. | Show Details class/trial tabs, My Entries show hub, and at-show class picker | `/shows/:id?tab=classes`, `/shows/:id?tab=my-entries`, `/exhibitor/entries`, `/at-show/:showId` | Static route evidence; `AtShowClassListPage` groups classes by trial/date | Phase 2 should verify this can be found from an accepted entry without guessing the route. |
| 7. Understand check-in, scratches, move-ups, and results. | My Entries check-in dialog plus at-show class picker and entry lists | `/exhibitor/entries`, `/exhibitor/check-in/:entryId` legacy redirect, `/at-show/:showId`, `/at-show/:showId/class/:classId` | Static route evidence; `AtShowEntryListPage` uses real check-in actions and ringside filters | Phone-at-ringside pass must verify one-handed use, dogs-ahead/conflict chips, scratch/move-up clarity, and offline tone. |
| 8. View results after the show. | Show Details results tab and class results route | `/shows/:id?tab=results`, `/shows/:showId/trials/:trialId/classes/:classId/results` | Static route evidence | Phase 2 should prove an exhibitor can get from My Entries/show history to post-show results without hunting. |

## Secretary Journey Map

| Scorecard step | Current surface | Route/component | Evidence | Audit notes |
| --- | --- | --- | --- | --- |
| 1. Create or open a show. | Create Show wizard or Secretary Dashboard | `/secretary/create-show/wizard`, `/secretary/dashboard` | Static route evidence; dashboard quick links point to the wizard and show-scoped entry management | Phase 3 should verify cold-start setup flow and clone-from-previous-show status. |
| 2. Configure club, registry, trials, classes, rings, judges, and run order. | Show Setup inside the single-show workbench; legacy run-order route redirects into setup | `/shows/:showId/setup`; `/secretary/run-order` redirects to show setup | Static route evidence; `SHOW_MANAGEMENT_SECTIONS` exposes `setup` as the canonical show section | Phase 3 setup pass should verify the setup surface covers configuration end to end without requiring legacy `/secretary/shows/:showId` routes. |
| 3. Publish or share entry information. | Public Show Details and registration entry points | `/shows/:id`, `/shows/:showId/register`, `/secretary/register/:showId` | Static route evidence | Phase 3 should verify secretary-facing publish/share actions are visible from setup or dashboard, not only that public routes exist. |
| 4. Manage entries, dogs, people, payments, waitlist, scratches, move-ups, and day-of additions. | Entry Management, People, and secretary registration path | `/shows/:showId/entry-management`, `/people`, `/people/:id`, `/secretary/register/:showId`; legacy `/secretary/entries/:showId?` redirects to show-scoped Entry Management | Static route evidence; dashboard pending-entry links target Entry Management | Phase 3 state coverage should verify bulk approval, check-in, email/payment, waitlist, scratch, move-up, and day-of-addition recovery. |
| 5. Use the show workbench to understand what needs attention. | Show Desk inside the single-show workbench | `/shows/:showId/show-desk`; `/secretary/day-of` and `/secretary/check-in` redirect to Show Desk | Static route and consolidation-plan evidence | Phase 3 pressure pass should verify it surfaces problems, not raw data. |
| 6. Print required sheets, labels, and official forms. | Reports and Show Desk closeout links | `/shows/:showId/reports` | Static route evidence; Show Desk links to Reports; report tests cover check-in sheet and result catalog deep links | Print quality belongs to separate venue hardware todo, not this recon. |
| 7. Run check-in and ring operations. | Show Desk, Entry Management check-in controls, and scoring class entry list | `/shows/:showId/show-desk`, `/shows/:showId/entry-management`, `/scoring/classes/:classId/entries` | Static route evidence; scoring and entry-management pages reference check-in status | Phase 3 must browser-test ring pressure behavior, especially scratches, move-ups, check-in status changes, and one-tap recovery paths. |
| 8. Enter or receive scores. | Scoring entry list and individual scoresheet | `/scoring/classes/:classId/entries`, `/scoring/classes/:classId/entries/:entryId` | Static route evidence; individual `ScoresheetPage` shows offline/sync state; other scoring surfaces use replicated tables and need Phase 3/Dynamic QA verification | Dynamic QA should verify secretary and judge score entry, save-and-next behavior, failed sync tone, and return paths to Show Desk. |
| 9. Confirm placements and class completion. | Scoring class list, secretary class dashboard, and Results Control | `/scoring/classes/:classId/entries`, `/shows/:showId/trials/:trialId/classes/:classId/secretary`, `/shows/:showId/results-control` | Static route evidence; scoring tests cover placement calculation and delayed placement visibility | Phase 3 should verify class-complete status and placement confirmation are obvious before result release. |
| 10. Produce results, reports, and closeout artifacts. | Results Control, Reports, and Submit Results | `/shows/:showId/results-control`, `/shows/:showId/reports`, `/shows/:showId/submit-results` | Static route evidence; Show Desk links to Results Control, Reports, and Submit Results | Closeout pass should verify official forms, result release settings, and submission status form one calm end-of-show path. |
| 11. Recover safely from offline/reconnect conditions. | Replication-backed show-day paths | Show Desk, Entry Management, scoring/ringside surfaces | Static evidence insufficient; individual `ScoresheetPage` shows offline/sync state; other scoring surfaces use replicated tables and need Phase 3/Dynamic QA verification | Dynamic QA and later golden-path walks must verify offline/reconnect behavior. |

## Light Browser Checks

Dev server used: `http://localhost:5173/`.

Credentials came from `apps/myk9show/src/test/e2e/helpers/testUsers.ts`: exhibitor `exhibitor1@myk9t.com` and secretary `secretary@myk9t.com`, both with the checked-in password from that file. No forms were submitted beyond sign-in. Seeded show ids were discovered from rendered read-only pages: exhibitor show `3b91e282-6e45-4a89-9446-f6ebeb0bf62c` and secretary show `4584f257-19b5-4016-aae6-5e7827b769cb`.

| Route | Expected behavior | Result | Evidence |
| --- | --- | --- | --- |
| `/exhibitor/show-day` | Legacy path redirects to show-specific `/at-show/:showId` when show context exists, otherwise falls back to My Entries | Confirmed | Signed-in exhibitor landed on `http://localhost:5173/exhibitor/entries`; this matches the no-selected-show fallback in `getLegacyShowDayRedirectTarget`. Page rendered `My Shows` with a show-day banner. |
| `/exhibitor/entries` | Exhibitor My Shows / My Entries hub renders for the signed-in exhibitor | Confirmed | Signed-in exhibitor stayed on `http://localhost:5173/exhibitor/entries`; page rendered `My Shows`, `My Dogs`, and `My Entries`. A server data-load toast appeared for `dogs`/`entries` policy recursion, so this is route/render evidence, not a clean data-state pass. |
| `/shows/:showId` | Show details page renders for a safe seeded show id | Confirmed | With exhibitor show id `3b91e282-6e45-4a89-9446-f6ebeb0bf62c`, final URL was `http://localhost:5173/shows/3b91e282-6e45-4a89-9446-f6ebeb0bf62c`; page rendered `Heritage`, entry status, tabs, and `My run schedule`. |
| `/shows/:showId/register` | Registration wizard route renders for a safe seeded show id without submitting entry data | Confirmed | With exhibitor show id `3b91e282-6e45-4a89-9446-f6ebeb0bf62c`, final URL was `http://localhost:5173/shows/3b91e282-6e45-4a89-9446-f6ebeb0bf62c/register`; page rendered `Register for Show` and the class-selection step. No class selection or submission was performed. |
| `/at-show/:showId` | At-show class picker renders for a safe seeded show id | Confirmed | With exhibitor show id `3b91e282-6e45-4a89-9446-f6ebeb0bf62c`, final URL was `http://localhost:5173/at-show/3b91e282-6e45-4a89-9446-f6ebeb0bf62c`; page rendered `Heritage` and grouped class cards by trial. |
| `/secretary/dashboard` | Secretary dashboard renders for the signed-in secretary | Confirmed | Signed-in secretary stayed on `http://localhost:5173/secretary/dashboard`; page rendered `Good afternoon, Test`, show sections, and task content. A server data-load toast appeared for `dogs`/`entries` policy recursion, so this is route/render evidence, not a clean data-state pass. |
| `/secretary/shows/:showId?phase=setup` | Legacy secretary show route redirects to canonical single-show setup surface | Confirmed | With secretary show id `4584f257-19b5-4016-aae6-5e7827b769cb`, final URL was `http://localhost:5173/shows/4584f257-19b5-4016-aae6-5e7827b769cb/setup?phase=setup`; page rendered the single-show workbench `Setup` surface. |
| `/secretary/shows/:showId?phase=show-desk` | Expected show-desk phase link should land on the canonical Show Desk surface | Different | With secretary show id `4584f257-19b5-4016-aae6-5e7827b769cb`, final URL was `http://localhost:5173/shows/4584f257-19b5-4016-aae6-5e7827b769cb/setup?phase=show-desk`; page rendered `Setup`, not Show Desk. Code-backed cause: `LegacySecretaryShowRedirect` preserves the query string but defaults the subpath to `setup`. |
| `/secretary/shows/:showId/entry-management` | Legacy secretary show subroute redirects to canonical show-scoped Entry Management | Confirmed | With secretary show id `4584f257-19b5-4016-aae6-5e7827b769cb`, final URL was `http://localhost:5173/shows/4584f257-19b5-4016-aae6-5e7827b769cb/entry-management`; page rendered `Entry Management`. |

## Recon Gaps For Later Phases

| Gap | Why recon cannot close it | Recommended phase |
| --- | --- | --- |
| Payment and confirmation confidence | Static route evidence cannot prove Stripe handoff, confirmation email feedback, or failed payment recovery. | Phase 2 exhibitor money-path state sweep |
| `/at-show` ringside clarity | Static evidence cannot prove 380px glanceability, tap target quality, dogs-ahead comprehension, or offline tone. | Phase 2 phone-at-ringside pass |
| Results/share completion | Static evidence cannot prove an exhibitor can find post-show results without hunting. | Phase 2 exhibitor journey audit |
| Show Desk pressure behavior | Static evidence cannot prove the secretary sees the right next action during scratches, move-ups, and scoring interruptions. | Phase 3 secretary show-day pressure pass |
| Legacy phase/query redirect mismatch | Light browser checks found `/secretary/shows/:showId?phase=show-desk` landed on `/shows/:showId/setup?phase=show-desk`, rendering Setup instead of Show Desk. | Phase 3 secretary routing cleanup |
| Bulk-operation failure states | Static route evidence cannot prove partial approve/check-in/armband failures recover calmly. | Phase 3 secretary state coverage |
| Route-check data-load toasts | Light browser checks surfaced `dogs`/`entries` policy-recursion data-load toasts on route/render checks; this needs investigation outside recon before golden-path walkthroughs. | Dynamic QA infrastructure plus scorecard close-out |
| Offline/reconnect recovery | Static route evidence cannot prove sync recovery or conflict tone. | Dynamic QA infrastructure plus scorecard close-out |

## Duplication Notes

| Surface or task | Does this duplicate an existing page? | Recon note |
| --- | --- | --- |
| Secretary operational work | Yes, if rebuilt outside Show Desk | Current plans make `/shows/:showId/show-desk` the canonical single-show operational hub; `/secretary/shows/:showId` is a legacy redirect. Recon should prefer links into Show Desk over new surfaces. |
| Bulk entry approval/check-in | Yes, if rebuilt in Show Desk | Entry Management owns cross-entry and bulk workflows. Show Desk can deep-link to filtered Entry Management, but should not duplicate bulk tables. |
| Exhibitor show-day status | Yes, if rebuilt under old `/exhibitor/show-day` | `/at-show/:showId` and the My Entries show-day banner are the canonical day-of path. Old `/exhibitor/show-day` is a legacy redirect surface. |
