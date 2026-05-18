# Plan — Show-Day Workflow Sequencing

**Date:** 2026-05-16
**Status:** Active sequencing roadmap. Current phase: Phase D — Day-of operational gaps.
**Scope:** Defines the order in which remaining items from the 2026-05-16 show-day brainstorm are picked up. This doc is the source of truth for _what's next_ when a PR lands; granular item tracking continues to live in `OPEN-TODOS.md`. Implementation details per phase land in their own dedicated plan docs as each phase begins.

## How to use this doc

- When finishing a PR, look at the **current phase** first for the next pickup.
- Do not pre-implement items from a later phase — phase boundaries exist because of dependencies.
- Each phase has an **entry trigger** (what makes it ready to start) and an **exit criterion** (what makes it done). When the exit criterion is met, the next phase becomes the current phase.
- Phases can overlap at the seams; what's load-bearing is the _order of starts_, not strict serial execution.
- Phase E is the only fully-parallel track — it's unblocked by user input rather than upstream code.

## Architectural commitments these phases must respect

Carried forward from `docs/plan-show-map-node-attrs-and-attention.md` and the OPEN-TODOS brainstorm:

1. **Single shared priority function.** `getRankedActions(scope, state)` in `apps/myk9show/src/features/show-map/showMapActions.ts` is the only source of action ranking. Every new consumer (recommendation card, tree filter, row menu, queue rendering) routes through it. No caller embeds its own priority logic. Reviewers must reject parallel definitions.
2. **Single shared attention function.** `attention.ts` is the only source of "needs attention" classification, consumed by the dashboard strip _and_ the show-map tree. New surfaces use the same function.
3. **Show-centric mental model.** All UI for managing a single show should ultimately live under `/secretary/shows/:id`. Pre-consolidation work targets feature surfaces (`ShowMapTab`, `SecretaryDashboardPage`) without adding new top-level routes outside this scope.

---

## Phase A — Finish smart row actions

**Status:** Complete as of 2026-05-17.

