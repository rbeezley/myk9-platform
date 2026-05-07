# Handoff: Premium List Designs (myK9Show)

## Overview

This package contains design references for **8 premium list styles** for the myK9Show "Generate Premium" feature on the Show Details page. A "premium" is the official document a dog show publishes describing the event (judges, classes, fees, schedule, entry methods, etc.) — read primarily by exhibitors deciding whether to enter.

The package includes:

- **3 existing styles** (Monogram, Banner, Headline) — recreated from PDFs the current Generate Premium button produces. These match what's in production today; included as reference so the new ones land in the same system.
- **5 new styles** (Magazine, Poster, Gazette, Field Guide, Heritage) — fresh design directions to add to the picker.

There is also a **print mode toggle ("Ink Saver")** that strips background fills and converts colored accents to black so the document doesn't drink toner when exhibitors print at home.

## About the Design Files

The HTML files in this bundle are **design references**, not production code. They are prototypes built in plain HTML/CSS/React (Babel-transpiled in the browser) so the design is viewable without a build step.

**The task is to recreate these designs in myK9Show's existing codebase** — using its real templating engine (whatever produces PDFs today), its real data model, and its real component library. Lift the visual decisions (typography, color palette, layout structure, spacing) from these files; do not copy the HTML/CSS verbatim.

If the existing Generate Premium feature renders to PDF server-side (e.g., Puppeteer / wkhtmltopdf / a templating engine), the new styles should be added as additional templates in that pipeline.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and layout decisions are made. Recreate pixel-close, not pixel-perfect — match the system, allow small adjustments where the real data forces them.

## Page Format

- **All styles target US Letter (8.5" × 11")** at 96 DPI = **816 × 1056 px per page**.
- Page count varies per style (3–5 pages). Each style is laid out as multiple pages stacked vertically in the prototype.
- Print-friendly. Verified that no page overflows its sheet boundary.

## Sample Data

The prototypes use realistic Scent Work trial data (Bexar County Kennel Club, San Antonio, TX, 2026). The data model the templates consume is shown in `data.js`. In your app, this data will come from the show record. Key fields the templates use:

- Club name, location, date range, AKC license number
- Officers (President, VP, Secretary, Treasurer)
- Trial committee (Chair, Secretary, etc.)
- Judges (name, city, trials assigned, element)
- Classes offered (level, elements, duration, hides)
- Entry fees (first entry, additional, junior)
- Closing date/time, entry limits
- Schedule (time, item)
- Hotels, vet clinic, additional notices
- Narrative fields: welcome from chair, venue description, about the club, awards description, hospitality notes, show hours narrative, trial information narrative

## The 8 Styles

### 01 · Monogram (existing)
Centered TC monogram, large serif title, 4-stat row, two-column info grid. Conservative, currently shipped.

### 02 · Banner (existing)
Black bar across top, left-aligned title, 4-stat row. Conservative, currently shipped.

### 03 · Headline (existing)
Stacked header with double-rule divider, 4-stat row. Conservative, currently shipped.

### 04 · Magazine (new)
Editorial magazine spread. Cover page with large "Spring Scent Work" display serif (Cormorant Garamond), tagline, and an info card / image slot. The image area defaults to an "At a Glance" panel listing trials/elements/levels/sanctioning/field limit; if a club provides a venue photo or crest, it replaces the panel. Inner pages have section headers in Inter Tight, body copy in Source Serif 4, pull quotes, judge cards.

**Image slot behavior:** if the club uploads no image, the "At a Glance" fallback shows. If they upload one, it fills the cover area edge-to-edge.

### 05 · Poster (new)
Bold single-page hero. Archivo Black headline ("SPRING / SCENT / WORK / '26") in red and dark olive on cream. Big graphic accents (red ink-blot circle), monospace meta strip across the bottom, dark "closing" call-out card. Inner pages keep the bold-headline language but pull back to readable body copy. **Most ink-hungry of the 8** — Ink Saver mode is recommended for printing.

### 06 · Gazette (new)
Newspaper broadsheet. Playfair Display masthead with date/edition meta row, multi-column body in Source Serif 4. Front page leads with a feature article ("Bexar County Kennel Club to Hold Spring Scent Work Trial"), photo placeholder, judges strip. Inner pages styled as classifieds (entry methods, lodging, awards, notices).

### 07 · Field Guide (new)
Utility / scannable reference. Cream paper background, sections numbered §01–§07 in IBM Plex Mono, dense data tables and stat grids. Designed to be easy to find a piece of info quickly while at a trial.

### 08 · Heritage (new)
Traditional kennel club / certificate aesthetic. Cream paper, double-line border frame, EB Garamond + Cormorant Garamond, hand-engraved feel. Roman numerals for page count, ornamental rule dividers, Latin-style "By way of Welcome" subheads. Five folios.

## Print Mode (Ink Saver)

A user-facing toggle that swaps the document into a low-toner mode:

- All background fills become white.
- Colored accents (red, brown, gold) become black.
- Borders and rules remain.
- Typography is unchanged.

Implementation in the prototype: a `body.ink-saver` class toggled by a Tweaks panel; CSS in `styles/ink-saver.css` provides per-style overrides.

