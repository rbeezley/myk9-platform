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
| Light browser checks | Route existence and redirects | Pending |

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

## Light Browser Checks

| Route | Expected behavior | Result | Evidence |
| --- | --- | --- | --- |

## Recon Gaps For Later Phases

| Gap | Why recon cannot close it | Recommended phase |
| --- | --- | --- |
| Payment and confirmation confidence | Static route evidence cannot prove Stripe handoff, confirmation email feedback, or failed payment recovery. | Phase 2 exhibitor money-path state sweep |
| `/at-show` ringside clarity | Static evidence cannot prove 380px glanceability, tap target quality, dogs-ahead comprehension, or offline tone. | Phase 2 phone-at-ringside pass |
| Results/share completion | Static evidence cannot prove an exhibitor can find post-show results without hunting. | Phase 2 exhibitor journey audit |

## Duplication Notes

| Surface or task | Does this duplicate an existing page? | Recon note |
| --- | --- | --- |
| Secretary operational work | Yes, if rebuilt outside Show Desk | Current plans make `/shows/:showId/show-desk` the canonical single-show operational hub; `/secretary/shows/:showId` is a legacy redirect. Recon should prefer links into Show Desk over new surfaces. |
| Bulk entry approval/check-in | Yes, if rebuilt in Show Desk | Entry Management owns cross-entry and bulk workflows. Show Desk can deep-link to filtered Entry Management, but should not duplicate bulk tables. |
| Exhibitor show-day status | Yes, if rebuilt under old `/exhibitor/show-day` | `/at-show/:showId` and the My Entries show-day banner are the canonical day-of path. Old `/exhibitor/show-day` is a legacy redirect surface. |
