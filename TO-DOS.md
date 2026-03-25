# TO-DOS

Items to address in future sessions.

---

## User Management Improvements (2026-03-14)

- [x] **Unify role systems — deprecate `people.roles` in favor of `user_roles` table** — Done: migration 066 seeds chairman/steward roles, removes trial_secretary/platform_admin, migrates people.roles data to user_roles, drops the column, and rewrites get_admin_user_list() RPC. AuthContext simplified to single RBAC path. Signup flows write to user_roles. CreateUserDialog/UserDetailsDialog fetch roles dynamically from roles table. All 30+ files updated to use UserRole enum (7 roles: site_admin, secretary, judge, club_admin, chairman, steward, exhibitor). Role priority hierarchy determines default dashboard routing.
- [x] **Add `status` column to `people` table** — Done: added `status` column (active/suspended), auth hook to block suspended logins, admin RPC with last_sign_in_at, real status badges/filters, UserEditPanel status dropdown, suspension enforcement in AuthContext.
- [x] **Add `is_active` column to `user_roles` table** — Done: migration 064 adds column with `DEFAULT true NOT NULL` + composite index. Updated all `user_roles` queries (AuthContext, RoleManager, admin-delete-user, send-registration-email, clubMembershipQueries, useUserRoles) to filter by `is_active`. RoleManager now soft-deactivates instead of hard-deleting, with reactivation on re-grant. All 3 generated type files updated.

---

## Port myK9Q Features to myK9Show (2026-03-14)

Goal: myK9Show becomes the complete end-to-end platform. myK9Q may be retired or kept only for ringside scoring.

### Secretary / Operations

- [x] **Secretary Kanban board** — Done: Ported drag-and-drop Kanban board from myK9Q. Three columns (To Do, In Progress, Done) with task cards supporting priority, due date, and assignee. Uses @dnd-kit, shadcn Dialog, Tailwind. Persists to localStorage per show. Route at `/secretary/tasks`, sidebar entry under Secretary section. 8 unit tests.
- [ ] **Volunteer scheduling page** — myK9Q has VolunteerChip/VolunteerDialog/VolunteerPool for steward/volunteer assignment. Build equivalent in myK9Show.
- [ ] **Check-in status report** — myK9Q's TrialSecretary has a check-in status tab. Add to myK9Show secretary tools.
- [ ] **Results control / publishing** — myK9Q has a results control tab for managing result visibility and publishing. Port to myK9Show.

### Live Event / Spectator

- [ ] **TV run order display** — myK9Q has `/tv/:licenseKey` with live run order, results podium, carousel navigation, real-time class status. No equivalent in myK9Show.
- [x] **Announcements system** — Done: DB migration 057, `announcementQueries`, `useAnnouncementStore` (Zustand + realtime), `useAnnouncementSubscription` mounted in App.tsx, `CreateAnnouncementDialog`, `AnnouncementItem`, `AnnouncementsCard` in Mission Control, NotificationCenter Announcements tab wired to store, NotificationBell combined unread count. Full test suite across 7 files.
- [ ] **Dog notification pipeline** — myK9Show's NotificationCenter has a "Dogs" tab and `notificationStore` infrastructure, but nothing generates alerts. Requires: (1) port run order system from myK9Q (several options, configurable), (2) realtime subscription to run position for the user's entries, (3) fire `your_turn` / `check_in_reminder` / `class_starting` / `results_posted` alerts via `notificationStore.addAlert()`. myK9Q's passcode model required favorites to route alerts; myK9Show's authenticated model can use the user's own entries directly. Favorite-following (a friend's dog) is a future enhancement.
- [ ] **Voice announcements / settings** — myK9Q has dedicated voice settings for audio feedback and announcements. Not in myK9Show.

### Scoring

- [x] **Scoresheet variants (full parity)** — Verified: all 7 variants (AKC Scent Work, AKC Nationals, AKC FastCat, UKC Obedience, UKC Rally, UKC Nosework, ASCA Scent Detection) are in `@myk9/scoring-ui` with both live and entry modes. myK9Show uses registry-based dynamic lookup via `getScoresheetComponent()` in both `ScoresheetPage` (judge) and `SecretaryScoringPage` (secretary). Full parity achieved.

### Data & Analytics

- [ ] **Trial statistics / analytics** — myK9Q has `/stats` and `/stats/:trialId/class/:classId` with detailed trial & class performance analytics. myK9Show's AnalyticsPage is limited.
- [x] **Public results display** — Done: Replaced placeholder Results tab on ShowDetailsPage with live podium cards showing 1st–4th placements per class. Results now visible to both authenticated and unauthenticated users. Includes element/level filters, pending results collapsible section. PodiumCard/PodiumPosition components with Tailwind. Data via React Query from `view_entry_with_results`. 15 unit tests.

### UX / Quality of Life

