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

- [ ] **Armband-based dog lookup** — myK9Q has `/dog/:armband` for quick lookup by armband number at shows. myK9Show only has ID-based routes.
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

- [ ] **Trash view for soft-deleted records** — Site admins need a way to see, restore, or permanently delete soft-deleted records. Currently soft-deleted shows/trials/classes/entries disappear from the UI with no way to access them. **Solution:** Add a "Trash" page (site admin only) that queries records where `deleted_at IS NOT NULL`, with options to restore (clear `deleted_at`) or permanently delete (call `hard_delete_show` RPC or equivalent per entity). Could be a single page with tabs per entity type, or accessible from each browse page via a "View Trash" toggle.

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

- **Group classes by trial date/trial number** — Add trial date and trial number columns to the classes table, or group rows visually by trial. **Problem:** The Classes tab shows a flat list of all classes across all trials. The same element+level combination can appear in multiple trials, making the list ambiguous — users can't tell which trial a class belongs to. **Files:** `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`, `apps/myk9show/src/pages/ShowDetailsPage.tsx:111-127` (showClasses memo that flattens trial classes). **Solution:** Either add trial date/number columns to the table, or group rows under trial headers (collapsible sections). The data already includes `trialId` per class — join with trial data to get date/number for display.

- **Remove Ring column for scent work trials** — Hide the "Ring" column when the show type is scent work. **Problem:** Scent work trials don't use ring numbers — the column is irrelevant and adds clutter. **Files:** `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx` (table column definitions). **Solution:** Conditionally hide the Ring column based on the show's organization or trial type. Check `show.organization` or trial-level `trialType` to determine if Ring applies.
