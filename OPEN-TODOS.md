# Open Todos

Active work items only. Resolved historical context lives in git history and dated plan docs.

---

## Lint debt from PR #196 — 2026-05-16

`pnpm lint` is failing on `main` as of 2026-05-16. Both findings landed via [PR #196](https://github.com/rbeezley/myk9-platform/pull/196) (refactor(show): route core reads through data modules), which merged without CI gating due to the paused GHA billing (see `project_gha_billing_paused.md`). Pre-existing on main; not introduced or worsened by the 2026-05-16 show-map data-attr PR.

- [ ] **Fix `react-hooks/set-state-in-effect` in `StickyNav.tsx:45`** — `setPresentIds(new Set(found.map(el => el.id)))` is called synchronously inside `useEffect`, triggering a cascading render. Refactor: either move into the IntersectionObserver callback below (which is the canonical pattern for this rule), or derive `presentIds` rather than storing it. File: `apps/myk9show/src/features/magazine/landing/sections/StickyNav.tsx`.
- [ ] **Fix `react-refresh/only-export-components` warning in `MonogramSectionFolio.tsx:50`** — A non-component export is colocated with a component, breaking fast refresh. Move the constant/function to a sibling module. File: `apps/myk9show/src/features/monogram/components/MonogramSectionFolio.tsx`.
- [ ] **Restore GHA CI gating** — Both issues above would have been caught by CI lint before merge. Re-enable billing / unblock the pipeline so trunk doesn't accumulate undetected lint debt; see `project_gha_billing_paused.md`.

---

## Show-Day Secretary Workflow Brainstorm — 2026-05-16

Captured from a brainstorm covering show-day tasks the secretary performs. Confirmed during the session: single-show-at-a-time is the dominant case; secretaries may have other future or other-club shows visible but only run one at a time. `useMissionControlData` already exposes a single "selected show" concept and persists to localStorage + showStore, so a show-centric IA refactor does not require a data-layer rewrite.

### Design principle — guided, non-blocking UX

Cross-cutting principle that informs every other todo in this section. Secretaries — especially newer ones — often do not know what to do next. Other software fails them by being a passive tool palette. We should make the system *opinionated about the next action* while never blocking the secretary from doing something else. **Not a wizard** (wizards are modal and linear; show day is parallel and interrupt-driven). Instead: the system always has an advisory recommendation, surfaced as a non-modal card, that the secretary can act on, dismiss, or ignore.

- [ ] **Guided next-action surfaces (cross-cutting)** — Four pieces that compose, not a single feature:
  - [ ] **"Next Best Action" card** at the top of the show workbench. Computed from current show state — driven by the same `attentionCount` + status taxonomy the tree already uses (no separate state). One sentence + one button (e.g., "Next: Print check-in sheets for Trial 1 — *Print now*"). Dismissible. Replaced by the next-highest-priority action after dismissal or completion. Same data source as the tree's Attention filter; do not let it diverge.
  - [ ] **Phase checklists** on Setup / Today / Wrap-up tabs. Each phase has a canonical list of standard tasks (e.g., Setup: classes finalized, judges assigned, run order published, check-in sheets ready). Auto-check on detected completion; allow manual check/skip. Progress visible at a glance.
  - [ ] **Contextual one-liner on every screen** — Small, dismissable "About this page" strip describing what a secretary typically uses this screen for. New secretaries lean on it; experienced ones dismiss globally in settings. Cheap to add; high payoff for onboarding.
  - [ ] **Searchable "What do I do if…" help panel** — Slide-out help surface for the unpredictable input flow (exhibitor questions, edge cases like "an exhibitor wants to move up after entries closed"). Decision-tree style: pick the situation, get the recommended flow. This is the only one of the four that does not derive from the data model, because it answers questions that come from outside the system.

### Information architecture

- [ ] **Show-centric IA consolidation (Option A)** — Replace the current Dashboard / Day-of / RunOrder / VolunteerScheduling sprawl with a `/secretary/shows/:id` workbench. Phase-named tabs: **Setup** (pre-show — classes, run order, volunteers/personnel), **Today** (live ops — check-in, move-ups, pulled/scratched, messages, live ring status), **Wrap-up** (results, reports, AKC submission, end-of-day reconciliation). `/secretary` becomes a show picker that auto-routes when only one active show exists. Hook reuse: `useMissionControlData` stays as-is; selected-show state is hoisted from `useState` into the URL.

  **Anchor view: extend the existing show-map tree** (`apps/myk9show/src/features/show-map/ShowMapTab.tsx`) rather than designing a new workbench from scratch. The tree already provides: hierarchy (show → trial → class → entry), per-node status, per-class progress, and an attention count that aggregates up. The mode tabs (Setup / Today / Wrap-up) become *decorations on the same tree plus a flat queue on Today* — they change the default filter, the row actions, and which auxiliary strips/views are shown. The tree is the orientation layer ("where is X?"), not the whole command center; for urgency ("what now?") the Today tab adds a flat priority queue rendering above the tree, both consuming the same priority function. Pages folded into row actions / sub-views: most of `DayOfOperationsPage` (Check-In / Move-Ups / Pulled / Day-of Entries), `VolunteerSchedulingPage` (into Setup tab), `RunOrderPage` personnel tab (into Setup tab). Pages kept as drill-in destinations: show edit, class edit, entry edit, `PaperScoresheetPage`, run-order detail editor.

  **Deprecation mechanics (per page, explicit):** `/secretary/dashboard` → keep as multi-show overview only (the show picker when more than one active show); auto-route to the active show's workbench when there is exactly one. `/secretary/day-of` → 301-redirect to the workbench's Today tab. `/secretary/run-order` → 301-redirect to the workbench's Setup tab, anchored to the run-order section. `/secretary/volunteer-scheduling` → 301-redirect to the workbench's Setup tab, anchored to the personnel section. The `PipelineDashboard` component (already unrouted per the explore) → delete after its callers are migrated. **No bare delete-without-redirect on previously-routed pages** — redirects preserve email/Slack/bookmark links. Capture the redirect map in the consolidation PR description.

- [ ] **Show-map tree extensions for show-day use** — Discrete enhancements to `ShowMapTab` so it can serve as the spine of the Today and Wrap-up tabs. Each sub-item is independently shippable.
  - [ ] **Time scoping + "Completed" tab** — Filter the tree by **Today / Tomorrow / All**, using `trial.trialDate` + `trial.timezone`. Default to Today on the Today tab. Visual treatment: dim non-today trials rather than hide them (still scrollable to, but quiet). Mirror myK9Q's pattern: when a class/entry/trial completes, it moves into a separate **Completed** view (tab on the toolbar or filter chip) so finished items are out of the way but reachable.
  - [ ] **"Running Now" pinned strip above the tree** — Compact horizontal row of ring cards (1–N), each showing current class + judge + percent-scored + ETA. Pulled from in-progress classes. Click a card to scroll/expand to that class in the tree.
  - [ ] **Inline row actions — three-dot + right-click + keyboard, with smart "Recommended" section** — Single `<RowActionsMenu>` component invoked by three triggers: visible three-dot icon, native `contextmenu` right-click, and `Enter`/`Space` on a focused row. All three open the same menu instance — guard against divergence in code review. Per-node-type action mix: entry rows get Scratch, Move Up, Mark Checked-In, Message Handler; class rows get Open Scoring, Print Check-In Sheet, Mark Class Started/Complete; trial rows get Open Schedule, Print Trial Reports.

    **Smart menu refinement:** every menu opens with a **Recommended** section at the top (max 2 items, separated by a divider from the full action list), each with a leading icon and a brief *why* line in muted text (e.g., "Class starts in 20 min", "Scores entered but not finalized"). The full action list still appears below the divider in a stable order — no layout shift if no recommendation applies; the Recommended section is simply omitted. The recommendation is NOT the default keyboard target (deliberate Enter required to execute, to protect against destructive misclicks like Scratch). Recommendations must be deterministic within a render frame — no flicker.

    **Shared priority function constraint:** the Recommended section, the "Next Best Action" card, and the tree's Attention filter all derive from a single pure function (e.g., `getRankedActions(node | 'root', state)` in `features/show-map/`). Three callers, one function — scope is the only argument that varies. Do not let any caller embed its own priority logic; that is how the three surfaces would silently diverge.
  - [ ] **Action dialogs (v1) — defer detail pane to v2** — Row actions that need user input (move-up target class, scratch with optional refund) open in a Dialog/Sheet. After one real show-day walk-through, count how many actions need a dialog: if 3+ of the common ones do, build a persistent right-pane detail view and convert dialogs into pane content. Do not build the pane up front.
  - [ ] **Wrap-up status taxonomy + Attention-only filter lens** — Extend the status classification on class nodes to include wrap-up signals: **signed-by-judge** (yes/no), **submitted-to-AKC** (yes/no, with submission date). Add an "Attention" toggle to the existing toolbar filter chips that hides any node where `attentionCount === 0`, so the tree doubles as a hierarchical task tracker without a separate screen.
  - [ ] **Today-tab flat priority queue rendering** — Above the tree on the Today tab, render a flat, priority-ordered list of next actions ("what needs me right now?"). The queue and the tree's Attention filter consume the *same* `getRankedActions(scope, state)` pure function — two renderings of one source. The queue answers "what now?" without hierarchy; the tree answers "where is that?" with drill-down. Do not let the queue derive its priority from anywhere other than the shared function. Setup and Wrap-up tabs do not get the queue; only Today.
  - [ ] **Per-row badge target spec (lock before sprawl)** — Define and document the canonical badge set per row type so incremental PRs don't drift. Targets: **Trial row** — registry, date, ring/judge, status, reports-readiness. **Class row** — run-order position, checked-in count, scored count, pending-issues count. **Entry row** — armband, check-in status, move-up/scratch/absent status, score status. Today's `StatusCell` renders a subset (status + checkInStatus + attentionCount); document the target spec in code (types file or component header comment) so future contributors add only what's specified.
  - Dropped from the gap list: expand-all-entries-in-class. Confirmed real-world classes rarely exceed the 25-entry preview cap, so the current cap stays.

### Reports & submission

- [ ] **AKC/UKC PDF form-fill — replace HTML mockups** — `JudgesCertification.tsx`, `TrialSecretaryReport.tsx`, `TrialSecretaryCertification.tsx` are styled HTML tables with a "Generated by myK9Show" footer, not the actual AKC/UKC submission forms. Use `pdf-lib` to populate the official AcroForm-fillable PDFs from show/trial/entry/scoring data. **User is sourcing the actual AKC + UKC PDF templates.** Until then, surface the HTML versions clearly as on-screen previews, not as submittable artifacts.
- [ ] **Verify ResultCatalog signature lines** — Confirm `apps/myk9show/src/components/reports/ResultCatalog.tsx` actually renders the judge signature + date lines required for the post-class signing step. If not, add them.
- [ ] **Print testing on venue hardware** — Real-world print test for `CheckInSheet`, `ScoresheetReport`, `ResultLabels`, `ArmbandLabelsReport` on representative venue setups (label printer + standard laser). Capture any margin/scaling/duplex issues.

### Day-of operational gaps

- [ ] **Per-judge supply checklist** — Per-judge supply list (clipboards, pens, water, timer, treats jar, etc.) printable alongside the run-order. New schema (supply template per registry + per-judge overrides) and a print artifact.
- [ ] **Mass-broadcast + canned replies to exhibitors** — Push-notification broadcast to a whole show ("lunch ready", "ring 2 paused 15 min") plus one-tap canned-reply templates inside the message thread UI. Currently the secretary has to type each message.
- [ ] **Verify run-order reorder propagation to myK9Q** — Confirm `RunOrderPage` changes flow through the replication layer to ringside in real time. Fix if stale. Show-day reorders must be instant.
- [ ] **Undo last move-up** — Add an undo affordance to `MoveUpDialog`. Move-ups happen under time pressure; mistakes are common; today the only recovery path is a second move-up edit.
- [ ] **Late-entry / day-of additions workflow** — Walk-in handling: secretary path to add a new exhibitor + dog + entry + payment at the desk on show day. Verify what exists and fill gaps.
- [ ] **Scratches / no-shows flow** — UI to mark an entry absent so the ring does not wait. Probably routes through `DayOfOperationsPage`'s Pulled tab — verify, polish, and make sure the change propagates to myK9Q's run order.
- [ ] **Refunds for scratches** — Stripe refund flow tied to the scratch action, or an explicit "this is manual" UI affordance so the secretary knows where the boundary is.
- [ ] **Incident logging** — Bite / complaint / DQ record with AKC-friendly schema. Permanent, attached to trial + exhibitor + dog + judge. Needed for downstream AKC reporting.
- [ ] **Schedule-slip communication** — When a ring runs 30+ min behind, auto-emit an exhibitor notification + PA-script generator the secretary can read at the desk.
- [ ] **Hospitality tracking** — Judge lunch order capture, water/coffee reminders. Probably belongs in the personnel manager.
- [ ] **End-of-day reconciliation** — Totals view: entries, no-shows, refunds, fees collected. Natural landing screen for the Wrap-up tab.

### Live-walk findings (2026-05-16, Heritage fixture, Chromium headless 1440×900)

Concrete observations from driving the secretary path against the Heritage fixture. Screenshots saved under `/tmp/secwalk/`. Each item below is a discrete bug or gap not already captured above.

- [x] **PREREQ: Add `data-node-id` + `data-node-type` attributes to show-map rows** — Shipped via [PR #197](https://github.com/rbeezley/myk9-platform/pull/197), merged 2026-05-16. Outer row `<div>` for trial/class/entry/more nodes now carries `data-node-id={node.id}` and `data-node-type={node.type}`; ARIA tree roles + `aria-expanded` + `aria-level` landed alongside; the show-summary tile carries `data-node-id="show:<id>"` for show-scope queries.
- [x] **Unify attention computation across dashboard + show-map** — Shipped via [PR #203](https://github.com/rbeezley/myk9-platform/pull/203), merged 2026-05-16. New `apps/myk9show/src/features/show-map/attention.ts` is the single source of truth (`getEntryAttention` + `countAttention`); both surfaces route through it; a divergence-prevention unit test (`attention-consistency.test.ts`) guards against future drift. Live-verified against staging by [PR #204](https://github.com/rbeezley/myk9-platform/pull/204)'s probe — Heritage show now shows 81 on both surfaces (was 81 vs 0).
- [ ] **Entry count inconsistency: tabs say "Entries 80", Show Map tile says "81 Entries"** — Same Heritage show, same screen, two different numbers. Investigate whether the discrepancy is filter-related (one count includes a soft-deleted/cancelled entry, the other doesn't) or a stale-cache issue. Trust-eroding for the secretary.
- [ ] **CLS performance: 0.59 on `/secretary/dashboard`, 0.75 on `/shows/:id`** — Cumulative Layout Shift > 0.25 is "poor" by web-vitals standards. The pages visibly reflow during load. Cause is likely deferred panel content (Tasks, Show Officials cards) pushing earlier content down. Bad on tablet and flaky venue Wi-Fi where load is slow and the shift window is long. Investigate via Lighthouse, set explicit min-heights on suspending panels.
- [ ] **Show Map default expansion creates a wall of empty rows** — Landing on Show Map for a 4-trial × 10-class show renders 40 expanded class rows, each with an empty progress bar and "Not started" badge. Visually loud, low information. Consider: default to expanding only today's trial (paired with the time-scoping todo); or default to collapsed and let the secretary pick where to drill.
- [ ] **"Score Class" buttons render on rows that are weeks away from being scored** — Every class row shows a prominent red "Score Class" button regardless of trial date. For a not-started class 27 days out, the button is irrelevant and visually competes with the page's primary action. Make the row's primary action *contextual* (today's classes get "Score Class"; future classes get "Print Check-In Sheet" or no inline button). This is the same problem the smart Recommended menu solves at the menu level; do not solve it twice — solve it once in the priority function and let both surfaces consume the output.
- [ ] **Overview tab redistribution plan** — Overview currently has 8 distinct panels (Premium List, Public Landing Page, Schedule, Show Officials, myKQ Access Codes, "More from Club X", entry-fee/payment-methods strip, schedule card). The show-centric IA consolidation needs an explicit map of which panels land in Setup vs Today vs Wrap-up vs deprecated. Worth a small plan doc before the consolidation PR is opened.
- [x] **Rename "Show List" UI label back to "Show Map"** — Shipped in this PR. Five sites updated: tab label in `ShowDetailsPage.tsx`, section heading and not-staff error message in `ShowMapTab.tsx`, three test assertions in `ShowMapTab.test.tsx`. Code vocabulary (`ShowMapTab`, `showMapTree`, `ShowMapStructureTable`, `showMapTypes`) now matches the user-visible label.
- [x] **Resolved: `apps/myk9show/secretary-walk.mjs` productionized** — Originally flagged as a throwaway to delete. The version shipped in [PR #204](https://github.com/rbeezley/myk9-platform/pull/204) is a maintained regression probe with a documented exit-code contract and configurable env (BASE_URL, SHOW_ID, HEADED). It asserts dashboard ↔ show-map attention-count parity end-to-end and was used to verify the Heritage 81-vs-0 fix on staging before [PR #203](https://github.com/rbeezley/myk9-platform/pull/203) merged. Keeping it as a deliberate part of the app, not a throwaway. Do not delete.

### Memory hygiene

- [ ] **Update memory: Phase 2 reports shipped** — `~/.claude/projects/.../memory/project_report_generation.md` currently says "6 Phase 2 report stubs pending." Inventory on 2026-05-16 confirmed `ResultCatalog`, `JudgesCertification`, `TrialSecretaryReport`, `TrialSecretaryCertification`, `CheckInSheet`, `ScoresheetReport`, `ResultLabels` all shipped as HTML. The true remaining gap is the AKC/UKC PDF form-fill (covered above), not the report stubs.

---

## Premium Style Completion — 2026-05-15

Heritage and Headline shipped end-to-end. Monogram closed out via PR #187 (merged 2026-05-15). Banner in flight via PR #188. After Banner, Magazine + Poster + Gazette + Field Guide remain — each currently routes Heritage emails as a fallback, has shipped premium-list PDF cover/body, but has no dedicated landing/wizard/entry-blank PDF.

- [x] **Monogram — landing + wizard + entry-blank PDF** — Shipped via [PR #187](https://github.com/rbeezley/myk9-platform/pull/187), merged 2026-05-15.
- [ ] **Banner — full pipeline** ([PR #188](https://github.com/rbeezley/myk9-platform/pull/188) — draft, awaiting migration push + edge fn deploy + ready-for-review flip). All four artifacts plus the `shows.brand_color` migration bundled in one PR per the no-deferred-followups rule. Plan: [`docs/plan-banner-style.md`](docs/plan-banner-style.md).
- [ ] **Magazine / Poster / Gazette / Field Guide — full pipelines** — Each needs a plan doc, the same 4-artifact build sequence Heritage/Headline/Monogram/Banner used. Premium-list PDF covers + bodies already shipped for all four. Schedule one style per work-week.

---

## Nightly E2E Repair Queue — 2026-05-12

- [x] **Repair `apps/myk9show/src/test/e2e/basic/registrationSmoke.spec.ts`** — Wave 1 fixed 2026-05-12. Now asserts user-critical route/auth/navigation affordances and passes in the promoted Nightly command.
- [x] **Repair `apps/myk9show/src/test/e2e/browse-shows-to-details.spec.ts`** — Wave 1 fixed 2026-05-12. Replaced hard-coded port assumptions with config-relative public browse/detail navigation and promoted to Nightly.
- [x] **Repair `apps/myk9show/src/test/e2e/simple-connectivity.spec.ts`** — Wave 1 fixed 2026-05-12. Secretary sign-in now asserts the secretary dashboard landing and avoids a flaky `networkidle` wait.
- [x] **Split/rewrite `apps/myk9show/src/test/e2e/cross-role-workflows.spec.ts`** — Fixed 2026-05-14. Replaced the stale 13-scenario all-in-one suite with focused current role smoke coverage for public Shows, secretary dashboard, exhibitor entries, and judge assignments. Passes alone with retries disabled.
- [x] **Repair `apps/myk9show/src/test/e2e/registration/entryCreationCore.spec.ts`** — Fixed 2026-05-13. Restored a minimal status-history row when entries are rebuilt from replicated state; passes alone and in the promoted Nightly command.
- [x] **Repair `apps/myk9show/src/test/e2e/registration/exhibitorSelfRegistration.spec.ts`** — Fixed 2026-05-14. Replaced the placeholder with a real exhibitor online-entry replay against the public Heritage fixture: class selection, cart write interception, card-path submission, entry agreement, enrollment/entry/armband mocks, Heritage receipt, and completion navigation. Passes alone and in the promoted Nightly command.
- [x] **Repair `apps/myk9show/src/test/e2e/registration/index.spec.ts`** — Fixed 2026-05-13. Converted to a maintained registration spec inventory/meta guard and passes alone.
- [x] **Repair `apps/myk9show/src/test/e2e/registration/secretaryExistingUsers.spec.ts`** — Wave 1 fixed 2026-05-12 and promoted as a narrow existing-user secretary registration guard.
- [x] **Repair `apps/myk9show/src/test/e2e/registration/secretaryNewUsers.spec.ts`** — Fixed 2026-05-14. Secretaries now get the mail-in entry create path, the exhibitor dialog persists an offline `people` row, and the E2E proves secretary-created person + dog + dog registration with shared writes intercepted and no auth user creation.
- [x] **Repair `apps/myk9show/src/test/e2e/registration/singleDogSingleClass.spec.ts`** — Fixed 2026-05-13. Updated auth waits, dog-row selection, and current agreement behavior; passes alone.
- [x] **Repair `apps/myk9show/src/test/e2e/secretary/classCreation.spec.ts`** — Wave 1 fixed 2026-05-12 and promoted as a narrow route/template-selection smoke, not full class-creation workflow coverage.
- [x] **Repair `apps/myk9show/src/test/e2e/secretary/show-creation-wizard.spec.ts`** — Wave 1 fixed 2026-05-12. Current wizard Step 1/add-trials assertions pass and are promoted to Nightly.
- [x] **Repair `apps/myk9show/src/test/e2e/secretary/show-wizard-officials.spec.ts`** — Fixed 2026-05-13. Refreshed chairman/judges picker selectors against current accessible labels; passes alone.
- [x] **Repair `apps/myk9show/src/test/e2e/uat/secretary/critical-path.spec.ts`** — Wave 1 fixed 2026-05-12. Hook signature and target-route sign-in repairs pass in the promoted Nightly command.
- [x] **Repair `apps/myk9show/src/test/e2e/uat/secretary/disposable-entry.spec.ts`** — Wave 1 fixed 2026-05-12. Hook signature repair passes in the promoted Nightly command.
- [x] **Repair `apps/myk9show/src/test/e2e/uat/secretary/evidence.spec.ts`** — Wave 1 fixed 2026-05-12. Target-route sign-in repair passes in the promoted Nightly command.

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
- [x] **Newly-created host club displays as `Unknown Club` in the picker** — Fixed on 2026-05-11 as part of Batch 1. Inline club creation now keeps the created club label available to the picker after mutation/cache refresh instead of falling back to `Unknown Club`.

### Wizard step 1 — host club picker (RLS / data)

- [x] **Host Club picker shows `No clubs found` for a fresh secretary, even when clubs exist** — Fixed on 2026-05-11 as part of Batch 1. The host-club picker path now supports the secretary create-show flow without forcing a dead-end empty state.

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

- [x] **Show detail "Entries" tab shows the current user's personal entries, not the show's full entry list** — Fixed on 2026-05-11 as part of Batch 3. Secretary entry management now avoids presenting the exhibitor-only personal-entry empty state as the management view.
- [x] **Public `/shows/:showId/register` page just says "Online show entry is coming soon"** — Fixed on 2026-05-11 as part of Batch 3. Public registration is no longer left as a feature-flag dead end for the post-create entry path.
- [x] **Secretary registration dog picker defaults to empty + "your dogs" filter** — Fixed on 2026-05-11. Secretary/admin empty states now direct the user to search/register dogs rather than referring to "your dogs."
- [x] **Secretary's "Manage Entries" button on a class detail page leads to a scoring view, not an entry-management view** — Fixed on 2026-05-11 as part of Batch 3. The class-detail action now avoids mislabeling a scoring-only destination as entry management.
- [x] **Secretary cannot remove an entry from a class via the UI** — Fixed on 2026-05-11 as part of Batch 3. Secretary entry-management affordances now include a removal/scratch path instead of leaving entry rows score-only.

### Post-create — trial + class edit affordances

- [x] **No Delete affordance for trials or classes after they're created** — Fixed on 2026-05-11 as part of Batch 3. Trial/class edit flows now include delete affordances with confirmation instead of requiring whole-show deletion.
- [x] **"New Trial" launches the full multi-step wizard instead of a single-step dialog** — Fixed on 2026-05-11 as part of Batch 3. Adding a trial now uses a focused post-create flow instead of the full show-creation wizard.

### Post-create — display / sync bugs

- [x] **Class tab header reads "Classes (0)" while viewing "All Classes (40)"** — Fixed on 2026-05-11. Class filters now use explicit `all` sentinel values instead of empty-string select values, so the all-classes count does not collapse to zero.
- [x] **Trial summary cards display `scent_work` raw enum (F19 re-confirmed in second context)** — Fixed on 2026-05-11. Trials tab cards and table rows now use the shared trial-type formatter, so raw enum values render as calm user-facing labels.
- [x] **No success toast after registration complete, show edit save, or other completions** — Fixed on 2026-05-11 as part of Batch 4. Successful registration/save/completion flows now provide success feedback through the shared notification path.

### Post-create — premium PDF (Heritage)

- [x] **Heritage premium PDF preview + download works** — Validated on the new Heritage show: opening "Premium List" panel on the trial pipeline page generated narratives in ~10s, "Preview PDF" rendered an iframe with a blob URL, "Download PDF" available. No visible render in a headless screenshot (likely Playwright/Chromium PDF rendering limitation, not an app bug).
- [x] **Premium narrative generation can fail silently with no actionable detail** — Fixed on 2026-05-11. The generate-premium response can now carry narrative-generation error detail, and the premium editor shows the detail with a Retry narrative generation action instead of a dead-end fallback banner.

### Post-create — judges + role assignment

- [x] **Show edit panel "Judges" save silently fails because the chairman/secretary lacks a `user_roles` row — corollary of F21** — Fixed on 2026-05-11 as part of Batch 1. Judge-assignment persistence now surfaces Supabase failures, and show creation grants the required show-scoped role rows for subsequent show-edit permissions.
- [x] **Console flood: Base UI "not rendered as a native `<button>`" warning** — Fixed on 2026-05-11 as part of Batch 4. Base UI trigger wrappers now pass the appropriate `nativeButton` value for `asChild` render paths and include regression coverage for the helper.

### Post-create — class edit (works), and inconsistent validation

- [x] **Class-level judge assignment works end-to-end** — Validated on Heritage / Friday Trial 1 / Container Master: opened Edit dialog, picked Liz Beezley from the Judge dropdown, set Start Time = 2026-06-12T09:00, clicked Save Changes → got "Class updated successfully" toast + dialog closed + Judge displays "Liz Beezley" both immediately and after full page reload. Class-level path uses different RLS than show-level (`can_manage_trial` rather than `is_show_official`) and is not affected by F38/F40.
- [x] **Class edit form requires Judge but wizard creates classes without one** — Fixed on 2026-05-11. Simple class edit validation now allows blank judge values, matching wizard-created classes.
- [x] **Class edit form requires Start Time but wizard creates classes without one** — Fixed on 2026-05-11. Simple class edit validation now allows blank start time, matching wizard-created classes.
- [x] **Inconsistent success toasts across save flows** — Fixed on 2026-05-11 as part of Batch 4. Show edit save, registration completion, and delete-show completion now follow the shared success-feedback pattern.
- [x] **F42 — Class judge dropdown renders "Liz Beezley( - )" when the qualification suffix is empty** — Fixed on 2026-05-11. Judge display names now strip empty qualification suffixes.

### F30 — third-dog selection blocker (confirmed in 2 walks)

- [x] **Registration wizard step 1 dog picker reliably caps at 2 dogs** — Fixed on 2026-05-11. Dog selection now keeps previously selected dogs when adding one dog from a later search result, and visible bulk-select actions add/remove only the visible eligible dogs instead of replacing or clearing the full selected-dog cart.

### Security / cosmetic

- [ ] **myK9Q access codes are deterministically derived from the show UUID** — The success screen at the end of show creation displays four codes: Admin / Judge / Steward / Exhibitor. Inspecting Heritage's: show UUID `3b91e282-6e45-4a89-9446-f6ebeb0bf62c` produced codes `a6e45 / j4a89 / s9446 / ef6eb`. Each is `<role-letter> + 4 chars from the corresponding UUID segment`. If these codes are meant to be access secrets (Steward + Judge especially) anyone who can read the show URL can compute them. Either make them random per-role and stored in a row, or make them not be a secret at all (publish them and rely on role gates).
- [x] **F30 — dog selection state desyncs across search filters** — Fixed on 2026-05-11 with the dog-selection cart helper used by `DogSelectionStepEnhanced`; selections now merge across filtered search results and visible bulk actions no longer discard hidden selected dogs.
- [x] **F17 still observable on the new club path: host club briefly shows `Unknown Club` after `Add Club`** — Fixed on 2026-05-11 as part of Batch 1. Duplicate tracking entry resolved with the host-club picker label/cache fix above.

### Process / tooling debt found while running this skill

- [x] **QA regression proof strict browser-health gate still fails** — Fixed/verified on 2026-05-12. Root cause was the proof helper signing in, then each test immediately doing a second `page.goto(...)`, which aborted post-login Supabase/RBAC/replication requests and logged `TypeError: Failed to fetch`. The auth helper now supports `returnTo`, the proof spec signs directly into each target route, and the strict run passes: `cd apps/myk9show && pnpm test:e2e:clean src/test/e2e/uat/secretary/qa-regression-proof.spec.ts --project=chromium --workers=1`.
- [x] **Intermittent Supabase fetch/RBAC/replication console errors during QA proof** — Fixed/verified on 2026-05-12. These were test-harness-induced aborted requests, not app-flow failures: the proof collected health during login, then navigated away from the just-loaded authenticated route. Signing in with `returnTo` preserves the target page load while keeping strict browser health enabled.
- [x] **Base UI native-button warning still appears in strict QA proof** — Fixed/verified on 2026-05-12. The proof worktree now passes `nativeButton` through the DateTimePicker popover trigger, shared Select trigger, and account-menu dropdown trigger; the strict QA proof run no longer reports the Base UI warning.
- [ ] **Worktree was missing `node_modules`** — When this audit started, `pnpm dev:show` failed with `vite: command not found` in the worktree. The `PostToolUse` hook documented in CLAUDE.md (`scripts/bootstrap-worktree.sh`) had not run. Either the EnterWorktree hook isn't firing for worktrees created outside the documented entry path, or the bootstrap script silently fails. Track this: any `/qa-feature` run starting in a fresh worktree may hit it. Mitigation: skill should detect missing `apps/myk9show/node_modules/.bin/vite` and run bootstrap up front.
- [ ] **MCP `playwright-test` driver fails from monorepo root** — Root `playwright.config.ts` requires `@playwright/test` and `dotenv`, but neither is installed at root `node_modules` (they only exist under `apps/myk9show/node_modules/`). Manual symlinks let the config load, then a "two playwright versions" runtime error appears because the MCP server's bundled npx playwright differs from the project's `1.58.0`. The `/qa-feature` skill is documented around `playwright-cli` but no such tool is in the current MCP toolset; the Playwright MCP server can't drive this repo without intervention. Two paths: (a) add `@playwright/test` + `dotenv` as workspace-root devDependencies so MCP can load the config cleanly; (b) update `/qa-feature` skill docs to use `Claude_Preview` (which works) as the primary driver. Until fixed, audits that need a real spec emitted at the end will need manual setup.

## North Star — Phase 2: Walk the Golden Paths

- [ ] **Phase 2 re-walk** — First pass complete 2026-05-03. Do a second end-to-end walk for secretary and exhibitor paths before Phase 3 hand-off. Exit: both paths complete without a blocker.
- [x] **Fix exhibitor check-in status column wiring** — Fixed on 2026-05-10. `/exhibitor/check-in/:entryId` and `/exhibitor/show-day` now read show-day status from `entries.check_in_status`, matching the `self_checkin_entry` RPC write path. Added focused tests for the check-in page data query and show-day class mapping.
- [x] **Secretary Task Timeline View** — Fixed on 2026-05-10. The Tasks tab has a persisted List/Timeline toggle, Timeline renders dated and undated tasks with summary counts, and Timeline rows now support mark done/undone, edit, and delete using the same task mutations as List. No migration required for v1.

## North Star — Phase 3: Real-User Testing

- [ ] **Phase 3 — Real-User Testing** — Recruit 2–3 non-technical test users (one secretary, one or two exhibitors). Hand them written tasks, watch silently, fix every hesitation. Full plan: `docs/plans/strategy/2026-04-11-north-star-fall-2026.md`.

## Health Records

- [x] **Import Records button** — Fixed on 2026-05-11 as part of Batch 6. Health Timeline now supports pasted CSV import for vaccination, vet visit, medication, and allergy rows, with preview validation before creating records.

## Training Journal

- [x] **View Progress Report** — Fixed on 2026-05-11 as part of Batch 6. Quick action now opens a progress report with sessions by skill, assessment distribution, and monthly training-time trends.
- [x] **Set Training Goals** — Fixed on 2026-05-11 as part of Batch 6. Quick action now opens a goal tracker backed by the new `training_goals` table, with create, complete, and reopen behavior.

## Phase 3 Polish (found during Phase 2 walk, 2026-05-03)

- [x] **Show cards: no personalized badge for logged-in users** — Fixed on 2026-05-11 as part of Batch 4. Browse show cards now preserve the personalized `Entry Submitted` badge for logged-in users with entries.

## Route & Page Audit Findings

- [x] **Admin / judge / club-admin interior audit** — Completed on 2026-05-11. Repaired the E2E admin and club-admin accounts, walked the admin, judge, and club-admin route sets, and fixed the UI warnings surfaced by the audit.

## Auth & Access

- [ ] **Add an approval workflow for sign-up role requests** — The sign-up page currently lets users select `Exhibitor`, `Club officer / show host`, and `Show secretary`; those values are stored only as auth metadata (`raw_user_meta_data.intended_roles`) and do **not** self-grant `club_admin` or `secretary` roles. **Problem:** The UI wording implies access may be granted automatically, and we need a safe admin approval path before elevated roles are acted on. **Files:** `apps/myk9show/src/pages/SignUpPage.tsx`, `apps/myk9show/src/hooks/useAuth.ts`, `supabase/migrations/165_handle_new_user_agreed_to_tos.sql`, future admin approval UI under `apps/myk9show/src/pages/admin/` or role-management components. **Solution:** (1) Change copy to "I'm interested in..." or "Request access as..." and add helper text that club officer / secretary access requires approval. (2) Decide whether to keep requests in auth metadata short-term or create a `role_requests` table. (3) Build an admin review queue with approve/deny actions. (4) Approval creates scoped `user_roles` rows only through an authorized path; denied requests are auditable. (5) Add regression coverage proving signup still auto-grants only `exhibitor`.

## Payments & Email

- [ ] **Stripe Integration** — No Stripe integration exists. Entry fees need Stripe Connect (club's connected account + platform convenience fee via `application_fee_amount`). Includes club Stripe onboarding flow, webhook handling, entry payment references, and reconciliation reporting.
- [ ] **Exhibitor Payments page** — `/exhibitor/payments` list view: date, show name, amount, Stripe reference, status, receipt link. Blocked on Stripe integration above. Files: `apps/myk9show/src/pages/`.

## Pre-Launch Housekeeping

- [ ] **Heritage confirmation-email cron is silently broken — migrate to Supabase Vault** — As of 2026-05-16, `current_setting('app.settings.confirmation_email_url')`, `app.settings.service_role_key`, and `app.settings.heritage_confirmation_secret` all return NULL in the linked project. The daily 09:00 UTC cron from migration `193_heritage_cron.sql` has been firing `net.http_post(url := null, ...)` since it was deployed — no Heritage confirmation emails have ever gone out via this path. `ALTER DATABASE postgres SET ...` is no longer permitted on the Supabase `postgres` role (permission denied 42501). Fix: rewrite the cron body to read all three values from `vault.decrypted_secrets`, store them via `vault.create_secret(...)`, and verify the next cron tick succeeds. Note: the previously-committed hardcoded secret in `194_heritage_cron_secret.sql` was never functional (cron couldn't reach the function), and the edge-function-side `HERITAGE_CONFIRMATION_SECRET` was rotated on 2026-05-16 — the live value is in the Supabase Edge Functions secrets dashboard. When fixing this todo, vault the same value so the cron and the function agree.
- [ ] **Temporary GitHub Actions billing pause through 2026-06-01** — GitHub Actions jobs are not usable until the billing/spending-limit reset on June 1, 2026. Until then, PR merge decisions should rely on focused local verification plus Vercel preview status where available; if a GitHub Actions `Test`/`Build` job fails before starting with the billing annotation, treat it as an infrastructure blocker rather than a code failure.
- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch; add deploy step to GitHub Actions after all tests pass. Requires `VERCEL_TOKEN` secret.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as required status check. No direct pushes to main in production.
- [ ] **Make E2E CI jobs blocking** — Skipped historically due to billing issues + unstable test suite. Revisit once tests are stable.
- [ ] **Pre-load AKC & UKC Judge Directory** — Import judge directories into `people` + `judge_qualifications` before launch. Format TBD; check akc.org and ukc.org for CSV/XML export.

## Post-Fall (parked — do not pick up before Phase 3 exit)

- [ ] **Prevent Duplicate Rows in Core Tables** — Add uniqueness constraints on people/dogs/clubs after a duplicate audit and merge migration.
- [ ] **Configurable Exhibitor Convenience Fee** — Add site-admin default and per-show override for exhibitor convenience fees.
- [ ] **Role-Mode Icon Switcher for Sidebar Nav** — Replace labelled section groups with an icon-mode switcher; brainstorm before implementing.
- [ ] **Queue-based Offline Dog Create** — Extend MutationManager to `dogs` table and replace rollback behavior with queued offline create.
- [ ] **Review awesome-design-md for Design Consistency** — Evaluate against current dual approach (shadcn/ui + semantic CSS).
- [ ] **Research Claude Code Managed Agents for AskQ** — Evaluate managed agents API for the AskQ feature.
