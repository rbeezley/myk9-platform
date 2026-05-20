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

Cross-cutting principle that informs every other todo in this section. Secretaries — especially newer ones — often do not know what to do next. Other software fails them by being a passive tool palette. We should make the system _opinionated about the next action_ while never blocking the secretary from doing something else. **Not a wizard** (wizards are modal and linear; show day is parallel and interrupt-driven). Instead: the system always has an advisory recommendation, surfaced as a non-modal card, that the secretary can act on, dismiss, or ignore.

- [ ] **Guided next-action surfaces (cross-cutting)** — Four pieces that compose, not a single feature:
  - [x] **"Next Best Action" card** at the top of the show workbench. Shipped 2026-05-17 via [PR #225](https://github.com/rbeezley/myk9-platform/pull/225): the Today Show Map now surfaces a promoted, dismissible guidance card sourced from the shared ranked-action contract and rotates to the next recommendation after dismissal.
  - [x] **Phase checklists** on Setup / Today / Wrap-up tabs. Shipped 2026-05-17 via [PR #227](https://github.com/rbeezley/myk9-platform/pull/227): each phase has canonical auto-complete predicates where data exists, local manual done/skip state, and glanceable progress.
  - [x] **Contextual one-liner on every screen** — Shipped 2026-05-17 via [PR #229](https://github.com/rbeezley/myk9-platform/pull/229): Setup, Today, and Wrap-up now show a dismissible "About this phase" strip scoped by show + phase. New secretaries lean on it; experienced ones can dismiss it locally.
  - [x] **Searchable "What do I do if…" AskQ entry points** — Shipped 2026-05-17 via [PR #230](https://github.com/rbeezley/myk9-platform/pull/230): reuses the existing AskQ slide-out help surface for the unpredictable input flow, adds secretary show-day prompts, and opens AskQ with a prefilled prompt plus show context instead of creating a second help panel.

### Information architecture

- [x] **Show-centric IA consolidation (Option A)** — Shipped 2026-05-17 via [PR #223](https://github.com/rbeezley/myk9-platform/pull/223). `/secretary/shows/:id` is now the staff workbench with **Setup / Today / Wrap-up** phases; legacy day-of, check-in, run-order, volunteer, and volunteer-scheduling routes redirect into the workbench or fall back calmly to the dashboard. Setup owns the redistributed setup panels, Today owns MyK9Q access + Show Map, Wrap-up links to results/report/submission surfaces, and the unrouted `PipelineDashboard` was removed. Phase C implementation plan: [`docs/plan-phase-c-tree-guided-ux.md`](docs/plan-phase-c-tree-guided-ux.md).

  **Anchor view: extend the existing show-map tree** (`apps/myk9show/src/features/show-map/ShowMapTab.tsx`) rather than designing a new workbench from scratch. The tree already provides: hierarchy (show → trial → class → entry), per-node status, per-class progress, and an attention count that aggregates up. The mode tabs (Setup / Today / Wrap-up) become _decorations on the same tree plus a flat queue on Today_ — they change the default filter, the row actions, and which auxiliary strips/views are shown. The tree is the orientation layer ("where is X?"), not the whole command center; for urgency ("what now?") the Today tab adds a flat priority queue rendering above the tree, both consuming the same priority function. Pages folded into row actions / sub-views: most of `DayOfOperationsPage` (Check-In / Move-Ups / Pulled / Day-of Entries), `VolunteerSchedulingPage` (into Setup tab), `RunOrderPage` personnel tab (into Setup tab). Pages kept as drill-in destinations: show edit, class edit, entry edit, `PaperScoresheetPage`, run-order detail editor.

  **Deprecation mechanics (per page, explicit):** `/secretary/dashboard` → keep as multi-show overview only (the show picker when more than one active show); auto-route to the active show's workbench when there is exactly one. `/secretary/day-of` → 301-redirect to the workbench's Today tab. `/secretary/run-order` → 301-redirect to the workbench's Setup tab, anchored to the run-order section. `/secretary/volunteer-scheduling` → 301-redirect to the workbench's Setup tab, anchored to the personnel section. The `PipelineDashboard` component (already unrouted per the explore) → delete after its callers are migrated. **No bare delete-without-redirect on previously-routed pages** — redirects preserve email/Slack/bookmark links. Capture the redirect map in the consolidation PR description.

- [ ] **Show-map tree extensions for show-day use** — Discrete enhancements to `ShowMapTab` so it can serve as the spine of the Today and Wrap-up tabs. Each sub-item is independently shippable.
  - [x] **Time scoping + "Completed" tab** — Shipped 2026-05-17 via [PR #225](https://github.com/rbeezley/myk9-platform/pull/225): the tree now supports **Today / Tomorrow / All** day scope using `trial.trialDate` + `trial.timezone`, defaults the Today tab to active Today rows, dims non-today rows in All scope, and keeps completed work reachable in a separate Completed view.
  - [x] **"Running Now" pinned strip above the tree** — Shipped 2026-05-17 via [PR #225](https://github.com/rbeezley/myk9-platform/pull/225): active classes render in a compact strip with class, judge, ring, progress, and click-to-focus behavior.
  - [ ] **Inline row actions — three-dot + right-click + keyboard, with smart "Recommended" section** — Single `<RowActionsMenu>` component invoked by three triggers: visible three-dot icon, native `contextmenu` right-click, and `Enter`/`Space` on a focused row. All three open the same menu instance — guard against divergence in code review. Per-node-type action mix: entry rows get Scratch, Move Up, Mark Checked-In, Message Handler; class rows get Open Scoring, Print Check-In Sheet, Mark Class Started/Complete; trial rows get Open Schedule, Print Trial Reports.

    **Smart menu refinement:** every menu opens with a **Recommended** section at the top (max 2 items, separated by a divider from the full action list), each with a leading icon and a brief _why_ line in muted text (e.g., "Class starts in 20 min", "Scores entered but not finalized"). The full action list still appears below the divider in a stable order — no layout shift if no recommendation applies; the Recommended section is simply omitted. The recommendation is NOT the default keyboard target (deliberate Enter required to execute, to protect against destructive misclicks like Scratch). Recommendations must be deterministic within a render frame — no flicker.

    **Shared priority function constraint:** the Recommended section, the "Next Best Action" card, and the tree's Attention filter all derive from a single pure function (e.g., `getRankedActions(node | 'root', state)` in `features/show-map/`). Three callers, one function — scope is the only argument that varies. Do not let any caller embed its own priority logic; that is how the three surfaces would silently diverge.

  - [x] **Action dialogs (v1) — defer detail pane to v2** — Shipped across PR #219, PR #220, and PR #221: scratch/no-show, move-up, and message-handler actions now open focused Dialog surfaces with the needed input. Detail-pane reconsideration remains deferred until after one real show-day walk-through.
  - [x] **Wrap-up status taxonomy** — Shipped 2026-05-18 via [PR #231](https://github.com/rbeezley/myk9-platform/pull/231): class/trial nodes now derive judge signature state from signed scoring rows and registry submission state from `result_submissions`, the Wrap-up phase opens the tree in completed/all-dates mode, and wrap-up recommendations route through the shared ranked-action contract. The Attention-only filter lens portion shipped 2026-05-16: the toolbar chip now routes through `getAttentionActions(scope, state)`, preserving submitted-entry leaves and conflict rows from the shared ranked-action contract.
  - [x] **Today-tab flat priority queue rendering** — Shipped 2026-05-17 in [PR #223](https://github.com/rbeezley/myk9-platform/pull/223) by placing the existing `ShowMapTab` priority queue in the Today phase of the workbench. The queue still consumes `getRankedActions('root', { tree })`; Phase C promotes the companion Next Best Action card into a more first-class workbench guidance surface.
  - [x] **Per-row badge target spec (lock before sprawl)** — Shipped 2026-05-16 in `showMapActions.ts` via `showMapBadgeTargets`, with regression coverage in `showMapActions.test.ts`. Targets: **Trial row** — registry, date, ring/judge, status, reports-readiness. **Class row** — run-order position, checked-in count, scored count, pending-issues count. **Entry row** — armband, check-in status, move-up/scratch/absent status, score status. Today's `StatusCell` renders a subset (status + checkInStatus + attentionCount); the target spec is now code-owned so future contributors add only what's specified.
  - Dropped from the gap list: expand-all-entries-in-class. Confirmed real-world classes rarely exceed the 25-entry preview cap, so the current cap stays.

### Reports & submission

- [ ] **AKC/UKC PDF form-fill — replace HTML mockups** — `JudgesCertification.tsx`, `TrialSecretaryReport.tsx`, `TrialSecretaryCertification.tsx` are styled HTML tables with a "Generated by myK9Show" footer, not the actual AKC/UKC submission forms. Use `pdf-lib` to populate the official AcroForm-fillable PDFs from show/trial/entry/scoring data. **User is sourcing the actual AKC + UKC PDF templates.** Until then, surface the HTML versions clearly as on-screen previews, not as submittable artifacts.
- [x] **Verify ResultCatalog signature lines** — Confirm `apps/myk9show/src/components/reports/ResultCatalog.tsx` actually renders the judge signature + date lines required for the post-class signing step. If not, add them. _(Done — added per-class judge signature + date footer matching `JudgesCertification` / `TrialSecretaryCertification`, plus tests.)_
- [ ] **Print testing on venue hardware** — Real-world print test for `CheckInSheet`, `ScoresheetReport`, `ResultLabels`, `ArmbandLabelsReport` on representative venue setups (label printer + standard laser). Capture any margin/scaling/duplex issues.

### Day-of operational gaps

- [x] **Per-judge supply checklist** — Shipped 2026-05-16 via [PR #218](https://github.com/rbeezley/myk9-platform/pull/218). Plan: [`docs/plan-judge-supply-checklist.md`](docs/plan-judge-supply-checklist.md). 5 phases delivered: migration `20260516170000_create_trial_judge_supplies.sql` + RLS + partial unique indexes, `apps/myk9show/src/features/judge-supplies/` (templates + service + hook + section + dialog with @dnd-kit reorder), `apps/myk9show/src/components/reports/JudgeSupplyChecklistReport.tsx` (show-scope, single-query N+1-guard), `?report=` deep link on the Reports page, and a "Print Supplies" button on the run-order page header. 38 new tests.
- [x] **Mass-broadcast + canned replies to exhibitors** — Push-notification broadcast to a whole show ("lunch ready", "ring 2 paused 15 min") plus one-tap canned-reply templates inside the message thread UI. Show Map one-handler canned replies shipped in PR #221; PR #243 added Today quick-broadcast canned show announcements; PR #244 added canned class messages through the existing targeted-message lane; PR #246 added opt-in push alerts for show-wide quick broadcasts and schedule-delay announcements. Plan: [`docs/plan-phase-d-quick-broadcast.md`](docs/plan-phase-d-quick-broadcast.md).
- [x] ~~**Verify run-order reorder propagation to myK9Q** — Confirm `RunOrderPage` changes flow through the replication layer to ringside in real time. Fix if stale. Show-day reorders must be instant.~~ Fixed: q-side was sorting by `class_order` (a legacy `view_class_summary` alias) instead of the canonical `classes.display_order` written by the show side, so reorders never reached ringside. See `docs/plan-run-order-propagation.md`.
- [x] **Undo last move-up** — Shipped 2026-05-17 in PR #220: Show Map move-ups now surface an undo affordance after the move is saved, restoring the original entry and soft-deleting the generated move-up entry.
- [x] **Late-entry / day-of additions workflow** — Walk-in handling: secretary path to add a new exhibitor + dog + entry + payment at the desk on show day. Phase D plan: [`docs/plan-phase-d-late-entry-workflow.md`](docs/plan-phase-d-late-entry-workflow.md). Shipped across PR #232 through PR #235: the Today workbench now opens the late-entry dialog, supports new exhibitor/dog creation, captures desk payment method, shows Wrap-up totals, and has a maintained show-day regression walk.
- [x] **Scratches / no-shows flow** — Shipped 2026-05-17 in PR #219: Show Map can mark scratch/no-show entries pulled, and myK9Q normalizes scratched/withdrawn/absent statuses to pulled for ringside.
- [x] **Refunds for scratches** — Shipped 2026-05-17 in PR #219 as an explicit manual-refund boundary in the scratch/no-show dialog. Stripe refunds remain out of scope until a dedicated refund lane.
- [x] **Incident logging** — Bite / complaint / DQ record with AKC-friendly schema. Permanent, attached to trial + exhibitor + dog + judge. Needed for downstream AKC reporting. PR #247 added the staff-only `show_incidents` table and Today workbench incident log; the follow-up closeout slice adds Wrap-up totals for all/reportable/urgent incidents. Plan: [`docs/plan-phase-d-incident-logging.md`](docs/plan-phase-d-incident-logging.md).
- [x] **Schedule-slip communication** — When a ring runs 30+ min behind, auto-emit an exhibitor notification + PA-script generator the secretary can read at the desk. PR #239 added the Today PA-script generator; PR #242 posts self-expiring generated copy to the existing show-announcement broadcast lane with undo; PR #246 added opt-in push alerts for time-sensitive delay updates. Plan: [`docs/plan-phase-d-schedule-slip-communication.md`](docs/plan-phase-d-schedule-slip-communication.md).
- [x] **Hospitality tracking** — Judge lunch order capture, water/coffee reminders. Current slice adds a Today workbench card with per-show local persistence for judge lunch orders, notes, water, coffee, and lunch delivered reminders. Plan: [`docs/plan-phase-d-hospitality-tracking.md`](docs/plan-phase-d-hospitality-tracking.md).
- [x] **End-of-day reconciliation** — Totals view: entries, no-shows, refunds, fees collected. Natural landing screen for the Wrap-up tab. Shipped across PR #234, PR #236, and PR #238: Wrap-up now shows total entries, day-of additions, collected/waived desk fees, pulled/no-show totals, manual refund review, and already-refunded totals. Plan: [`docs/plan-phase-d-show-day-reconciliation.md`](docs/plan-phase-d-show-day-reconciliation.md).

### Live-walk findings (2026-05-16, Heritage fixture, Chromium headless 1440×900)

Concrete observations from driving the secretary path against the Heritage fixture. Screenshots saved under `/tmp/secwalk/`. Each item below is a discrete bug or gap not already captured above.

- [x] **PREREQ: Add `data-node-id` + `data-node-type` attributes to show-map rows** — Shipped via [PR #197](https://github.com/rbeezley/myk9-platform/pull/197), merged 2026-05-16. Outer row `<div>` for trial/class/entry/more nodes now carries `data-node-id={node.id}` and `data-node-type={node.type}`; ARIA tree roles + `aria-expanded` + `aria-level` landed alongside; the show-summary tile carries `data-node-id="show:<id>"` for show-scope queries.
- [x] **Unify attention computation across dashboard + show-map** — Shipped via [PR #203](https://github.com/rbeezley/myk9-platform/pull/203), merged 2026-05-16. New `apps/myk9show/src/features/show-map/attention.ts` is the single source of truth (`getEntryAttention` + `countAttention`); both surfaces route through it; a divergence-prevention unit test (`attention-consistency.test.ts`) guards against future drift. Live-verified against staging by [PR #204](https://github.com/rbeezley/myk9-platform/pull/204)'s probe — Heritage show now shows 81 on both surfaces (was 81 vs 0).
- [x] **Entry count inconsistency: tabs say "Entries 80", Show Map tile says "81 Entries"** — Fixed in `claude/entry-count-divergence`. Root cause was source divergence: the Show Map tile counted the show roster from `useEntriesByShowQuery`, while the Show Details tab badge counted `useMyEntries()`. Added `countCatalogEntries()` and routed both staff-facing surfaces through it; staging Heritage check returned 81 non-deleted submitted rows.
- [x] **CLS performance: 0.59 on `/secretary/dashboard`, 0.75 on `/shows/:id`** — Cumulative Layout Shift > 0.25 is "poor" by web-vitals standards. The pages visibly reflow during load. Cause is likely deferred panel content (Tasks, Show Officials cards) pushing earlier content down. Bad on tablet and flaky venue Wi-Fi where load is slow and the shift window is long. Investigate via Lighthouse, set explicit min-heights on suspending panels. _Fixed: explicit loading skeletons with `min-height` reservations on `ShowOfficials`, `MoreFromClub`, `TasksTab`, and `MessagesTab` (PR "perf(shows): reserve layout space for deferred panels (CLS)")._
- [x] **Show Map default expansion creates a wall of empty rows** — Fixed by collapsing class rows by default in `apps/myk9show/src/features/show-map/showMapTree.ts` (`getDefaultExpandedNodeIds` now returns root only). Trial rows still render, but their class children stay hidden until the secretary opens a specific trial. The "Expand trials" toolbar button (via new `getTrialsExpandedNodeIds`) still expands every trial on demand. Today-only auto-expand is deferred to the trial-date time-scoping todo.
- [x] **"Score Class" buttons render on rows that are weeks away from being scored** — Fixed 2026-05-16. Class primary actions now come from the shared `getPrimaryActionForNode()` contract: active classes get "Score Class"; not-started classes get "Print Check-In Sheet" instead of the scoring CTA. The row action menu and inline primary button now consume the same ranked action source.
- [x] **Overview tab redistribution plan** — Plan doc landed at [`docs/plan-overview-tab-redistribution.md`](docs/plan-overview-tab-redistribution.md). Reconciles the OPEN-TODOS "8 panels" inventory against the real ~10 panels across hero / top-row / Overview tab, maps each to Setup / Today / Wrap-up / deprecated, calls out the two cross-cutting cases (ScheduleSummary, QuickInfoCards) and three deprecations (ShareEvent, MoreFromClub, conditional premium cards). Input for the eventual show-centric IA consolidation PR.
- [x] **Rename "Show List" UI label back to "Show Map"** — Shipped in this PR. Five sites updated: tab label in `ShowDetailsPage.tsx`, section heading and not-staff error message in `ShowMapTab.tsx`, three test assertions in `ShowMapTab.test.tsx`. Code vocabulary (`ShowMapTab`, `showMapTree`, `ShowMapStructureTable`, `showMapTypes`) now matches the user-visible label.
- [x] **Resolved: `apps/myk9show/secretary-walk.mjs` productionized** — Originally flagged as a throwaway to delete. The version shipped in [PR #204](https://github.com/rbeezley/myk9-platform/pull/204) is a maintained regression probe with a documented exit-code contract and configurable env (BASE_URL, SHOW_ID, HEADED). It asserts dashboard ↔ show-map attention-count parity end-to-end and was used to verify the Heritage 81-vs-0 fix on staging before [PR #203](https://github.com/rbeezley/myk9-platform/pull/203) merged. Keeping it as a deliberate part of the app, not a throwaway. Do not delete.

### Memory hygiene

- [x] **Update memory: Phase 2 reports shipped** — Closed on 2026-05-16. The memory file `~/.claude/projects/.../memory/project_report_generation.md` was already updated to "Phase 1 + all 7 Phase 2 HTML reports shipped" with the verified-2026-05-16 component list (`ResultCatalog`, `JudgesCertification`, `TrialSecretaryReport`, `TrialSecretaryCertification`, `CheckInSheet`, `ScoresheetReport`, `ResultLabels`) all present under `apps/myk9show/src/components/reports/`. Remaining gap is the AKC/UKC PDF form-fill (tracked separately above).

---

## Premium Style Completion — 2026-05-15

Heritage and Headline shipped end-to-end. Monogram closed out via PR #187 (merged 2026-05-15). Banner closed out via PR #188 (merged 2026-05-15). Magazine + Poster + Gazette + Field Guide remain — each currently routes Heritage emails as a fallback, has shipped premium-list PDF cover/body, but has no dedicated landing/wizard/entry-blank PDF.

- [x] **Monogram — landing + wizard + entry-blank PDF** — Shipped via [PR #187](https://github.com/rbeezley/myk9-platform/pull/187), merged 2026-05-15.
- [x] **Banner — full pipeline** — Shipped via [PR #188](https://github.com/rbeezley/myk9-platform/pull/188), merged 2026-05-15. All four artifacts plus the `shows.brand_color` migration bundled in one PR per the no-deferred-followups rule. Migration dry-run on 2026-05-16 reported the remote database up to date. Plan: [`docs/plan-banner-style.md`](docs/plan-banner-style.md).
- [x] **Magazine / Poster / Gazette / Field Guide — full pipelines** — Closed/verified on 2026-05-16. All four styles shipped end-to-end: dedicated landing pages, wizard entry-received pages, entry-blank PDF documents + buttons, style-specific components (covers, mastheads, drop caps, etc.), premium-list PDF covers + bodies, dedicated confirmation-email builders, and tests for each. Dispatch lives in `apps/myk9show/src/features/_shared/styledLandingRegistry.ts` and `apps/myk9show/src/features/_shared/styledReceiptRegistry.tsx`, both keyed off `getShowLandingStyle(show)`. Email registry routes each style to its own builder (`magazine-email.ts`, `poster-email.ts`, `gazette-email.ts`, `fieldGuide-email.ts`) — not Heritage fallback. Plan docs already on disk: `docs/plan-magazine-style.md`, `docs/plan-poster-style.md`, `docs/plan-gazette-style.md`, `docs/plan-fieldguide-style.md`.

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
- [x] **Temporary GitHub Actions billing pause through 2026-06-01** — Closed 2026-05-16. GitHub Actions jobs are not usable until the billing/spending-limit reset on June 1, 2026. Until then, PR merge decisions should rely on focused local verification plus Vercel preview status where available; if a GitHub Actions `Test`/`Build` job fails before starting with the billing annotation, treat it as an infrastructure blocker rather than a code failure.
- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch; add deploy step to GitHub Actions after all tests pass. Requires `VERCEL_TOKEN` secret.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as required status check. No direct pushes to main in production.
- [ ] **Make E2E CI jobs blocking** — Skipped historically due to billing issues + unstable test suite. Revisit once tests are stable.
- [ ] **Pre-load AKC & UKC Judge Directory** — Import judge directories into `people` + `judge_qualifications` before launch. Format TBD; check akc.org and ukc.org for CSV/XML export.
- [ ] **Regenerate `src/types/supabase.ts` to remove `db as any` casts** — Several services (`pipeline/services/checklistService.ts`, `judge-supplies/trialJudgeSuppliesService.ts`, and likely others) carry an `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `const db = supabase as any` workaround for tables not present in the generated `Database` type. Run `npx supabase gen types typescript --project-id sojmvhhwsjxmfistvzbe --schema public > apps/myk9show/src/types/supabase.ts`, then drop the `db as any` cast in every service that uses it. Grep `db = supabase as any` to find all callers in one pass. Worth doing before each launch so the cast doesn't metastasize.

## Post-Fall (parked — do not pick up before Phase 3 exit)

- [ ] **myK9Q access codes are deterministically derived from the show UUID** — Deferred from "Security / cosmetic" on 2026-05-16. **Original analysis:** The success screen at the end of show creation displays four codes: Admin / Judge / Steward / Exhibitor. Inspecting Heritage's: show UUID `3b91e282-6e45-4a89-9446-f6ebeb0bf62c` produced codes `a6e45 / j4a89 / s9446 / ef6eb`. Each is `<role-letter> + 4 chars from the corresponding UUID segment` (see `packages/core/src/utils/passcodes.ts`). The show UUID is in every public show URL and `shows_select FOR SELECT USING (true)` lets anonymous users read it directly, so anyone with a show URL can compute all four codes. **Deferral rationale:** Pre-launch with no real users, niche dog-show domain with a small realistic attacker pool, server-side `validate-passcode` Edge Function with rate limiting already in place, and existing prod shows use the legacy `myK9Q1-...` license-key format with ~32 hex chars of entropy that is not affected. Real fix requires schema migration for per-role secrets + rotation flow + migration of legacy-format shows + `MyK9QAccessCard` and `validate-passcode` updates + tests — roughly one full session. Revisit after Phase 3 / real-user testing, or sooner if a real incident makes it concrete. **Fix sketch when picked up:** add per-role random secret columns to `shows` (e.g., `admin_passcode`, `judge_passcode`, `steward_passcode`, `exhibitor_passcode`), generate at show creation, fall through to UUID derivation for legacy rows during a migration window, then drop the derivation path entirely.
- [ ] **Prevent Duplicate Rows in Core Tables** — Add uniqueness constraints on people/dogs/clubs after a duplicate audit and merge migration.
- [ ] **Configurable Exhibitor Convenience Fee** — Add site-admin default and per-show override for exhibitor convenience fees.
- [ ] **Role-Mode Icon Switcher for Sidebar Nav** — Replace labelled section groups with an icon-mode switcher; brainstorm before implementing.
- [ ] **Queue-based Offline Dog Create** — Extend MutationManager to `dogs` table and replace rollback behavior with queued offline create.
- [ ] **Review awesome-design-md for Design Consistency** — Evaluate against current dual approach (shadcn/ui + semantic CSS).
- [ ] **Research Claude Code Managed Agents for AskQ** — Evaluate managed agents API for the AskQ feature.