- [x] **Armband-based dog lookup** — Done: Added `ArmbandLookup` component to ShowDetailsPage header. Compact input field appears when armbands exist for the show. User types armband number, presses Enter, popover shows dog info (name, breed, sex, owner), class entries with status badges, handler info, and "View profile" link. Self-contained component with `armbandQueries.ts` (count + lookup), React Query hooks, error/not-found/loading states. 10 unit tests.
- [ ] **Settings pages (comprehensive)** — myK9Q has scoring settings, voice settings, privacy, data management, developer tools, install app prompts. myK9Show only has basic PreferencesPage.
- [x] **PWA / app install prompts** — Done: Ported PWA install prompt from myK9Q. `usePWAInstall` hook detects standalone mode, captures `beforeinstallprompt` for Chrome/Edge, provides iOS Safari manual instructions via shadcn Dialog. Banner auto-dismisses for 7 days. Mounted above AppHeader in App.tsx. 8 unit tests.

---

## Landing Page & Public UX (2026-03-14)

- [x] **Remove Kanban view from shows browse page** — Done: removed Kanban view mode, its toggle button, drag-drop status handler, card renderer, and all related imports from BrowseShowsPage. Kanban remains available for secretary dashboard use.

---

## Exhibitor UX Redesign — Sidebar, Dashboard Modes, Page Structure (2026-03-14)

- [x] **Redesign Exhibitor sidebar navigation** — Done: Sidebar restructured to Home, Show Day, My Dogs, My Entries, Find Shows, Clubs, Calendar, Settings. Exhibitor-only users get streamlined plain-English labels; multi-role users get a "My Shows" section alongside their other role sections.

- [x] **Add dual-mode Exhibitor Dashboard (Planning vs Show Day)** — Done (direction changed): Instead of auto-switching a single dashboard, built two separate pages — `/exhibitor/dashboard` (planning: greeting, stats, upcoming entries, quick actions) and `/exhibitor/show-day` (live: check-in, run order, ring progress, notifications, adaptive timing). Planning dashboard shows a prominent alert linking to Show Day when detected.

- [x] **Build missing Exhibitor pages** — Done: My Dogs (`/dogs`), Clubs (`/clubs`, `/clubs/:id`), Calendar (`/calendar`), My Entries, Profile/Settings all exist with routes and sidebar links.

- [x] **Build My Profile page** — Done: Created `/profile` page with editable fields (first name, last name, phone, address — all required for AKC/UKC reporting), avatar upload to Supabase Storage, read-only email, and link to Preferences for password change. Card-based layout with shadcn/ui. 23 unit tests (useAvatarUpload, useProfileForm, ProfilePage). Replaced old ProfileRedirect with ProfilePage. Updated AppHeader "My Profile" link.

- [x] **Exhibitor missing "Add Dog" button on BrowseDogsPage** — Fixed: root cause was that `permissions` and `role_permissions` tables were never seeded for non-admin roles. Migration 067 adds 42 granular permissions and assigns role_permissions to exhibitor (15), secretary (31), judge (9), and club_admin (26) roles.

---

## Judge Qualification Management Improvements (2026-03-15)

- [x] **Manage Qualifications panel should append, not replace** — Done: Moved persistence logic into JudgeQualificationPanel itself (self-sufficient pattern). Panel always has the full qualification list in local state, so delete-all-recreate is safe. Removed duplicated save handlers from UserEditPanel, UserListPage, UserDetailsView, and TestPanelPage. Changed `onSave` callback to `onSaved` (no-arg).
- [x] **Show judge number and show types on qualification card** — Done: QualificationsTab displays `judge_number` badge in header (via cached useUserQuery) and discipline badges labeled "Show Types". No extra network call — reuses existing person data cache.
- [x] **Show Edit > Judges tab not finding qualified judges** — Done: Created dedicated `getJudgesWithQualifications()` query (fetches only judges with qualifications join) and `useJudgesWithQualifications` React Query hook. ShowEditForm now uses the targeted hook instead of filtering all users from the Zustand store. Extracted shared `JUDGE_QUALIFICATIONS_SELECT` constant to DRY up the select fragment in userQueries.ts.
- [x] **Remove stale `people.roles` references** — Done: `mapDbUserToUser` now extracts roles from joined `user_roles` data (or flat RPC array). Removed write of `roles` to people table. Added `user_roles(role:roles(name))` join to `getAllUsers`, `getUserById`, and `searchUsers` queries.
- [x] **Remove debug `useEffect`/`qualsLoaded` state from UserEditPanel** — Done: Removed `qualsLoaded` useEffect from UserEditPanel. Made JudgeQualificationPanel self-sufficient with its own React Query fetch (same pattern as QualificationsTab). Removed `initialQualifications` prop from JudgeQualificationPanel interface and all 4 call sites. Fixed 3 lint warnings (dep arrays).

---

## Site Admin: Trash / Recycle Bin (2026-03-17)

