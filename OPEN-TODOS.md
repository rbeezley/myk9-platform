# Open Todos

Active work items only. Resolved items and full context live in TO-DOS.md.

---

## Premium PDF Styles — Cover image upload

- [x] **Cover-image upload for Gazette + Magazine** — Fixed on 2026-05-11. Premium templates now carry `coverImageUrl`, the premium panel can upload/remove a cover image through Supabase Storage, and Gazette/Magazine covers render uploaded cover art with the existing At-a-Glance stat panels preserved as the null fallback. The PDF draft pre-resolves cover URLs to browser-safe data URLs before rendering to avoid the prior browser image/runtime failure path.
- [x] **Show creation wizard cannot choose premium list style** — Fixed on 2026-05-10. The show details step now includes a Premium List Style selector using the current premium style values, the wizard defaults unset drafts to `monogram`, and the atomic create payload/RPC writes `shows.style` during initial creation.
- [x] **Fallback AKC Scent Work template rules fetch 400s** — Fixed on 2026-05-10. The class-rule service now treats local fallback template IDs as non-DB templates, skips Supabase prewarm/fetch calls for them, and continues fetching rules for UUID-backed database templates.
- [x] **Show overview judges card can render `?` after wizard assignment** — Fixed on 2026-05-10. The show detail overview now ignores unresolved judge names from show-level assignment rows, falls back to class-level judge names, and renders the calm empty state when neither source has a displayable name.

---

## QA Walk — Shows as Secretary (2026-05-10, completed)

Real-browser secretary walk against the dev server covering show creation, edit-after-create, registration, entry creation, and premium PDF generation. **Pre-walk cleanup**: all 8 prior premium-style-named test shows (Heritage, Headline, Monogram, Banner, Field Guide, Magazine, Poster, Gazette) were deleted. **Post-walk fixtures** for scoring tests:

| Show     | Style    | UUID                                   | Trials | Classes | Entries               |
| -------- | -------- | -------------------------------------- | ------ | ------- | --------------------- |
| Heritage | heritage | `3b91e282-6e45-4a89-9446-f6ebeb0bf62c` | 4      | 40      | 80 (Ace + Bravo × 40) |
| Headline | headline | `18802fc0-1558-4dc3-902d-989edef4df3c` | 4      | 40      | 80 (Ace + Bravo × 40) |

Both shows: 3-day Fri/Sat/Sun structure (Jun 12-14, 2026), 2 elements per trial mixed across Container/Interior/Exterior/Buried, all 5 levels per element (Novice A + Novice B + Advanced + Excellent + Master). Hit F30 trying to get the 3rd dog — ended at 2 dogs × 40 classes per show. Run the same wizard again later to top up to 120/show if needed for scoring tests.

### Premium style data + type drift

- [x] **Premium-style wizard dropdown lists 8 options but the type declares 6 — root-cause confirmed** — Fixed/verified on 2026-05-11. `PremiumStyle` now includes all eight wizard options (`monogram`, `banner`, `headline`, `magazine`, `poster`, `gazette`, `fieldGuide`, `heritage`) and `getPremiumStyleOptions()` is the aligned source.

### Show creation wizard route

- [x] **`/secretary/classes` is the registered route for the show creation wizard, but `/secretary/create-show/wizard` is what the "New Show" button actually navigates to** — Fixed on 2026-05-11. The route registry, preload pattern, and admin-help directory now use the canonical `/secretary/create-show/wizard` path.
- [x] **Two show-creation pages coexist (`ShowCreationWizardPage.tsx` + `CreateShowPage.tsx`)** — Fixed on 2026-05-11. The unused legacy redirect page was removed after verifying live routes use `ShowCreationWizardPage`.

### Secretary dashboard data inconsistency

- [x] **Dashboard says "Managing 0 shows" + empty state, while "Needs Attention" lists shows with pending entries** — Fixed on 2026-05-11. Pending-entry attention items now filter through the same managed-show set used by the dashboard count, so entries for unrelated shows no longer make a 0-show dashboard look contradictory.

### Accessibility / structural HTML

- [x] **Show cards on `/shows` are `<div>` with onClick instead of `<a href>`** — Fixed on 2026-05-11. `ShowCardHorizontal` now exposes a named React Router link to the show detail route while preserving selection checkbox behavior.
- [x] **Sidebar nav links lack accessible names** — Fixed on 2026-05-11. Collapsed `RoleSidebar` icon-only links now get their nav item title as both `aria-label` and `title`.
- [x] **Raw UUID leaks into Tasks panel UI** — Fixed on 2026-05-11. Task list/timeline show a calm `Unknown show` fallback when a task references a show that is not available locally.

