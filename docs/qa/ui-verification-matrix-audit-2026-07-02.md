# UI Verification Matrix Audit: myK9Show

**Date:** 2026-07-02
**Auditor:** Codex
**Scope:** 15 key myK9Show routes, focused on the unaudited UI dimensions from the improvement-plan recommendation: light mode, responsive coverage, and accessibility.
**Sources:** Playwright/Chromium screenshots, DOM metrics, axe-core scans, static source grep for icon-only controls, `docs/INTENT.md`, `docs/qa/assets.md`, `docs/qa/e2e-suite-map.md`, `docs/qa/findings.md`.

## Method

The matrix forced theme classes directly (`theme-light` or `dark theme-dark`) instead of relying on the app theme toggle, because the original UX walk reported the toggle would not respond to synthetic clicks.

Artifacts:

- Full JSON: `docs/qa/assets/ui-verification-2026-07-02/matrix-results.json`
- Screenshots: `docs/qa/assets/ui-verification-2026-07-02/screenshots/`
- Screenshot count: 90 (`15 routes x 2 themes x 3 widths`)
- Widths: `375x667`, `768x1024`, `1280x800`
- Axe tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`

Route matrix:

| Route                             | Light | Dark | Overflow     | Serious/Critical axe groups                              |
| --------------------------------- | ----: | ---: | ------------ | -------------------------------------------------------- |
| `/`                               |   3/3 |  3/3 | tablet 106px | none                                                     |
| `/shows`                          |   3/3 |  3/3 | none         | color-contrast                                           |
| `/shows/:showId`                  |   3/3 |  3/3 | none         | color-contrast, document-title                           |
| `/sign-in`                        |   3/3 |  3/3 | none         | color-contrast                                           |
| `/secretary/dashboard`            |   3/3 |  3/3 | none         | none                                                     |
| `/secretary/create-show/wizard`   |   3/3 |  3/3 | none         | color-contrast                                           |
| `/shows/:showId/setup`            |   3/3 |  3/3 | none         | aria-prohibited-attr, nested-interactive, color-contrast |
| `/shows/:showId/entry-management` |   3/3 |  3/3 | none         | color-contrast, nested-interactive                       |
| `/shows/:showId/reports`          |   3/3 |  3/3 | none         | nested-interactive, color-contrast                       |
| `/people`                         |   3/3 |  3/3 | none         | color-contrast                                           |
| `/exhibitor/entries`              |   3/3 |  3/3 | none         | color-contrast                                           |
| `/judge/dashboard`                |   3/3 |  3/3 | none         | none                                                     |
| `/admin/dashboard`                |   3/3 |  3/3 | none         | color-contrast                                           |
| `/admin/users`                    |   3/3 |  3/3 | none         | nested-interactive, select-name, color-contrast          |
| `/admin/permissions`              |   3/3 |  3/3 | none         | color-contrast                                           |

## Pass 1: Mental Model Alignment

**What UI suggests:** Light and dark themes should be equivalent, key pages should remain readable and operable at phone/tablet/desktop widths, and controls with icons should expose clear names and touch targets.

**What it actually does:** Every route rendered in both themes and at all widths, but several shared visual tokens and control primitives fail accessibility or tablet reliability expectations.

| UI Element                    | User Expects                                     | Actually Does                                                                                    | Severity |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------- |
| Dark primary CTAs             | The same contrast confidence as light mode       | `bg-primary text-primary-foreground` fails axe in dark mode on many pages at 3.12:1              | High     |
| Public show landing           | Strong public-facing readability                 | Heritage/headline show detail has many contrast failures and an empty document title             | High     |
| Show workbench armband lookup | A normal searchable input                        | `PopoverTrigger asChild` turns the form into a role=button wrapper with a focusable input inside | High     |
| Admin users table             | Row click plus row controls both work accessibly | Clickable `<tr role="button">` contains focusable controls, causing nested-interactive failures  | High     |
| App header utilities          | Tablet-friendly controls                         | Shared header icon buttons measure 28-36px, below the 44px guardrail                             | Medium   |

**Jargon found:** No new jargon issue was introduced by this pass; the failures are visual/accessibility mechanics.

## Pass 2: Information Architecture

**Current structure:**

- Public discovery: landing, browse shows, show detail, sign-in.
- Secretary operations: dashboard, show wizard, workbench setup, entry management, reports, people.
- Role landings: exhibitor entries, judge dashboard, admin dashboard/users/permissions.

**IA issues:**

| Issue                                                            | Location                                 | Problem                                                          | Recommendation                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Shared app header sizing affects many pages                      | `AppHeader`, `NotificationBell`          | Utility controls are visually compact across authenticated pages | Fix the shared header primitive once; do not patch per page                           |
| Shared table row interaction affects admin users                 | `DataTable` + `UserTable`                | Row-as-button competes with nested checkboxes/actions            | Prefer explicit row action affordance or row link semantics that do not wrap controls |
| Show-shell armband lookup affects multiple show workbench routes | `ArmbandLookup` in show management shell | Popover trigger wraps a form/input as a button                   | Split submit/search form from popover trigger semantics                               |

**Visibility problems:**

- Hidden but should be visible: public show route document title is empty, reducing navigation context for assistive tech/browser history.
- Prominent but should be secondary: no duplication/new-surface issue found. Recommended fixes should tighten shared components, not add pages.

## Pass 3: Affordance Clarity

| Element                          | Looks Like      | Actually Is                                       | Clear? |
| -------------------------------- | --------------- | ------------------------------------------------- | ------ |
| Armband lookup                   | Text input      | Popover trigger role=button containing an input   | No     |
| Admin users row                  | Table row       | Keyboard-focusable button row containing controls | No     |
| Header utility icons             | Compact toolbar | Touch/click targets below 44px                    | Partly |
| Landing waitlist button at 768px | Header CTA      | Off-canvas by 106px                               | No     |

**False affordances:** Clickable table rows with nested controls blur whether users should click the row, the checkbox, or the row actions.

**Hidden affordances:** Static grep found several icon-only button candidates with no accessible name or only `title`, outside the 15-route matrix. Examples: `TrialDetailsPage` previous/next trial buttons, `ClassDetailsPage` menu, `TemplateManagementPage` menu, `ChecklistItem` delete, `EntrySyncStatusBar` retry actions, `PlacementRecalculationAlert`, `ClassDefinitionTable`, some club/details menus.

**Recommended fixes:**

- Add/standardize `aria-label` on icon-only buttons; use labels, not `title` alone.
- Convert the armband lookup trigger so the input is not nested under role=button.
- Rework table row click behavior where rows contain checkbox/action controls.

## Pass 4: Cognitive Load

| Screen/Step             | Decisions Required                                  | Can Be Reduced?                                        |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Public landing at 768px | Header CTA is partially off-screen                  | Yes: wrap/hide/reorder header CTAs at tablet width     |
| Show workbench shell    | Search input behaves like a popover button          | Yes: separate input submit from popover result display |
| Admin users table       | Row click, checkbox, role/actions, page-size select | Yes: avoid row-as-button around controls               |

**Missing defaults:** The admin users page-size `<select>` has visible adjacent text “Rows” but no programmatic label.

**Unnecessary complexity:** Shared dark-mode accent token debt appears on many pages; fixing per page would create churn. Fix at token/component level.

**Cognitive load score:** Medium. Core routes render, but inaccessible controls and low contrast make repeated operational use feel less calm and predictable.

## Pass 5: State Coverage

### Theme Coverage

| State | Implemented? | Quality                | Issue                                                     |
| ----- | ------------ | ---------------------- | --------------------------------------------------------- |
| Light | Yes          | Mixed                  | Public show detail headline/heritage contrast failures    |
| Dark  | Yes          | Poor in shared accents | Primary CTA and status/date accents fail contrast broadly |

### Responsive Coverage

| State  | Implemented? | Quality     | Issue                                                |
| ------ | ------------ | ----------- | ---------------------------------------------------- |
| 375px  | Yes          | Mostly good | Header controls below 44px; contrast failures remain |
| 768px  | Yes          | Mixed       | Landing header waitlist CTA overflows by 106px       |
| 1280px | Yes          | Mostly good | Contrast and a11y semantics still fail               |

### Accessibility Coverage

| State              | Implemented? | Quality | Issue                                                                           |
| ------------------ | ------------ | ------- | ------------------------------------------------------------------------------- |
| Contrast           | Partial      | Poor    | 85 cell-level serious/critical axe hits, mostly shared color patterns           |
| Keyboard semantics | Partial      | Poor    | Nested interactive failures on armband lookup and clickable admin rows          |
| Names/labels       | Partial      | Mixed   | Admin users page-size select is unlabeled; static icon-button candidates remain |
| Touch targets      | Partial      | Mixed   | Shared header controls are below 44px                                           |

**Dead ends found:** None; all 15 routes rendered in all 90 cells.

**Missing error handling:** None in this pass; this audit did not inspect console/network health beyond route render success.

## Pass 6: Flow Integrity

**Primary flow tested:** Mechanical UI verification across representative public, secretary, exhibitor, judge, and admin surfaces in light/dark themes at mobile/tablet/desktop widths.

| Step | Action                                      | Friction                                                                                 | Severity |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| 1    | Force light theme and screenshot all routes | Routes render, but public show detail and admin permissions expose light contrast issues | High     |
| 2    | Force dark theme and screenshot all routes  | Shared primary/action colors fail repeatedly                                             | High     |
| 3    | Resize to 375/768/1280                      | Landing header overflows at 768; shared header targets below 44px                        | Medium   |
| 4    | Run axe-core                                | Serious/critical issues cluster in shared controls/tokens                                | High     |
| 5    | Static grep icon-only controls              | Several unlabeled candidates outside the matrix                                          | Medium   |

**Abandonment risks:**

- Low-contrast CTAs/status labels reduce confidence, especially outdoors/tablet.
- Nested focus controls can trap or confuse keyboard and screen-reader users.

**Recovery gaps:**

- No app-wide title guard caught the empty show-detail document title.
- No route-wide token contrast guard is catching dark primary foreground regressions.

**Flow verdict:** Completable with accessibility and polish friction.

## Summary

**Overall UX health:** Needs Work. The route matrix did not find blank pages or broad responsive collapse, which is good. The main risk is shared-system UI debt: token contrast, accessible semantics, and target sizing.

### Critical

| Finding                                             | Pass | Impact                                          | Effort |
| --------------------------------------------------- | ---- | ----------------------------------------------- | ------ |
| Admin users page-size select has no accessible name | 5    | Screen-reader users cannot identify the control | Low    |

### High Priority

| Finding                                                                                | Pass | Impact                                                                              | Effort |
| -------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- | ------ |
| Dark `bg-primary text-primary-foreground` fails contrast across public/auth pages      | 1, 5 | CTAs and status accents are hard to read in dark mode                               | Medium |
| Public show detail headline/heritage accents fail contrast and document title is empty | 1, 5 | Public visitors lose readability and page identity                                  | Medium |
| Armband lookup creates nested interactive form/button semantics                        | 3, 5 | Keyboard/screen-reader users hit invalid control structure on secretary show routes | Medium |
| Admin users table row-as-button contains focusable descendants                         | 3, 5 | Admin table navigation/actions are semantically invalid                             | Medium |

### Medium Priority

| Finding                                                          | Pass | Impact                                                          | Effort |
| ---------------------------------------------------------------- | ---- | --------------------------------------------------------------- | ------ |
| Landing header waitlist CTA overflows at 768px in both themes    | 3, 5 | Tablet visitors see an off-canvas control                       | Low    |
| App header utility controls are below 44px                       | 3, 5 | Tablet/show-day use is less forgiving                           | Medium |
| Static icon-only button candidates lack names or rely on `title` | 3, 5 | Some non-matrix pages remain exposed to unlabeled control drift | Medium |

### Quick Wins

- `Pagination.tsx`: add `aria-label="Rows per page"` or an explicit label association to the page-size select.
- `LandingHeader` / `landing.css`: hide, wrap, or move `.l-waitlist-btn` earlier for the 768px header band.
- `StatusDot.tsx`: remove `aria-label` from decorative `div` or give it a valid role/text pattern.
- `AppHeader.tsx` + `NotificationBell.tsx`: standardize utility buttons to at least `h-11 w-11` on touch/tablet contexts.

### Improvement Plan Feed

1. Fix shared theme tokens/components first: dark primary contrast, show-detail accent contrast, `text-info`/status patterns. This should reduce the majority of axe findings at once.
2. Fix shared semantics next: armband lookup popover trigger, clickable table row pattern, admin users select label, status dot role/label.
3. Then run the impeccable page-polish pass on the remaining route-level visuals, especially public landing/show detail and admin users.
4. Add a repeatable UI matrix check: at minimum public pages + secretary workbench + admin users in light/dark at 375/768/1280, with axe serious/critical budgeted to zero.

### Testing Phase

- Add focused unit/component tests for token contrast where the repo already has token tests (`src/styles/__tests__`).
- Add axe/component tests for `ArmbandLookup`, `StatusDot`, `Pagination`, and the admin users table row pattern.
- Add a Playwright matrix spec or script that records route/theme/viewport status without committing full screenshots every run.
- Before closing fixes, rerun the 15-route matrix and verify: no navigation failures, no 375/768 overflow, no serious/critical axe violations, and no shared header controls below 44px on tablet-facing authenticated routes.
