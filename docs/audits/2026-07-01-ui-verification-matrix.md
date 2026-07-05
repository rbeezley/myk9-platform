# UI Verification Matrix — Theme × Viewport × Accessibility

> **Status:** Active

**Date:** 2026-07-01
**Auditor:** Claude (automated Playwright matrix + axe-core + AST static sweeps + 5 parallel screenshot reviewers)
**Scope:** The three UI dimensions the journey walks left unaudited: **light mode** (all prior walks ran dark), **responsive coverage** (systematic 375/768/1280 instead of one spot-check), and **accessibility** (axe-core WCAG 2.1 AA + INTENT guardrails: 44px touch targets, 14px font floor).
**Method:** 20 key pages × 2 themes × 3 viewports = **120 full-page screenshots**, 40 axe scans (desktop, both themes), runtime checks (horizontal overflow, touch-target sizes, sub-14px text), console-error capture, plus three codebase-wide static sweeps (unlabeled icon buttons via TS-compiler AST, theme-drift color literals, text-size classes). Accounts: `e2e-secretary@` / `e2e-exhibitor@test.myk9.com` on a worktree dev server (port 5199) against the shared dev DB.
**Companion docs:** flow/UX findings live in [2026-07-01-secretary-journey-ux-audit.md](2026-07-01-secretary-journey-ux-audit.md) and [2026-07-01-show-creation-wizard-ux.md](2026-07-01-show-creation-wizard-ux.md). This report only re-states a journey finding when this pass adds evidence (marked **[confirms journey audit]**).
**Cross-review:** merged 2026-07-02 with the independent Codex matrix of the same scope (`docs/qa/ui-verification-matrix-audit-2026-07-02.md`, 15 routes × 2 themes × 3 widths, on the `codex-ui-verification-matrix` worktree at time of merge). Codex-sourced findings are marked **[Codex]**; findings both matrices hit independently are marked **[×2]**. Every merged [Codex] claim was re-verified against source in this repo before inclusion. See "Cross-audit consensus" at the end.

## Calibration caveats — read before acting