- [x] **Trash view for soft-deleted records** — Done: Extended existing `DeletedEntitiesTab` at `/admin/data-lifecycle` to cover all 7 soft-delete entity types (shows, trials, classes, entries, dogs, clubs, people). Collapsible sections with badge counts, lazy data loading on expand, restore and permanent delete actions with confirmation dialogs. Self-contained component manages its own data fetching. 14 unit tests. Enhanced `getDeletedTrials` query with show/deleted_by joins. Added Collapsible component to `@myk9/ui`.

---

## Outstanding from Code Quality Sprint (2026-02-15)

- [x] **~28 files in 700-750 line range** — Done: Split 6 files (AnalyticsDashboard, BulkActionsBar, checkinNotificationService, entry-query-lookups, UnifiedSidebar, UserCreationPanel) into smaller modules with extracted types, constants, helpers, and hooks. 12 new sibling files. OfflineScoringService (875 lines) left alone — already has types/serialization extracted. Review fixes: removed duplicate SIDEBAR_TOKENS.groupHeader, moved ROLE_OPTIONS to .constants.ts, cleaned what-comments.
- [ ] **Make E2E CI jobs blocking once tests are stable** — Investigated 2026-02-27: CI broken due to GitHub Actions billing. myK9Q 1/10 E2E passing (missing test passcodes). myK9Show E2E ~0% (AI-generated artifacts need triage). Next steps: (1) fix billing/wait for reset, (2) decide passcode seeding strategy, (3) triage myK9Show E2E files.

---

## Production Readiness (when real users are on production URL)

- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch. Add a deploy step at the end of the GitHub Actions CI workflow that only runs after all tests pass (`vercel deploy --prod`). Keep auto-deploy for PR preview URLs. Requires `VERCEL_TOKEN` secret and Vercel CLI in CI.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as a required status check. No direct pushes to main in production.

---

## Add Icons to Show Details Tab Titles - 2026-03-17 10:53

- [x] **Add icons to tab titles on ShowDetailsPage** - Enhance tab navigation with icons alongside text labels. **Problem:** Tab titles are text-only, missing visual affordance that helps users quickly identify sections. **Files:** `apps/myk9show/src/pages/ShowDetailsPage.tsx:220-226` (tab config array), `apps/myk9show/src/pages/TrialDetailsPage.tsx:527-532` (trial detail tabs — same pattern). **Solution:** Add `icon` property to each tab config object and render Lucide icons inside `TabsTrigger`. The shared `TabsTrigger` component already has `gap-1.5` and `items-center` styling that supports icon + text layout. Suggested icons: Overview → `LayoutDashboard`, Trials → `Trophy`, Classes → `ListChecks`, My Entries → `ClipboardList`, Results → `Medal`.

---

## Investigate Remotion for User Explainer Videos (2026-03-17)

- [x] **Evaluate Remotion for programmatic video generation** — Done: Research written to `docs/research/remotion-evaluation.md`. Remotion is the best fit (React/TS, CI-automatable, screenshot compositing). Main risk: licensing cost for orgs with 4+ people. Alternatives (Motion Canvas, Manim, FFmpeg) weaker for this use case. Next step: contact Remotion for company license pricing before investing in PoC.

---

## Classes Tab Improvements - 2026-03-17 15:51

- [x] **Group classes by trial date/trial number** — Done: `ClassesTab` groups classes via `groupedByTrial` memo (keyed by trialDate+trialNumber), renders trial group headers when multiple trials exist, sorts within groups by element then level. `ShowDetailsPage` passes `trialDate`, `trialNumber`, `trialName` from trial data.

- [x] **Remove Ring column for scent work trials** — Done: `ClassesTab` has `hideRing` prop; `ShowDetailsPage` passes it when any trial is Scent Work/Nosework/Scent Detection. Ring column header, data cell, and colSpan all conditional on `hideRing`.

---

## Registration Entries Not Syncing to Supabase - 2026-03-18 16:11

- [x] **Investigate entry sync pipeline from wizard to Supabase** — Root cause: `useMyEntries` queries Supabase directly, bypassing the local Zustand entry store. Entries DO exist locally (the write path works via replication layer) but the read path skips them. **Fix:** Rewrite `useMyEntries` to read from local stores (entry store + class store + dog store). Design spec: `docs/superpowers/specs/2026-03-18-use-my-entries-offline-first-design.md`.

---

## Card and Table View for Child Lists - 2026-03-18 19:27

- [x] **Add card/table view toggle to all child list tabs** — Done: Added `useViewPreference` hook (localStorage per-tab persistence), `ClassCard` component (contextual live data for in-progress classes), and card/table toggle to ClassesTab (default: table), TrialsTab (default: cards), and MyEntriesTab (default: cards). Shared `CARD_TABLE_MODES` constant and existing `ViewToggle` component. 41 tests across 5 files. PR #18, merged as `f31e6352`.

---

