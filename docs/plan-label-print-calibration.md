# Label Print Calibration

> **Status:** Active

Preventive hardening of armband/results label printing so misalignment (drift, offset, scaling) never becomes a support call — the secretary can diagnose and fix it self-service.

## Background

Labels render as HTML with exact inch-based CSS (`@page size: letter`, Avery template dimensions in `apps/myk9show/src/lib/labels/labelTemplates.ts`), printed via a hidden iframe. This already eliminates the Access-era driver-dependent failure modes. Residual risks, each with a distinct fix:

| Cause | Symptom | Fix |
| --- | --- | --- |
| Print-dialog scaling ("Fit to page") | Everything shrinks toward center | Guidance + test-sheet ruler |
| Printer origin offset (unprintable area) | Whole page uniformly shifted | New top/left offset nudges |
| Feed accuracy / label-stock tolerance | Drift grows toward bottom of sheet | Existing pitch adjustment |

Known gaps today: pitch adjustment exists but ResultLabelsReport keeps it in unsaved local state (`useState(0)`), there are no top/left offset controls, and nothing helps the secretary diagnose which knob to turn.

## Design

### 1. Shared calibration preferences

Extend `LabelPreferences` (`apps/myk9show/src/hooks/useLabelPreferences.ts`) with `offsetTop` and `offsetLeft` — thousandths of an inch, default 0, clamped to ±30. `ResultLabelsReport` switches from local `useState(0)` pitch to this shared hook, so one calibration covers both armband and results labels. Storage stays per-browser localStorage: calibration is a property of the printer, not the show. Old saved prefs without the new keys hydrate with defaults.

### 2. Offset rendering

`buildLabelStylesheet(template, pitchAdjustment, offsetTop, offsetLeft)` applies offsets by adjusting `@page` margins: top/left grow or shrink by the offset, bottom/right compensate by the opposite amount so the grid geometry is untouched. Pitch continues to adjust `row-gap`. Margins clamp at 0 (relevant for the full-bleed 8387 template).

### 3. Shared LabelCalibrationPanel component

Extract the current Advanced pitch block from `ArmbandLabelsReport` into `LabelCalibrationPanel` used by both reports:

- Three sliders: top offset, left offset (±30/1000"), row pitch (±20/1000"), each with plain-language help text.
- One Reset button clearing all three.
- Static hint: "In your browser's print dialog, set Scale to 100% — never 'Fit to page' or 'Shrink to fit'."
- "Print alignment test" button (below).

### 4. Calibration test sheet

Prints (via the existing iframe path) a plain-paper diagnostic for the currently selected template:

- Corner registration marks at exact page corners.
- A 1-inch reference ruler.
- Label grid outlines with row numbers.
- Printed three-line diagnosis guide: ruler ≠ 1 inch → set Scale to 100%; grid uniformly shifted → adjust top/left offset; rows increasingly off toward the bottom → adjust row pitch.

The secretary holds the printed sheet against a label sheet up to the light. The test sheet renders **with current calibration applied**, so it doubles as the verification loop after adjusting.

## Out of scope

Per-printer named profiles, PDF generation, server/DB changes.

## Implementation phases

### Phase 1 — Preferences + stylesheet

- Add `offsetTop`/`offsetLeft` to `LabelPreferences` with clamping and migration defaults.
- Extend `buildLabelStylesheet` with offset margin math + clamping.
- Tests: stylesheet output across offset/pitch combinations incl. clamps; prefs persistence and hydration of legacy saved values.

### Phase 2 — Shared panel + results-report wiring

- Extract `LabelCalibrationPanel`; wire into `ArmbandLabelsReport` and `ResultLabelsReport`; results report drops local pitch state for shared prefs.
- Tests: panel component test (sliders update prefs, reset clears all); ResultLabelsReport reads shared prefs; existing label tests stay green.

### Phase 3 — Test sheet

- Test-sheet renderer (template-driven marks/ruler/grid/instructions) + print button in the panel.
- Tests: renderer output for each template; calibration values applied to the test sheet.

### Phase 4 — Verification

- `pnpm typecheck`, lint, full label test suite.
- Manual: print preview of test sheet + both label reports for all three templates at 0 and non-zero calibration.
