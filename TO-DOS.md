# TO-DOS

Items to address in future sessions.

---

## User Management Improvements (2026-03-14)

- [ ] **Unify role systems — deprecate `people.roles` in favor of `user_roles` table** — Two disconnected role systems exist: `people.roles` (legacy text array, used by UI badges) and `user_roles` table (RBAC, used by AuthContext for access control). They're not synced — users can have RBAC roles but show no badges, or vice versa. Fix: (1) Update user table/badges to read from `user_roles` joined with `roles` table. (2) Update user creation flows (OAuth, admin create) to write to `user_roles` instead of `people.roles`. (3) Migrate existing `people.roles` data into `user_roles`. (4) Deprecate and eventually drop `people.roles` column.
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

## Outstanding from Code Quality Sprint (2026-02-15)

- [ ] **~28 files in 700-750 line range** — address when naturally touched
- [ ] **Make E2E CI jobs blocking once tests are stable** — Investigated 2026-02-27: CI broken due to GitHub Actions billing. myK9Q 1/10 E2E passing (missing test passcodes). myK9Show E2E ~0% (AI-generated artifacts need triage). Next steps: (1) fix billing/wait for reset, (2) decide passcode seeding strategy, (3) triage myK9Show E2E files.

---

## Production Readiness (when real users are on production URL)

- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch. Add a deploy step at the end of the GitHub Actions CI workflow that only runs after all tests pass (`vercel deploy --prod`). Keep auto-deploy for PR preview URLs. Requires `VERCEL_TOKEN` secret and Vercel CLI in CI.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as a required status check. No direct pushes to main in production.
