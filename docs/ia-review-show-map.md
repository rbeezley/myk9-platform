# IA Review: Show Map

**Date:** 2026-05-21
**Auditor:** Claude
**Sources:** Route audit (`apps/myk9show/src/routes/`), codebase scan (`apps/myk9show/src/features/show-map/`), recent commit history (PRs #277–#288), architectural commitments (`docs/plan-show-day-sequencing.md`, `docs/plan-show-map-node-attrs-and-attention.md`)
**Scope:** The `show-map` feature surface and the capabilities added during the row-actions / rewalk-gap workstream (commits between #277 "phase f row actions plan" and #288 "close phase 2 rewalk gaps").

## What's in scope

The show-map feature is mounted in three places:

1. **Public ShowDetails** — `/shows/:id?tab=map` via `apps/myk9show/src/pages/ShowDetailsPage.tsx`, gated by `canShowMap = features.showMap && canManageShow`.
2. **Secretary Workbench → Today tab** — `/secretary/shows/:showId?phase=today` via `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`, configured with `initialDayScope="today"`.
3. **Secretary Workbench → Wrap-up tab** — `/secretary/shows/:showId?phase=wrap-up` via `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`, configured with `initialDayScope="all"`, `initialCompletionScope="completed"`, `actionPhase="wrap-up"`.

All three mounts use the same `ShowMapTab` component from `apps/myk9show/src/features/show-map/ShowMapTab.tsx` and reach into a shared 21-file feature module (≈4,000 LOC) covering:

- Tree builders (`showMapTree.ts`, `showMapTreeNavigation.ts`)
- Action ranking (`showMapActions.ts` — the shared `getRankedActions()` priority function)
- Action execution + mutations (`showMapActionExecution.ts`, `showMapActionMutations.ts`, `useShowMapActionExecutor.ts`)
- Attention classification (`attention.ts` — also imported by `SecretaryDashboardPage`)
- Three dialogs (move-up, scratch/no-show, message-handler)
- Toolbar, running-now strip, structure table, guidance card

The recent workstream (PRs #277–#288) added: row-action menu (three-dot + right-click + keyboard), roving tree focus, class status row actions, class completion action, and several rewalk gap fixes.

## Step 1: Route Audit

**Surface scope:** Show Map feature across all mount points.

| Route                                    | Purpose                                                                           | Target user                                                               | Parent in IA                                           | Component                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `/shows/:id?tab=map`                     | Tree view + actions of a show's structure, gated by `canManageShow`               | Authenticated user with manage rights (currently overlaps with secretary) | Public ShowDetails                                     | `pages/ShowDetailsPage.tsx` → `features/show-map/ShowMapTab.tsx`                                                                |
| `/secretary/shows/:showId?phase=today`   | "Today" workbench phase — includes ShowMap below other Today widgets              | Secretary, day-of-show                                                    | Secretary Workbench (the architectural canonical home) | `pages/secretary/ShowWorkbenchPage.tsx` → `ShowMapTab` (`initialDayScope="today"`)                                              |
| `/secretary/shows/:showId?phase=wrap-up` | "Wrap-up" workbench phase — includes ShowMap scoped to completed work             | Secretary, post-show                                                      | Secretary Workbench                                    | `ShowWorkbenchPage.tsx` → `ShowMapTab` (`initialDayScope="all"`, `initialCompletionScope="completed"`, `actionPhase="wrap-up"`) |
| `/secretary/dashboard`                   | Cross-show dashboard; **reads from `attention.ts`** but does not mount ShowMapTab | Secretary, multi-show overview                                            | (top)                                                  | `pages/secretary/SecretaryDashboardPage/index.tsx`                                                                              |

**Orphan routes:** None. Every show-map render path has at least one entry link.

**Duplicate-purpose routes:** One concern — the **public `/shows/:id?tab=map`** mount and the **secretary `/secretary/shows/:showId?phase=today`** mount render the same row actions to a manager-permissioned user. Both can scratch, move-up, message the handler, etc. This is a candidate IA finding (see Step 4).

**Routes whose URL doesn't reflect their data hierarchy:**

- The Workbench `phase` is a query param, not a path segment (`?phase=today` vs `/secretary/shows/:showId/today`). Phase routing redirects exist (`SecretaryShowPhaseRedirect` in `secretaryRoutes.tsx`) but the canonical URL keeps phase as a query. Minor; intentional per workbench design.
- ShowMap's internal tree state (expanded nodes, focused row, filter, day/completion scope) is not URL-reflected — deep-linking to a specific class node inside ShowMap isn't possible. This is a separate concern from route IA but worth noting.

## Step 2: Task Flow Walk

I did **not** execute a live walk for this v1 audit — the audit is structural (routes + component composition) rather than behavioral. The skill notes Step 2 should use `qa-feature` or `playwright-cli`; an automated live-walk script is referenced for dashboard/show-map parity but does not yet drive every row-action dialog (per Phase A exit criterion in `plan-show-day-sequencing.md:51`). Recommendation: extend that script before treating Step 2 as complete.

That said, from code inspection the following representative tasks were modeled:

### Task: Secretary scratches an entry on show day

| Step             | Action                          | Route                              | Friction                                                                                       | Severity |
| ---------------- | ------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| 1                | Open Workbench for today's show | `/secretary/shows/:id?phase=today` | None (auto-routes if exactly one active show)                                                  | None     |
| 2                | Find the entry in the tree      | Same                               | Tree starts at default expansion (trials only); user must expand class to see entries          | Low      |
| 3                | Open row action menu            | Same                               | Three-dot + right-click + keyboard all work; only three-dot is visually advertised             | Med      |
| 4                | Choose "Scratch / No-show"      | Same                               | Opens `ShowMapScratchNoShowDialog` inline                                                      | None     |
| 5                | Confirm                         | Same                               | Mutation runs through `showMapActionMutations.ts`; running-now strip and priority queue update | None     |
| Context switches |                                 | 0                                  |                                                                                                |          |
| Verdict          |                                 | **Completable**                    |                                                                                                |          |

### Task: Manage-capable user lands on public `/shows/:id` and tries to scratch

| Step    | Action             | Route                                   | Friction                                            | Severity                                                    |
| ------- | ------------------ | --------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| 1       | Open `/shows/:id`  | Public ShowDetails                      | "Show Map" tab appears (gated by `canShowMap`)      | None                                                        |
| 2       | Click Show Map tab | `/shows/:id?tab=map`                    | Same component as secretary; same actions available | None for the task — but creates two homes for the same work |
| Verdict |                    | **Completable but with IA duplication** | See Step 4                                          | High                                                        |

### Task: Reviewer post-show looks at what completed

| Step    | Action                                                   | Route                                | Friction                                                                                                                          | Severity |
| ------- | -------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1       | Open Workbench → Wrap-up tab                             | `/secretary/shows/:id?phase=wrap-up` | Shows ShowMap with `initialCompletionScope="completed"`                                                                           | None     |
| 2       | Realize this is a different "view" of ShowMap than Today | Same                                 | No visible "you're seeing the wrap-up view" framing; the toolbar lets the user re-toggle scope, which can hide the Wrap-up intent | Med      |
| Verdict |                                                          | **Completable; mental-model muddle** |                                                                                                                                   | Med      |

### Task: User looks for "the show's venue map"

| Step    | Action                                          | Route                                 | Friction               | Severity |
| ------- | ----------------------------------------------- | ------------------------------------- | ---------------------- | -------- |
| 1       | Click "Show Map" tab expecting a spatial layout | `/shows/:id?tab=map`                  | Sees a tree, not a map | High     |
| Verdict |                                                 | **Mental-model mismatch on the name** |                        | High     |

## Step 3: Mental Model Check

**Method used:** Codebase inspection + product owner intuition substitute (the architectural commitments doc reflects the PO's mental model).

**Capabilities the feature offers (what users can DO):**

- Browse the show's structure (trials → classes → entries) as a tree
- See "running now" (in-flight classes) at a glance
- See a ranked queue of recommended actions
- Scratch an entry / mark no-show
- Move an entry to a different class (with undo)
- Message a handler about an entry
- Mark an entry checked-in
- Mark a class complete
- Navigate to deeper class/entry routes (`route-class-and-trial-actions`, per PR #279)
- Filter by day scope (today / all) and completion scope (active / completed)
- Drive everything by keyboard (PR #278, #283)

**User mental grouping (PO intuition):**

- **Group A — "What needs my attention right now?"** : priority queue, running-now strip, recommended actions, attention indicators
- **Group B — "Structural reference"** : the tree itself; "show me what's in this show"
- **Group C — "Per-row management"** : scratch, move-up, message-handler, mark-checked-in
- **Group D — "Wrap-up reconciliation"** : completed-scope view, results submission handoff

**Actual route grouping:**

- `/secretary/shows/:id?phase=today` surfaces A + B + C in one tab
- `/secretary/shows/:id?phase=wrap-up` surfaces D + B + C
- `/shows/:id?tab=map` surfaces B + C (and A when `canManageShow`)
- `/secretary/dashboard` surfaces A (via `attention.ts`) but doesn't mount the map itself

**Mismatches:**

| Capability                                                                   | User expects in                                      | Actually lives in                                                                                                                                         | Severity                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| "Spatial venue map" (literal interpretation of the name)                     | A view of the venue floorplan/rings                  | Tree of trials/classes/entries                                                                                                                            | High (naming)                                |
| Per-row scratch/move/message on a manage-capable user using the public route | `/secretary/...` only (per architectural commitment) | Also available at `/shows/:id?tab=map` when `canShowMap` is true                                                                                          | High (commitment violation)                  |
| "Today's priority queue"                                                     | Top of Today tab                                     | Inside ShowMapTab, which is itself well below other Today widgets (`AboutThisPhase`, `PhaseChecklist`, `ScheduleSlipScriptCard`, `IncidentLogCard`, etc.) | Med                                          |
| Per-class completion action                                                  | Class detail surface                                 | Inline in the tree (added in #287, then guarded in #287 follow-up)                                                                                        | Low (deliberate — row actions are the point) |

## Step 4: Duplication & Orphan Scan

**Task duplication:**

| Task                | Paths available                                                                                                                                                  | Recommended consolidation                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scratch an entry    | (a) `/shows/:id?tab=map` row action, (b) `/secretary/shows/:id?phase=today` row action, (c) `/secretary/entry-management` (TBD — verify), (d) entry detail pages | Pick `/secretary/shows/:id` as canonical per architectural commitment; consider removing the public-side map tab for `canManageShow` users OR explicitly framing the public map as "viewer mode" with manage actions disabled when the user is on the public route |
| Move-up an entry    | Same three: public map, secretary map, possibly EntryManagement                                                                                                  | Same                                                                                                                                                                                                                                                               |
| Mark class complete | Inline row action (added #287) + possibly elsewhere                                                                                                              | Confirm there isn't a second path; if a class-detail route also has this, consolidate                                                                                                                                                                              |
| View "running now"  | Workbench Today tab (via ShowMap running-now strip) + Secretary dashboard (via `attention.ts`)                                                                   | Both consume shared functions — this is consolidation, not duplication. No action needed.                                                                                                                                                                          |

**Orphan routes:** None identified. All three mount points are reachable via primary nav.

**Modal/inline duplications:**

- `ShowMapMoveUpDialog`, `ShowMapScratchNoShowDialog`, `ShowMapMessageHandlerDialog` are all modals invoked from the tree row actions. Each is a self-contained dialog. No duplicate "page" version exists — appropriate.
- However: `ShowMapTab.tsx` contains _both_ a flat **Priority Queue** rendering (≈4 visible actions) **and** a **tree structure table** with per-row actions. These two surfaces operate on overlapping action sets ranked by the same `getRankedActions()`. From the user's POV, the same scratch can be invoked from the Priority Queue (top of the tab) or from the row in the tree below. That's two homes for the same action _inside one tab_. Probably intentional ("queue is the recommendation, tree is the ground truth") but worth examining whether it confuses or helps.

**Inside-component density (not strictly IA but adjacent):**
`ShowMapTab.tsx` is 406 LOC and assembles:

1. Toolbar
2. Running-now strip
3. Guidance card
4. Move-up undo banner
5. Summary stats row
6. Priority queue
7. Tree structure table (`ShowMapStructureTable.tsx`, 486 LOC)
8. Three dialog modals

That's 8 distinct visual subsystems in one tab. Not an IA issue per se (it's one tab) but if any of these are duplicated elsewhere in the Today phase, that's where IA debt accumulates.

## Step 5: Severity Scoring

| Finding                                                                                                                                                                                                                  | Step | Frequency                          | Friction                                                                | Fix invasiveness                                                                             | Sum    | Priority                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ---------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| Manage-capable actions render on both public `/shows/:id?tab=map` AND secretary `/secretary/shows/:id` — partial violation of "all manage UI under `/secretary/shows/:id`" commitment                                    | 1, 4 | 3 (any manage user has both paths) | 4 (commits the user to picking; risk of action-from-wrong-context bugs) | 3 (gate `canShowMap` off when user has secretary access; or strip actions from public mount) | **10** | **High**                                          |
| ~~Name "Show Map" implies spatial layout but renders a tree~~ — **Reclassified 2026-05-21 as intentional.** "Map" is used in the sitemap sense (a structural map of the show hierarchy), confirmed by PO. Not a finding. | 3    | —                                  | —                                                                       | —                                                                                            | —      | **Intentional (not a finding)**                   |
| Three row-action access paths (three-dot, right-click, keyboard) without discoverable hint for right-click or keyboard                                                                                                   | 2    | 5                                  | 2                                                                       | 2                                                                                            | **9**  | **High**                                          |
| Inside one Today tab: Priority Queue + tree row actions both expose the same actions (two homes for the same scratch/move-up)                                                                                            | 4    | 4                                  | 2 (probably intentional cognitive layering)                             | 3 (only fix if user testing shows confusion)                                                 | **9**  | **High** (verify with user testing before acting) |
| Wrap-up tab renders the same ShowMap as Today with different scope props; no visible framing that this is "the post-show view"                                                                                           | 2    | 3                                  | 3                                                                       | 2 (add header/empty-state copy explaining the scope)                                         | **8**  | **High**                                          |
| Tree internal state (expansion, focused row, day/completion scope) isn't URL-reflected — no deep-linking                                                                                                                 | 1    | 2                                  | 3                                                                       | 4 (URL-state sync nontrivial)                                                                | **9**  | **High** (defer — fix invasiveness dominates)     |
| Phase routing uses query param `?phase=today` rather than path segment                                                                                                                                                   | 1    | 1 (intentional)                    | 1                                                                       | —                                                                                            | **3**  | Low (intentional)                                 |
| Class completion action is inline in tree — possibly also elsewhere — **verified 2026-05-22 and remediated via PR #293.**                                                                                                | 4    | —                                  | —                                                                       | —                                                                                            | —      | **Resolved**                                      |

**Top findings to fix in the next phase:**

1. Resolve the public-vs-secretary duplication of manage actions (#1 above)
2. ~~Rename "Show Map"~~ — reclassified as intentional (sitemap sense, per PO 2026-05-21)
3. Surface row-action access affordances (#3)
4. Add Wrap-up framing (#5)

**Documented but not fixed:**

- Two homes for the same action inside one tab (#4) — keep as-is until evidence of confusion
- Deep-linking via URL state (#6) — defer; nontrivial fix
- Phase-as-query-param (#7) — intentional
- Class completion duplication (#8) — verified and remediated in PR #293; see [`ia-4-class-completion-duplication-audit.md`](ia-4-class-completion-duplication-audit.md)

## Step 6: Phased Remediation Plan

**Plan doc:** [`docs/plan-ia-show-map.md`](plan-ia-show-map.md) (drafted 2026-05-21; IA-1 Option A approved and implemented 2026-05-22).

**Phase summary:**

| Phase                                                                      | Scope                                                                                                                                                                      | Entry trigger      | Exit criterion                                                                                                          | Estimated PRs |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------- |
| **IA-1: Resolve manage-action duplication**                                | Public Show Map is read-only for manage-capable users; operational row actions live only in the secretary workbench. Workbench and public routes cross-link intentionally. | Approved Option A  | Public route passes `canManageShow={false}` to Show Map; tests cover read-only public map and workbench link visibility | Done          |
| **IA-2: Wrap-up framing only**                                             | (Rename dropped — "Show Map" is intentionally a sitemap-style name per PO.) Add Wrap-up tab framing copy so users know this view is scoped to completed work.              | Approval           | Wrap-up renders an explanatory header / kicker                                                                          | 1             |
| **IA-3: Row-action discoverability**                                       | Add a small "Tip" line or kbd legend in the toolbar advertising right-click + keyboard shortcuts (without crowding the UI). Validate with a fresh-contributor walk.        | Approval           | Toolbar legend ships; legend can be dismissed/persisted                                                                 | 1             |
| **IA-4: URL-reflected state + class-completion duplication check**         | URL-state sync remains deferred until user demand appears; class-completion duplication was verified and remediated.                                                       | Complete           | Class Details duplicate removed; URL-state deferral documented                                                          | Done          |

**Why this order:**

- IA-1 is the biggest mental-model risk (action-from-wrong-context bugs); also the highest-priority architectural-commitment violation.
- IA-2 reads as cosmetic but pays back the largest first-impression mismatch; cheap to ship.
- IA-3 is a UX patch on already-shipped behavior — small, low-risk.
- IA-4 verification found a real Class Details lifecycle duplicate, which PR #293 remediated. URL-state sync remains deferred until evidence warrants the work.

---

## Summary

**Overall IA health:** **Closed for the shipped scope** — the show-map feature is internally coherent (one shared component, one shared priority function, one shared attention function), IA-1 makes the public Show Map read-only for staff preview, IA-2 surfaces row-action shortcuts, IA-3 frames the Wrap-up scope, and IA-4 removed the confirmed Class Details completion duplicate. URL-state/deep-linking remains a deferred enhancement until users ask for it.

**Top 3 findings (after PO reclassification 2026-05-21):**

1. **Resolved in IA-1:** Manage actions no longer duplicate across public `/shows/:id?tab=map` and secretary `/secretary/shows/:id`; the public map is read-only and staff get a `Manage in Workbench` link.
2. **Three row-action access paths exist; only one (three-dot menu) is discoverable** — High. Recently shipped via PRs #278 (keyboard) and #284 (row actions menu) without a discoverability companion.
3. **Resolved in IA-3:** Wrap-up Show Map now explains the completed/full-show default before users reach the toolbar and tree.

_(Original finding #2 — "Show Map" name implies spatial layout — withdrawn. "Map" is intentionally used in the sitemap sense per PO.)_

**Recommended next phase:** **Phase 3 real-user testing** — URL-state/deep-linking remains deferred unless users ask for it; no additional IA remediation is required before the next observed show-day walk.

**Remaining estimated remediation effort:** None for the shipped Show Map scope. URL-state sync remains deferred pending evidence.

---

## v1 audit caveats

- Step 2 was **not** executed as a live walk; it was modeled from code. Re-running Step 2 with `qa-feature` against the live app may surface friction not visible from code inspection.
- The mental-model elicitation in Step 3 substitutes product-owner intuition (via architectural commitments) for real user research. A fresh-contributor walk would strengthen findings #2 and #3.
- "Class completion duplication" (finding #8) was verified and remediated on 2026-05-22; the evidence trail lives in [`ia-4-class-completion-duplication-audit.md`](ia-4-class-completion-duplication-audit.md).

## 2026-05-22 Impeccable follow-up

The later `$impeccable critique` pass added one Today-workbench finding that is adjacent to, but separate from, this route IA audit: Show Map is the operational spine, but the Today tab placed multiple secondary desk tools before it. The remediation is tracked in [`docs/plan-ia-show-map.md`](plan-ia-show-map.md#2026-05-22-impeccable-p1-p3-polish-addendum).

This follow-up also addresses the row-action discoverability finding with an in-toolbar shortcuts popover. IA-1 later resolved the public-vs-secretary route duplication by making the public Show Map read-only for staff preview.

## 2026-05-22 IA-4 closeout

The IA-4 verification pass found a confirmed duplicate: Class Details still exposed direct `Mark In Progress` / `Mark Completed` lifecycle commands while Show Map owned the guarded, offline-first class status row actions. PR #293 removed those duplicate Class Details commands, added an `Open in Workbench` route for secretaries/admins, and added focused coverage for the consolidated menu behavior.

Final closeout validation passed on 2026-05-22:

- `pnpm exec vitest run src/features/show-map/__tests__/ShowMapTab.test.tsx src/test/pages/secretary/ShowWorkbenchPage.test.tsx src/pages/ClassDetailsPage/ClassDetailsPage.actions.test.tsx`
- `pnpm test:e2e:clean src/test/e2e/entities/phase2ShowDayRewalk.spec.ts --project=chromium --workers=1 --timeout=90000 --retries=0`
- PR #293 CI run `26308644892`: Quality Checks, Test, and Build all passed.
