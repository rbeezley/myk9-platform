# Avery Label Printing — Design Document

**Date:** 2026-04-08
**Status:** Approved

## Overview

Build a reusable label layout engine for myK9Show that renders print-ready Avery label sheets. First use case: armband labels for trial secretaries. The engine is designed so result labels (Phase 2) and future label types are just a new content renderer + registry entry.

## Architecture

Three layers:

### 1. Template Definitions

Pure data config mapping Avery product numbers to physical specs:

| Avery # | Dimensions | Grid | Labels/Sheet |
|---------|-----------|------|-------------|
| 18262 | 1.333" x 4" | 2 x 7 | 14 |
| 18163 | 2" x 4" | 2 x 5 | 10 |
| 8387 | 4.25" x 5.5" | 2 x 2 | 4 |

Each template defines: width, height, columns, rows, page margins, and gap between labels. Adding a new size is one config object.

### 2. Label Layout Engine

Takes a template + array of label content + skip count. Produces a grid of positioned labels with:

- Items mapped to grid positions, skipping the first N cells (for partially used sheets)
- Page breaks when a sheet fills up
- Empty cells rendered as blank (not missing) to keep the CSS grid aligned

### 3. Label Content Renderers

Separate React components for each label type. Each receives one item's data and the label dimensions, returns the visual content for a single cell. The layout engine is agnostic to what's inside each cell.

## Armband Label Content

Layout based on the existing Access application, with improvements:

```
+------------------------------------+
|                                    |
|  101          STORM                |
|              Jane Smith            |
|                                    |
|  6/11/2025     myK9Q: ABCD-1234   |
|                WiFi: VenueNet/pass |
+------------------------------------+
```

- **Top zone** (identity): Armband number (dominant, auto-scaled to fill available space), call name, handler name
- **Bottom zone** (action items): Trial date, myK9Q passcode, venue WiFi

The armband number auto-scales — fewer content options checked means a bigger number. The number is always the largest element regardless of configuration.

### Configurable Content Fields

- Dog's Call Name (default: checked)
- Trial Date (default: checked)
- Handler's Name
- Club Logo (disabled until clubs can upload logos — "coming soon")
- myK9Q Access Code (default: checked)
- Venue WiFi (disabled with "(not configured)" if show has no WiFi info)

### Entry Filters

- **Early Entries** (default: checked) — entries where `is_day_of_show = false`
- **Day of Show Entries** (default: checked) — entries where `is_day_of_show = true`
- **Specific Armband Number** — text input for single replacement label

All three can be combined.

### Skip Labels

"Labels to skip on first page" — integer input, default 0. For partially used sheets. Skipped positions render as blank cells.

### Vertical Pitch Adjustment

Collapsible "Advanced" section with a slider that adjusts the vertical row gap in thousandths of an inch (-20 to +20). Compensates for printer-specific alignment drift where labels shift out of position toward the bottom of the sheet. Saved to localStorage per browser — secretary tunes it once per printer.

### Preferences Persistence

Secretary's last-used label size, content selections, skip count, and pitch adjustment saved to localStorage. Pre-loaded on next visit.

## Report Integration

Registered in the existing report registry as a report with `scopes: ['show']`. Secretary accesses it from the Reports page like any other report.

Instead of extending ReportControlsBar with label-specific controls, the label report renders its own **inline config panel** above the label preview. The secretary sees configuration and resulting labels together in one view.

The existing Print button in the controls bar triggers printing via `printIframe()`.

## UI Flow

1. Secretary navigates to Reports page
2. Selects a show
3. Picks "Armband Labels" from report dropdown
4. Inline config panel appears with label size, entry filter, content checkboxes, skip count
5. Live preview updates below as options change
6. Secretary clicks Print

## Database Migrations

### Shows table — WiFi fields

```sql
ALTER TABLE shows ADD COLUMN venue_wifi_network text;
ALTER TABLE shows ADD COLUMN venue_wifi_password text;
```

Secretary fills these in on the show settings page. If blank, the WiFi checkbox on the label config is disabled.

### Entries table — Day-of-show flag

```sql
ALTER TABLE entries ADD COLUMN is_day_of_show boolean DEFAULT false;
```

Day-of-show entries are always secretary-created after the closing date. Exhibitors cannot self-register as day-of-show. When the secretary adds an entry after closing, the UI defaults this flag to true.

## Scope

### In scope

- Label layout engine (template definitions, grid positioning, skip logic, page breaks)
- Armband label content renderer with configurable fields
- Inline config panel (label size, entry filter, content checkboxes, skip count)
- Report registry entry for "Armband Labels"
- Migration: `venue_wifi_network`, `venue_wifi_password` on shows; `is_day_of_show` on entries
- WiFi input fields on show settings page
- localStorage for label preferences

### Out of scope (future work)

- **Result labels** — Phase 2, reuses the engine with a new renderer. Layout is receipt-style with armband #, call name, date, trial, handler, club, judge, element, result, max time, faults, placement, search time.
- **Scoresheet labels** — Phase 2, reuses the engine with a new renderer. Armband #, call name, class, blank areas for judge scoring.
- **Custom label size input** — secretary enters own dimensions
- **Secretary entry management UI for day-of-show entries** — the column exists, UI for adding entries is a separate feature
- **Club logo upload/management** — checkbox present but disabled until clubs can upload logos

## Reference Screenshots

Access application screenshots in `docs/mySWT/`:
- `armband_labels.png` — dialog and Access UI
- `armband_labels2.png` — 18262 labels with number + call name + date
- `armband_labels3.png` — labels with handler info
- `armband_labels4.png` — labels with fewer options
- `result_labels.png` — Phase 2 reference for result label layout
