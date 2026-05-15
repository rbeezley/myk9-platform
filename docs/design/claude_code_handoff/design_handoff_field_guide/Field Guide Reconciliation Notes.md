# Field Guide — Codebase Reconciliation Notes

Companion to `README.md`. Field Guide introduces the **chip system** — the only genuinely new component family this style needs. Otherwise it's the standard four-artifact port using IBM Plex.

This is the final style in the eight-style series. The architecture is now fully exercised; this doc focuses on Field Guide–specific additions plus a closing summary of the cross-style infrastructure.

---

## Where Field Guide files should land

```
apps/myk9show/src/features/field-guide/
  components/
    FieldGuideChip.tsx               ← NEW: the chip primitive (default / orange / cyan variants)
    FieldGuideQuickRef.tsx           ← NEW: 6-cell horizontal quick-reference grid
    FieldGuideDataTable.tsx          ← Alternating-row data table wrapper
    FieldGuideStat.tsx               ← Mini-stat card (label / big number / sub)
    FieldGuideSectionHead.tsx        ← Folio + title + meta head row
    FieldGuideHeading.tsx            ← IBM Plex Sans display
    FieldGuideTopBar.tsx             ← Dark sticky top with ID + nav + CTA
  email/
    buildConfirmationProps.ts
  entry-blank/
    FieldGuideEntryBlankDocument.tsx
    FieldGuideEntryBlankButton.tsx
    buildEntryBlankProps.ts
    sections/
    types.ts
    index.ts
  hooks/
    (reuse shared hooks)
  landing/
    FieldGuideLandingPage.tsx
    useFieldGuideLandingData.ts
    types.ts
    sections/
      TopIdBar.tsx
      QuickRefHero.tsx
      WelcomeSection.tsx
      ParticularsSection.tsx           ← Data table with chip-tagged level/element rows
      FeesSection.tsx                  ← Stat grid
      JudgesSection.tsx                ← Chip-tagged judge cards
      RosterSection.tsx                ← Capacity meter
      ScheduleSection.tsx              ← Timetable
      SiteReferenceSection.tsx         ← LDG/VET/VEN/HSP reference cards
      OfficersSection.tsx
      FinalEntrySection.tsx            ← Dark band with entry card
      FieldGuideFooter.tsx
    utils/
  wizard/
    FieldGuideEntryReceived.tsx
  fonts.ts
  field-guide.css
  index.ts
  tokens.ts

packages/email/src/
  fieldGuideTokens.ts
  templates/FieldGuideConfirmationEmail.tsx
  __tests__/FieldGuideConfirmationEmail.test.ts
```

## Token map

### `apps/myk9show/src/features/field-guide/tokens.ts`

```ts
export const fieldGuideColors = {
  paper: '#f6f1e6',
  paperWarm: '#ebe4cf',
  paperDeep: '#1f2a24',
  ink: '#1f2a24',
  soft: '#3a4339',
  mute: '#6b6e5e',
  hair: '#c4bba0',
  orange: '#c96442',        // primary indicator
  orangeDeep: '#8a3e21',    // links, folios
  cyan: '#3a6e72',          // secondary indicator (HD, 24hr vet)
} as const;

export const fieldGuideSpacing = {
  sectionPaddingY: 64,
  pageGutterX: 32,
  contentMax: 1200,
} as const;

export const fieldGuideTypography = {
  display: "'IBM Plex Sans', system-ui, sans-serif",
  body: "'IBM Plex Sans', system-ui, sans-serif",
  serif: "'IBM Plex Serif', Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const fieldGuideDurations = {
  capacityBarFill: 1100,
  capacityBarDelay: 400,
} as const;
```

### `packages/email/src/fieldGuideTokens.ts`

```ts
export const FG = {
  INK: '#1f2a24',
  PAPER: '#f6f1e6',
  PAPER_WARM: '#ebe4cf',
  PAPER_DEEP: '#1f2a24',
  MUTE: '#6b6e5e',
  HAIR: '#c4bba0',
  ORANGE: '#c96442',
  ORANGE_DEEP: '#8a3e21',
  CYAN: '#3a6e72',
  DISPLAY: "'IBM Plex Sans', Arial, sans-serif",
  BODY: "'IBM Plex Sans', Arial, sans-serif",
  MONO: "'IBM Plex Mono', Courier, monospace",
} as const;
```

The Deno edge function needs a parallel `FG` block.

## Component contracts

### `<FieldGuideChip>`

```tsx
interface FieldGuideChipProps {
  /** Color variant. */
  variant?: 'default' | 'orange' | 'cyan';
  /** Optional leading icon (lucide-react component or string glyph). */
  icon?: React.ReactNode;
  children: React.ReactNode;
}
```

Render as inline-flex span. Used **heavily** — every section will contain several. Accept arbitrary children but expect short uppercase labels ("OPEN", "TRIAL 01·03·05", "$129/NT").

### `<FieldGuideQuickRef>`

```tsx
interface FieldGuideQuickRefCell {
  label: string;            // mono uppercase
  value: React.ReactNode;   // can include orange-emphasis
  emphasis?: 'orange';      // wraps value in orange span
}
interface FieldGuideQuickRefProps {
  cells: FieldGuideQuickRefCell[];  // typically 4–6 cells
}
```

Renders the horizontal grid with border-top/bottom and 1px hairlines between cells. Auto-collapses to 3-col grid below 960px, 2-col below 640px.

