# Plan: Show-Detail Surface Consolidation

> **Status:** Complete

**Created:** 2026-06-29
**Completed:** 2026-06-29 across 8 PRs (all merged):
`useShowLandingData` ([#1032](https://github.com/rbeezley/myk9-platform/pull/1032)) ·
`ShowPublicLanding` ([#1033](https://github.com/rbeezley/myk9-platform/pull/1033)) ·
`resolveShowAudience` ([#1034](https://github.com/rbeezley/myk9-platform/pull/1034)) ·
`ShowDetailTabs` ([#1035](https://github.com/rbeezley/myk9-platform/pull/1035)) ·
`ShowManagementShell`+`ShowExhibitorView` ([#1036](https://github.com/rbeezley/myk9-platform/pull/1036)) ·
`useTrialDetailData` ([#1037](https://github.com/rbeezley/myk9-platform/pull/1037)) ·
`TrialManagementDialogs` ([#1038](https://github.com/rbeezley/myk9-platform/pull/1038)).
**Result:** `ShowDetailsPage` 893→466 LOC, `TrialDetailsPage` 606→383 LOC; every
extracted module is under the 500-line ceiling. All phases behavior-preserving,
verified by the existing route/page suites staying green plus new per-module unit
tests. Dual-route decision (Phase 4c): **keep both** `/trials/:trialId` and
`/shows/:showId/trials/:trialId` — the unscoped route is an actively-used fallback
that can't be redirected cleanly. Cold-session anon paths are covered by the
existing cold-anon integration tests (the anon data layer was re-homed, not
changed); a live incognito spot-check remains a recommended human gate.

**Source:** OPEN-TODOS.md → "Consolidate the show-detail surface (hotspot #1)" (identified 2026-06-25 via `/hotspots`, git churn × size).
**Gate:** The original blocker — *"wait for code-audit Waves A–C"* — is **satisfied**: the code-quality audit ([`docs/archive/plan-code-quality-audit.md`](archive/plan-code-quality-audit.md)) is complete (Waves A–D shipped, archived). Wave C extracted the *mechanical* concerns from these files; what remains is the **IA fusion** problem this plan addresses, which is a consolidation/UX question, not a line-count one. Execution still sequences through [`plan-launch-execution-lanes.md`](plan-launch-execution-lanes.md) — do not implement out of lane order.

---

## Problem

`/shows/:id` → [`ShowDetailsPage.tsx`](../apps/myk9show/src/pages/ShowDetailsPage.tsx) (893 LOC) **tops both the 6-month and 3-month churn rankings**. It is not messy code — it is *load-bearing code that keeps changing*, because a single file serves **three different audiences with three different mental models**:

| Audience | What they see | Code in the file |
| --- | --- | --- |
| **Public / anonymous visitor** | A styled marketing landing (`STYLED_LANDING_BY_STYLE[...]`) | The `StyledLanding` branch (~531–575) **plus** the entire anon cold-store fallback data layer (~254–430): `publicTrialsResult`, `publicClassesByTrial`, `publicTrialStats`, and their `pickLandingTrials` / `buildPublicShowClasses` / `buildPublicTrialStats` reshapers |
| **Authenticated exhibitor (not staff)** | Tabbed details: Overview / Trials / My Entries / Classes / Results, plus the entry CTA | `tabDefs`, `MyEntriesTab`, the `secondaryActions` "See classes" + "Enter This Show" CTAs, `defaultTab` / `hasUserEntries` logic |
| **Secretary / admin / club-admin** | The management workbench: a section nav (`SHOW_MANAGEMENT_SECTIONS`) that renders an `<Outlet/>`, plus extra tabs (Show Map, Entries, My Stats), the publish row, edit/delete dialogs, presence/live indicators | The `canManageShow` branches throughout, the management `<nav>` (~726–754), `<Outlet/>` (~756), `ShowEditPanel` + `DeleteShowDialog` (~834–888) |

Every change to *any* of the three audiences edits this one file, so it churns continuously. Three concerns, one page — the exact anti-pattern CLAUDE.md's "consolidate, don't duplicate" phase targets.

**The same fusion exists in the cluster:**

- [`TrialDetailsPage.tsx`](../apps/myk9show/src/pages/TrialDetailsPage.tsx) (606 LOC) — same public-vs-management split (`canManageTrial`, `PUBLIC_TAB_IDS` vs `TAB_IDS`, the same anon by-id cold-store fallback), and it is **dual-routed** (`/trials/:trialId` *and* `/shows/:showId/trials/:trialId`).
- [`EntryManagementPage.tsx`](../apps/myk9show/src/pages/secretary/EntryManagementPage.tsx) (499 LOC) — already at the 500-line ceiling; it is one of the six sections rendered through the ShowDetailsPage `<Outlet/>`, so its lifecycle is coupled to the shell.
- `features/show-map/*` — already heavily factored (~40 sibling modules); **not** a target. It is a consumer of the shell, not part of the fusion.

### The duplication question (CLAUDE.md rule #4)

> *"Does this split create duplication? If so, why is it justified instead of a link?"*

**No.** Splitting these audiences apart does not duplicate logic — it *separates* concerns that are currently interleaved. The shared pieces (the show fetch, the anon fallback, the entry-status derivation) become **named modules consumed by each surface**, not copy-paste. This plan adds zero new user-facing surfaces; it re-homes existing ones behind the *same URLs* so shareable links keep working.

---

## Target structure

`/shows/:id` becomes a **thin audience router** that decides which surface to render, delegating to three focused components. The route and URL are unchanged.

```
ShowDetailsPage (route shell — small)
 ├─ decides audience from { isStaff, isAuthenticated, hasUserEntries, isManagementSection }
 ├─ <ShowPublicLanding>     ← anon / non-entered visitor   (styled landing)
 ├─ <ShowExhibitorView>     ← authed exhibitor             (Overview/Trials/MyEntries/Classes/Results tabs)
 └─ <ShowManagementShell>   ← secretary/admin/club-admin   (section nav + <Outlet/> + publish row + edit/delete)
```

Shared, audience-neutral logic is extracted to consumable modules:

- `useShowLandingData(showId)` — owns the **anon cold-store fallback** (`publicTrialsResult`, `publicClassesByTrial`, `publicTrialStats`) + the reshapers. This is the single highest-leverage extraction: it is ~180 lines of self-contained, already-commented, already-test-backed (`buildPublicShowClasses` etc.) logic that only the public/exhibitor read paths need, and it is the densest part of the churn.
- `useShowAudience(...)` — the pure predicate that maps `{ user, roles, hasUserEntries, isManagementSection }` → `'public' | 'exhibitor' | 'management'`. One function, deterministic, unit-testable in isolation (replaces the scattered inline `!isManagementSection && !isSecretary && ...` conditionals).
  - **[ADDED] Transient/loading state is part of the contract, not an afterthought.** The current page deliberately defers the decision while data is still resolving to avoid *flashing the wrong surface* — `isWaitingForExhibitorEntryDefault` renders a skeleton instead of a tab, and the public-landing branch returns a skeleton when `user && userEntriesLoading` "to avoid flashing the landing page briefly" (ShowDetailsPage ~555–563). `useShowAudience` must return a fourth state — `'pending'` — while `authLoading || rbacLoading || (user && userEntriesLoading)`, and the router renders a skeleton for it. A predicate that resolves eagerly to `'public'` before entries load is a visible regression (anon landing flashes, then snaps to the exhibitor view).

---

## Phased execution

Each phase is independently shippable, reviewable, and reversible. **Behavior must not change** in Phases 1–3 — these are extractions, verified by the existing route/page tests staying green plus new unit tests per module (CLAUDE.md: a phase is not complete until its tests pass).

**[ADDED] Rollback.** This is a pure structural refactor with no schema, no migration, and no API change — so rollback is **`git revert` of the offending phase PR**, nothing more. No feature flag is warranted (a flag would mean shipping both the old and new code paths, doubling the surface this plan exists to shrink). Because each phase is one self-contained PR that keeps the existing route/page tests green, a revert restores the prior behavior cleanly without touching any other phase. If a phase can't be reverted in isolation (e.g. Phase 3 depends on Phase 1's hook), revert forward to the last green phase boundary.

### Phase 1 — Extract the anon/public data layer (lowest risk, biggest churn win)
- Move the three `useQuery` fallbacks + `pickLandingTrials` / `buildPublicShowClasses` / `buildPublicTrialStats` wiring into `useShowLandingData(showId, associatedTrials, showEntries)`.
- `ShowDetailsPage` consumes the hook; no JSX changes.
- **Tests:** unit tests for the hook (warm-store passthrough vs cold-store fallback vs fallback-error surfacing — preserve the "throw so React Query retries, don't swallow into a false-empty tab" invariant at ~287–291). The reshaper helpers already have tests; re-point any `vi.mock()` paths that move.

### Phase 2 — Extract `<ShowPublicLanding>`
- Lift the `StyledLanding` branch (~531–575) into its own component fed by `useShowLandingData`.
- **Preserve INTENT:** the null/default-style → committed Monogram default behavior (comment at ~541–544) is deliberate — keep it verbatim.
- **Tests:** anon render picks the right styled landing per `ShowStyle`; default/unknown falls back to Monogram.

### Phase 3 — Extract `<ShowExhibitorView>` and `<ShowManagementShell>`
- Exhibitor view: the `tabDefs` + `PrimaryTabs` block for non-staff, the entry-status badges, and the `secondaryActions` CTAs. **Preserve INTENT:** the "See classes" deep-link (UX-P2-04, ~660–663) and the filled-vs-outline entry CTA rationale (~674–686).
- Management shell: the section `<nav>` + `<Outlet/>`, the publish row (**preserve INTENT** anchor `#setup-publish`, ~709–712), header actions (presence, live indicator, status pill, edit/delete menu), and the `ShowEditPanel` / `DeleteShowDialog` dialogs.
- **[ADDED] Re-wrap `ShowPresenceProvider`.** The provider currently wraps the *entire* authed return (ShowDetailsPage ~582). After the split it must wrap `<ShowManagementShell>` (and the exhibitor view if presence is shown there) — `LiveUpdateIndicator`, `ShowPresenceStack`, and any presence-aware child silently no-op outside the provider. Add a render test asserting the presence stack mounts for a staff user.
- **[ADDED] Preserve URL-state continuity.** The `?edit=true` deep-link (opens `ShowEditPanel`, then strips the param — ShowDetailsPage ~201–209) and the `?tab=` URL-sync (`useUrlTab`, ~351) are consumed across two of the three surfaces. Keep the `searchParams` ownership co-located with the surface that uses it (edit→management shell, tab→exhibitor view) so shareable/deep links survive the split. Test: visiting `/shows/:id?edit=true` as staff opens the edit panel; `?tab=classes` selects the Classes tab.
- **[ADDED] Preserve the perf fast-path + navigation tracking.** `useFastShowDetails` (cache-first show load), the `entryCountByClassId` memo (explicitly O(entries), *not* O(classes × entries) — ShowDetailsPage ~353–363), and `endNavigation(isFromCache)` (`useNavigationPerformance`, ~189–193) are deliberate. Whatever component owns the show fetch must keep firing `endNavigation` exactly once on first data, and the entry-count memo must not be recomputed per-child. Lift the shared show/entries fetch to the router level and pass derived data down, rather than each child re-fetching.
- `ShowDetailsPage` is now the thin router calling `useShowAudience(...)`.
- **Tests:** `useShowAudience` truth table (incl. the `'pending'` state); the existing [`canonicalShowRoutes.test.tsx`](../apps/myk9show/src/test/routes/canonicalShowRoutes.test.tsx) and [`ShowDetailsPage.test.tsx`](../apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx) must stay green (no route or default-tab regressions).

### Phase 4 — Apply the same split to `TrialDetailsPage` + resolve the dual route
- Mirror Phases 1–3 on the trial surface (`canManageTrial` → audience predicate; reuse the by-id anon fallback pattern).
- **Decide the dual route:** keep both `/trials/:trialId` and `/shows/:showId/trials/:trialId` rendering the same component (status quo), **or** redirect one to the other. If either path moves, ship a redirect — *no bare delete on a previously-routed URL* (CLAUDE.md worktree/IA rule); capture the redirect map in the PR description.
- **Tests:** [`TrialDetailsPage.test.tsx`](../apps/myk9show/src/test/pages/TrialDetailsPage.test.tsx) green; redirect coverage if a path changes.

### Phase 5 — Verification & sign-off
- `pnpm typecheck` + `pnpm lint` clean; affected unit + route suites green.
- **Cold-session anon walk** (incognito): a shareable `/shows/:id` and `/trials/:trialId` still render the public landing for a signed-out visitor (guards the offline/anon fallback this refactor moves). Per the project's "verify anon in a cold session" rule.
- Each `ShowDetailsPage` / `TrialDetailsPage` file lands **under the 500-line ceiling**; record the before/after LOC in the final PR.

---

## Out of scope / non-goals

- **No new surfaces, no URL changes** (beyond an optional, redirect-backed dual-route collapse in Phase 4).
- **`show-map/` is not touched** — it is already factored and is a consumer, not part of the fusion.
- **No UX/IA redesign of the tabs themselves** — that is the UX Journey Audit's job ([`plan-ux-journey-audit.md`](plan-ux-journey-audit.md)); this plan is a structural de-fusion that *makes* that audit easier, not the audit itself.

## Risks

- **Hidden coupling via hooks-order** — `ShowDetailsPage` runs many hooks before its early returns (rules-of-hooks). Extractions must preserve call order; a moved hook that now runs conditionally is a regression. Mitigate by extracting into child components (each child runs its own hooks unconditionally) rather than conditional inline hooks.
- **INTENT erosion** — four `// INTENT:` comments live in the churn zone (Monogram default, publish row anchor, See-classes deep-link, filled entry CTA). Each is called out above; none may be dropped without explicit approval.
- **Test mock drift** — moving import paths silently breaks captured `vi.mock()` targets. Re-point them in the same phase (known repo footgun).
- **[ADDED] Silent context/provider loss** — `ShowPresenceProvider` wraps the whole authed return today; an extraction that forgets to re-wrap it makes presence/live features no-op with *no error* (the hooks just read an empty context). Same failure class for any other provider in the tree. Guard with a render test that asserts a presence-dependent child mounts.
- **[ADDED] Performance regression via re-render / re-fetch** — naively giving each child its own `useFastShowDetails` / `useEntriesByShowQuery` call multiplies fetches and breaks the single `endNavigation` tracking contract. Keep the shared fetch at the router and pass data down; memoize derived structures (`entryCountByClassId`, `showClasses`) once at that level.
- **[ADDED] URL-state breakage** — the `?edit=true` and `?tab=` params are load-bearing deep links. A split that drops `searchParams` wiring breaks shareable links with no test failure unless explicitly covered — hence the param tests added to Phase 3.