In your app, this should be a checkbox on the Generate Premium dialog — **"Print-friendly (saves ink)"** — that selects the ink-saver variant when generating the PDF.

## Layout Tokens

```
Page width:        816 px (8.5")
Page height:       1056 px (11")
Page margin:       varies by style — typically 56px / 64px

Common typography stacks used across styles:
  Display serif:   "Cormorant Garamond", "EB Garamond", "Playfair Display", "Lora"
  Display sans:    "Inter Tight", "Archivo Black"
  Body serif:      "Source Serif 4", "Lora", "EB Garamond"
  Body sans:       "Inter"
  Mono / labels:   "IBM Plex Mono"

Color accents (per-style):
  04 Magazine:     warm gold gradient #c9a87c → #4a3826, dark text #1a1a1a
  05 Poster:       cream #f3ede0, red #c83b1a, dark olive #1f1d18
  06 Gazette:      ivory #f7f1e3, sepia text #2a2520, accents #6b4f3a
  07 Field Guide:  parchment #f6f1e6, ink #1f2a24, indicator orange #c96442
  08 Heritage:     ivory #f4ecd8, ink #29200f, gold #b08948, oxblood #7a1f1f
```

## State / Data Requirements

The premium templates are **read-only views over the show record**. No state management needed at the template level. The host page (Show Details) needs:

1. A way to select which of the 8 styles to use (style picker — dropdown, radio, or a visual chooser).
2. A toggle for Ink Saver mode.
3. (Optional) An image upload field for the Magazine style's cover image — see "Image Handling" below.
4. Pass the chosen style + data + ink-saver flag to the PDF renderer.

## Image Handling (Magazine cover)

The Magazine style has an optional cover image area. Design decision still open — three viable approaches:

- **A.** Add a dedicated "Premium cover image" field on Show Details. Used by Magazine; ignored by other styles.
- **B.** Pull from existing show fields (club logo, venue photo, hero image) automatically.
- **C.** Don't ship an upload; rely on the "At a Glance" fallback panel.

Whichever path is chosen, the Magazine template must gracefully handle the no-image case by rendering the fallback panel (already designed).

## Files in This Bundle

```
design/
├── Premium Designs.html         Top-level entry — loads all 8 styles on a canvas
├── data.js                      Sample data model the templates render against
├── design-canvas.jsx            Canvas wrapper (presentation only — not part of production)
├── tweaks-panel.jsx             Tweaks panel (prototype only — Ink Saver toggle UI)
├── image-slot.js                Image slot web component (prototype only)
└── styles/
    ├── shared.css               Sheet sizing, common print rules
    ├── ink-saver.css            Per-style overrides for ink-saver mode
    ├── styles-existing.css      Styles 01–03 CSS
    ├── styles-existing.jsx      Styles 01–03 React components
    ├── style-4-editorial.css    Style 04 Magazine
    ├── style-4-editorial.jsx
    ├── style-5-poster.css       Style 05 Poster
    ├── style-5-poster.jsx
    ├── style-6-newspaper.css    Style 06 Gazette
    ├── style-6-newspaper.jsx
    ├── style-7-field.css        Style 07 Field Guide
    ├── style-7-field.jsx
    ├── style-8-traditional.css  Style 08 Heritage
    └── style-8-traditional.jsx
```

To view the prototype locally: open `Premium Designs.html` in a browser. All 8 styles render side-by-side on a pannable canvas.

## Implementation Notes for the Developer / Claude Code

1. **Don't copy the prototype's React+Babel runtime.** It's just a viewer. Recreate the templates in whatever your PDF pipeline already uses.
2. **Lock the page size to Letter** at the PDF renderer (most engines have a `format: 'Letter'` or equivalent option). Don't rely on pixel-exact 816×1056 — let the renderer handle DPI.
3. **Web fonts:** the styles use Google Fonts (Cormorant Garamond, EB Garamond, Playfair Display, Lora, Inter, Inter Tight, Archivo Black, IBM Plex Mono, IBM Plex Sans, Source Serif 4). Make sure these are accessible to your PDF renderer — either bundle them with the templates, or self-host.
4. **Ink Saver = a CSS class toggle.** No layout changes. The whole feature is a `body.ink-saver` class plus the per-style overrides in `ink-saver.css`. Treat it as a stylesheet variant, not a separate template.
5. **Pagination:** every style is hand-paginated (each `.sheet` is one page). When real data has more entries than the prototype assumes (e.g., 50 judges instead of 3), you'll need either dynamic overflow handling or to design "continuation pages." Worth a conversation before implementing.
6. **The image-slot in Magazine is prototype-only.** In production, replace with a normal `<img>` that falls back to the "At a Glance" panel when the image source is null/empty.
7. **Speaker notes / Tweaks panel / image-slot.js are prototype scaffolding.** Don't ship them.

## Open Questions

- Which framework will host the templates? (React-PDF, server-rendered HTML → Puppeteer, native PDF library, etc.)
- Where does the style picker live — Show Details page, Generate Premium modal, both?
- Default style? (Currently styles 01–03 are shipping; suggest keeping one as default and offering the other 7.)
- How is the "Premium cover image" handled (A/B/C above)?
- Pagination strategy for shows with very long data (many judges, many classes, many notices).