### `<FieldGuideDataTable>` and row helpers

```tsx
interface FieldGuideDataTableProps {
  children: React.ReactNode;
}
interface FieldGuideRowProps {
  label: string;            // mono uppercase, left column
  alt?: boolean;            // alternating background
  children: React.ReactNode; // right column content
}
```

Convenience wrapper that handles alternating row backgrounds, mono `<th>` styling, and 1px hairlines. Internally maintains a counter for `alt` if it's not explicitly set per row.

## Wizard completion: prop-interface parity

`FieldGuideEntryReceived` uses the **same** `HeritageEntryReceivedProps` interface, no extensions. The chip system in the mock is decorative; chips are derived from the props (3 RUNS → from `runs.length`; ARMBAND #247 → from a run's armband; CONFIRMED → constant for this component).

## Migration changes required

### 1. `shows.landing_style` constraint

Add `'fieldGuide'` (note: camelCase to match the `PremiumStyle` enum already used in `apps/myk9show/src/types/premium-types.ts`). If previously batched to all 8 values, this is a no-op.

### 2. Email template registration

Add `FieldGuideConfirmationEmail` export. Update send-function switch.

### 3. No new columns

Field Guide is fully expressed in the existing trial schema.

## Tests to mirror

| Heritage test file | Field Guide equivalent |
|---|---|
| — | `FieldGuideChip.test.tsx` (renders default/orange/cyan variants; accepts icon; meaningful children for SR) |
| — | `FieldGuideQuickRef.test.tsx` (renders N cells; orange emphasis applies; responsive collapse) |
| — | `FieldGuideDataTable.test.tsx` (alternating row backgrounds applied; mono labels) |
| `__tests__/HeritageSectionFolio.test.tsx` | `FieldGuideSectionHead.test.tsx` |
| `__tests__/HeritageHeading.test.tsx` | `FieldGuideHeading.test.tsx` |
| `__tests__/landingUtils.test.ts` | `field-guide/landing/__tests__/landingUtils.test.ts` |
| `email/__tests__/HeritageConfirmationEmail.test.ts` | `email/__tests__/FieldGuideConfirmationEmail.test.ts` |
| `wizard/__tests__/HeritageEntryReceived.test.tsx` | `wizard/__tests__/FieldGuideEntryReceived.test.tsx` |

Plus Playwright visual snapshots at 375/768/1280 in `tests/visual-references/field-guide/`.

## Open questions for engineering

1. **Chip data model** — should chips be derived in the view layer (current mock approach) or be a dedicated metadata field on the trial row? My recommendation: derive in view, keep DB clean.
2. **Cyan-vs-orange semantics** — orange is for primary status (open, total, CTA); cyan is for "additional info" (HD master, 24hr vet). Worth a brief style-guide doc for content editors so they don't reach for cyan inappropriately.
3. **IBM Plex Serif loading** — only used in 2 places (welcome paragraph + agreement). Should it be lazy-loaded after first paint, or included in the initial bundle? Recommend lazy-load with serif fallback (`Georgia, serif`); the FOUT is minimal because the affected text is below the fold.
4. **Section anchor IDs use `§` character** — `#§01`, `#§02`. Modern URL fragments handle this but some older share links may strip the `§`. Recommend a redirect helper that maps `#01` → `#§01` for resilience.
5. **Print version** — the entry blank already has a print stylesheet. The landing page does not. Should there be a "Print this field guide" button that generates a paginated PDF? Out of scope for this handoff; flag for future work.

## Cross-style infrastructure summary (final)

With Field Guide complete, the eight-style architecture is fully exercised:

| Architectural concern | Style that introduced it | All-style status |
|---|---|---|
| Per-style `features/<style>/` tree | Heritage | All 8 follow it |
| `<style>Tokens.ts` in `packages/email/src/` | Heritage | All 8 follow it |
| `HeritageEntryReceivedProps` shape | Heritage | All 8 reuse it |
| `shows.landing_style` enum | Heritage migration 192 | All 8 values now |
| Cron `confirmation-emails` (generalized) | Headline reconciliation | Used by all 8 |
| Shared hooks (`useCountdown`, etc.) | Headline reconciliation | Worth extracting if not done |
| Image-asset slot infrastructure | Magazine | Magazine-only; other 7 ignore |
| `shows.brand_color` per-club color | Banner | Banner-only; other 7 ignore |
| Graphic-shape components | Poster | Poster-only |
| Chip system | Field Guide | Field Guide-only |

After Field Guide ships, the platform supports 8 fully distinct visual identities through a single `shows.landing_style` selector. The only style-specific schema additions are Magazine's image columns and Banner's `brand_color`; everything else is rendered from the same trial data.

## Files in the design handoff

| File | Implementation target |
|---|---|
| `Field Guide Landing Page.html` | `features/field-guide/landing/FieldGuideLandingPage.tsx` + sections |
| `Field Guide Entry Blank.html` | `features/field-guide/entry-blank/FieldGuideEntryBlankDocument.tsx` |
| `Field Guide Confirmation Email.html` | `packages/email/src/templates/FieldGuideConfirmationEmail.tsx` |
| `Field Guide Wizard Completion.html` | `features/field-guide/wizard/FieldGuideEntryReceived.tsx` |
| `README.md` | Design system, tokens, chip-system rationale, eight-style series summary |
| `Field Guide Reconciliation Notes.md` | This file — chip-component contracts, final cross-style summary |
