# date-formatting

## Purpose

Defines the rule that all app-facing (non-public-landing-page) date display in myK9Show renders through a single canonical module, and the documented exception for timezone-bound public landing pages. Introduced by `ux-date-status-consistency` to stop the same date rendering as visibly different strings (e.g. `"Jul 3, 2026"` vs `"7/3/2026"`) across surfaces.
## Requirements
### Requirement: Single date-formatting module for app-facing dates
All app-facing (non-public-landing-page) date display in myK9Show SHALL render through `apps/myk9show/src/lib/format/dates.ts`. Components and utility modules SHALL NOT define a new `formatDate`/`formatDateDisplay`/`formatDateRange`-style function outside that module.

#### Scenario: Same date renders identically across surfaces
- **WHEN** the same trial date is displayed on the secretary Waitlist Management page, the Results Submission page, and any entry-management view
- **THEN** all three render the date using the same format string produced by `lib/format/dates.ts` (e.g. consistently `"Fri, Jul 3, 2026"` style, not a mix of `"Jul 3, 2026"` and `"7/3/2026"`)

#### Scenario: New component needs a date displayed
- **WHEN** a developer adds a new component that needs to display a show, trial, or entry date to a user
- **THEN** the component imports and calls the appropriate function from `lib/format/dates.ts` rather than calling `toLocaleDateString`/`toLocaleString` directly or writing a new local formatter

### Requirement: Documented exception for timezone-bound public landing pages
Per-landing-theme date formatting (`features/{gazette,heritage,magazine,headline,fieldGuide,banner,monogram,poster}/landing/utils/dateFormat.ts`) SHALL be exempt from the single-module requirement because it must render in the show's own timezone regardless of the viewer's locale, which the app-facing canonical module does not support.

#### Scenario: Public landing page renders show-local time
- **WHEN** a public show landing page renders an event date/time
- **THEN** it uses that theme's `formatDateInTimezone`/`formatDateRange` helper, anchored to the show's configured timezone, not the viewer's local timezone or the app-facing canonical module

#### Scenario: A landing-page date helper duplicates non-timezone logic
- **WHEN** an audit finds a per-theme date helper doing something other than timezone-anchored formatting (e.g. a plain, non-timezone-specific reformat that duplicates the app-facing module)
- **THEN** that specific helper is migrated onto the canonical module; the exemption applies only to genuinely timezone-bound formatting, not to every file under a `landing/utils/dateFormat.ts` path

### Requirement: Landing-page dates are anchored to the trial timezone and agree with app surfaces
Per-theme landing-page date helpers SHALL anchor show dates, date ranges, and entries-close dates to the trial's configured IANA timezone (via the canonical trial-timezone accessor). A show's calendar dates SHALL NOT differ between the public landing page and app-facing surfaces (shows list, entry cards) for the same viewer.

#### Scenario: Show date consistent between list and landing
- **WHEN** a show starting Aug 1 (trial-local) is rendered on the shows list and its public landing page
- **THEN** both display Aug 1 as the start date, with no one-day offset from UTC/local conversion

#### Scenario: Entries-close date consistent
- **WHEN** a show's entries close Jun 30 at the trial-local cutoff
- **THEN** the landing page, shows list, and entry cards all present the same close date

### Requirement: Landing venue falls back to the show address
When a landing page's venue field is not set, the landing page SHALL fall back to the show's address record rather than rendering a "TBA" placeholder while other surfaces display the full address.

#### Scenario: Venue unset but address known
- **WHEN** a show has no explicit venue name but has a street address
- **THEN** the landing venue section renders the address (not "TBA")

