# Monogram — Codebase Reconciliation Notes

Companion to `README.md`. Written after reading the shipped Heritage and Headline implementations in `myk9-platform/`. Use this when porting Monogram from design to code so the implementation drops into the existing slots cleanly.

---

## Where Monogram files should land

Mirror the `features/heritage/` and `features/headline/` trees exactly:

```
apps/myk9show/src/features/monogram/
  components/
    MonogramEmboss.tsx                ← NEW: the signature element (letters with letterpress emboss)
    MonogramSectionFolio.tsx          ← lowercase-roman folio (i, ii, iii...)
    MonogramHeading.tsx               ← Bodoni Moda display
    MonogramJudgeCard.tsx             ← Reusable across landing
  email/
    buildConfirmationProps.ts
  entry-blank/
    MonogramEntryBlankDocument.tsx
    MonogramEntryBlankButton.tsx
    buildEntryBlankProps.ts
    sections/
    types.ts
    index.ts
  hooks/
    (reuse shared hooks from features/_shared/hooks/ if extracted)
  landing/
    MonogramLandingPage.tsx
    useMonogramLandingData.ts
    types.ts
    sections/
      StickyNav.tsx
      HeroBlock.tsx
      WelcomeSection.tsx
      ParticularsSection.tsx
      JudgesSection.tsx
      RosterSection.tsx
      PlanSection.tsx
      OfficersSection.tsx
      FinalCtaBand.tsx
      MonogramFooter.tsx
    utils/
  wizard/
    MonogramEntryReceived.tsx
  fonts.ts
  monogram.css
  index.ts
  tokens.ts

packages/email/src/
  monogramTokens.ts                   ← parallel to heritageTokens.ts, headlineTokens.ts
  templates/MonogramConfirmationEmail.tsx
  __tests__/MonogramConfirmationEmail.test.ts
```

## Reuse what already exists

The Monogram style is **already partially scaffolded** in the codebase:

- `apps/myk9show/src/features/premium/pdf/pdfStyles.ts` exports `buildMonogram(name)` — turns "Bexar County Kennel Club" → "BC". **Use this verbatim** in the new `MonogramEmboss` component.
- `apps/myk9show/src/features/premium/pdf/pdfTokens.ts` exports `MONOGRAM_TOKENS` for the PDF cover. The web/email/wizard tokens should align numerically:
  - PDF Monogram paper tone → web `--mg-paper`
  - PDF Monogram ink → web `--mg-ink`
  - PDF Monogram accent → web `--mg-bronze`

  If the PDF tokens differ from the web tokens in this handoff, treat the **handoff values as the new source of truth** and update the PDF tokens to match. The PDF cover predates the polished visual system.
- `apps/myk9show/src/features/premium/pdf/covers/CenteredCover.tsx` and `TopblockCover.tsx` already use the monogram as a wax seal / corner stamp. Keep those covers; this work is the *landing/email/blank/wizard* extension of the same visual system.

## Token map

### `apps/myk9show/src/features/monogram/tokens.ts`

```ts
export const monogramColors = {
  paper: '#f3eee4',
  paperDeep: '#ece5d4',
  ink: '#1c1815',
  soft: '#3a342c',
  mute: '#7a6f5e',
  quill: '#5a4f3e',
  bronze: '#8a6938',      // primary accent
  leaf: '#c9a14b',        // accent-on-dark
} as const;

export const monogramSpacing = {
  sectionPaddingY: 80,
  pageGutterX: 56,
  contentMax: 1200,
} as const;

export const monogramTypography = {
  monogram: "'Italiana', 'Bodoni Moda', serif",  // initials only
  display: "'Bodoni Moda', 'Didot', Georgia, serif",
  body: "'Crimson Pro', Georgia, serif",
} as const;

export const monogramDurations = {
  embossFadeIn: 1600,
  heroChildFade: 900,
  heroStagger: 200,
  capacityBarFill: 2000,
  sectionHeadReveal: 720,
} as const;

export const monogramFolios = ['i','ii','iii','iv','v','vi','vii','viii'] as const;
```

### `packages/email/src/monogramTokens.ts`

```ts
export const MG = {
  INK: '#1c1815',
  PAPER: '#f3eee4',
  PAPER_DEEP: '#ece5d4',
  BRONZE: '#8a6938',
  QUILL: '#5a4f3e',
  MUTE: '#7a6f5e',
  MONOGRAM: "'Italiana', 'Bodoni Moda', serif",
  DISPLAY: "'Bodoni Moda', Georgia, serif",
  BODY: "'Crimson Pro', Georgia, serif",
} as const;
```

