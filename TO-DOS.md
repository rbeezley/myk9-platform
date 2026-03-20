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

- [ ] **Secretary Kanban board** — myK9Q has KanbanBoard/KanbanCard/KanbanColumn with drag-and-drop task management for day-of operations. Port to myK9Show's SecretaryDashboard.
- [ ] **Volunteer scheduling page** — myK9Q has VolunteerChip/VolunteerDialog/VolunteerPool for steward/volunteer assignment. Build equivalent in myK9Show.
- [ ] **Check-in status report** — myK9Q's TrialSecretary has a check-in status tab. Add to myK9Show secretary tools.
- [ ] **Results control / publishing** — myK9Q has a results control tab for managing result visibility and publishing. Port to myK9Show.

### Live Event / Spectator

- [ ] **TV run order display** — myK9Q has `/tv/:licenseKey` with live run order, results podium, carousel navigation, real-time class status. No equivalent in myK9Show.
- [ ] **Announcements system** — myK9Q has `/announcements` for trial-wide messaging. myK9Show has a spec (`2026-03-10-show-announcements-design.md`) but no implementation yet.
- [ ] **Voice announcements / settings** — myK9Q has dedicated voice settings for audio feedback and announcements. Not in myK9Show.

### Scoring

- [x] **Scoresheet variants (full parity)** — Verified: all 7 variants (AKC Scent Work, AKC Nationals, AKC FastCat, UKC Obedience, UKC Rally, UKC Nosework, ASCA Scent Detection) are in `@myk9/scoring-ui` with both live and entry modes. myK9Show uses registry-based dynamic lookup via `getScoresheetComponent()` in both `ScoresheetPage` (judge) and `SecretaryScoringPage` (secretary). Full parity achieved.

### Data & Analytics

- [ ] **Trial statistics / analytics** — myK9Q has `/stats` and `/stats/:trialId/class/:classId` with detailed trial & class performance analytics. myK9Show's AnalyticsPage is limited.
- [ ] **Public results display** — myK9Q has `/results` and `/results/:licenseKey` for browsing results. myK9Show has entry dashboards but no public results page.

### UX / Quality of Life

- [x] **Armband-based dog lookup** — Done: Added `ArmbandLookup` component to ShowDetailsPage header. Compact input field appears when armbands exist for the show. User types armband number, presses Enter, popover shows dog info (name, breed, sex, owner), class entries with status badges, handler info, and "View profile" link. Self-contained component with `armbandQueries.ts` (count + lookup), React Query hooks, error/not-found/loading states. 10 unit tests.
- [ ] **Settings pages (comprehensive)** — myK9Q has scoring settings, voice settings, privacy, data management, developer tools, install app prompts. myK9Show only has basic PreferencesPage.
- [ ] **PWA / app install prompts** — myK9Q has device detection and mobile app install prompts. myK9Show has no equivalent.

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

- [ ] **~28 files in 700-750 line range** — address when naturally touched
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

- **Evaluate Remotion for programmatic video generation** — Investigate using [Remotion](https://remotion.dev) to create user explainer/tutorial videos for myK9Show. **Problem:** Need onboarding and feature walkthrough content for exhibitors, secretaries, and judges. Manually producing videos is time-intensive and hard to keep current as the UI evolves. **Files:** N/A (research task). **Solution:** Evaluate Remotion's React-based video composition for generating explainer videos programmatically — could use actual component screenshots/recordings, overlay narration, and regenerate when UI changes.

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

- **Apply unified list/detail design system across all entity pages** — Use the Show list and Show detail pages as the golden template, then roll out the same structure to Trials, Classes, Entries, Clubs, Dogs, and People pages. **Problem:** Each page currently rolls its own header, spacing, empty states, loading skeletons, and error handling — resulting in inconsistent UX across the app. The existing design spec (`docs/superpowers/specs/2026-03-15-unified-list-detail-system-design.md`) established the pattern for the Shows→Trials→Classes→Entries hierarchy (Phase 1), but Phase 2 entities (Dogs, Clubs, People) are still ad-hoc. **Files:** `docs/superpowers/specs/2026-03-15-unified-list-detail-system-design.md` (design spec — Phase 1 exhibitor-facing), `apps/myk9show/src/pages/BrowseShowsPage.tsx` (golden list template), `apps/myk9show/src/pages/ShowDetailsPage.tsx` (golden detail template), `apps/myk9show/src/pages/TrialDetailsPage.tsx`, `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`, `apps/myk9show/src/pages/BrowseDogsPage.tsx`, `apps/myk9show/src/pages/clubs/BrowseClubsPage.tsx`, `apps/myk9show/src/pages/admin/UserListPage.tsx` (people). **Solution:** (1) Finalize shared primitives extracted from Show pages (page header, filter bar, view picker, detail layout, tab structure, empty states, skeletons). (2) Apply to remaining Phase 1 entities (Trials, Classes, Entries) if not yet done. (3) Extend to Phase 2 entities: Dogs list/detail, Clubs list/detail, People list/detail. Each page should use the same layout shell, consistent spacing, and role-appropriate defaults (exhibitor = simple cards, secretary/admin = table with bulk actions). See design spec for view mode defaults per entity.

---

## Pending/Completed Tabs for Trials, Classes, and Entries - 2026-03-19 08:43

- **Add pending/completed split to trial, class, and entry lists** — Port the myK9Q pattern where items are separated into "Pending" and "Completed" tabs (or a toggle). **Problem:** Currently all trials, classes, and entries are shown in a single list regardless of status. During a show, secretaries and judges primarily care about pending items (what's left to do), while after the show they want completed items (results). Mixing both adds noise and makes it harder to find what you need. In myK9Q, when a dog was scored its entry moved from the Pending tab to the Completed tab, providing immediate visual feedback. **Files:** `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx` (trial list on ShowDetailsPage), `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx` (class list), `apps/myk9show/src/components/classes/ClassEntriesTable/ClassEntriesTable.tsx` (entry list), `apps/myk9q/src/pages/ClassList/ClassCard.tsx` (reference: myK9Q class card with status-based grouping). **Solution:** Add a tab pair or toggle (Pending / Completed) to each list. Filter by status — e.g., trials with status != 'completed' go to Pending, scored entries go to Completed. Default to Pending during active shows, Completed after show end date. Could use the existing `Tabs` component or a simpler toggle button.