### Show detail / delete-show UX

- [x] **"More actions" dropdown contains only "Delete Show"** — Fixed on 2026-05-11. The single-item overflow menu was replaced with an inline Delete button using the existing confirm dialog.
- [x] **No success toast after deleting a show** — Fixed on 2026-05-11. Successful show deletion now emits a success toast before navigating away.
- [x] **Delete confirm shows trial times as "12:00 AM"** — Fixed on 2026-05-11. The cascading delete dialog now displays trial dates without meaningless default midnight times.

### Wizard step 1 — date / range pickers

- [x] **Show Dates field can be silently wiped by interactions with adjacent date pickers** — Fixed on 2026-05-11. `DateRangePicker` now keeps a local draft range per instance, ignores empty calendar emissions unless the explicit clear button is used, and opens from a stable month.
- [x] **Entry Period multi-month range fails to persist — only end date is kept** — Fixed on 2026-05-11. Cross-month range selection now preserves both endpoints and applies the correct default open/close times.

### Wizard step 1 — host club inline creation

- [x] **`Create New Club` toggles host-club section into inline-create mode but offers no way back** — Fixed/verified on 2026-05-11. Inline club creation includes a Cancel action that returns to the host-club picker and clears the draft create state.
- [ ] **Newly-created host club displays as `Unknown Club` in the picker** — After typing a valid club name (e.g. `QA Test Club Heritage`) + email, clicking `Add Club` flips the section back to the picker mode but the picker now shows `Unknown Club` as the selected text rather than the just-typed name. The club value gets stored correctly downstream (the show-create RPC even quotes the club's UUID in its error message), but the user-facing label is wrong. Likely a missed re-fetch / cache write after the create-club mutation. Files: host-club picker label resolver, club-create mutation onSuccess handler.

### Wizard step 1 — host club picker (RLS / data)

- [ ] **Host Club picker shows `No clubs found` for a fresh secretary, even when clubs exist** — Logged in as `secretary@myk9t.com`, the Host Club picker rendered an empty state (`No clubs found`) and a search for `Test` returned no results, even though `Test Club 1` was the host club for the eight pre-existing premium-style test shows we just deleted. The picker's query is filtering too aggressively (likely by a not-yet-existing club-membership / club-admin role link), so the secretary's only path forward is to create a new club inline — see F21 below for why that path also dead-ends. Investigate: the clubs query the picker uses, and whether it should fall back to "all clubs viewable by this user" instead of "clubs the user is a member of." Files: host-club picker component, the clubs query hook.

### Wizard final submit — RLS / authorization (FLOW STOPPER)

- [x] **`Failed to create show: not authorized to create shows for club <id>` when secretary creates a show on a club they just created** — Fixed on 2026-05-11. Migration `20260511100000_grant_club_admin_to_club_creator.sql` adds a DB trigger that grants the signed-in club creator an active `club_admin` role scoped to the new club; pushed to Supabase project `sojmvhhwsjxmfistvzbe` and verified in remote migration history.

### Wizard final submit — schema mismatch (FIXED 2026-05-10)

- [x] **`Failed to create show: column "show_id" of relation "classes" does not exist` — FIXED 2026-05-10** — Root cause: migration `20260510120000_create_show_with_children_style.sql` (commit `9a118b32`) added a non-existent `show_id` column to the `INSERT INTO public.classes` in the `create_show_with_children` RPC. Classes link to shows via `classes.trial_id → trials.show_id`, not directly. Fix shipped in new migration [`supabase/migrations/20260510143000_fix_create_show_with_children_classes_show_id.sql`](supabase/migrations/20260510143000_fix_create_show_with_children_classes_show_id.sql) which `CREATE OR REPLACE`s the function with the bad columns removed. Pushed to remote DB and validated end-to-end: a new Heritage show was created in this same session via the secretary wizard with 4 trials, 40 classes, and 80 entries.

### Wizard step 2 — trial form

- [x] **Trial Type dropdown displays the raw enum value (`scent_work`) instead of the human label (`Scent Work`)** — Fixed on 2026-05-11. Added `formatTrialTypeLabel()` and use it in the trial type dropdown/review surfaces.
- [x] **Trial Type dropdown only offers `Scent Work` and `Other` for AKC shows** — Fixed on 2026-05-11. The wizard now uses the organization compatibility map as the base list and lets active templates add options, so AKC shows keep the broader AKC discipline set even when only Scent Work templates are loaded.
- [x] **Trial date picker doesn't auto-navigate to the show's date range** — Fixed on 2026-05-11. The trial date picker opens to the show start month when no trial date has been selected yet.
- [x] **`Event Number*` is required but not visually emphasized in the trial form** — Fixed on 2026-05-11. AKC event numbers now use required input semantics and clearer required placeholder copy.

### Wizard step 3 — class selector

- [x] **`Select All` checkbox at the element-section level is a `<div role="checkbox">` not a labeled button — and its label is empty in the accessibility tree** — Fixed on 2026-05-11. Element-level select-all controls now expose clear aria labels and mixed state.
- [x] **Class-card click handler appears to occasionally drop clicks under rapid sequential interaction** — Fixed on 2026-05-11. Class selection now uses a current-selection ref so rapid sequential toggles are applied against the latest selection state.

### Post-create — secretary registration + entry CRUD

- [ ] **Show detail "Entries" tab shows the current user's personal entries, not the show's full entry list** — On `/shows/<id>?tab=my-entries` a secretary sees a "You haven't entered any classes in this show yet" empty state with a "Browse Classes" CTA. That's the right experience for an exhibitor but wrong for a secretary, who needs to see _all_ entries across exhibitors for management. Either rename the tab "My Entries" (and add a separate "All Entries" view for secretaries), or branch the content by role. Files: show detail tab content for `tab=my-entries`.
- [ ] **Public `/shows/:showId/register` page just says "Online show entry is coming soon"** — Confirmed feature-flag-gated empty state. The actual public entry-form for exhibitors isn't built/enabled yet. Until it is, exhibitors can't self-register and secretaries can only register dogs they personally own. Either enable the existing public flow (the route + component exist) or remove the feature flag.
- [x] **Secretary registration dog picker defaults to empty + "your dogs" filter** — Fixed on 2026-05-11. Secretary/admin empty states now direct the user to search/register dogs rather than referring to "your dogs."
- [ ] **Secretary's "Manage Entries" button on a class detail page leads to a scoring view, not an entry-management view** — Class detail page has a "Manage Entries" button. It navigates to `/scoring/classes/.../entries` which only shows scoring filters (Q / NQ / Q only / All runs) and a list of armband+dog rows that click through to scoring. There are no scratch / withdraw / move / delete / edit-handler buttons per entry. Either rename the button "Score class" or build the actual entry-management UI behind it. Files: class detail toolbar, scoring page.
- [ ] **Secretary cannot remove an entry from a class via the UI** — Once a dog is registered to a class, there's no UI affordance for the secretary to scratch, withdraw, delete, or transfer it. The entry rows are entirely clickable to score; nothing per-row. Files: class scoring entries page (and ideally a new secretary entries page).

### Post-create — trial + class edit affordances

- [ ] **No Delete affordance for trials or classes after they're created** — Trial edit panel has Save / Cancel; class edit panel has Save / Cancel. Neither has a Delete button. The secretary can create trials and classes via the wizard but has no UI path to remove them after the fact. To get rid of a misconfigured trial they have to either edit it in place or delete the entire show and start over. Add a Delete with confirm to both panels. Files: trial-edit panel, class-edit panel.
- [ ] **"New Trial" launches the full multi-step wizard instead of a single-step dialog** — On Heritage's Trials tab, clicking "New Trial" routed to `/secretary/create-show/wizard`-like flow with a 4-step progress indicator and a context note "4 existing trials — use Edit Trial on the trial detail page to make changes to them." Adding a single trial doesn't warrant a 4-step wizard. Convert to a focused single-page form or a slide-over dialog.

### Post-create — display / sync bugs

- [x] **Class tab header reads "Classes (0)" while viewing "All Classes (40)"** — Fixed on 2026-05-11. Class filters now use explicit `all` sentinel values instead of empty-string select values, so the all-classes count does not collapse to zero.
- [x] **Trial summary cards display `scent_work` raw enum (F19 re-confirmed in second context)** — Fixed on 2026-05-11. Trials tab cards and table rows now use the shared trial-type formatter, so raw enum values render as calm user-facing labels.
- [ ] **No success toast after registration complete, show edit save, or other completions** — Pattern: most successful mutations land with no toast and no banner. Heritage was edited from "Heritage" to "Heritage (Edited)" and back with zero visual acknowledgement; registration wizard's Complete Registration dropped me at the show overview with no "80 entries added" confirmation. Add `toast.success(...)` after each successful mutation. Files: show edit save handler, registration wizard onComplete, others.

### Post-create — premium PDF (Heritage)

- [x] **Heritage premium PDF preview + download works** — Validated on the new Heritage show: opening "Premium List" panel on the trial pipeline page generated narratives in ~10s, "Preview PDF" rendered an iframe with a blob URL, "Download PDF" available. No visible render in a headless screenshot (likely Playwright/Chromium PDF rendering limitation, not an app bug).
- [x] **Premium narrative generation can fail silently with no actionable detail** — Fixed on 2026-05-11. The generate-premium response can now carry narrative-generation error detail, and the premium editor shows the detail with a Retry narrative generation action instead of a dead-end fallback banner.

### Post-create — judges + role assignment

- [ ] **Show edit panel "Judges" save silently fails because the chairman/secretary lacks a `user_roles` row — corollary of F21** — Verified end-to-end during this audit: checking Liz Beezley in the show edit Judges section and clicking Save Changes closes the dialog with no error, but after a hard reload the show overview still reads "Judges not yet announced" and the checkbox is unchecked. Root cause traced through code: [`persistShowJudgeAssignments()`](apps/myk9show/src/services/database/queries/judgeQueries.ts:234) calls `.delete()` and `.insert()` on `judge_assignments` without checking the response, so RLS rejections are silently swallowed. The RLS policy [`judge_assignments_write` from migration 143](supabase/migrations/143_scope_judge_assignments_rls.sql) requires the caller to be a site admin, club admin, trial secretary, OR show official via [`is_show_official()`](supabase/migrations/163_mailin_enrollment_rls_and_club_secretary.sql:52), which checks for a row in `user_roles` with role_name in (`secretary`, `chairman`, `steward`) for the given `show_id` or `club_id`. The wizard's `create_show_with_children` RPC inserts into `shows`, `trials`, `classes`, `judge_assignments` — but **not into `user_roles`**, so the chairman/secretary assigned during wizard step 1 never gets the role row that grants subsequent show-edit permissions. Same architectural issue as F21 (club-create doesn't grant club-admin). **Two fixes needed**: (a) in `persistShowJudgeAssignments` capture and throw on supabase error so silent failures surface as visible toasts; (b) in the `create_show_with_children` RPC, after the `shows` INSERT add `INSERT INTO user_roles (auth_user_id, role_id, show_id, is_active) SELECT chairman_auth_user_id, id, v_show_id, true FROM roles WHERE name = 'chairman' ...` (same for secretary).
- [ ] **Console flood: Base UI "not rendered as a native `<button>`" warning** — Many Base UI button-like components are missing the `nativeButton={false}` prop or are being rendered with a non-button element via `render`. Console emits the warning dozens of times per page load. Recommendation: pass `nativeButton={false}` where intentional, or change `render` to actually use a `<button>`. This is a noisy dev-only warning but it should be cleared before launch so real warnings aren't lost in the noise.