The Deno edge function in `supabase/functions/send-confirmation-email/index.ts` needs a parallel `MG` block (Deno cannot import from workspace packages, per the existing Heritage pattern).

## The `MonogramEmboss` component

This is the only genuinely new primitive — Heritage and Headline don't have anything analogous. Spec:

```tsx
interface MonogramEmbossProps {
  /** Pre-computed initials (from buildMonogram). 1-3 chars. */
  letters: string;
  /** Font size in px. Common values: 32, 64, 96, 280, 580, 640. */
  size: number;
  /** "embossed" (gradient + shadows) or "solid" (single color). */
  variant?: 'embossed' | 'solid';
  /** Color for solid variant. Defaults to monogramColors.ink. */
  solidColor?: string;
  /** Embossed background — "paper" (default) or "dark" (for dark bands). */
  surface?: 'paper' | 'dark';
  /** ARIA. Defaults to aria-hidden=true (decorative). */
  ariaHidden?: boolean;
}
```

Implementation lives in `apps/myk9show/src/features/monogram/components/MonogramEmboss.tsx`. The technique:

```tsx
const EMBOSS_PAPER: React.CSSProperties = {
  color: 'transparent',
  background: 'linear-gradient(180deg, #ece5d4 0%, #f3eee4 50%, #d8cfb8 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  textShadow: [
    '1px 1px 0 rgba(255, 252, 240, 0.95)',
    '-1px -1px 0 rgba(28, 24, 21, 0.18)',
    '2px 2px 4px rgba(28, 24, 21, 0.12)',
    '-2px -2px 4px rgba(255, 252, 240, 0.55)',
  ].join(', '),
  filter: 'drop-shadow(0 2px 1px rgba(28, 24, 21, 0.08))',
};

const EMBOSS_DARK: React.CSSProperties = {
  color: 'transparent',
  background: 'linear-gradient(180deg, #2a241e 0%, #1c1815 50%, #0f0c09 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  textShadow: [
    '1px 1px 0 rgba(255, 252, 240, 0.04)',
    '-1px -1px 0 rgba(0, 0, 0, 0.6)',
  ].join(', '),
};
```

**Important for the email template:** Outlook strips `background-clip: text` and falls back to solid color. The `MonogramConfirmationEmail.tsx` template should render the monogram as **solid ink** (`color: monogramColors.ink`) — *not* embossed. The Monogram email mock in this handoff already does this. The emboss effect is web-only.

## Wizard completion: prop-interface parity

`MonogramEntryReceived.tsx` consumes the **same** `HeritageEntryReceivedProps` interface (rename to `MonogramEntryReceivedProps`, but keep the shape identical):

```ts
export interface MonogramEntryReceivedProps {
  showName: string;
  clubName: string;
  dateRange: string;
  dogRegisteredName: string;
  dogCallName: string | null;
  classSummary: string;
  totalFeesFormatted: string;
  registrationNumber: string | null;
  confirmationDateLabel: string | null;
  onPrintEntryBlank?: (() => void) | undefined;
}
```

Plus one extension:

```ts
  /** Pre-computed initials for the header. Pass buildMonogram(clubName). */
  monogramLetters?: string;
```

If `monogramLetters` is absent, derive it inline with `buildMonogram(clubName)`. Don't make callers pre-compute it just to render the standard wizard step.

| Prop | Where it shows in mock |
|---|---|
| `monogramLetters` | "BC" embossed centerpiece at top |
| `clubName` | "Bexar County Kennel Club" italic Bodoni under monogram |
| `showName` + `dateRange` | "Spring Scent Work Trial · Jun 12–14, 2026" small-caps |
| `dogRegisteredName` | Big Bodoni name |
| `dogCallName` | `called "Pointe"` italic line |
| `classSummary` | "3 runs · Excellent Containers..." |
| `totalFeesFormatted` | "$69.00" bronze display number |
| `registrationNumber` | "Receipt № 2026-0137" label-side |
| `confirmationDateLabel` | "Jun 6, 2026" inline in caption |
| `onPrintEntryBlank` | Wires to primary CTA; disables when undefined |

## Migration changes required for Monogram

### 1. `shows.landing_style` check constraint

Migration 192 currently has:
```sql
check (landing_style in ('default', 'heritage'))
```

Headline already required expanding this. After Heritage + Headline shipped, the column should accept:
```sql
check (landing_style in ('default', 'heritage', 'headline', 'monogram'))
```