1. **Cold-sync race in the harness, turned into a finding.** Each page's first capture (mobile ran first) happened while `@myk9/replication` was still cold-syncing a fresh browser profile. Ringside pages and My Entries captured **definitive empty/error states** ("This show has no classes yet", "No Entries Yet", "Class not found", exhibitor welcome card) that a warm-cache re-test proved wrong. The mobile *screenshots* for those pages show sync-race state, not mobile bugs — but the race itself is Critical finding **S1**.
2. **Shared dev DB was timing out during the run.** An `entries` read query hit Postgres `statement timeout` → HTTP 500 on 7 secretary surfaces (16 of 24 workbench-area shots show the failure toast). This polluted some captures (Reports' print preview never rendered; Show Desk dark shots caught the degraded state, so its dark-vs-light diff is confounded) — and is itself finding **S2**.
3. **`at-show-classes` axe result (0 violations) is meaningless** — it scanned the empty state.
4. **Static-sweep numbers are upper bounds with measured precision.** The icon-button sweep is AST-based (TypeScript compiler); an 18-item manual sample found no false positives after refinement, but buttons labeled via prop spreads are conservatively *excluded*, so the true count may be slightly higher.

## What held up (keep)

- **Light mode is broadly sound.** The feared theme-regression scenario (#671 class) did not materialize: axe contrast failures are **light 4 pages / dark 13 pages** — dark, the theme everyone audits in, is actually the weaker one. Sign-in, wizard step 1, dashboard, and the browse pages re-theme cleanly in both directions.
- **Wizard step 1 is visually clean in all 6 captures** — fields uncrushed at 375px, fully themed.
- **No document-level horizontal overflow at 375px anywhere** — mobile clipping issues are element-level (cards, toolbars), not page-level.
- **Ringside class list has zero sub-44px touch targets at tablet** — the INTENT tablet guardrail holds exactly where it matters most; the scoresheet chips/timer render large and high-contrast in both themes.
- The entries table's `aria-label="Actions for Ranger"` convention remains the house standard to copy.

---

## Dimension 1 — Theme (light × dark)

### Machine matrix (axe, desktop)

| Page | axe light | axe dark | Tablet targets <44px | Backend errors |
| --- | --- | --- | --- | --- |
| at-show-classes | 0 ⚠ empty-state | 0 ⚠ | 0/7 | — |
| at-show-entries | contrast ×4 | contrast ×1 | 4/11 | — |
| clubs-browse | 0 | 0 | 25/29 | — |
| dog-detail | 0 | contrast ×3 | 26/35 | — |
| dogs-list | contrast ×2 | contrast ×8 | 24/24 | — |
| entry-management | nested-interactive ×1 | contrast ×12, nested-interactive ×1 | 86/95 | yes |
| home | 0 | 0 | 16/25 | — |
| manage-classes | aria-toggle-field-name ×3, button-name ×8 | + contrast ×3 | 33/33 | — |
| my-entries | 0 | contrast ×9 | 24/75 | — |
| reports | nested-interactive ×1 | contrast ×4, nested-interactive ×1 | 31/37 | yes |
| results-control | nested-interactive ×1 | contrast ×3, nested-interactive ×1 | 26/40 | yes |
| scoresheet | 0 | contrast ×1 | 6/10 | — |
| secretary-dashboard | 0 | 0 | 23/26 | yes |
| show-desk | aria-progressbar-name ×2, contrast ×7, nested-interactive ×1 | contrast ×12 + same | 41/55 | yes |
| show-detail-public | contrast ×16, document-title ×1 | contrast ×17, document-title ×1 | 5/9 | — |
| shows-browse | 0 | contrast ×2 | 22/25 | — |
| sign-in | 0 | contrast ×1 | 6/9 | — |
| submit-results | nested-interactive ×1 | contrast ×4, nested-interactive ×1 | 22/33 | yes |
| wizard-step1 | 0 | contrast ×2 | 37/42 | — |
| workbench-setup | aria-prohibited-attr ×5, nested-interactive ×1 | + contrast ×9 | 22/36 | yes |

### Findings

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| T1 | **Dark-mode status-chip contrast is a token/pattern-level failure**, not per-page: `text-success` on `bg-success/10` chips, "Published" chip keeps light-mode blue text rgb(30,64,175) on a dark navy pill (**≈1.9:1**, needs 4.5), "Pending" chip loses its pill background entirely (amber text bare on card), "Completed" chip near-invisible next to solid "In Progress", level chips (Novice/Advanced/Excellent) lose their pill surfaces while element chips keep theirs, exhibitor "Not Checked In" renders as an un-themed near-white pill. **[×2] Root cause for the solid-fill half (Codex, verified):** dark accents brighten `--primary` (e.g. clay `#d97757`, index.css:698) for text-on-dark legibility but keep `--primary-foreground: #ffffff` — so every `bg-primary text-primary-foreground` fill (CTAs, armband badge "102", avatar, calendar chip) lands at **≈3.1:1** in dark mode across the app | axe dark-contrast on 13 pages (mine) + Codex's 15-route matrix; `shows-browse__dark__*`, `entry-management__dark__mobile`, `manage-classes__dark__*`, `my-entries__dark__*` | High |
| T2 | **Heritage public show page fails contrast in BOTH themes** **[×2]** (16–17 nodes: `hd-nav-cta`, `hd-hero-tag`, `hd-cta`, "Closing in" block) — this is the page exhibitors share publicly | axe both themes (both audits), `show-detail-public__*` | High |
| T3 | Ringside entry list has **more contrast failures in light (4) than dark (1)**, and its light-mode "No Status" chip is white-on-mid-gray ≈2.5–3:1 — below the "readable outdoors" INTENT bar on the tablet surface | axe; `at-show-entries__light__tablet/desktop` | High |
| T4 | Dark mode: at-show-entries active tab loses its selected-state background (only text color differs) | `at-show-entries__dark__tablet/desktop` | Med |
| T5 | Light mode: at-show-classes trial headers + judge names are muted gray on cream ≈3.5:1 at small size (outdoor tablet) | `at-show-classes__light__tablet` | Med |
| T6 | `home` and `show-detail-public` do not re-theme in dark mode (fixed-light body under a re-themed dark header — jarring seam on heritage page). If intentional (marketing/heritage styling), add an `// INTENT:` note; today it reads as inconsistency against fully-theming sign-in/browse | pixel-diff, `*__dark__*` vs `*__light__*` | Low |
| T7 | Static sweep: **241 unguarded literal-color class strings in 118 files** (`bg-white`, `text-gray-900`, etc. without `dark:` counterpart). Known-legit families: `PrintableReport` (paper), `TVDisplay` (always dark), `CreditCardVisual` (decorative). The rest are latent #671-class regressions; top offenders: `FirstTimeDelight` (17), `DualTimerDisplay` (7), `ScentWorkScoresheet` (5) | `scan-theme-drift.mjs` (session artifacts) | Med (risk register) |

**Fix shape for T1:** one dark-token contrast pass in [index.css](../../apps/myk9show/src/index.css) (the `--success` token already has exactly this treatment *with a regression test* — `styles/__tests__/success-token.test.ts` — extend that pattern to warning/info/muted chip tints) plus a shared status-chip component sweep so chips can't silently drop their pill surface in dark.

---

## Dimension 2 — Responsive (375 / 768 / 1280)

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| R1 | **Public landing overflows at tablet** **[×2]**: page renders 874px wide at a 768px viewport (+106px); the header "Join the waitlist" CTA sits entirely off-viewport (x 783–874); nav labels wrap mid-word onto 2–3 lines. Both audits measured the identical +106px independently. Fix site (Codex): `LandingHeader` / `landing.css` `.l-waitlist-btn` — wrap, hide, or reorder the header band at ≤768px | runtime overflow check (both audits); `home__*__tablet` | High |
| R2 | **Show title clips mid-word ("Heartlan") at 375px on every workbench page** — shared hero component; "Published" chip clips at the same card edge. **[confirms journey audit]**, now shown systemic (3 pages × 2 themes) | `workbench-setup/show-desk/reports/results-control/submit-results__*__mobile` | High |
| R3 | **Manage Classes mobile: primary CTA off-screen** — "Add Classes" entirely outside the viewport, "Manage Waitlist" truncated to icon+"M" | `manage-classes__*__mobile` | High |
| R4 | **Entry Management tablet: table renders Status/Date/action columns beyond the card edge with no scroll affordance**; mobile: per-card "Actions ⋯"→"Actio…", "Email E…" clipped off-screen on rows with refund chips / exhibitor IDs | `entry-management__*__tablet/mobile` | High |
| R5 | **"Armband #" input truncates to "Armban" at ALL widths including 1280px desktop** — fixed-width input, not responsive squeeze. **[confirms journey audit**, which assumed mobile-only**]** | all 18 workbench-page shots | Med |
| R6 | **Tab strips clip mid-word with no scroll affordance/fade — recurring pattern**: workbench tabs ("Su…", "Entry Managemen…"), my-entries tabs ("Upcoming" cut, "Completed" off-screen), dog-detail tabs (cuts at every viewport: "Health Re" even at desktop), shows-browse/clubs table toolbars ("Co…", "Reset view" gone) | 5 surfaces, both themes | Med |
| R7 | **"Copy Link" button overlaps the "Headline" badge** on the Public Landing Page card at ≤768px (badge hidden under button, URL truncated) — shared card on 3 workbench pages | `workbench-setup__*__tablet/mobile` + show-desk, reports | Med |
| R8 | Results-control mobile: per-trial override rows truncate ("Saturday T…") and toggles are half-clipped by the card edge | `results-control__*__mobile` | High |
| R9 | Ringside entry card: favorite (heart) button overlaps the status chip — half inside "In Ring" chip; mis-tap risk on the primary touch surface | `at-show-entries__*__tablet/desktop` | Med |
| R10 | Show Desk tablet: trial-row progress text + bar clipped at card edge ("1/3 classes compl…") | `show-desk__*__tablet` | Med |
| R11 | My-entries tablet stat cards truncate the numbers that matter ("2 accepted · …" loses pending count; "Amount due…" loses the dollar amount) | `my-entries__*__tablet` | Med |
| R12 | Search placeholders longer than their inputs truncate mid-word without ellipsis ("Search shows by nar", "Search your dogs by", "Search clubs by nam") — pattern across browse pages | shows/dogs/clubs desktop+tablet | Low |
| R13 | Clubs-browse mobile: Type/Location columns off-screen, descriptions cut mid-word, third toolbar button → "Co" | `clubs-browse__*__mobile` | Med |
| R14 | Dogs-list mobile: "Codex Dai…" truncates despite free width; registry chip wraps into a cramped 4-line column | `dogs-list__*__mobile` | Low |
| R15 | Home mobile: nav items silently dropped (no hamburger); ticker separator dots orphan at line breaks | `home__*__mobile` | Low |
| R16 | **Error toasts dock over content, not a safe corner** — covered "+ Add Task", "New Entry", "All Classes" filter, JUDGES card, Premium List title, Next Best Action card across tablet/mobile captures | 16 of 24 workbench-area shots | Med |

**Fix shape:** R2/R5/R7 are three shared components (workbench hero, ArmbandLookup, landing-page card). R6 is one primitive (tab/toolbar strip needs `overflow-x-auto` + fade affordance) reused everywhere. R4/R13 are the table-in-card pattern needing a visible horizontal-scroll affordance at <1280.

---

## Dimension 3 — Accessibility

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| A1 | **153 icon-only buttons with no accessible name across 95 files** (of 270 icon-only buttons total — 57%). axe confirms rendered instances: `button-name` **critical** ×8 on Manage Classes **[confirms journey audit]**. The house convention exists (`"Actions for Ranger"`); it's just unapplied in half the app. **[×2]** Codex's independent grep hit the same cluster (TrialDetailsPage prev/next, ClassDetailsPage menu, EntrySyncStatusBar retries, PlacementRecalculationAlert, ClassDefinitionTable…) and adds a nuance this sweep under-weighted: some buttons rely on `title` **alone** (counted as "labeled" here) — `title` is unreliable for screen readers and invisible on touch, so the sweep should prefer `aria-label` even where `title` exists | AST sweep (full list in [appendix](2026-07-01-ui-verification-matrix-appendix-icon-buttons.md)); axe; Codex grep | High |
| A2 | **Touch targets:** the shared app chrome fails 44px on every page — header logo 103×28, search 144×32, Message Center 36×36, theme toggle 28×32, AskQ 28×32, account 62×40, sidebar rows 39×44 — inflating every page's count (dogs-list literally 24/24). Ringside: **"Actions menu" is 20×20 on entry cards** (INTENT requires 44+, prefers 48 on tablet); "Back to Classes" 40×40. **[×2]** Codex measured the same 28–36px header cluster and names the fix sites: `AppHeader.tsx` + `NotificationBell.tsx` — fix the shared primitives once, not per page | runtime scan at 768px, all pages; Codex DOM metrics | High (chrome + ringside), Med (tables) |
| A3 | **Sub-14px text is systemic:** 1,660 `text-xs` (12px) across 551 files + 61 `text-[10px]` + 22 `text-[11px]`; runtime check capped out at 60 sub-14px elements on the home page alone. INTENT says "never below 14px for anything." Realistic remedy is a design decision (bump the `text-xs` token to 0.875rem app-wide and triage what breaks), not 1,660 edits | static + runtime | High (decision), effort Med |
| A4 | `nested-interactive` **[×2]**: [ArmbandLookup.tsx:63](../../apps/myk9show/src/components/shows/ArmbandLookup.tsx) wraps the search `<form>` in `<PopoverTrigger asChild>`, so Base UI stamps `role="button" tabindex="0"` onto a form containing a focusable input — flagged on all 6 workbench tabs. Fix (Codex, agreed): split the submit/search form from the popover-trigger semantics (anchor the results popover to the input instead of making the form the trigger) | axe (both audits), 6 pages both themes | Med |
| A5 | `aria-prohibited-attr` ×5 **[×2]**: [StatusDot.tsx:25](../../apps/myk9show/src/components/schedule/StatusDot.tsx) puts `aria-label` on a plain `<div>` (needs `role="img"` or sr-only text) | axe (both audits), workbench-setup | Low |
| A6 | `aria-toggle-field-name` ×3: bulk-select checkboxes on Manage Classes have no label (Base UI `role="checkbox"` spans) | axe | Med |
| A7 | `aria-progressbar-name` ×2 on Show Desk progress bars | axe | Low |
| A8 | **`document-title` missing on the public show page** **[×2]** — the page exhibitors share/bookmark has no `<title>` (bad for tabs, history, screen readers, link previews) | axe (both audits), `show-detail-public` | Med |
| A9 | **[Codex, verified] Shared DataTable makes whole rows `role="button"`** — [data-table/index.tsx:460](../../apps/myk9show/src/components/ui/data-table/index.tsx) adds `role="button" tabIndex=0` to `<TableRow>` whenever `onRowClick` is set, wrapping focusable cell controls (checkboxes, kebabs, links). Codex caught it as `nested-interactive` on `/admin/users` (a route this matrix skipped); the component is shared by dogs/clubs/shows/admin tables, so any consumer passing `onRowClick` plus row controls inherits the violation. Fix in the primitive: row-link semantics or an explicit per-row action instead of button-role on the `<tr>` | Codex axe on /admin/users + source verification | High |
| A10 | **[Codex, verified] Admin users page-size `<select>` has no accessible name** — [UserTable/Pagination.tsx:42](../../apps/myk9show/src/components/admin/users/UserTable/Pagination.tsx) renders a bare `<select>` beside a `<span>Rows</span>` with no label association (axe `select-name`, serious). One-line fix: `aria-label="Rows per page"` | Codex axe on /admin/users + source verification | Med |

---

## Dimension 4 — State & data integrity (caught by the harness; mostly new)

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| S1 | **Cold-cache first paint shows definitive empty/error states instead of loading states.** Fresh browser profile: `/at-show/:showId` renders "This show has no classes yet" (took >20s to populate on the shared dev DB), entry list renders "No Entries Yet", **scoresheet renders "Class not found"** (an error state!), my-entries renders the "You haven't entered any shows yet" welcome. Verified: warm-cache re-test populates all of them. A judge opening a fresh tablet on show morning sees "no classes"/"Class not found" — direct violation of INTENT's offline guardrails ("Never show 'No internet' as an error", calm sync). Pages need a third state: *syncing* ≠ *empty* | verified via 20s-settle + warm-cache re-runs (`*-RETRY.png`, `*-WARM.png` artifacts) | **Critical** |
| S2 | **Entries read query fails with Postgres `statement timeout` → HTTP 500 → raw vendor toast** ("entries: Supabase query failed: canceling statement due to statement timeout") on 7 secretary surfaces during the run. Complements the journey audits' write-path failure (`ringside_update_entry` timeout **[×2 there]**) — the entries *read* path now shows the same class of failure. Possibly the same root cause as the staging OCC/CPU storms. Needs a perf/reliability investigation, not copy polish alone | console capture, 6 pages; toast visible in 16 shots | **Critical** (investigate) |
| S3 | **Same fact, two values, one screen:** Entry Management hero "TOTAL ENTRIES 0" directly above stats card "TOTAL ENTRIES 21" (hero uses the timed-out query, card another source); Reports "Total Entries" flips 0↔21 across captures. Extends journey-audit §C: partial-failure rendering needs a stale/erred treatment, not a confident 0 | `entry-management__*`, `reports__*` | High |
| S4 | **Manage Classes: raw status enums as user-facing chips** (`in_progress`, lowercase `completed`/`upcoming`) *and* summary counters frozen at "Upcoming 0 / In Progress 0 / Complete 0" while the list below shows 1/1/1. Two filter selects render raw lowercase "all". Joins the journey audit's status-vocab drift (C4) as the strongest argument for the shared status-label map | all 6 `manage-classes` shots | High |
| S5 | My-entries count contradictions: stat "ENTRIES 9 · 2 accepted · 7 pending" vs tabs "All 10 / Accepted 1 / Completed 0"; the Scored entry lands in no tab | `my-entries__*__desktop/tablet` | High |
| S6 | Submit-results: "21 entries ready to submit" directly above "21 entries are missing AKC registration numbers"; warning copy leaks the raw XML field name **`akcDogRegnum`** | all 6 shots | Med |
| S7 | Heritage page: journey timeline steps numbered 01–04 render out of chronological order (02 "Entries close Aug 31" after 03/04 "Trial Jul 31–Aug 2"); "21/TBD runs claimed · 0% FULL" (missing denominator renders as TBD + false 0%); raw IANA "America/Chicago"; five bare "TBD"s | `show-detail-public__*` | Med |
| S8 | Armband "0" on every pending ringside entry card (reads as a real armband; unassigned should render "—") **[confirms journey audit F]** | `at-show-entries__*` | Med |
| S9 | Doubled trial label "Trial Saturday Trial" on all three ringside headers + raw ISO date "2026-08-01" confined to the at-show-classes trial header **[confirms journey audit T/F]** — both machine-verified as shared-formatter fixes | 12 ringside shots | Med |
| S10 | Data hygiene visible to users on dev/staging: "E2E Club A/B/C 1782410786153 (automated UI test club, deleted at end of run)" rows in exhibitor-facing Clubs browse; two dogs sharing "Registration #MK9-000056"; refund note renders "(7/19/2026)" numeric-future-date in one row and "(3 days ago)" in another; dog-detail says "No upcoming entries for Willow" while my-entries credits her with 3 upcoming classes | `clubs-browse__*`, `my-entries__*`, `dog-detail__*` | Med |
| S11 | Low polish: orphaned orange sliver wedged under the header on heritage page (all 6 shots); grey box glued to the hero H1's final period; empty "Plan the trip" right cell at desktop; dog-detail result row bare red "1" with no "st" label; scoresheet disabled Save ≈2:1 in light mode | various | Low |

---

## Summary

**Overall UI health: Needs Work** — light mode itself is healthier than feared (the real contrast debt is in *dark* mode), but the matrix surfaced two Criticals invisible to single-viewport, warm-cache walks: sync-race empty states on the show-day surfaces, and an entries read-path that falls over and shouts vendor jargon while doing it.

### Critical

| Finding | Dim | Impact | Effort |
| --- | --- | --- | --- |
| S1 sync-race: definitive empty/error states during cold replication sync (ringside + my-entries) | 4 | Judge/steward panic on show morning; wrong trust signal | Med — expose `isSyncing` from replication layer; gate empty states on it |
| S2 entries read timeouts → 500 + raw toast on 7 secretary surfaces | 4 | Secretary surfaces degrade + leak internals; audit itself was polluted | Med — DB/query investigation + toast copy/dock fix (pairs with journey-audit toast finding) |

### High

| Finding | Dim | Impact | Effort |
| --- | --- | --- | --- |
| T1 dark-mode chip/token contrast cluster (13 pages) | 1 | Status — the app's core signal — unreadable in the default-audited theme | Med — token pass + chip component sweep + extend `success-token.test.ts` pattern |
| A1 153 unlabeled icon buttons (axe-critical on Manage Classes) | 3 | Screen-reader users get "button" ×153 | Med — mechanical sweep, list in hand |
| A2 touch targets: app chrome + ringside 20×20 Actions menu | 3 | INTENT guardrail broken on every page incl. tablet ring surface | Low–Med — fix shared chrome + ringside card |
| A3 sub-14px text app-wide (1,660 sites) | 3 | INTENT floor; retired-demographic readability | Decision + Med |
| R1 home tablet overflow (CTA off-screen) | 2 | Broken first impression on iPad | Low |
| R2 hero title/chip clip at 375 (3 pages) | 2 | Secretary's own show name unreadable | Low — one component |
| R3 Manage Classes mobile CTA off-screen | 2 | Page's primary action unreachable | Low |
| R4 entry-management tablet columns beyond card edge | 2 | Power surface loses columns silently | Med |
| R8 results-control mobile toggles half-clipped | 2 | Settings unusable at 375 | Low |
| T2 heritage page contrast both themes + A8 missing `<title>` | 1/3 | Public/sharable page | Low–Med |
| T3 ringside light-mode contrast ("No Status" chip, 4 axe nodes) | 1 | Outdoor tablet readability | Low |
| A9 shared DataTable row-as-button wraps focusable controls **[Codex]** | 3 | Invalid semantics on every clickable-row table (admin users confirmed; dogs/clubs/shows tables share the primitive) | Med — fix in `data-table/index.tsx` once |
| S3/S4/S5 count contradictions + raw enum chips | 4 | Trust erosion (journey audit's C-family, now with 3 more instances) | Low–Med each; shared status-label map |

### Medium

R5 Armban (all widths), R6 tab-strip clipping (5 surfaces), R7 Copy-Link/Headline overlap, R9 heart/chip overlap, R10–R11 tablet truncations, R13 clubs mobile, R16 toast docking, A4 ArmbandLookup nested-interactive, A6 checkbox names, A8 title, A10 page-size select name **[Codex]**, S6 akcDogRegnum + contradictory ready-count, S7 heritage timeline/TBDs, S8 armband "0", S9 doubled trial label + ISO date, S10 data hygiene, T4–T5 theme details, T7 drift register.

### Low

R12/R14/R15 truncation & nav polish, A5 StatusDot, A7 progressbar names, S11 cosmetic cluster, T6 fixed-light intent annotation.

### Quick wins (high impact, low effort)

1. **Gate empty states on sync status** for at-show pages + my-entries ("Loading your classes…" until first sync completes) — kills all four false-empty screens (S1).
2. **Dock toasts to a safe corner** and swap vendor error text for plain English — one toast component fix (R16 + S2 copy half).
3. **Status-label map** (journey-audit Rec #2) now also closes S4's raw `in_progress` chips and T1's chip sweep entry point.
4. **Min-width + search icon + aria-label on ArmbandLookup** — fixes R5 + A4 + journey-audit "mystery control" in one component.
5. **`<title>` on public show page** (A8) — one line with the show name.
6. **Workbench hero: `min-w-0` + truncate with title attr** — fixes R2 across 3 pages.
7. **Ringside entry-card Actions menu → 44×44** (A2's worst instance) + move heart away from chip (R9).
8. **Home tablet: collapse nav at ≤ md** (`.l-waitlist-btn` band in `landing.css`) — fixes R1 + nav wrap. **[×2]**
9. **`aria-label="Rows per page"` on the admin page-size select** (A10) — one line. **[Codex]**

### Improvement-plan lanes (proposed)

> **Absorbed 2026-07-02:** these lanes were tracked as tasks in [`docs/archive/plan-ux-walk-remediation-2026-07.md`](../archive/plan-ux-walk-remediation-2026-07.md) — lane 1 → Phase 2, lane 2 → 3.G, lane 3 → 3.H, lane 4 → 3.E, lane 5 → 0.G/1.G, lane 6 → 5.D/5.E, lane 7 → Phase 3 testing + 6.B. The plan is now complete and archived.

Sequenced so systemic fixes land before per-page polish (they visually clean up many pages at once):

1. **Lane: shared vocabulary & formatting** *(already Rec #2 of the journey audit — this audit adds 5 more consumers)* — status-label map, shared date formatter, armband placeholder rule.
2. **Lane: dark-token & chip contrast pass** — index.css dark block + chip components, **starting with the dark `--primary`/`--primary-foreground` pair (≈3.1:1) [×2]**; extend the existing `success-token.test.ts` guard pattern to the primary/warning/info/chip-tint tokens (T1, T3–T5). Codex, agreed: fixing the token pair should collapse the majority of dark axe hits at once.
3. **Lane: shared-component responsive & semantics fixes** — workbench hero, ArmbandLookup (truncation + popover-trigger semantics in one pass), landing-page card, tab-strip primitive, table-in-card scroll affordance, toast docking, app-header targets (`AppHeader.tsx`/`NotificationBell.tsx` to ≥44px), **DataTable row-as-button pattern (A9)** (R2–R16, A2, A4, A9).
4. **Lane: a11y label sweep** — 153 icon buttons ([appendix list](2026-07-01-ui-verification-matrix-appendix-icon-buttons.md); prefer `aria-label` over `title`-only), checkboxes, progressbars, StatusDot, page-size select, document titles (A1, A5–A8, A10). Mechanical; suits an unattended sweep.
5. **Lane: replication UX + read-path reliability** — S1 syncing-vs-empty states; S2 root-cause (with the journey audit's `ringside_update_entry` write-path failure — likely one investigation).
6. **Then per-page cosmetic polish via the impeccable playbook** (S7, S11, R12–R15 leftovers), after lanes 1–3 land.
7. **Testing phase (per repo convention; Codex, agreed):** extend `src/styles/__tests__` token-contrast guards to the dark primary/warning/chip tints; add component-level axe tests for `ArmbandLookup`, `StatusDot`, `Pagination`, and the DataTable clickable-row pattern; keep a repeatable slim matrix check (public pages + workbench + admin users, light/dark × 375/768/1280) with a **zero serious/critical axe budget** and a no-sub-44px-chrome assertion — recording pass/fail without committing screenshots.

## Cross-audit consensus (Codex merge, 2026-07-02)

Two independent matrices ran the same brief a day apart (this one: 20 pages, journey-weighted; Codex: 15 routes including 5 this one skipped — `/people`, `/judge/dashboard`, `/admin/dashboard`, `/admin/users`, `/admin/permissions`). The route sets are complementary; together they cover 25 surfaces.

**Independently reproduced [×2]:** home tablet overflow (both measured the identical +106px), dark-mode contrast as a shared-token failure, heritage-page contrast + missing `document-title`, ArmbandLookup `nested-interactive`, StatusDot `aria-prohibited-attr`, sub-44px app-header cluster, and the unlabeled icon-button population (AST sweep here, grep there — overlapping example sets).

**Merged from Codex after source verification:** the dark `--primary`/`--primary-foreground` root cause (T1), the `PopoverTrigger asChild` mechanism + fix for ArmbandLookup (A4), the shared DataTable row-as-button pattern (A9 — Codex saw it on `/admin/users`; the primitive is app-wide), the unlabeled page-size select (A10), `AppHeader`/`NotificationBell` fix sites (A2), the `title`-only labeling nuance (A1), and the testing-phase recommendations (lane 7). Severity note: Codex rated the select-name finding Critical; this doc records it Medium per its rubric (Critical = users cannot complete a core task) — it remains axe-serious and a one-line fix.

**Claude-only (out of Codex's scope, stands as reported):** both Criticals — S1 cold-sync empty/error states (Codex didn't test cold-cache ringside routes) and S2 entries read-path 500s (Codex explicitly did not inspect console/network health) — plus the element-level responsive family (R2–R16: title/CTA/toggle clipping, tab-strip pattern, toast docking; Codex's "responsive mostly good" verdict rests on document-level overflow only, which this audit also found clean), the state/data-integrity family (S3–S11), ringside/tablet INTENT specifics (T3, A2-ringside), and the static theme-drift and text-floor registers (T7, A3).

**Codex-only route results worth carrying:** `/judge/dashboard` and `/secretary/dashboard` were the only fully clean routes in its matrix (no serious/critical axe groups); `/admin/users` is the worst admin surface (`nested-interactive`, `select-name`, contrast); `/people`, `/admin/dashboard`, `/admin/permissions` fail only on the shared contrast tokens — consistent with lane 2 fixing them for free. Codex artifacts: `docs/qa/assets/ui-verification-2026-07-02/` (90 screenshots + matrix JSON, on its branch).

## Artifacts & reproduction

- Screenshots (120 + verification re-runs), axe/check JSONs (40), static-sweep JSONs, and the harness scripts (`playwright.uiaudit.config.ts`, `uiaudit/ui-matrix.spec.ts`, `global-setup.ts`, scanner scripts) are preserved in the session scratchpad: `/private/tmp/claude-501/-Users-richardbeezley-AI-Projects-myk9-platform--claude-worktrees-agitated-babbage-13c523/7819610c-1f9a-43d4-a541-a333cdce1da9/scratchpad/` (`uiaudit/` + `*.json` + `scan-*.mjs`). Copy them out before session cleanup if wanted for the fix PRs.
- Method to re-run: Playwright spec navigates 20 routes as secretary/exhibitor (storageState from the e2e accounts), forces theme via `localStorage.theme` init-script before boot, captures full-page shots at 375/812, 768/1024, 1280/800, runs `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21aa`) at desktop per theme, and evaluates overflow/touch-target/font-floor checks in-page. **Lesson for next run:** warm the replication cache (one throwaway desktop load per context) before capturing, and run against a DB that isn't timing out, or S1/S2-style states will pollute captures.