## Classes Defaulting to In Progress - 2026-03-18 19:29

- [x] **Fix class status defaulting to In Progress for future shows** — Done: `deriveElementStatus()` now treats Upcoming as equivalent to Scheduled; ClassesTab switched from snake_case `CLASS_STATUS_CONFIG` to `@myk9/core` canonical helpers; ShowDetailsPage fallback uses `CLASS_STATUS.SCHEDULED` constant. Previously classes for a show in May 2026 displayed "In Progress" badges instead of "Upcoming" or "Scheduled". **Problem:** Two separate status systems exist: (1) `@myk9/core` canonical statuses (`Scheduled`, `Upcoming`, `In Progress`, `Completed`, `Cancelled`) used by TrialsTab/TrialDetailsPage via `getClassStatusDisplay()`, and (2) `live-status-config.ts` statuses (`not_started`, `in_progress`, `completed`, `paused`) used by ClassesTab via `CLASS_STATUS_CONFIG`. Classes are created with `status: 'Scheduled'` in `classCreationStore.ts:380`, but somewhere in the sync/display pipeline the status is being mapped or defaulted to "In Progress". **Files:** `apps/myk9show/src/store/classCreationStore.ts:380` (class creation default status), `packages/core/src/constants/class-status.ts` (canonical statuses + `normalizeClassStatus()`), `apps/myk9show/src/constants/live-status-config.ts` (ClassesTab status config — no `Scheduled` or `Upcoming` keys), `apps/myk9show/src/pages/ShowDetailsPage.tsx:137` (maps `cls.status || 'not_started'`), `apps/myk9show/src/store/trial-store-helpers.ts:35` (defaults to `'Scheduled'` on read). **Solution:** Investigate what status value is actually stored after creation/sync. Likely need to (1) unify on a single status system (prefer `@myk9/core` canonical values), (2) ensure `CLASS_STATUS_CONFIG` in `live-status-config.ts` handles canonical values, or (3) normalize status at the display boundary. Check Supabase `trial_classes` table column default.

---

## Spine Dot Vertical Alignment - 2026-03-18 19:32

- [x] **Center spine dots vertically with each element card** — Done: Restructured TrialSpine from two parallel columns to per-element rows with `items-center`; connecting lines use absolute-positioned half-segments bridging the gap. Also switched `bg-slate-700` to semantic `bg-border`, extracted `useCallback` for navigate. **Problem:** In the ScheduleSummary/TrialSpine component, the spine dots and element cards are rendered in two parallel flex columns. Each dot aligns to the top of its row, but the visual expectation is that the dot sits at the vertical midpoint of its card. With the current layout (`pt-1.5` on the dot column), the dot only appears centered on the first card by coincidence — on taller cards or when card heights vary, the misalignment is visible. **Files:** `apps/myk9show/src/components/schedule/TrialSpine.tsx:33-41` (dot column with `flex flex-col items-center pt-1.5`), `apps/myk9show/src/components/schedule/StatusDot.tsx` (dot component), `apps/myk9show/src/components/schedule/ElementCard.tsx` (card component). **Solution:** Pair each dot+line segment with its card in a single row container using `items-center` so the dot naturally centers vertically against the card height. Alternatively, wrap each dot in a container that matches the card's height and uses `justify-center`.

---

## Armband Number Assignment - 2026-03-18

- [x] **Implement armband number assignment during registration** — Done: Postgres `assign_armband()` function atomically assigns sequential armband numbers per dog per show. `starting_armband_number` column added to `shows` (default 100), configurable in both Show Creation Wizard and Edit Show Dialog. Registration wizard calls RPC after entry creation, writes armband back to `entries.registrationData.armband` via replication layer (so confirmation email includes it), and displays armband on confirmation step. 13 tests passing.

---

## Redesign Show Cards with Date Circle - 2026-03-18 19:35

- [x] **Restyle upcoming show cards with circular date graphic** — Done: New `DateCircle`, `ShowCardHorizontal` (browse page), `ShowCardVertical` (landing/carousel), `ShowProgressBar`, and `showCardUtils`. Old `ShowCard` and `show-card-placeholders` deleted. All consumers migrated. `StaggeredGrid` animations preserved. 12 commits on `feature/show-card-redesign`, merged via PR #16. **Original problem:** Redesign show cards to feature a prominent date circle on the left, inspired by the mockup saved in `docs/design-inspiration/show-card-date-circle.md`. **Problem:** Current show cards lack a strong visual date anchor — users must scan text to find when a show is. The inspiration design uses a rounded date graphic (month abbreviation + day number) that makes dates instantly scannable, plus inline status badges, location/time row, and discipline tag chips. **Files:** `apps/myk9show/src/components/shows/ShowCard.tsx` (main show card), `apps/myk9show/src/components/shows/browse/ShowCardGrid.tsx` (grid container), `apps/myk9show/src/components/shows/UpcomingShows.tsx` (dashboard upcoming list), `apps/myk9show/src/components/landing/UpcomingShowsSection.tsx` (landing page). **Solution:** Build a `DateCircle` component (month abbreviation top, day number bottom, subtle border/bg). Restructure ShowCard layout as: `[DateCircle] [Title + StatusBadge / Location · Time / DisciplineTags] [Action]`. Apply to all show listing contexts. See design reference doc for full layout details and sidebar "Next Event Spotlight" concept.

