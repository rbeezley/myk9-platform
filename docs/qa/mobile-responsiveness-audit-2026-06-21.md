# Mobile Responsiveness Audit: myK9Show Route Sweep

**Date:** 2026-06-21
**Auditor:** Codex
**Viewport:** 375 x 667
**Scope:** 48 myK9Show routes across public, exhibitor, secretary, judge, and admin roles. Club-admin routes were skipped because local club-admin credentials were absent.
**Sources:** `docs/INTENT.md`, `docs/qa/assets.md`, `docs/qa/e2e-suite-map.md`, `docs/qa/findings.md`, route screenshots from a local Playwright sweep, route source files, and manual screenshot review.
**Raw run artifact:** `docs/qa/assets/mobile-2026-06-21/route-summary.json` plus referenced screenshots in the same directory.

## Executive Summary

The account-page fix held: `/account` now renders as a full-width mobile page with a horizontal section rail and no page-level overflow.

The broader sweep found **no console errors, no owned 4xx/5xx network failures, and no critical blank-page failures**. The main mobile debt is concentrated in a few reusable patterns:

| Priority | Pattern                                      | Affected surfaces                                                                                                                             | User impact                                                                                                                                      |
| -------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| High     | Shared show shell/header is desktop-shaped   | `/shows/:showId`, `/shows/:showId/setup`, `/shows/:showId/show-desk`, `/shows/:showId/entry-management`, `/shows/:showId/reports`             | Public visitors and secretaries see overlapping show title/card/tabs; public show detail has 68px horizontal overflow from the countdown ticker. |
| High     | Show creation wizard form stays two-column   | `/secretary/create-show`, `/secretary/create-show/wizard`                                                                                     | Secretaries see squeezed labels, clipped controls, and cramped official picker fields on phone width.                                            |
| High     | Dense tables are clipped instead of adapting | `/people`, `/admin/users`, `/admin/permissions/users`, `/admin/judges/analytics`, `/shows/:showId/entry-management`, `/shows/:showId/reports` | Important columns/actions are cut off or hard to scan; users have no clear mobile table/card affordance.                                         |
| Medium   | Admin page header actions clip               | `/admin/dashboard`, `/admin/templates`, `/admin/permissions`                                                                                  | Primary/secondary actions run off the right edge or are partially hidden.                                                                        |
| Medium   | Admin tab strips overlap                     | `/admin/alerts`, `/admin/sync`, `/admin/performance`                                                                                          | Tabs visually stack over each other; filtering/section selection looks broken.                                                                   |
| Medium   | Browse Shows table toolbar clips             | `/shows`                                                                                                                                      | The toolbar/table controls are partially hidden on the public discovery page.                                                                    |

**Duplication answer:** none of the recommended fixes require new pages. They should tighten existing surfaces by improving shared layout primitives: show shell/header, wizard field grids, table/card responsive variants, action bars, and tab strips.

## Method

1. Started myK9Show locally with `pnpm dev:show`.
2. Signed into seeded local E2E accounts for exhibitor, secretary, judge, and admin.
3. Visited each route at `375x667`.
4. Captured:
   - final URL / redirects
   - body text length
   - page-level horizontal overflow
   - offscreen elements
   - small interactive controls
   - console errors
   - owned network errors
   - screenshots for flagged routes
5. Manually reviewed screenshots for internal clipping that page-level `scrollWidth` cannot catch.

## Route Sweep Summary

| Role      | Routes | Page overflow | Console/network errors | Notes                                                                                                                                          |
| --------- | -----: | ------------: | ---------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Public    |      7 |             1 |                      0 | Show detail overflow; Browse Shows toolbar clipping visible.                                                                                   |
| Exhibitor |     10 |             0 |                      0 | Account, dogs, cart, My Entries are usable; `/exhibitor/dashboard` redirects to `/exhibitor/entries`.                                          |
| Secretary |     13 |             0 |                      0 | Legacy day-of/check-in/run-order/waitlist routes redirect into consolidated workbench surfaces. Workbench shell and wizard need mobile polish. |
| Judge     |      3 |             0 |                      0 | Dashboard/check-in/stats render without obvious mobile overflow.                                                                               |
| Admin     |     15 |             0 |                      0 | Dense tables, action bars, and tab strips need mobile variants.                                                                                |

