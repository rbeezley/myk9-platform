# Plan — Overview Tab Redistribution (Show-Centric IA Consolidation)

**Date:** 2026-05-16
**Status:** Input doc for the eventual `/secretary/shows/:id` workbench consolidation PR.
**Scope:** Map every panel currently surfaced on the Show Details page into exactly one of the planned phase tabs — **Setup**, **Today**, **Wrap-up** — or mark it for deprecation.

**Cross-reference to OPEN-TODOS:** Executes the "Overview tab redistribution plan" item in the 2026-05-16 Show-Day Secretary Workflow Brainstorm. Feeds the parent "Show-centric IA consolidation (Option A)" todo. Not an implementation PR — no component edits, no route changes.

---

## Panel inventory — reality check

`OPEN-TODOS.md` lists "8 distinct panels" on the Overview tab. The actual surface on `/shows/:id` is closer to **10 panels** split across three render zones. Documenting the real list so the consolidation PR can act on it without re-discovery.

Source files:

- `apps/myk9show/src/pages/ShowDetailsPage.tsx` — page shell, hero, top-row cards
- `apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx` — Overview tab body
- `apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx` — hero footer strip
- `apps/myk9show/src/components/shows/overview/*` — individual overview sub-panels

### Render zone A — page header / hero (always visible, above tabs)

| # | Panel | Component | File |
|---|---|---|---|
| A1 | Quick-info strip (entry close, location, entry fee, payment methods) | `QuickInfoCards` | `apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx` |

### Render zone B — top-row cards (always visible, above tabs)

| # | Panel | Component | File |
|---|---|---|---|
| B1 | Premium List download card | `PremiumDownloadCard` | `apps/myk9show/src/features/premium/PremiumDownloadCard.tsx` |
| B2 | Public Landing Page card | `LandingPageCard` | `apps/myk9show/src/features/premium/LandingPageCard.tsx` |

### Render zone C — Overview tab body (inside `PrimaryTabs`, value="overview")

| # | Panel | Component | File |
|---|---|---|---|
| C1 | Schedule timeline | `ScheduleSummary` → `ScheduleTimeline` | `apps/myk9show/src/components/shows/overview/ScheduleSummary.tsx` |
| C2 | Venue map | `VenueMap` | `apps/myk9show/src/components/shows/overview/VenueMap.tsx` |
| C3 | Show Officials | `ShowOfficials` | `apps/myk9show/src/components/shows/overview/ShowOfficials.tsx` |
| C4 | Judges list | `JudgesList` | `apps/myk9show/src/components/shows/overview/JudgesList.tsx` |
| C5 | Share event | `ShareEvent` | `apps/myk9show/src/components/shows/overview/ShareEvent.tsx` |
| C6 | myK9Q access codes | `MyK9QAccessCard` | `apps/myk9show/src/components/secretary/MyK9QAccessCard.tsx` |
| C7 | More from Club X | `MoreFromClub` | `apps/myk9show/src/components/shows/overview/MoreFromClub.tsx` |

### Reconciliation with the OPEN-TODOS list of 8

| OPEN-TODOS label | Maps to | Note |
|---|---|---|
| Premium List | B1 | — |
| Public Landing Page | B2 | — |
| Schedule | C1 | — |
| Show Officials | C3 | — |
| myKQ Access Codes | C6 | Typo in OPEN-TODOS — "myKQ" → "myK9Q" |
| "More from Club X" | C7 | — |
| Entry-fee / payment-methods strip | A1 | Lives in the hero footer, not the Overview tab body |
| Schedule card | C1 (duplicate) **or** C2 (venue map) | OPEN-TODOS lists "Schedule" + "schedule card" as two items — only one schedule panel exists. Treating the second slot as **C2 VenueMap**, which is the other visible card in the main column. **Also missing from the OPEN-TODOS list:** C4 JudgesList, C5 ShareEvent. The redistribution table below covers all real panels, including these. |

The consolidation PR description should reference this corrected inventory, not the original 8.

---

## Target IA recap

Three phase tabs replace the current Overview / Dashboard / Day-of / Run-Order sprawl:

- **Setup** (pre-show) — configuration, premium production, personnel, run-order finalization.
- **Today** (live ops) — check-in, move-ups, scratches, messages, live ring status, anchored on the show-map tree + flat priority queue.
- **Wrap-up** (post-show) — results, reports, AKC/UKC submission, reconciliation.

Per the parent todo (`OPEN-TODOS.md` line 33–37), the spine of Today and Wrap-up is the existing show-map tree (`ShowMapTab`), decorated with phase-specific filters / strips / row actions.