### Post-create — class edit (works), and inconsistent validation

- [x] **Class-level judge assignment works end-to-end** — Validated on Heritage / Friday Trial 1 / Container Master: opened Edit dialog, picked Liz Beezley from the Judge dropdown, set Start Time = 2026-06-12T09:00, clicked Save Changes → got "Class updated successfully" toast + dialog closed + Judge displays "Liz Beezley" both immediately and after full page reload. Class-level path uses different RLS than show-level (`can_manage_trial` rather than `is_show_official`) and is not affected by F38/F40.
- [x] **Class edit form requires Judge but wizard creates classes without one** — Fixed on 2026-05-11. Simple class edit validation now allows blank judge values, matching wizard-created classes.
- [x] **Class edit form requires Start Time but wizard creates classes without one** — Fixed on 2026-05-11. Simple class edit validation now allows blank start time, matching wizard-created classes.
- [ ] **Inconsistent success toasts across save flows** — Class edit save shows a "Class updated successfully" toast. Show edit save, registration completion, show deletion all silently succeed with no toast. Standardize: every successful mutation should produce a toast acknowledging what changed. Files: show edit save handler, registration wizard completion, delete-show confirm.
- [x] **F42 — Class judge dropdown renders "Liz Beezley( - )" when the qualification suffix is empty** — Fixed on 2026-05-11. Judge display names now strip empty qualification suffixes.