## Pass 1: Mental Model Alignment

**What UI suggests:** Mobile users should be able to complete the same core show, entry, and admin tasks without needing a desktop viewport.

**What it actually does:** Most card/list pages work, but dense operational pages often preserve desktop table/header assumptions on phones.

| UI Element                  | User Expects                                     | Actually Does                                                                   | Severity |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- | -------- |
| Show detail/workbench shell | Show name, status, and section tabs are readable | Header card overlaps/clips, section nav cuts labels, public countdown overflows | High     |
| Create Show wizard          | One calm field path                              | Two-column controls squeeze labels and values                                   | High     |
| Entry/People/Admin tables   | A mobile-friendly list or clear scroll behavior  | Columns are clipped or partially hidden                                         | High     |
| Admin tabs                  | Distinct selectable filters                      | Labels overlap each other                                                       | Medium   |

**Jargon found:** No new jargon issues found in this mobile sweep. This audit focused on layout and touch usability.

## Pass 2: Information Architecture

**Current structure:**

- Public discovery/show detail: public pages with filters, cards/tables, and show landing detail.
- Exhibitor account/entries/dogs: mostly card/list surfaces.
- Secretary workbench: show shell plus setup/show-desk/entry-management/report content.
- Admin: dashboards, statistics cards, tables, tabbed diagnostic panels.

| Issue                                                  | Location                                                           | Problem                                                                         | Recommendation                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Shared show context consumes too much horizontal space | Show detail and show workbench routes                              | The show card/header/tabs behave like a desktop summary inside a phone viewport | Create a mobile show-shell variant with stacked title, compact status chips, and horizontally scrollable tabs with visible affordance. |
| Data tables remain the dominant mobile IA              | People, Entry Management, Admin Users, Role Users, Judge Analytics | Users must interpret clipped columns rather than task-specific rows             | Prefer card/list rows on `<md`; keep tables for tablet/desktop.                                                                        |
| Header actions compete with page title                 | Admin dashboards/templates/permissions                             | Buttons sit beside headings and clip                                            | Stack actions below the title on mobile or use a compact action menu.                                                                  |

## Pass 3: Affordance Clarity

| Element                   | Looks Like              | Actually Is                         | Clear? |
| ------------------------- | ----------------------- | ----------------------------------- | ------ |
| Clipped table columns     | Missing content         | Horizontally constrained data table | No     |
| Overlapping admin tabs    | Broken text             | Selectable tabs                     | No     |
| Public show countdown     | Full-width ticker       | Countdown, but wider than viewport  | No     |
| Account nav after PR #884 | Horizontal section rail | Section switcher                    | Yes    |

**False affordances:** Some admin tab strips look like static overlapped text when compressed.
**Hidden affordances:** Wide internal tables may be scrollable, but the screenshots do not make that clear.

## Pass 4: Cognitive Load

| Screen/Step                 | Decisions Required                                           | Can Be Reduced?                                                                                                     |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Show creation wizard step 1 | Show identity, dates, fees, payment, club, officials, judges | Yes. Mobile should present one clear field per row; current two-column fields force users to parse squeezed labels. |
| Entry Management mobile     | Review, day-of, filters, stats, bulk/table actions           | Yes. Use mobile cards focused on review/payment/day-of actions instead of exposing every table column.              |
| Admin Users / People        | Search, filters, columns, export, row selection              | Yes. Default to card/list rows on phone and put export/columns in a compact menu.                                   |

**Cognitive load score:** Medium-high for secretary/admin operational pages; low for simple exhibitor pages.

## Pass 5: State Coverage

