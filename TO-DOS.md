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

- [ ] **Scoresheet variants (full parity)** — myK9Q has UKC Obedience, UKC Rally, UKC Nosework, AKC Scent Work, AKC FastCat, ASCA Scent Detection, AKC Nationals. Verify all are available via `@myk9/scoring-ui` and wired up in myK9Show.

### Data & Analytics

- [ ] **Trial statistics / analytics** — myK9Q has `/stats` and `/stats/:trialId/class/:classId` with detailed trial & class performance analytics. myK9Show's AnalyticsPage is limited.
- [ ] **Public results display** — myK9Q has `/results` and `/results/:licenseKey` for browsing results. myK9Show has entry dashboards but no public results page.

### UX / Quality of Life

- [ ] **Armband-based dog lookup** — myK9Q has `/dog/:armband` for quick lookup by armband number at shows. myK9Show only has ID-based routes.
- [ ] **Settings pages (comprehensive)** — myK9Q has scoring settings, voice settings, privacy, data management, developer tools, install app prompts. myK9Show only has basic PreferencesPage.
- [ ] **PWA / app install prompts** — myK9Q has device detection and mobile app install prompts. myK9Show has no equivalent.

---

## Landing Page & Public UX (2026-03-14)

- [ ] **Remove Kanban view from shows browse page** — Kanban is a management view, not useful for public show browsing. Hide it for unauthenticated users (or remove from the view switcher entirely on the browse page).

---

## Exhibitor UX Redesign — Sidebar, Dashboard Modes, Page Structure (2026-03-14)

- [ ] **Redesign Exhibitor sidebar navigation** — Current sidebar has 4 items (Dashboard, My Account, Current Entries, Entry History). Proposed structure: My Profile, My Dogs, My Entries, Shows, Clubs, Calendar, Activity (History), Settings. **Problem:** Current nav is too shallow — missing dogs management, clubs, calendar, activity history, and settings. Sidebar doesn't reflect the breadth of exhibitor workflows. **Files:** `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts:67-98` (sidebar items), `apps/myk9show/src/routes/publicRoutes.tsx:160-210` (route definitions). **Solution:** Restructure sidebar sections and add routes for new pages.

- [ ] **Add dual-mode Exhibitor Dashboard (Planning vs Show Day)** — Dashboard should intelligently switch between two modes based on context. **Planning mode** (default): browsing shows, managing entries, reviewing performance, managing dogs (premium: titles, health records, training journal). **Show Day mode** (when active show detected): check-in status, notifications setup, run order, live results. **Problem:** Current dashboard has progressive disclosure logic (`ShowDayHero` etc.) but it's not a clean two-mode experience with distinct information architecture. **Files:** `apps/myk9show/src/pages/ExhibitorDashboard.tsx:1-504` (main dashboard), `apps/myk9show/src/components/exhibitor/ShowDayHero.tsx`, `apps/myk9show/src/hooks/queries/useShowDayData.ts` (show day detection). **Solution:** Design two distinct dashboard layouts, use show day detection to auto-switch, allow manual toggle. Brainstorm better names than "Before/During".

- [ ] **Build missing Exhibitor pages** — Several proposed sidebar destinations don't have pages yet. **Problem:** My Dogs, Clubs, Calendar, and Activity (History) pages don't exist. Settings is minimal (PreferencesPage only). **Files:** `apps/myk9show/src/pages/` (page directory), `apps/myk9show/src/routes/publicRoutes.tsx` (routes). **Solution:** Build My Dogs page (list/manage dogs, premium features later), Clubs page (club memberships), Calendar page (upcoming shows/entries), Activity page (entry/result history timeline), expand Settings.

- [ ] **Build My Profile page for exhibitors** — The "My Profile" link in the user dropdown goes to `/users/{personId}` (a public profile view page), which shows nothing useful. Exhibitors need an editable profile page to manage their name, email, phone, address, and password. **Problem:** After skipping the onboarding modal, there's no way to set or edit personal info. The dashboard greeting falls back to the email prefix ("exhibitor") when no name is set. The Preferences page (`/preferences`) has theme/notification settings but no profile fields. **Files:** `apps/myk9show/src/pages/ProfileRedirect.tsx` (current redirect), `apps/myk9show/src/components/exhibitor/ExhibitorOnboardingModal.tsx` (has profile form fields to reference), `apps/myk9show/src/pages/PreferencesPage.tsx` (settings page). **Solution:** Create a dedicated `/profile` page with editable fields (first name, last name, email, phone, address) and Supabase Auth password change. Link from user dropdown "My Profile" and consider adding to the exhibitor sidebar under Settings.

- [ ] **Exhibitor missing "Add Dog" button on BrowseDogsPage** — The "Add Dog" button is gated by `hasPermission('dog:create')` via `useRBAC`. The exhibitor role has `dog:create` in the RBAC seed migration (`002_rbac_seed_data.sql:144`), but the permission check returns false at runtime. **Problem:** Exhibitors see the dogs page with no way to add a dog. The permission is seeded in the migration but not resolving for this user. **Files:** `apps/myk9show/src/pages/BrowseDogsPage.tsx:56` (permission check), `apps/myk9show/src/hooks/useRBAC.ts` (RBAC hook), `apps/myk9show/supabase/migrations/002_rbac_seed_data.sql:144` (seed data). **Solution:** Investigate whether role_permissions rows exist for the exhibitor role in the DB, whether the user has the exhibitor role in user_roles, and whether useRBAC is resolving permissions correctly.

---

## Outstanding from Code Quality Sprint (2026-02-15)

- [ ] **~28 files in 700-750 line range** — address when naturally touched
- [ ] **Make E2E CI jobs blocking once tests are stable** — Investigated 2026-02-27: CI broken due to GitHub Actions billing. myK9Q 1/10 E2E passing (missing test passcodes). myK9Show E2E ~0% (AI-generated artifacts need triage). Next steps: (1) fix billing/wait for reset, (2) decide passcode seeding strategy, (3) triage myK9Show E2E files.

---

## Production Readiness (when real users are on production URL)

- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch. Add a deploy step at the end of the GitHub Actions CI workflow that only runs after all tests pass (`vercel deploy --prod`). Keep auto-deploy for PR preview URLs. Requires `VERCEL_TOKEN` secret and Vercel CLI in CI.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as a required status check. No direct pushes to main in production.