### F30 — third-dog selection blocker (confirmed in 2 walks)

- [ ] **Registration wizard step 1 dog picker reliably caps at 2 dogs** — Reproducer: search "Ace" → select; search "Bravo" → select; search "Charlie" → click row → 0 of 3 selected and the count holds at 2. Confirmed in two consecutive registration flows (Heritage and Headline). Workarounds attempted: clicking the row's nested checkbox, calling `onCheckedChange` via fiber, using the "Bulk Select" mode and clicking "Select All Visible" / "Select All Eligible". None added the third dog. This may be specific to the audit's fiber-based clicks, but worth a manual reproduction with a human pointer. Files: `DogSelectionStepEnhanced`, `DogSearchInterface`, the dog-list bulk-select logic.

### Security / cosmetic

- [ ] **myK9Q access codes are deterministically derived from the show UUID** — The success screen at the end of show creation displays four codes: Admin / Judge / Steward / Exhibitor. Inspecting Heritage's: show UUID `3b91e282-6e45-4a89-9446-f6ebeb0bf62c` produced codes `a6e45 / j4a89 / s9446 / ef6eb`. Each is `<role-letter> + 4 chars from the corresponding UUID segment`. If these codes are meant to be access secrets (Steward + Judge especially) anyone who can read the show URL can compute them. Either make them random per-role and stored in a row, or make them not be a secret at all (publish them and rely on role gates).
- [ ] **F30 — dog selection state desyncs across search filters** — In the registration wizard step 1, switching the search input from "Ace" to "Bella" to "Bravo" reliably reaches 2 dogs selected but never 3. Each new search seems to deselect a previously-selected dog under some condition (probably the "Bulk Select" header checkbox being mis-classified as a row checkbox by my eval; behavior may be different in normal human use, but worth verifying). Files: registration wizard dog selection step.
- [ ] **F17 still observable on the new club path: host club briefly shows `Unknown Club` after `Add Club`** — Same finding as before; just confirming it persists after F23 fix. Display-layer cache miss.