If the Headline implementation took **Option B from the Headline reconciliation notes** (allow all 8 up-front), this migration is a no-op. Otherwise, add `'monogram'` now.

### 2. Email template registration

`packages/email/src/index.ts` should now export:
```ts
export { HeritageConfirmationEmail } from './templates/HeritageConfirmationEmail';
export { HeadlineConfirmationEmail } from './templates/HeadlineConfirmationEmail';
export { MonogramConfirmationEmail } from './templates/MonogramConfirmationEmail';
```

The send function in `supabase/functions/send-confirmation-email/` picks one by `show.landing_style`. If a switch statement already exists for Heritage + Headline, add the `'monogram'` case.

### 3. No cron change required

Monogram reuses the same `confirmation-emails` cron job (already generalized for Headline per the Headline reconciliation notes). If that generalization hasn't happened yet, do it now — adding a parallel `monogram-confirmation-emails` cron would be the third copy of the same scheduler.

## Tests to mirror

| Heritage test file | Monogram equivalent |
|---|---|
| `__tests__/HeritageOrnamentRule.test.tsx` | `MonogramEmboss.test.tsx` (covers paper + dark variants, ARIA, missing-letters fallback) |
| `__tests__/HeritageSectionFolio.test.tsx` | `MonogramSectionFolio.test.tsx` |
| `__tests__/HeritageHeading.test.tsx` | `MonogramHeading.test.tsx` |
| `__tests__/HeritageEngravedFrame.test.tsx` | (skip — Monogram has no framed equivalent) |
| `__tests__/landingUtils.test.ts` | `monogram/landing/__tests__/landingUtils.test.ts` |
| `email/__tests__/HeritageConfirmationEmail.test.ts` | `email/__tests__/MonogramConfirmationEmail.test.ts` (snapshot HTML, lint inline styles, **assert no background-clip in output** — email-safe check) |
| `wizard/__tests__/HeritageEntryReceived.test.tsx` | `wizard/__tests__/MonogramEntryReceived.test.tsx` |

Plus Playwright visual snapshots at 375/768/1280 in `tests/visual-references/monogram/`.

One additional test specific to Monogram:

```ts
// MonogramEmboss.test.tsx
it('falls back to solid color when CSS background-clip:text is unsupported', () => {
  // Render with browser/JSDOM that lacks WebkitBackgroundClip support
  // Assert the component still renders the letters with non-transparent color
});
```

## Open questions for engineering

1. **PDF token alignment** — the existing `MONOGRAM_TOKENS` in `pdfTokens.ts` was set when Monogram was the unstyled "classic" default. Should I propose updated values to match the new web tokens, and ship those as a PDF-cover refresh in the same PR? Or keep PDF and web tokens separate for now?
2. **`buildMonogram()` edge cases** — what does it return for clubs like "Kennel Club of Atlanta"? "K"? "KCA"? "KC"? The visual system assumes **2 letters**. A fallback (`buildMonogram` returning 1 or 3 chars) needs a max-3 cap in the component or the layout breaks.
3. **Print color management** — the embossed monogram bleed on the entry blank renders fine in Chrome's "Save as PDF" but may produce a heavy ink coverage on physical printers (the gradient becomes solid mid-tone). Should the entry-blank embossed bleed be removed in print media query, or kept?
4. **Hero monogram on narrow screens** — at <600px the 640px hero monogram becomes a 320px hero monogram, which still bleeds past the viewport. Is that acceptable (intentional crop) or should it scale to fit?
5. **Italiana licensing** — Italiana is on Google Fonts (OFL), so safe. But if the platform ever self-hosts fonts, confirm OFL re-distribution rules. (Heritage and Headline fonts are also OFL — same applies.)

## Files in the design handoff

| File | Implementation target |
|---|---|
| `Monogram Landing Page.html` | `features/monogram/landing/MonogramLandingPage.tsx` + sections |
| `Monogram Entry Blank.html` | `features/monogram/entry-blank/MonogramEntryBlankDocument.tsx` (@react-pdf) |
| `Monogram Confirmation Email.html` | `packages/email/src/templates/MonogramConfirmationEmail.tsx` (React Email) |
| `Monogram Wizard Completion.html` | `features/monogram/wizard/MonogramEntryReceived.tsx` |
| `README.md` | Design system, tokens, motion vocabulary, emboss technique |
| `Monogram Reconciliation Notes.md` | This file — codebase mapping |