Public exhibitor-facing rendering (the styled landing page for non-staff viewers) is **out of scope** for the phase tabs. Exhibitors continue to land on the styled premium experience; phase tabs are staff-only. The redistribution table below assumes the staff path.

---

## Redistribution table

| # | Panel | Lands in | Rendering change when moved | Rationale |
|---|---|---|---|---|
| A1 | QuickInfoCards (entry close / location / fee / payment) | **Persistent show header** (above all phase tabs, not inside any tab) | Stays read-only summary. Drop "Entries Close" once we're past close date (Today + Wrap-up phases) to avoid stale data. | Identity/context strip — useful in every phase. Putting it inside a single tab forces re-navigation. Same principle as the existing `PageHeader` / `DetailHero` — header chrome, not tab content. |
| B1 | PremiumDownloadCard | **Setup** | Render with full edit affordances (Generate, Regenerate, Download). On Today + Wrap-up, do **not** render — premium is frozen by entry close. | Premium production is a pre-show concern. Showing it during Today is visual noise; showing it during Wrap-up implies edits are still valid when they're not. |
| B2 | LandingPageCard | **Setup** | Same as B1 — full publish/unpublish controls on Setup; hidden on Today + Wrap-up. | Public landing page goes live before entry close and is locked thereafter. Same lifecycle as B1. |
| C1 | ScheduleSummary (ScheduleTimeline) | **Setup** (primary) + **Today** (read-only mirror) | **Setup:** full timeline with edit actions (add session, reorder, set times). **Today:** read-only "current + next session" condensed view, pinned above the show-map tree. Same source data; different density + interactivity. | Schedule is built in Setup, consumed in Today. The Today-tab mirror is one of the few legit cross-cutting cases — see "Cross-cutting panels" below. |
| C2 | VenueMap | **Setup** | Edit-mode (set address, confirm geocode). Read-only static thumbnail moves into the persistent show header as a click-to-expand affordance — handlers and judges need directions on every phase, but the full map widget doesn't need to be re-rendered on each tab. | Venue address rarely changes post-Setup but is referenced in all phases. Compromise: edit lives in Setup, a tiny "Directions" link lives in the header. |
| C3 | ShowOfficials | **Setup** | Edit-mode (assign secretary, chairman, chief ring steward, etc.). On Today, surface officials inside the existing `ShowMapTab` "Running Now" strip / personnel pane (already planned in the parent todo's "personnel section"). Do not duplicate the full officials grid on Today. | Officials are configured in Setup. Today needs *who is on duty right now*, not the static officials roster. The Setup version is the source of truth; Today shows a derived "on duty" pill. |
| C4 | JudgesList | **Setup** | Edit-mode in Setup (assign judges to classes via the existing wizard). Today consumes judge data through class rows in the show-map tree (judge name is already a row-level badge in `ShowMapStructureTable`). On Wrap-up, surface judge-signature status as a per-class badge in the tree (covered by the parent todo's "Wrap-up status taxonomy"). | Same pattern as C3 Officials. The flat list panel is a Setup concern. Today + Wrap-up consume judge data via the tree rather than re-rendering a flat list. |
| C5 | ShareEvent | **Deprecated** from the staff workbench. Move to the **public exhibitor landing page** only. | n/a for staff phase tabs. | Secretaries do not share their own show — exhibitors and clubs do. The current placement in the staff Overview is misplaced. Public landing renders already include show metadata for sharing; the Web Share API target there is the correct home. **Deletion is not destructive** because the share target moves, not disappears. |
| C6 | MyK9QAccessCard | **Today** (primary) + **Setup** (secondary, pre-show preview) | **Today:** prominent, near the "Running Now" strip — the codes are the secretary's pocket reference during show day. **Setup:** smaller "Preview access codes" card so the secretary can verify codes were generated and test myK9Q login from a tablet before show day. Same component, different placement weight. | Access codes are a Today tool — used to bootstrap myK9Q on judge tablets in the morning. The Setup placement is the pre-flight verification. Wrap-up does not need them; myK9Q access is sunsetted at end-of-show. |
| C7 | MoreFromClub | **Deprecated** from the staff workbench. Keep on the **public exhibitor landing page** only. | n/a for staff phase tabs. | A secretary running show X does not need links to show Y from the same club. This is an exhibitor discovery feature. Like C5 ShareEvent, it stays on the public landing — staff phase tabs drop it. |

---

## Cross-cutting panels — why and where

Only **two** panels appear in more than one phase tab. Documenting the duplication tradeoff explicitly so the implementer doesn't accidentally proliferate cross-cutting placements.

### C1 ScheduleSummary — Setup (edit) + Today (read-only)

**Why duplicate:** The schedule is the authoritative source of "what is happening when". On Today, the secretary needs to see current + next session at a glance without leaving the show-map tree. Forcing a tab switch back to Setup mid-show is the wrong UX.

**How to keep them in sync:** Both render from the same `ScheduleTimeline` data source. The Today variant is a different *view* (condensed, read-only, current-time-aware), not a different data path. Build a `ScheduleTimelineCondensed` sibling that consumes the same hook. **Hard rule:** if a third surface needs schedule data, route it through the same hook — do not add a third query.

### A1 QuickInfoCards — persistent header (not in any tab)

**Why not in a tab:** Show identity (location, fee, entry status) is referenced from every phase. Putting it in one tab forces re-navigation. Putting it in all three tabs is duplication; the user can't tell which is canonical.

**Resolution:** Lift to persistent header above the phase tabs. Already adjacent to `DetailHero` in the current implementation, so the consolidation PR can keep it where it is and let the phase tabs render below.

---

## Deprecations — explicit, with redirects

Three deprecations. Two are "move to public landing" (C5, C7) and one is a structural relocation (B1/B2 hidden on non-Setup tabs).

| Panel | Action | Destination | Notes |
|---|---|---|---|
| C5 ShareEvent | Remove from staff workbench | Public exhibitor landing (already a sibling render path) | Already wired into `STYLED_LANDING_BY_STYLE` flows. Verify before deleting from the staff path. |
| C7 MoreFromClub | Remove from staff workbench | Public exhibitor landing (same as C5) | `useShowsByClubQuery` continues to power the public version. |
| B1 PremiumDownloadCard, B2 LandingPageCard | Conditional render — Setup only | n/a (still on the same page, just gated by active phase tab) | Gate on the active phase tab, not on a date. Manual phase override (e.g., reopening Setup post-close to regenerate a corrected premium) must keep the card visible. |

**No bare deletes.** Parent todo's deprecation mechanics rule applies: previously-reachable surfaces get a redirect or a clear new home, never a "this is gone now" empty state.

---

## Implementation notes for the consolidation PR

1. **Do not edit the panel components themselves in the consolidation PR.** The components are already cohesive (judges list, officials list, share event). The redistribution is purely a *placement* change — wrap each in the appropriate phase tab's layout, keep the component contracts intact.
2. **Phase-tab gating helper.** Introduce a single `useActivePhase(): 'setup' | 'today' | 'wrap-up'` hook driven by URL state (mirrors the existing `useUrlTab` pattern at `apps/myk9show/src/hooks/useUrlTab.ts`). All conditional renders consume that hook, not parallel boolean props.
3. **Header lift order.** Move A1 QuickInfoCards out of `DetailHero`'s `footer` slot and into a sibling component above `PrimaryTabs`. This keeps the hero clean for the eventual phase-tab redesign without touching `DetailHero` itself.
4. **Schedule duplication guard.** Build `ScheduleTimelineCondensed` as a sibling of `ScheduleTimeline` consuming the same hook. Add a unit test that asserts both surfaces render the same canonical session list given identical input — divergence-prevention pattern mirrored from `attention-consistency.test.ts` (see `docs/plan-show-map-node-attrs-and-attention.md` Phase 2).
5. **Public landing migration check.** Before deleting C5 / C7 from the staff path, verify `STYLED_LANDING_BY_STYLE` variants already include share + more-from-club affordances. If any style is missing them, add to the styled landing **before** removing from the staff overview — no user-facing gap.
6. **Tests to update.** `apps/myk9show/src/test/components/ShowOverviewTab.test.tsx` and `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx` both assert current Overview tab structure. Both need rewrites against the phase-tab layout. Treat as in-scope for the consolidation PR — not deferred.

---

## Out of scope for this doc

- The actual `/secretary/shows/:id` route definition and redirects (covered by the parent "Show-centric IA consolidation" todo).
- Show-map tree extensions (covered by `docs/plan-show-map-node-attrs-and-attention.md` and the "Show-map tree extensions for show-day use" todo).
- "Next Best Action" card placement (covered by "Guided next-action surfaces" todo).
- Exhibitor-facing landing page changes beyond confirming share + more-from-club already exist there.

This doc is one piece of input — the redistribution map — feeding the consolidation PR. Pair it with the IA todo (`OPEN-TODOS.md` line 33) and the show-map extensions todo (line 39) when scoping the actual PR.