| Surface             | Empty       | Loading | Success     | Error      | Mobile issue                          |
| ------------------- | ----------- | ------- | ----------- | ---------- | ------------------------------------- |
| Public show detail  | N/A         | Good    | Present     | Not tested | Countdown/header overflow.            |
| Account             | Good        | Good    | Good        | Not tested | No current issue found.               |
| Dogs                | Good        | Good    | Good        | Not tested | No current issue found.               |
| Create Show wizard  | N/A         | Present | Present     | Not tested | Layout makes form state hard to read. |
| People/Admin tables | Present     | Present | Present     | Not tested | Table state is not phone-friendly.    |
| Admin settings      | Placeholder | N/A     | Coming soon | N/A        | Not a mobile bug; parked feature.     |

**Dead ends found:** none from routing alone.
**Missing error handling:** none surfaced in this sweep.

## Pass 6: Flow Integrity

**Primary flow tested:** route arrival and first-screen usability at phone width.

| Step | Action                                  | Friction                                                                       | Severity |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| 1    | Public visitor opens a show detail page | Countdown creates horizontal overflow and the show landing is visually cramped | High     |
| 2    | Secretary opens Create Show             | Step 1 fields are squeezed and labels collide                                  | High     |
| 3    | Secretary opens Entry Management        | Shared show header overlaps and table columns clip                             | High     |
| 4    | Secretary opens People                  | Table view clips email/content; cards should be the phone default              | Medium   |
| 5    | Admin opens users/permissions pages     | Tables and top actions clip                                                    | Medium   |
| 6    | Admin opens monitoring pages            | Tabs overlap                                                                   | Medium   |

**Flow verdict:** Completable with friction. No route was completely broken, but several operational pages look unreliable on phones.

## Prioritized Findings

### Critical

None found in this sweep.

### High Priority

| Finding                                                   | Impact                                                                   | Effort      | Suggested owner                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------- |
| Fix shared show detail/workbench mobile shell             | Improves public first impression and secretary show-day surfaces at once | Medium      | `features/headline`, `ShowDetailsPage`, show workbench/navigation components |
| Make Show Creation Wizard step 1 single-column on phones  | Makes secretary setup usable on mobile                                   | Medium      | `ShowCreationWizardPage`, `ShowDetailsStep`                                  |
| Add a mobile table/card pattern for dense management rows | Helps People, Entry Management, Admin Users, permission users, analytics | Medium-high | shared table/list controls plus affected page modules                        |

### Medium Priority

| Finding                                                   | Impact                            | Effort     | Suggested owner                               |
| --------------------------------------------------------- | --------------------------------- | ---------- | --------------------------------------------- |
| Stack/wrap page header action buttons on mobile           | Prevents clipped primary actions  | Low-medium | admin page headers/action bars                |
| Make admin tab strips horizontally scroll or wrap cleanly | Prevents overlapping filters/tabs | Low-medium | admin monitoring tabs / shared tabs primitive |
| Repair Browse Shows mobile table toolbar                  | Keeps public discovery polished   | Low-medium | `ListControls` / shows browse table toolbar   |

### Low Priority / Notes

- Several small-touch-target warnings were header icons or hidden sidebar internals; do not treat them as confirmed defects without an accessibility-specific pass.
- Legacy secretary routes redirect into consolidated workbench surfaces. That matches the current consolidation direction and should not be undone.
- Club-admin was not covered due to missing local credentials.

## Recommended Fix Order

1. **Show shell/header pass:** fix public show detail and secretary workbench header/tabs together. This is the highest leverage because it affects public conversion and secretary show-day pages.
2. **Secretary wizard pass:** make `ShowDetailsStep` mobile-first with one field per row, full-width selects/date controls, and stacked footer actions.
3. **Mobile management rows:** create or standardize a card/list fallback for dense tables; apply first to People and Entry Management, then admin users/permissions/analytics.
4. **Admin polish pass:** header action wrapping and tab-strip responsiveness.
5. **Browse Shows toolbar:** keep existing public responsive spec but add coverage for toolbar clipping.

## Proof Before Closing

For each remediation PR:

- Run focused unit tests for the touched component/page.
- Run Playwright at `375x667` for each affected route.
- Assert `document.documentElement.scrollWidth <= window.innerWidth` where applicable.
- Add a screenshot/manual check for internal table clipping where page-level overflow is insufficient.
- Keep route-health clean: no console errors, no owned 4xx/5xx, no stuck loading text.