### Process / tooling debt found while running this skill

- [ ] **Worktree was missing `node_modules`** — When this audit started, `pnpm dev:show` failed with `vite: command not found` in the worktree. The `PostToolUse` hook documented in CLAUDE.md (`scripts/bootstrap-worktree.sh`) had not run. Either the EnterWorktree hook isn't firing for worktrees created outside the documented entry path, or the bootstrap script silently fails. Track this: any `/qa-feature` run starting in a fresh worktree may hit it. Mitigation: skill should detect missing `apps/myk9show/node_modules/.bin/vite` and run bootstrap up front.
- [ ] **MCP `playwright-test` driver fails from monorepo root** — Root `playwright.config.ts` requires `@playwright/test` and `dotenv`, but neither is installed at root `node_modules` (they only exist under `apps/myk9show/node_modules/`). Manual symlinks let the config load, then a "two playwright versions" runtime error appears because the MCP server's bundled npx playwright differs from the project's `1.58.0`. The `/qa-feature` skill is documented around `playwright-cli` but no such tool is in the current MCP toolset; the Playwright MCP server can't drive this repo without intervention. Two paths: (a) add `@playwright/test` + `dotenv` as workspace-root devDependencies so MCP can load the config cleanly; (b) update `/qa-feature` skill docs to use `Claude_Preview` (which works) as the primary driver. Until fixed, audits that need a real spec emitted at the end will need manual setup.

## North Star — Phase 2: Walk the Golden Paths

- [ ] **Phase 2 re-walk** — First pass complete 2026-05-03. Do a second end-to-end walk for secretary and exhibitor paths before Phase 3 hand-off. Exit: both paths complete without a blocker.
- [x] **Fix exhibitor check-in status column wiring** — Fixed on 2026-05-10. `/exhibitor/check-in/:entryId` and `/exhibitor/show-day` now read show-day status from `entries.check_in_status`, matching the `self_checkin_entry` RPC write path. Added focused tests for the check-in page data query and show-day class mapping.
- [x] **Secretary Task Timeline View** — Fixed on 2026-05-10. The Tasks tab has a persisted List/Timeline toggle, Timeline renders dated and undated tasks with summary counts, and Timeline rows now support mark done/undone, edit, and delete using the same task mutations as List. No migration required for v1.

## North Star — Phase 3: Real-User Testing