**Entry trigger:** Met. Ranked-action contract (#215) and execution contract (#216) shipped; the four common action lanes have since landed.

**Scope:**

- Enable the three remaining priority-tier row actions: **move-up**, **scratch**, **message-handler** (currently `disabled` in `showMapActionExecution.ts`).
- Add **undo move-up** affordance (per the brainstorm's "pressure-driven mistakes are recoverable" requirement).
- Each action implements its dialog (move-up needs a target-class picker; scratch needs optional refund confirm; message-handler needs the template list).
- One live walk per action to verify the priority function recommends sensibly when multiple actions compete on the same row.

**OPEN-TODOS items covered:**

- "Inline row actions — three-dot + right-click + keyboard, with smart Recommended section" (continuation)
- "Action dialogs (v1) — defer detail pane to v2"
- "Undo last move-up"

**Exit criterion:** Met for the entry-action row set:

- `mark-checked-in` merged via PR #217.
- `scratch / no-show` merged via PR #219.
- `move-up` plus undo merged via PR #220.
- `message-handler` plus canned replies merged via PR #221.

Focused Show Map tests now exercise the shared action registry, row menu, dialogs, executor paths, and the rendered `ShowMapTab` integration for these lanes. A browser live-walk script exists for dashboard/show-map count parity, but it does not yet drive every row-action dialog; extend that script before treating automated live-walk coverage as complete.

**Why this phase first:** The ranked-action contract has no consumers yet beyond `mark-checked-in`. Until 3+ actions are enabled, the priority function's ordering is hypothetical. Shipping the rest closes the loop on the architectural commitment from #215/#216 and validates the contract under real load _before_ it gets cited as a foundation for Phase C work.

---

## Phase B — IA consolidation

**Status:** Complete as of 2026-05-17. Implementation specifics live in [`docs/plan-phase-b-ia-consolidation.md`](plan-phase-b-ia-consolidation.md).

**Entry trigger:** Met. Specifically: the row-action workstream is complete enough that migrating those surfaces into a new IA does not require simultaneous mid-flight changes to the actions themselves.

**Scope:**

- Build the `/secretary/shows/:id` workbench with **Setup / Today / Wrap-up** tabs.
- `/secretary` becomes a show picker that auto-routes when exactly one active show exists.
- Redistribute the 8 Overview-tab panels per the [`docs/plan-overview-tab-redistribution.md`](docs/plan-overview-tab-redistribution.md) plan from #210.
- 301-redirects per the deprecation mechanics already specified in `OPEN-TODOS.md`: `/secretary/day-of` → Today tab, `/secretary/run-order` → Setup tab, `/secretary/volunteer-scheduling` → Setup tab.
- Fold `PipelineDashboard` after its consumers migrate.
- The Today tab gets the flat priority queue rendering above the show-map tree (using the same `getRankedActions('root', state)` function).

**OPEN-TODOS items covered:**

- "Show-centric IA consolidation (Option A)"
- "Today-tab flat priority queue rendering"
- "Overview tab redistribution plan" (already-shipped plan doc executes here)

**Exit criterion:** Met for the initial workbench consolidation:

- `/secretary/shows/:showId` shipped via [PR #223](https://github.com/rbeezley/myk9-platform/pull/223).
- Setup / Today / Wrap-up phase tabs are live.
- Legacy day-of, check-in, run-order, volunteer, and volunteer-scheduling routes redirect into the workbench or calmly fall back to the dashboard.
- Setup owns the redistributed setup panels, Today owns MyK9Q access + Show Map, and Wrap-up links to results/report/submission surfaces.
- `PipelineDashboard` was removed after consumers migrated.

**Why this phase second:** Every feature shipping into the current IA accumulates retrofit cost. The longer Phase B waits, the larger the migration becomes. Doing it after Phase A — but _before_ Phase C tree extensions and guided-UX surfaces — means Phase C's new surfaces are built directly into the new IA, not retrofitted twice.

---

## Phase C — Tree extensions + guided UX (inside the new IA)

**Status:** Complete as of 2026-05-18. Implementation specifics live in [`docs/plan-phase-c-tree-guided-ux.md`](plan-phase-c-tree-guided-ux.md).

**Entry trigger:** Phase B exit criterion met. The workbench exists and is the default secretary entry point.

**Scope:**

- **Tree extensions:** time scoping (Today/Tomorrow/All) with myK9Q-style Completed view + dim treatment for non-today trials; Running Now pinned strip; wrap-up status taxonomy (signed-by-judge, submitted-to-AKC); Attention-only filter as task-tracker lens.
- **Guided-UX surfaces:** Next Best Action card promoted to a first-class workbench element (already shipped in v1 form per the audit — extend it here); phase checklists on Setup/Today/Wrap-up; contextual "About this page" strips; "What do I do if…" entry points into the existing AskQ help panel.

**OPEN-TODOS items covered:**

- "Time scoping + 'Completed' tab"
- "'Running Now' pinned strip above the tree"
- "Wrap-up status taxonomy + Attention-only filter lens"
- All four "Guided next-action surfaces" sub-items
- "Per-row badge target spec" extensions

**Exit criterion:** Met for the initial guided workbench:

- Time scoping, Completed view, Running Now, and workbench-grade Next Best Action shipped via PR #225.
- Phase checklists shipped via PR #227.
- Contextual about strips shipped via PR #229.
- AskQ "What do I do if..." entry points shipped via PR #230.
- Wrap-up status taxonomy shipped via PR #231.

**Why this phase third:** These surfaces depend on the workbench being the home. Building a Running Now strip inside `SecretaryDashboardPage` (the current home) means rebuilding it inside the workbench later. The contextual help and FAQ panel are similarly easier to author once their permanent home is known.

---

## Phase D — Day-of operational gaps

**Status:** Current phase. Initial late-entry plan lives in [`docs/plan-phase-d-late-entry-workflow.md`](plan-phase-d-late-entry-workflow.md).

**Entry trigger:** Phase C exit criterion met _or_ a specific operational gap becomes urgent before then (e.g., real users requesting incident logging). Phase D can also overlap with Phase C if items don't compete for the same UI surface.

**Scope:** Eight remaining items from the brainstorm's day-of gap list:

- Late entries / day-of additions workflow
- Scratches / no-shows flow
- Refunds for scratches
- Incident logging (bites / complaints / DQs)
- Schedule-slip communication (PA-script generator + push notifications)
- Hospitality tracking (judge lunch, water/coffee)
- End-of-day reconciliation totals (lands in Wrap-up tab)
- Per-judge supply checklist
- Mass-broadcast + canned replies to exhibitors

**OPEN-TODOS items covered:** the entire "Day-of operational gaps" subsection.

**Exit criterion:** Each item has shipped UI in the workbench _or_ has been explicitly de-scoped with a documented reason. Estimated 8-12 PRs.

**Why this phase fourth:** Each item is a discrete feature that lands as a row-action variant, a Setup/Today/Wrap-up sub-view, or a notification surface. None of them require new architecture. Picking them up after the tree/guided-UX scaffolding is mature avoids each item designing its own one-off home.

---

## Phase E — Compliance / AKC + UKC PDF form-fill (parallel track)

**Entry trigger:** User has sourced the official AKC and UKC submission PDF templates.

**Scope:**

- Replace HTML mockups in `JudgesCertification.tsx`, `TrialSecretaryReport.tsx`, `TrialSecretaryCertification.tsx` with `pdf-lib`-driven fills of the actual fillable AcroForm PDFs.
- Surface HTML versions as on-screen previews; the "Download for AKC submission" button hands back the real form.
- Wire submission status into the wrap-up status taxonomy (Phase C).

**OPEN-TODOS items covered:** "AKC/UKC PDF form-fill" + "Verify ResultCatalog signature lines" (#211 already shipped the latter).

**Exit criterion:** A secretary can complete an AKC submission without manually retyping any data from on-screen reports. Estimated 2-4 PRs.

**Why this phase is parallel:** Blocked on external input (the user's PDF sourcing), not on upstream code. Can run alongside any other phase. Has a compliance-deadline dimension that may justify pulling it forward if a real submission is imminent.

---

## Cross-phase tracks (do anytime)

These don't fit a phase; pick up at any time when convenient:

- **Lint debt from PR #196** — `StickyNav.tsx` `react-hooks/set-state-in-effect` error, `MonogramSectionFolio.tsx` `react-refresh` warning. Captured in OPEN-TODOS.
- **Restore GHA CI gating** — once billing is unpaused. Until then, lint regressions can land silently.
- **Memory hygiene** — `~/.claude/projects/.../memory/project_report_generation.md` says "6 Phase 2 report stubs pending"; inventory on 2026-05-16 confirmed all shipped except the PDF form-fill (Phase E here).

---

## Reading order

This sequencing doc complements, does not replace:

- [`OPEN-TODOS.md`](../OPEN-TODOS.md) — granular item tracker (still source of truth for _what's outstanding_)
- [`docs/plan-show-map-node-attrs-and-attention.md`](plan-show-map-node-attrs-and-attention.md) — Phase 1+2 implementation plan (foundation)
- [`docs/plan-overview-tab-redistribution.md`](plan-overview-tab-redistribution.md) — Phase B's panel mapping (executes during Phase B)

Phase A closeout created `docs/plan-phase-b-ia-consolidation.md` with implementation specifics, the same way Phase 1+2 had their own plan doc.