---

## Hide Phone Numbers on Public Show Page - 2026-03-18 19:33

- [x] **Hide phone numbers from Show Officials section** — Done: Removed phone rendering and `Phone` import from ShowOfficials.tsx; condition now checks only `person.email`. Previously displayed secretary phone numbers on the public-facing show details page. Emails are acceptable to show. **Problem:** The Show Officials sidebar on ShowDetailsPage displays secretary phone numbers (e.g., "19187067590") on a public-facing page. This is a privacy concern — phone numbers should not be visible to unauthenticated or general users. **Files:** `apps/myk9show/src/components/shows/overview/ShowOfficials.tsx:33-39` (phone rendering with `tel:` link), `apps/myk9show/src/components/shows/overview/ShowOfficials.tsx:22` (conditional that shows contact block when email or phone exists). **Solution:** Remove the phone number rendering from ShowOfficials. Keep email display. The phone conditional on line 22 should check only `person.email`. Consider whether phone should be visible to authenticated/admin users only (future enhancement) or removed entirely from this component.

---

## Trial Card Enhancements - 2026-03-18 19:25

- [x] **Add class and entry counts to trial cards** — Done: commit 5b4d3020 rewrote trial cards with date element, counts, and progress bar. Show how many classes and total entries each trial has. **Problem:** Trial cards on ShowDetailsPage only display name, status, date, type, and start time. Users can't see at a glance how many classes or entries a trial contains without clicking into it. **Files:** `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx:74-116` (card content area), `apps/myk9show/src/pages/ShowDetailsPage.tsx:122-145` (showClasses memo — has per-trial class/entry data available). **Solution:** Pass class and entry counts per trial to TrialsTab. Add count badges or a footer row to the trial card (e.g., "5 classes · 42 entries"). Data is already available — `trialClasses[trial.id]` has class arrays with `entries` counts.

- [x] **Add progress bar to trial cards** — Done: included in commit 5b4d3020. Port myK9Q's class card progress bar to trial cards. **Problem:** No visual indicator of trial completion progress. myK9Q class cards show a progress bar (scored/total entries) that gives instant status feedback. **Files:** `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx:74-116` (card content), `apps/myk9q/src/pages/ClassList/ClassCard.tsx` (reference: progress bar showing scored vs total). **Solution:** Add a thin progress bar at the bottom of each trial card showing completed classes / total classes (or scored entries / total entries). Compute from class status data already available via `trialClasses`. Only show when trial is in-progress or completed.

- [x] **Establish icon policy for buttons and tabs** — Done: Moderate coverage policy established and applied. All tab group triggers get Lucide icons (h-4 w-4) before labels; all standalone action buttons get icons. Dialog footer dismissals, inline links, and filter chips stay text-only. Applied to 6 tab groups (ClubDetails, JudgeDashboard, TrialManagementTabs, CompetitionsTabs, SyncMonitoringDashboard, DogDetailsTabs), 4 button locations (CartPage, CheckoutCancelPage, TrialManagementTabs, JudgeDashboard), plus aria-label fix on TrialHeader and dead code cleanup of unused ClubTabs.tsx. Spec: `docs/superpowers/specs/2026-03-19-icon-consistency-policy-design.md`.

---

## Standardize All List/Detail Pages - 2026-03-18 19:38

