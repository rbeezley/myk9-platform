# TO-DOS

Items to address in future sessions.

---

## Port Exhibitor Trial-Day Features to myK9Show (2026-03-14, updated 2026-04-02)

Goal: myK9Show becomes the complete platform for exhibitors. myK9Q stays as the ringside operations tool for judges, stewards, and timers. See [architecture decision](docs/superpowers/specs/2026-04-02-one-app-vs-two-apps-design.md).

### Secretary / Operations

- [x] **Results control / publishing** — Done (PR #37). Standalone page at `/secretary/results-control` with PresetSelector, TrialOverrides, ClassOverrides with checkboxes, BulkOperationsBar (batch upsert), SelfCheckinSection, and Release Results. 40 tests. Follow-up cleanup tracked separately.

### Live Event / Spectator

- [x] **TV run order display** — Done (PR #41). Public route at `/tv/:showId` with persistent dark grid, podium takeover with staggered reveal/confetti/shimmer, mobile scrollable list, Supabase Realtime subscriptions, QR code on secretary dashboard. Migration 108 adds anon entries RLS + fixes stale status values in shows/trials/classes RLS. 40 tests. Deploy: `supabase db push` for migration 108.
- [x] **Voice announcements / settings** — Done. NotificationSettings extended with Voice Announcements card: master toggle, 4 per-category toggles (run order, results, class starting, announcements), grouped voice picker (Recommended/Other), enhanced voice nudge with platform-specific download instructions, speed slider, test button. Push moved into Channels card. ScoringSettings removed. `speakWithConfig` in `@myk9/notifications` with localStorage migration guard. 47 package tests + 15 component tests + 16 utility tests.

### Data & Analytics

- [x] **Gate premium analytics behind subscription** — Done (PR #42). Three sections (QualificationTrendChart, DogBreakdownCards, FastestTimesTable) gated behind `performance_stats` feature with `<FeatureGate>`. Shows-based free trial: users with <= 3 scored shows get premium analytics free, with trial banner. Hardened: loading race fix, expired subscriber trial re-entry blocked, null expiry treated as expired. 23 tests.

---

## Class Details Page — Future Enhancements (2026-03-24)

- [x] Dog status column (Checked In / In Ring / On Deck / Conflict) — Done. `check_in_status` column on entries table with 8 statuses, `CheckInStatusBadge` in ClassResultsTable with click-to-change `StatusPickerDialog`, `useCheckInMutation` with optimistic UI, realtime subscriptions, conflict detection utility, self-check-in control per show/trial/class.
- [x] **Drag-and-drop run order in entries table** — Done (branch feat/myk9q-db-alignment). Secretary can drag rows in Pending/All tabs to reorder; saves optimistically with rollback on failure. Exhibitor Show Day shows "X dogs ahead" / "You're next" countdown on ClassTimelineCard and NextUpCard, updated via Supabase Realtime. No migration needed (`run_order` column already existed).
- [x] Inline score editing in table cells — Already implemented. ClassResultsTable has inline editable cells for qualification, search time, faults, and judge notes with edit buffer, optimistic UI, keyboard navigation, and batch submit.

---

## Outstanding from Code Quality Sprint (2026-02-15)

- [ ] **Make E2E CI jobs blocking once tests are stable** — Investigated 2026-02-27: CI broken due to GitHub Actions billing. myK9Q 1/10 E2E passing (missing test passcodes). myK9Show E2E ~0% (AI-generated artifacts need triage). Next steps: (1) fix billing/wait for reset, (2) decide passcode seeding strategy, (3) triage myK9Show E2E files.

---

## Production Readiness (when real users are on production URL)

- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch. Add a deploy step at the end of the GitHub Actions CI workflow that only runs after all tests pass (`vercel deploy --prod`). Keep auto-deploy for PR preview URLs. Requires `VERCEL_TOKEN` secret and Vercel CLI in CI.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as a required status check. No direct pushes to main in production.

---

## Security & Data Integrity — /harden findings (2026-03-31)

- [x] **Fix `is_trial_secretary` null `club_id` RLS bypass** — Done. Migration `102_fix_trial_secretary_rls_bypass.sql` removes `ur.club_id IS NULL` fallback from both `is_trial_secretary()` and `is_club_admin()`, deletes over-privileged rows, adds constraint trigger enforcing `club_id IS NOT NULL` for secretary/club_admin roles.

- [x] **Reconcile dual visibility table schema (migration 060 vs 093)** — Done. Migration `103_drop_duplicate_visibility_tables.sql` drops 12 RLS policies and 3 duplicate 093-named tables. TypeScript consumers still need updating (see follow-up below).

- [x] **Update TypeScript files referencing dropped 093 visibility tables** — Migration 103 dropped `show_result_visibility_defaults`, `trial_result_visibility_overrides`, `class_result_visibility_overrides`. ~16 TypeScript files across myK9Show (4) and myK9Q (12) still reference these table names and need to be pointed at the canonical 060 tables (`show_visibility_settings`, `trial_visibility_overrides`, `class_visibility_overrides`). Column `preset_name` → `preset`. Regenerate Supabase types after. **Files:** `apps/myk9show/src/hooks/queries/useVisibilitySettings.ts`, `apps/myk9show/src/hooks/mutations/useVisibilityMutations.ts`, `apps/myk9show/src/hooks/useVisibleResultFields.ts`, `apps/myk9show/src/features/pipeline/components/ShowSettingsPanel.tsx`, plus ~12 myK9Q files (replication layer, services, hooks).

- [x] **Add `results_released_by` audit column to `classes` table** — Done. Migration `100_add_results_released_by.sql` adds column; `useReleaseResults` writes user ID.

---

## Harden Volunteer Scheduling RLS Policies - 2026-03-30 18:20

- [x] **Extract shared RLS helper function for secretary/admin check** — The same 6-line `EXISTS (SELECT 1 FROM user_roles JOIN roles ...)` subquery is duplicated 6 times across volunteer table policies. **Problem:** DRY violation — if a role is added or the check logic changes, 6 policies must be updated in lockstep. **Files:** `supabase/migrations/095_volunteer_scheduling.sql:49-67,70-88,90-108`. **Solution:** Create a `is_secretary_or_admin()` SECURITY DEFINER STABLE function, then replace all 6 policy bodies with `USING (is_secretary_or_admin())`. Also drop the redundant `WITH CHECK` clauses (Postgres uses USING when WITH CHECK is identical). Audit other migrations for the same pattern and consolidate. — Done (migration 100).

- [x] **Add show-scoped RLS to volunteer write policies** — Secretary write policies grant access to volunteers across all shows, not just the secretary's assigned shows. **Problem:** A secretary assigned to Show A can currently insert/update/delete volunteer records for Show B. Fine for single-club usage but breaks multi-tenancy. **Files:** `supabase/migrations/095_volunteer_scheduling.sql:48-108` (all three FOR ALL policies). **Solution:** Check `ur.scope_id = volunteers.show_id` for secretary role (site_admin remains global). Requires verifying that secretary user_roles rows have `scope_type = 'show'` and `scope_id` set correctly. — Done (migration 100).

---

## Add Push Notifications to Announcements - 2026-03-30 18:30

- [x] **Wire announcements into push notification infrastructure** — Done (PR #38). New edge function `push-trigger-announcement` sends web-push to show participants (exhibitors + officials) when high/urgent announcements are created. Database trigger via pg_net on `show_announcements` INSERT with `WHEN` clause filtering. Normal priority remains in-app only. Deploy steps: `supabase functions deploy push-trigger-announcement --no-verify-jwt` then `supabase db push`.

---

## Results Control Page — Follow-up Cleanup (2026-03-31)

- [x] **Move `detectPreset` and `hasVisibilityOverride` to `@myk9/secretary`** — Done. Functions + `FieldTimings` type moved to `packages/secretary/src/visibility/`. Consumers updated.

- [x] **Replace `useBulkClassOperations` with existing `useBulkSelection<T>`** — Done. Redundant hook deleted; `ResultsControlPage` now uses `useBulkSelection`.

---

## Port AskQ AI Assistant to myK9Show - 2026-03-30 18:11

- [x] **Port AskQ (Ask Queue) from myK9Q to myK9Show** — Done (PR #39). AskQ panel integrated into AppHeader/UnifiedAppLayout as a floating SlideOverPanel. Edge function `ask-myk9q` reused with show_id scoping. Frontend rebuilt with shadcn/Tailwind. Triggered via keyboard shortcut.

---

## In-App Chat — Exhibitor ↔ Secretary Messaging (2026-04-01)

- [x] **In-app chat between exhibitors and trial secretary** — Done (PR #40). Private 1-on-1 messaging + targeted class broadcasts. Tables: `show_message_threads`, `show_messages` (migration 106). Edge functions: `push-trigger-chat-message`, `send-targeted-message`. Zustand store with `postgres_changes` realtime. Secretary inbox at `/secretary/messages`, exhibitor chat at `/messages/:showId`. "Message Class" button on ClassDetailsPage. Unread badges on sidebar nav. 34 tests. Hardened: auth bypass fixes, column-restriction trigger, RLS deny policy, subscription mutex, cross-club validation.

---

## Report Generation & Printing System - 2026-04-01 20:21

- **Build report generation system with scope/sort selection** — Secretary needs to generate and print multiple report types at varying scopes with configurable sort order. **Problem:** No reporting infrastructure exists in myK9Show. Dog shows require numerous printed reports for operations, judging, and organization compliance. **Solution:** Build a report picker UI: (1) select report type, (2) select scope (show / trial / class), (3) select sort order, then generate a print-ready view. Report types fall into three categories:

  **Operational Reports:**
  - Check-in sheets (per show, trial, or class)
  - Score sheets (per show, trial, or class)
  - Preliminary results sheets
  - Show catalog (full participant/entry listing)
  - Result catalog (final results compilation)
  - Judge's schedule

  **Organization-Specific Reports** (vary by show type / sanctioning body):
  - Trial secretary report
  - Judge's certification report
  - Trial chairman report

---

## Avery Label Printing (Armbands & Results) - 2026-04-01 20:22

- **Print armband labels on Avery sheet labels** — Secretary needs to print armband number labels on standard Avery label sheets in various sizes. **Problem:** No label printing capability exists in myK9Show. Armband numbers are assigned to exhibitors/dogs and need to be printed on adhesive labels for physical use at shows. Different clubs use different Avery label sizes (e.g., 5160, 5163, 8160). **Solution:** Build a label layout engine that maps data onto a grid matching the selected Avery template dimensions and margins, then generates a print-ready CSS `@page` layout. User picks the Avery product number, selects scope (show/trial/class), and prints. The label engine should be reusable across label types.

- **Print result labels on Avery sheet labels** — Exhibitors attach result labels to their qualifying ribbons for personal records. Each label should show score/search time, class, judge, and trial info. **Problem:** Exhibitors currently have no printed takeaway connecting their ribbon to specific run details. **Solution:** Reuse the same Avery label layout engine from armband printing. Secretary selects "Result Labels" as the label type, picks scope (show/trial/class) and Avery size, and prints. Label content: dog name, armband #, class, judge, trial date, score or search time, qualifying status.

---

## Brainstorm: One App vs Two Apps - 2026-04-01 20:23

- [x] **Decide whether to merge myK9Q into myK9Show or keep separate** — RESOLVED (2026-04-02). Decision: keep both apps. myK9Show = the platform (exhibitors, secretaries, club admins). myK9Q = ringside tool (judges, stewards, timers, exhibitors who prefer it). Strip secretary/admin features from myK9Q, port TV run order + voice announcements to myK9Show. See [architecture decision](docs/superpowers/specs/2026-04-02-one-app-vs-two-apps-design.md).

---

## Align myK9Q to Platform Database (2026-04-02)

- [x] **Point myK9Q at myk9-platform Supabase project** — Done (PR #44). Reconciled env vars, schema differences, replication layer, and edge function references against unified `myk9-platform` Supabase project.

- [x] **Build passcode generation in myK9Show** — Done (2026-04-06). Secretary sees all four role codes (admin/judge/steward/exhibitor) derived from show UUID on ShowSettingsPage and wizard success screen. `MyK9QAccessCard` with copy + print slip. `validate-passcode` edge function updated to derive from `show.id`. Algorithm in `@myk9/core`.

- [ ] **Strip secretary/admin features from myK9Q** — Remove results control, Kanban board, volunteer scheduling, reports, show management, in-app chat, announcement creation. Low priority -- do when naturally touching those files.

---

## Debug Site Admin Login & Password Reset - 2026-04-01 20:23

- [x] **Fix site admin login failure and missing password reset emails** — RESOLVED (2026-04-02). Root cause: database was wiped — all user data gone, only schema remained. `richard@myk9t.com` account no longer exists. `site_admin` and `secretary` roles were never seeded (migration 066 bug). Fix: migration 107 seeds both roles + grants site_admin to new `beezley@cox.net` account. **Open issue:** Database wipe cause unknown — no vacuum history, no dead tuples, tables appear to have never had data. Contact Supabase support re: project `sojmvhhwsjxmfistvzbe`. Email deliverability also an issue (see below).

- [x] **Investigate database data loss** — RESOLVED (2026-04-02). Cause: out-of-order migrations were pushed yesterday, triggering a full db reset. All 107 migrations re-ran from scratch (confirmed via sequential transaction IDs). Seed/reference data survived (populated by migrations), user-generated data did not. Not a Supabase issue.

- [x] **Configure DNS for Resend email deliverability** — RESOLVED (2026-04-02). Three fixes applied: (1) Set `SITE_URL=https://myk9show.com` on Supabase Edge Functions so confirmation links match the sending domain (was pointing to vercel.app). (2) Added `_dmarc` TXT record in Vercel DNS. (3) Changed FROM_EMAIL from `noreply@` to `notifications@myk9show.com` in all 3 edge functions. SPF + DKIM were already configured. Domain was already verified in Resend.

---

## Implement Wait List & Mail-In Reservations - 2026-04-02 20:08

- [x] **Implement wait list and mail-in reservation system** — Done (PR #43). Judge-day capacity model (125 entries/judge/day default), FIFO wait lists, configurable mail-in reservation strategies (fixed/percentage/deadline), secretary capacity dashboard with bulk promotion, exhibitor wait list queue on My Entries page. Migration 114 live. Phases 7 (Stripe payment flow) and 8 (push edge function) deferred — see items below.

---

## Generate myK9Q Passcodes from myK9Show - 2026-04-01 20:23

- [x] **Build passcode generation for myK9Q roles** — Moved to "Align myK9Q to Platform Database" section above (depends on database alignment). See [architecture decision](docs/superpowers/specs/2026-04-02-one-app-vs-two-apps-design.md).

---

## Configurable Payment Types Per Show - 2026-04-01 20:24

- [x] **Allow clubs to configure accepted payment methods per show** — Done. Online (card) always enabled; check and cash are opt-in per show via `accept_check_payments`/`accept_cash_payments` boolean flags (migration 115). Payment Methods section in wizard step 1 and edit fees tab. Indigo pill badges on show details page. PaymentMethodSelector filters check/cash based on show flags. Shared `PaymentMethodsCheckboxGroup` component. 25 tests. Deploy: `supabase db push` for migration 115.

---

## Security Hardening — /harden Findings from Analytics Gating (2026-04-02)

- [x] **Restrict `subscription_tier` column writes via RLS** — Done. Migration `109_restrict_subscription_columns.sql` splits the `exhibitor_profiles_policy` FOR ALL into separate SELECT/INSERT/UPDATE/DELETE policies. Column-restriction trigger `restrict_subscription_column_updates()` blocks non-privileged writes to `subscription_tier`, `subscription_expires_at`, and `stripe_customer_id`. Service role and platform_admin bypass. Deploy: `supabase db push` for migration 109.

- [x] **Scope `getAllDogs` query to current user's dogs** — Done. `getAllDogs`, `searchDogs`, `getDogsWithUpcomingShows`, and `getDogStatistics` now require `personId` parameter and filter by `owner_id`/`co_owner_id`. Hook callers (`useDogsQuery`, `useDogsSearchQuery`, `useDogStatisticsQuery`) pass `personId` from `useExhibitorProfile` and disable queries when unavailable.

- [x] **Fix `window.location.href` hard navigation in FeatureGate dialog** — Done. Replaced `window.location.href = '/pricing-page'` with `useNavigate` from React Router in `FeatureUpgradePrompt`. No more full page reload destroying React Query cache and Zustand stores.

---

## UX Audit Findings — Exhibitor Core Journey (2026-04-04)

Full audit details in `docs/ux-audits/phase-1-summary.md` and individual page audits in `docs/ux-audits/01-*.md` through `06-*.md`.

### Critical

- [x] **Replace mock credit card form in Registration Wizard** — Done. Removed CreditCardVisual and mock card fields. Replaced with honest "payment coming soon" Alert. Fixed misleading Stripe messaging in PaymentSummaryCard and PaymentStep. 26 tests updated.

- [x] **Add loading feedback during registration payment submission** — Already fixed in `a2261900`. `isSubmitting` wired to `WizardNavigation`, double-click guard via `submittingRef`. Regression tests added (5 structural + 11 component).

- [x] **Remove mock data injection in Dog Detail UpcomingShowsSection** — Done. Removed mockCompetitions useEffect. Added EmptyState with Calendar icon, "No Upcoming Shows", and "Browse Shows" CTA. 6 tests.

### High Priority

- [x] **Fix error-as-empty-state across 3 pages** — Done. `useMyEntriesData` now surfaces `isError`; MyEntriesPage and MyEntriesTab show error+retry; ShowDayPage shows per-section error cards for entries and results.

- [x] **Wire Show Day `onNavigate` to card tap targets** — Already wired. `onClassNavigate` passes through ShowDayPage → ShowDayHero → NextUpCard and ClassTimelineCard. No changes needed.

- [x] **Wire Dog Detail "Add Achievement" and "Add Past Result" buttons** — Done. `CompetitionsTabs` now manages `addPastResultOpen` and `addAchievementOpen` state, branching `handleAdd` per tab. `PastResultsSection` wired with live state; `AchievementsSection` gained optional external open props.

- [x] **Show entry status badge in Show Details hero** — Done. Color-coded badge (green/orange/red/muted) always visible in hero via new `entryStatusBadge` prop on `DetailHero`. Variant mapped from `EntryStatus` in `ShowDetailsPage`.

- [x] **Show "Entries Closed" when Register button is hidden** — Done. `closedMessage` prop added to `DetailHero`; passes `entryStatus.description` (e.g. "Entries closed on 4/15/2026") when `canEnter` is false.

- [x] **Add title progress to Exhibitor Dashboard and Dog Detail hero** — Done. Dog Detail hero shows earned title abbreviations (e.g. `OA · OAJ · NF`) under breed name via `useTitleProgress`. Dashboard has new free-tier `TitleProgressCard` showing earned titles per dog with link to full progress.

- [x] **Revisit premium gating on Dog Detail** — Done. Replaced hard PremiumGate wall with BlurGate on all 5 premium tabs (Title Progress, Statistics, Health Records, Training Journal, Pedigree). Free users see their real data blurred behind an upgrade overlay. 6 BlurGate unit tests + 7 DogDetailsTabs tests.

---

## UX Audit Findings — Secretary Operations (2026-04-04)

Full audit details in `docs/ux-audits/phase-2-summary.md` and individual page audits `07-*.md` through `11-*.md`.

### Critical

- [x] **Fix Pipeline Dashboard hardcoded scoring/review booleans** — Done. Threaded `is_scoring_finalized` and `is_results_reviewed` from DB through ReplicatedClassesTable → TrialClass → useMissionControlData. Kanban Review → Publish → Closed workflow now functional. 108 tests passing.

### High Priority

- [x] **Reduce scratch/move-up tap count toward INTENT target** — Done. Buttons upsized to `size="default"` (~40px + padding). Scratch now uses inline confirm (2 taps, no modal). Move-up still 4 taps (class selection inherent); auto-select when one eligible class would reduce further but needs UX decision.

- [x] **Add "Clone from Previous Show" to creation wizard** — Done. New `CloneFromShowCombobox` at top of step 1. Uses existing `useShowsQuery`, prefills all fields except dates, live search, "Start fresh" reset. Wizard flow unchanged.

- [x] **Fix CSV export missing owner data** — Done. Extracted `buildExportRow` to `entryExportUtils`, joined owner data via `SECURITY DEFINER` RPC function (migration 113), added CSV injection defense, newline stripping, double-click guard, Firefox download fix. 27 tests.

- [x] **Remove or implement dead "Send Email" bulk button** — Done. Removed from `RegistrationView.tsx` along with unused `Mail` import.

- [x] **Fix check-in status button affordance in Entry Management** — Done. Added `cursor-pointer`, border, and `hover:border-border` classes to check-in button in `EntryListCard`. 3 tests.

- [x] **Add error handling to Results Control queries** — Done. Combined error flag across all 3 queries; destructive Alert with "Retry" button calls all three `refetch` functions in parallel.

---

## Feature Inventory Cleanup — Act on Audit Findings (2026-04-04)

Full audit in `docs/feature-inventory-audit.md`. Items below are the "Consider Hiding/Deleting" findings that need action.

- [x] **Remove dev/test routes from myK9Show** — Done. Removed `/test-panels` from App.tsx, `/class-templates` from publicRoutes.tsx, `/admin/performance-mode`, `/admin/permission-test`, `/admin/rbac-test` from adminRoutes.tsx. `/admin/load-testing` was already DEV-gated.

- [x] **Remove dev/test routes from myK9Q** — Done. Removed unguarded `/wireframe/nationals`, `/test/scoresheet`, and `/tv/:licenseKey` from App.tsx. `/debug`, `/test-connections`, `/migration-test`, `/demo/status-popup` were already DEV-gated.

- [x] **Remove judge scoring pages from myK9Show** — Done. Removed `JudgeScoringRoutes` export and all `/scoring/*` route definitions from judgeRoutes.tsx. Removed `JudgeScoringRoutes` import and call from App.tsx along with `HEADERLESS_ROUTE_PATTERN` regex.

- [x] **Consolidate Create Show to wizard only** — Done. Replaced flat `/secretary/create-show` route with `<Navigate to="/secretary/create-show/wizard" replace />`. Removed `CreateShowPage` lazy import from secretaryRoutes.tsx.

- [x] **Pick canonical TV run order URL and redirect the other** — Done. myK9Show `/tv/:showId` is canonical. Removed myK9Q's `/tv/:licenseKey` route and `TVRunOrder` lazy import.

- [x] **Hide Browse People from public nav** — Done. Removed `/people`, `/users` redirect, and `/users/:id` routes from publicRoutes.tsx. Removed `BrowsePeoplePage` and `PersonDetailPage` lazy imports.

- [x] **Move Sync Dashboard to admin-only** — Done. Removed `/sync/dashboard` route and `SyncDashboardPage` lazy import from secretaryRoutes.tsx.

---

## Port Run Order Options from myK9Q to myK9Show - 2026-04-05 21:11

- **Port full run order preset system to myK9Show ClassDetailsPage** — myK9Q has a complete `RunOrderDialog` and `runOrderService` with multiple ordering modes. myK9Show's ClassResultsTable has a stub "Drag-and-drop run order" placeholder but no preset system at all. **Problem:** Secretaries using myK9Show can't set run order for a class. myK9Q supports: armband low→high, armband high→low, manual drag-and-drop, random shuffle (all), random shuffle (within A/B sections), section-aware presets (A then B, B then A — each with asc/desc), scoped reordering of a single section with preserve/renumber choices. **Files:** `apps/myk9q/src/services/runOrderService.ts` (source logic — `RunOrderPreset` type, `calculateRunOrder`, `applyRunOrderPresetScoped`), `apps/myk9q/src/components/dialogs/RunOrderDialog.tsx` (source UI — 608 lines), `apps/myk9q/src/pages/EntryList/hooks/useDragAndDropEntries.ts` (drag-and-drop hook), `apps/myk9q/src/pages/EntryList/SortableEntryCard.tsx` (dnd-kit card), `apps/myk9show/src/features/secretary/class-details/ClassResultsTable.tsx` (target — add "Set Run Order" button). **Solution:** (1) Extract `runOrderService` logic into a shared `@myk9/secretary` package or duplicate into myK9Show. (2) Build shadcn/Tailwind `RunOrderDialog` mirroring the preset groups from myK9Q. (3) Wire drag-and-drop mode using `@dnd-kit` (already used in myK9Q). (4) Connect to `exhibitor_order` column via React Query mutation + optimistic UI. Preserve section-aware presets and scoped renumber step.