- [ ] **Phase 3 — Real-User Testing** — Recruit 2–3 non-technical test users (one secretary, one or two exhibitors). Hand them written tasks, watch silently, fix every hesitation. Full plan: `docs/plans/strategy/2026-04-11-north-star-fall-2026.md`.

## Health Records

- [ ] **Import Records button** — "Import Records" button on the Health Timeline has no onClick handler. Plan and implement: define supported import formats (CSV? PDF from vet portals?), build import flow. File: `HealthTimeline.tsx` line 272.

## Training Journal

- [ ] **View Progress Report** — Plan and implement the "View Progress Report" button in the Training Journal Quick Actions card. Should show a breakdown of sessions by skill/sport tag, assessment distribution (breakthrough/solid/needs_work/regression), and training time trends over time. Files: `apps/myk9show/src/components/dogs/DogDetails/TrainingJournal/EnhancedTrainingJournal.tsx`.
- [ ] **Set Training Goals** — Plan and implement the "Set Training Goals" button in the Training Journal Quick Actions card. Should allow users to define and track specific training goals (e.g., "earn NW1 by September"). Files: same as above; may require a new `training_goals` table (migration needed).

## Phase 3 Polish (found during Phase 2 walk, 2026-05-03)

- [ ] **Show cards: no personalized badge for logged-in users** — Cards always show generic status ("Accepting Entries") even when user already entered. Needs `userHasEntriesForShow` wired into browse show cards.

## Route & Page Audit Findings

- [ ] **Admin / judge / club-admin interior audit** — Routes under `/admin/*`, `/judge/*`, `/club-admin/*` not walked end-to-end. Need a pass as SITE_ADMIN (and JUDGE for `/judge/*`) to surface 400s, broken UI, or missing data.

## People & Clubs CRUD

- [ ] **People CRUD full audit** — End-to-end audit: create, read, update, delete people as secretary + admin; monitor console/network. Files: `apps/myk9show/src/features/people/`. Full context in TO-DOS.md § "People CRUD + Test Clubs Audit — 2026-04-25".
- [ ] **Clubs full CRUD audit** — Walk create, read, update, delete, list, detail as site admin; capture console/network errors. Files: `apps/myk9show/src/pages/clubs/`. Full context in TO-DOS.md § "Clubs Full CRUD Audit and Fix — 2026-04-25".

## Payments & Email

- [ ] **Stripe Integration** — No Stripe integration exists. Entry fees need Stripe Connect (club's connected account + platform convenience fee via `application_fee_amount`). Includes club Stripe onboarding flow + webhook. Full context in TO-DOS.md § "Stripe Integration + Exhibitor Payments Page — 2026-04-30".
- [ ] **Exhibitor Payments page** — `/exhibitor/payments` list view: date, show name, amount, Stripe reference, status, receipt link. Blocked on Stripe integration above. Files: `apps/myk9show/src/pages/`.

## Pre-Launch Housekeeping

- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch; add deploy step to GitHub Actions after all tests pass. Requires `VERCEL_TOKEN` secret.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as required status check. No direct pushes to main in production.
- [ ] **Make E2E CI jobs blocking** — Skipped historically due to billing issues + unstable test suite. Revisit once tests are stable.
- [ ] **Pre-load AKC & UKC Judge Directory** — Import judge directories into `people` + `judge_qualifications` before launch. Format TBD; check akc.org and ukc.org for CSV/XML export.

## Post-Fall (parked — do not pick up before Phase 3 exit)

- [ ] **Prevent Duplicate Rows in Core Tables** — Uniqueness constraints on people/dogs/clubs. Requires duplicate-audit + merge migration before adding constraints. Full context in TO-DOS.md.
- [ ] **Configurable Exhibitor Convenience Fee** — Per-show override + site-admin default. Full context in TO-DOS.md.
- [ ] **Role-Mode Icon Switcher for Sidebar Nav** — Replace labelled section groups with icon-mode switcher (Claude Desktop pattern). Brainstorm before implementing. Full context in TO-DOS.md.
- [ ] **Queue-based Offline Dog Create** — Extend MutationManager to `dogs` table; replace rollback pattern with enqueue. Full context in TO-DOS.md.
- [ ] **Review awesome-design-md for Design Consistency** — Evaluate against current dual approach (shadcn/ui + semantic CSS).
- [ ] **Research Claude Code Managed Agents for AskQ** — Evaluate managed agents API for the AskQ feature. Full context in TO-DOS.md.