- [x] **Apply unified list/detail design system across all entity pages** — Done (PR #20): Created PrimaryTabs, SubTabs, useUrlTab. Migrated 13 pages to shared primitives (PageShell, PageHeader, DetailHero, SearchBar, FilterChips, ViewToggle, ResultsCount, ErrorState, EmptyState). All tab bars standardized to two patterns. Dead CSS and useRememberedTab deleted. TrialDetailsPage decomposed from 706 to 477 lines.

- [x] **Standardize statistics cards across detail pages** — Done: Created shared `StatCard` and `StatsGrid` components in `@myk9/ui` (packages/ui). Migrated all 26 stat card consumers across the app. Deleted 3 old component files and ~330 lines of `myk9-show-stat-*` / `myk9-class-stat-*` CSS. Design: side-by-side layout (icon left, content right), 6 semantic colors with soft tint backgrounds (no gradients), optional progress bars, trend badges, keyboard-accessible clickable cards. Spec: `docs/superpowers/specs/2026-03-23-stat-card-standardization-design.md`. Plan: `docs/superpowers/plans/2026-03-23-stat-card-standardization.md`.

---

## Fix Pre-Existing Test Failures - 2026-03-23 14:03

- [x] **Fix 36 stale test failures across 7 files** — Done: commit `9a0145f1`. Updated tests for ScheduleSummary (rewired to useScheduleTimeline), TrialDetailsMain (added QueryClientProvider, removed 15 stale tests, added 7 new), ShowDetailsPage (tab labels + default), MyEntriesPage (6 capitalized tabs), ShowCardVertical (uppercase badge text), class-status (Upcoming default), ReplicatedClassesTable (judge join in select query). Also fixed unused `err` lint error in TrialDetailsPage. All suites green: 3530 myK9Show + 271 core tests passing.

---

## Fix Duplicate Judges on Show Details Page - 2026-03-23 21:24

- [x] **Deduplicate judges in JudgesList on ShowOverviewTab** — Done: commit `f681efb2`. Root cause was `showMappers.ts:mapDatabaseToShow` mapping `judge_assignments` rows 1:1 (one entry per class assignment). Fixed by grouping rows by `person_id` before mapping, collecting `class_id` values into `assignedClasses`. The Zustand store path (`buildAssignedJudges.ts`) already deduplicated correctly — only the React Query/mapper path was affected.

---

## Soften Light Mode Backgrounds - 2026-03-23 21:41

- [x] **Warm up light mode color palette** — Done: 6 commits. Updated 11 CSS variables in `index.css` and 7 in `design-tokens.css` to subtle warm cream (`--background: #f5f2ed`, `--card: #faf8f4`). Replaced 63 `bg-white` Tailwind classes across 38 component files with semantic `bg-card`/`bg-background`/`bg-popover`. Swept `#fff` in 11 CSS files (most were mask patterns — kept; 2 surface backgrounds replaced). Print components and `.high-contrast` left intentionally white. 3530 tests pass. Spec: `docs/superpowers/specs/2026-03-23-soften-light-mode-design.md`.

---

## Class Details Page Redesign - 2026-03-24

- [x] **Restructure Class Details page layout** — Done: Replaced flat DetailHero + info grid + expandable sections layout with compact header (metadata strip) + stats row + full-width results table. Removed data duplication (judge/date no longer shown twice). Enter Scores button moved from page header to results table header. Added ClassRequirementsPanel (slide-out drawer) ported from myK9Q's ClassRequirementsDialog — shows rules reference from `class_requirements` table by org/element/level. New React Query `useClassRequirements` hook. 662 lines of dead code removed (ClassExpandableSections, SectionToggleControls, ClassInfo, ExpandableSection). 28 new tests across 3 files. Spec: `docs/superpowers/specs/2026-03-24-class-details-redesign.md`. Plan: `docs/superpowers/plans/2026-03-24-class-details-redesign.md`.

**Future enhancements (out of scope):**

- Dog status column (Checked In / In Ring / On Deck / Conflict) — requires check-in data pipeline
- Drag-and-drop run order in entries table
- Inline score editing in table cells

---

## Class Entries: Duplicate Entries and Unknown Dog Names - 2026-03-24 13:55

- [x] **Fix "Unknown Dog" names in ClassResultsTable** — Done: Root cause was 5 files using deprecated `useDogStore()` (always returns `dogs: []`) instead of `useDogStoreCompat()` (React Query-backed with actual Supabase data). Fixed in `useClassDetailsData.ts`, `ClassDetailsMain.tsx`, `SecretaryClassDashboard.tsx`, `CartPreviewPanel.tsx`, `LazyDogCard.tsx`, and `useOfflineEntryCreation.ts`. Dog names (Buddy, Tera, Maximus, Sam) now resolve correctly.

- [x] **Fix duplicate entries showing in ClassResultsTable** — Resolved on dev server restart. Duplicates were a client-side state issue (local Zustand store + React Query both returning the same entries before dedup stabilized). The entry merge logic in `useClassDetailsData.ts` correctly deduplicates by ID — the issue was transient.

- [x] **Fix entries not syncing to Supabase** — Done: Two root causes found. (1) MutationManager's auto-upload (`scheduleUpload`) successfully pushed mutations to Supabase but never invalidated React Query caches — UI showed `dbCount: 0` from stale cache. Fixed by dispatching `replication:upload-complete` CustomEvent after successful uploads; ReplicationSyncProvider listens and invalidates affected query keys. (2) All 6 entry update methods in `entryStore.ts` (`updateEntry`, `updateRegistration`, `updateStatus`, `recordResult`, `updateResult`, `updateEntriesStatus`) used `replicatedEntriesTable.set()` without calling `queueMutation()` — updates were local-only, never synced to Supabase. Fixed by switching all to `replicatedEntriesTable.updateEntry()` which queues UPDATE mutations. Also added `window.__replicationDiag` diagnostic helper (getPendingCount, uploadNow, triggerSync) for browser console debugging. 2 new tests in MutationManager.test.ts. All 185 replication + 3555 myK9Show tests pass.

---

## AKC Scent Work Section Display Rules - 2026-03-24 13:58

- [x] **Hide section label for non-Novice AKC Scent Work classes** — Done: Added `shouldShowSection()` helper to `ClassDetailsMain.helpers.ts` that returns true only for Novice level (and not Detective element). Applied to 6 display locations (ClassCompactHeader, ClassesTab, ClassCard, ClassesTableView, ClassGroupedSidebar, formatClassTitle). 14 new tests across 2 files.

---

## Fix Class Requirements Query — Wrong Table - 2026-03-24 14:20

- [x] **Rewrite useClassRequirements to query sport_class_rules** — Done: Both hooks rewritten to query `sport_class_rules` joined with `sport_templates`. New formatting helpers (`formatIntRange`, `formatTimeLimit`, `deriveTimeType`) convert integer DB columns to display strings. `ClassRequirementsPanel` updated with new field cards (hides known/blind, blank area, dual timer, odors). Auto-fill hook deduped to reuse `mapRowToRequirements` and `ClassRequirements` type from query hook. 19 tests passing.

---

## Fix Armband Auto-Assignment - 2026-03-24 14:12

- [x] **Debug armband assignment not persisting to entries** — Done: Root cause was split-brain between `armbands` table (RPC writes atomically) and `entries.armband` (async replication). Fixed with `fetchMissingArmbands()` in `getEntriesByClass` that backfills from authoritative armbands table (immutable spread, no unsafe casts). Also added local store merge in `useClassDetailsData` for the sync window, and conditional armband display (`--` instead of bare `#`).

---

## Premium Visual Polish — Both Modes - 2026-03-24 00:15

- [x] **Improve card elevation and floating effect** — Done: Added `--shadow-card` and `--shadow-card-hover` CSS variables (warm-tinted light, deeper dark), wired into Tailwind via shared preset with fallbacks. Applied `shadow-card` to shared Card component. Updated `buildClasses.card` in designTokens.ts.

- [x] **Replace flat borders with subtle shadows on containers** — Done: Migrated 9 components (SearchBar, BrowseCard, ShowCardVertical, ShowCardHorizontal, FilterChips, GlassCard, PremiumCard, SectionCard, myk9-user-details.css) from `border border-border` to `shadow-card`/`hover:shadow-card-hover`. Borders softened to `/30` or `/50` opacity where kept. Dividers between adjacent items preserved.

---

## Trial Details Page: Entries Not Showing - 2026-03-24

- [ ] **Fix entries not appearing on trial details page** — Entries exist in a class (visible on class details page with correct count), but the trial details page shows 0 entries in both the classes table and the Entries tab. **Root cause (two problems):** (1) `trial_id` is never written to the `entries` table — `mapEntryInputToInsert` in `classMappers.ts` doesn't set it, and `EntryInput` in `class-store-types.ts` has no `trialId` field. The Entries tab queries via `getEntriesByTrial()` which filters `.eq('trial_id', trialId)` — always returns 0. (2) Classes table entry count uses `getAllEntries()` (global full-table fetch) then filters client-side by `classId` — fragile and possibly blocked by RLS. **Files:** `apps/myk9show/src/services/mappers/classMappers.ts:254-263` (mapEntryInputToInsert — add `trial_id`), `apps/myk9show/src/store/class-store-types.ts:51-61` (EntryInput — add `trialId`), `apps/myk9show/src/components/trials/TrialDetail/TrialEntriesTable.tsx` (queries by `trial_id`), `apps/myk9show/src/pages/TrialDetailsPage.tsx:140-157` (per-class entry count logic). **Fix strategy:** (1) Add `trialId` to `EntryInput`, set `trial_id` in mapper, backfill existing NULL rows via SQL (`UPDATE entries SET trial_id = c.trial_id FROM trial_classes c WHERE entries.class_id = c.id AND entries.trial_id IS NULL`). (2) Replace global `getAllEntries` with per-trial entry query for the classes table count.

- [x] **Detective still shows "Unknown" in trial classes table Level column** — Done: Exported `shouldShowLevel` from ClassDetailsMain.helpers and applied it in TrialClassesTable level cell. Also replaced inline `startsWith('Novice')` section check with `shouldShowSection` for consistency.

---

- [x] **Add contrast accent surface to sidebar or header** — Done: Three-level surface hierarchy. Sidebar darkened (`--sidebar: #edeae3` light, `#17171b` dark). Header gets floating shadow (`--shadow-header`). Sidebar border uses dedicated `--sidebar-border` variable. 7 files changed: `index.css` (CSS vars), `AppHeader.tsx` (shadow), `SidebarLayout.tsx` (border), `RoleSidebar.tsx`, `EntitySidebar.tsx` (x2), `UserEnhancedSidebar.tsx` (all switched from `bg-card`/`bg-background` to `bg-[var(--sidebar)]`). Spec: `docs/superpowers/specs/2026-03-24-surface-contrast-hierarchy-design.md`.

---

## Security Audit Skill & First Audit (2026-03-25)

- [x] **Build `/security-audit` skill** — Done: Custom Claude Code skill with dual-mode (full audit + diff review), 7 tailored checklist categories (RLS, edge function auth, RBAC escalation, client auth, data exposure, Stripe, input validation), markdown report with severity-rated findings, and auto-fix workflow. Files: `.claude/skills/security-audit/SKILL.md` (239 lines) + `references/checklist.md` (121 lines). Spec: `docs/superpowers/specs/2026-03-25-security-audit-skill-design.md`. Plan: `docs/superpowers/plans/2026-03-25-security-audit-skill.md`.
- [x] **First full security audit** — Report: `docs/security-audit-2026-03-25.md`. Found 32 findings (3 critical, 9 high, 10 medium, 10 low). 26 auto-fixable.
- [ ] **Fix critical/high findings from first audit** — 3 critical: entries table open to anon (SA-001), user_roles open to all authenticated (SA-002), roles/permissions/role_permissions open (SA-003). 9 high: is_platform_admin/is_club_admin/has_role missing `is_active` check (SA-004/005/006), assign_armband no auth (SA-007), email_log anon insert (SA-008), send-push-notification no auth (SA-009), Stripe open redirects (SA-010/011), promo_codes open update (SA-012). See report for full details.

---

## Color Palette Overhaul — Light & Dark Modes - 2026-03-25 14:26

- **Discuss and implement "Elevated" color palette for both modes** — Replace current flat palette with refined, premium-feel colors.

---

## Card View for Entries & Results — 2026-03-25 17:57

- **Support clearing/erasing existing results** — Allow secretary to reset a previously scored entry back to blank and persist that to the database. **Problem:** Currently, clearing qualification/time via the X buttons sets `hasChanges: true` but the submit flow sends an empty string as `qualification`, which the backend isn't designed to handle. Need to distinguish "new result" from "clear existing result" in the submit payload. **Files:** `apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts:259-277` (submit logic filters `hasChanges && isValid` then builds `ScentWorkResult`), `onResultsSubmit` callback contract in parent. **Solution:** Add a `cleared: boolean` flag to `BulkEntryData`, or send a separate `clearedEntryIds: string[]` array alongside results. Backend `onResultsSubmit` handler needs to delete/null-out competition data for cleared entries. The clear X buttons already work in the UI — just need the persistence path.

- **Add card view toggle to ClassResultsTable** — myK9Q-style pending/completed entry cards alongside the existing table view. **Problem:** The current table-only view is functional but doesn't match the visual richness of myK9Q's card-based entry display. Secretaries and judges benefit from at-a-glance card layouts showing armband badge, dog/handler info, placement ribbons, qualification status, search time, and faults. **Files:** `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx` (add view toggle + card grid), new file `apps/myk9show/src/components/classes/ClassResultsTable/ResultsCardView.tsx` (card component). **Solution:** Add Pending/Completed tabs (filter by `hasChanges && isValid`). Card design: ArmbandBadge (left), dog name + breed + handler (center), placement ribbon + qualification badge + time + faults (right). Reference myK9Q screenshots from 2026-03-25 — two styles: pending cards (simple, armband + dog + handler + status badge) and completed cards (armband + dog + handler + placement ribbon + qualification + time + faults). Use `TrialClassesTable`'s table/cards view toggle pattern as implementation reference. Includes mockup screenshots comparing current vs suggested for both modes. **Problem:** Current light mode feels flat (pure white cards on white background lack depth); dark mode uses pure blacks that feel heavy. Need deliberate palette choices for visual hierarchy, elevation, and brand consistency. **Light mode targets:** App bg `#F8F9FB` (cool grey-blue tint), card bg `#FFFFFF`, card border `#E2E8F0`, primary text `#1A202C` (charcoal, not black), secondary text `#718096` (muted slate), active accent `#FF6B00` (signature orange). **Dark mode targets:** App bg `#0F1115` (navy-charcoal), card bg `#1C1E26` (elevated step-up), card border `rgba(255,255,255,0.05)` (transparent highlight), primary text `#F8F9FA`, secondary text `#9BA1B0` (slate-blue-grey), accent `#FF6B00`. **Implementation tips:** Soft shadows over solid borders (`box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06)`), pale orange badge backgrounds, sidebar icons to medium grey `#4A5568` with active in brand orange, icon containers in low-opacity colored circles (dark mode). **Files:** `apps/myk9show/src/index.css` (CSS variables for both `:root` and `.dark`), `apps/myk9show/src/styles/design-tokens.css` (semantic tokens), `apps/myk9show/tailwind.config.ts` (theme extend colors). **Mockups:** See attached screenshots — light mode palette refinement (flat vs elevated) and dark mode palette refinement (flat vs elevated).
