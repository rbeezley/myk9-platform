# TO-DOS

Items to address in future sessions.

---

## Port myK9Q Features to myK9Show (2026-03-14)

Goal: myK9Show becomes the complete end-to-end platform. myK9Q may be retired or kept only for ringside scoring.

### Secretary / Operations

- [x] **Results control / publishing** — Done (PR #37). Standalone page at `/secretary/results-control` with PresetSelector, TrialOverrides, ClassOverrides with checkboxes, BulkOperationsBar (batch upsert), SelfCheckinSection, and Release Results. 40 tests. Follow-up cleanup tracked separately.

### Live Event / Spectator

- [ ] **TV run order display** — myK9Q has `/tv/:licenseKey` with live run order, results podium, carousel navigation, real-time class status. No equivalent in myK9Show.
- [ ] **Voice announcements / settings** — myK9Q has dedicated voice settings for audio feedback and announcements. Not in myK9Show.

### Data & Analytics

- [ ] **Gate premium analytics behind subscription** — Wrap four sections with `FeatureGate` so free users see summary cards + result distribution (basic "how did I do"), while premium sections are blurred/locked with an upgrade prompt. Sections to gate: (1) **Lifetime analytics page** — cross-show trends and historical performance on `/analytics`; free users see summary cards and pie chart, everything below is gated. (2) **QualificationTrendChart** — the "am I improving?" trend line is the highest-value visualization. (3) **Per-dog breakdown (DogBreakdownCards)** — especially once comparative stats (breed averages) are added. (4) **Fastest times leaderboard (FastestTimesTable)** — competitive cross-show rankings. **Keep free:** show-scoped "My Stats" tab (you entered a show, you see your results), summary cards, result distribution pie chart. **Rollout:** Platform-wide free trial for 3-6 months after production launch. After that, new users get premium analytics free for their first 3 shows with scored results (count distinct `show_id` where user has at least one scored entry). Three shows gives enough data for the trend chart to start forming and for exhibitors to see real value before gating. **Implementation:** Extend `FeatureGate`/`useSubscriptionGate` with a shows-based trial check — query count of distinct shows with scored entries for the user's dogs, gate when count > 3 and no paid tier. **Files:** `AnalyticsPage.tsx` (wrap individual sections, not the whole page), `FeatureGate` component + `useSubscriptionGate` hook already exist in the codebase.

---

## Class Details Page — Future Enhancements (2026-03-24)

- Dog status column (Checked In / In Ring / On Deck / Conflict) — requires check-in data pipeline
- Drag-and-drop run order in entries table
- Inline score editing in table cells

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

- **Decide whether to merge myK9Q into myK9Show or keep separate** — Fundamental architecture decision on the future of both apps. **Problem:** Current direction is "port everything to myK9Show, maybe retire myK9Q or keep for ringside only" (see memory: `project_myk9show_vision.md`), but this hasn't been rigorously evaluated. Key open questions: (1) Does ringside scoring need a separate offline-first app, or can myK9Show handle it? (2) If we keep myK9Q, what gets stripped out of it (secretary tools, analytics, chat, AskQ — all recently added to myK9Show)? (3) Features already duplicated in both apps (scoring, results, announcements) — do we remove from one side or maintain both? (4) Does the offline-first replication layer (`@myk9/replication`) make sense in myK9Show, or is it a myK9Q-only concern? (5) User experience impact — exhibitors currently use myK9Q with 2+ years of muscle memory. **Solution:** Run `/brainstorm` session to evaluate tradeoffs before committing to more porting work.

---

## Debug Site Admin Login & Password Reset - 2026-04-01 20:23

- **Fix site admin login failure and missing password reset emails** — Richard@myk9Q.com (site admin account) cannot sign in ("invalid credentials") and password reset emails never arrive. **Problem:** Two separate failures: (1) authentication rejects valid credentials — could be case sensitivity on email, account not confirmed, or account not existing in Supabase auth; (2) password reset email never sent/received — need to determine if email is handled by Supabase's built-in auth emails or Resend, check spam, verify email provider configuration in Supabase dashboard (Auth > Email Templates, SMTP settings). **Solution:** Check Supabase dashboard: Auth > Users to confirm account exists and email matches exactly. Check Auth > Providers > Email settings for SMTP/Resend configuration. Check Supabase auth logs for failed login attempts and password reset requests. Test with `supabase auth` CLI if possible.

---

## Brainstorm: Wait Lists & Entry Capacity - 2026-04-01 20:23

- **Design wait list system and mail-in entry reservations** — Shows fill up fast with online entries; need per-class wait lists and the ability to reserve a percentage of spots for mail-in entries. **Problem:** No capacity management exists. When a class fills up, there's no way to queue additional exhibitors or notify them when a spot opens. Mail-in entries (still common in the sport) get shut out if online entries grab all spots first. Key questions: (1) How are class limits defined — per class, per trial, per show? (2) Wait list ordering — FIFO, priority-based, or lottery? (3) When a spot opens, auto-promote or notify and let exhibitor confirm? (4) What percentage of entries to reserve for mail-in, and who configures it (secretary per show)? (5) What happens when mail-in reservation deadline passes — do reserved spots release to wait list? (6) How does this interact with the existing registration wizard flow? **Solution:** Run `/brainstorm` session before implementation.

---

## Generate myK9Q Passcodes from myK9Show - 2026-04-01 20:23

- **Build passcode generation for myK9Q roles** — If myK9Q is kept as the ringside app, myK9Show needs to generate and manage the passcodes that myK9Q uses for authentication. **Problem:** myK9Q uses passcode-based auth (`[role][4-digits]`, e.g., `aa2604`), but there's no UI in myK9Show for secretaries to generate/view/regenerate these codes per show. Currently passcodes are manually configured. Four role codes needed: exhibitor (`e`), steward (`s`), judge (`j`), admin/secretary (`a`). **Depends on:** "One App vs Two Apps" brainstorm decision — only needed if myK9Q is kept. **Solution:** Secretary generates passcodes per show from myK9Show (likely on show settings or a dedicated "Ringside Setup" page). Store in Supabase, myK9Q validates against them via existing edge function. Consider: auto-generate on show creation vs manual generation, regeneration/revocation, display as QR codes for easy sharing at the event.

---

## Configurable Payment Types Per Show - 2026-04-01 20:24

- **Allow clubs to configure accepted payment methods per show** — Secretary/club admin sets which payment types are accepted during show setup. **Problem:** No way to restrict payment methods. Some clubs only want online payments (Stripe), others accept checks or cash at the door. Currently there's no configuration for this, and the registration flow doesn't enforce or display accepted payment types. Options to support: online (Stripe), check, cash, and potentially others. **Solution:** Add a payment configuration section to show settings where the club selects which methods to accept. Registration wizard and entry flow should only present the enabled options. Store as a JSON array or flags on the show record. Consider: default payment types per club (so they don't reconfigure every show), validation that at least one method is enabled.
