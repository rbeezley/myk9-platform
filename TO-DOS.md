# TO-DOS

Items to address in future sessions.

---

## Port myK9Q Features to myK9Show (2026-03-14)

Goal: myK9Show becomes the complete end-to-end platform. myK9Q may be retired or kept only for ringside scoring.

### Secretary / Operations

- [ ] **Results control / publishing** — Secretary admin panel for controlling when result fields (placement, qualification, time, faults) become visible to exhibitors. myK9Q has 3 presets (Open/Standard/Locked), cascading hierarchy (Show > Trial > Class overrides), bulk operations, and role-based visibility. myK9Show has partial hooks (`useVisibilitySettings`, `useVisibilityMutations`) but no UI. Port ResultsControlTab, visibility presets, and bulk operations from myK9Q.

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

## Harden Volunteer Scheduling RLS Policies - 2026-03-30 18:20

- **Extract shared RLS helper function for secretary/admin check** — The same 6-line `EXISTS (SELECT 1 FROM user_roles JOIN roles ...)` subquery is duplicated 6 times across volunteer table policies. **Problem:** DRY violation — if a role is added or the check logic changes, 6 policies must be updated in lockstep. **Files:** `supabase/migrations/095_volunteer_scheduling.sql:49-67,70-88,90-108`. **Solution:** Create a `is_secretary_or_admin()` SECURITY DEFINER STABLE function, then replace all 6 policy bodies with `USING (is_secretary_or_admin())`. Also drop the redundant `WITH CHECK` clauses (Postgres uses USING when WITH CHECK is identical). Audit other migrations for the same pattern and consolidate.

- **Add show-scoped RLS to volunteer write policies** — Secretary write policies grant access to volunteers across all shows, not just the secretary's assigned shows. **Problem:** A secretary assigned to Show A can currently insert/update/delete volunteer records for Show B. Fine for single-club usage but breaks multi-tenancy. **Files:** `supabase/migrations/095_volunteer_scheduling.sql:48-108` (all three FOR ALL policies). **Solution:** Check `ur.scope_id = volunteers.show_id` for secretary role (site_admin remains global). Requires verifying that secretary user_roles rows have `scope_type = 'show'` and `scope_id` set correctly.

---

## Add Push Notifications to Announcements - 2026-03-30 18:30

- **Wire announcements into push notification infrastructure** — Currently announcements are in-app only (Supabase Realtime + toast + bell badge). Users miss announcements when the app is closed. **Problem:** Secretary sends an urgent announcement ("Ring 3 moved to Building B") but exhibitors with closed browsers never see it until they reopen the app. High/urgent announcements especially need to reach users immediately. **Files:** `apps/myk9show/src/store/announcementStore.ts:108-118` (current toast-only path for high/urgent), `apps/myk9show/src/components/notifications/NotificationBell.tsx` (in-app badge). **Solution:** Depends on push infrastructure being built by the dog notification pipeline (service worker, push subscription table, server-side web-push, permission prompt UX). Once that lands: (1) add a Supabase database webhook or trigger on `show_announcements` INSERT that fires web-push to all subscribers for that `show_id`, (2) high/urgent priority -> push immediately, normal priority -> in-app only (avoid notification fatigue). VAPID key already configured (`VITE_VAPID_PUBLIC_KEY`).

---

## Results Control Page — Follow-up Cleanup (2026-03-31)

- [ ] **Move `detectPreset` and `hasVisibilityOverride` to `@myk9/secretary`** — Both are pure domain logic currently in `ResultsControlPage/resultsControlUtils.tsx`. `detectPreset` reverse-maps field timings to a preset name (useful to both apps). `hasVisibilityOverride` checks whether an override has any non-null field (duplicates internal cascade guard). **Files:** Move from `apps/myk9show/src/pages/secretary/ResultsControlPage/resultsControlUtils.tsx` to `packages/secretary/src/visibility/visibility-presets.ts`, re-export from `packages/secretary/src/index.ts`, update imports in myK9Show.

- [ ] **Replace `useBulkClassOperations` with existing `useBulkSelection<T>`** — `useBulkClassOperations` (in `hooks/useBulkClassOperations.ts`) reimplements Set-based toggle/selectAll/clearSelection that already exists as a generic `useBulkSelection<T>` in `hooks/useBulkSelection.ts`. **Files:** Delete `useBulkClassOperations.ts`, update `ResultsControlPage/index.tsx` to use `useBulkSelection({ items: showClasses, getItemId: c => c.id })`, adapt `toggleClass` → `toggleItem` and `toggleAllInTrial` → `selectItems`/`deselectItems`. Update tests accordingly.

---

## Port AskQ AI Assistant to myK9Show - 2026-03-30 18:11

- **Port AskQ (Ask Queue) from myK9Q to myK9Show** — AI-powered assistant that answers rule questions via full-text search and natural language show data queries (e.g., "How did my dog Buddy do today?"). **Problem:** myK9Show has no equivalent — users cannot ask rule questions or query their show data conversationally. myK9Q's implementation uses Claude Haiku with 5 Supabase-backed tools (`search_rules`, `get_class_summary`, `get_entry_results`, `get_trial_overview`, `search_entries`), a chatbot UI with source attribution, FAQ browsing with offline IndexedDB cache, response caching (5min rules / 30s data), query analytics logging, and user ratings. myK9Show's authenticated model is an advantage over myK9Q's passcode model — queries can be scoped to the user's own entries without favorites. **Files:** Edge function: `apps/myk9q/supabase/functions/ask-myk9q/` (7 files: index.ts, promptBuilder.ts, toolDefinitions.ts, toolExecutor.ts, ruleLookup.ts, responseFormatter.ts, types.ts). Frontend components: `apps/myk9q/src/components/chatbot/` (7 files: AskMyK9Q.tsx, AnswerSection.tsx, SourcesSection.tsx, ChatInputFooter.tsx, FAQSection.tsx, chatbotUtils.ts, AskMyK9Q.css). Services: `apps/myk9q/src/services/chatbotService.ts`, `apps/myk9q/src/services/faq/` (4 files). DB tables: `rules`, `askq_knowledge_base`, `faq_categories`, `chatbot_query_log`. **Solution:** Reuse the existing `ask-myk9q` Edge Function (or fork as `ask-myk9show` with auth-aware scoping). Port frontend components to myK9Show using shadcn/Tailwind (replace myK9Q's semantic CSS). Leverage authenticated user context to auto-scope "my dog" queries to the user's entries. Consider placing as a floating chat button or dedicated route.
