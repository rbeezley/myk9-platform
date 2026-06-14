# Banner — Codebase Reconciliation Notes

Companion to `README.md`. Written against the shipped Heritage, Headline, and Monogram implementations in `myk9-platform/`. Use this when porting Banner from design to code.

---

## Where Banner files should land

Mirror the established pattern:

```
apps/myk9show/src/features/banner/
  components/
    BannerFlagBar.tsx                ← NEW: the signature element (top + bottom flag bars)
    BannerSectionFolio.tsx           ← "01 / WELCOME" format, configurable accent color
    BannerHeading.tsx                ← Inter Tight 800/900 display
    BannerStepRow.tsx                ← Timeline row with done/active/upcoming variants
  email/
    buildConfirmationProps.ts
  entry-blank/
    BannerEntryBlankDocument.tsx
    BannerEntryBlankButton.tsx
    buildEntryBlankProps.ts
    sections/
    types.ts
    index.ts
  hooks/
    (reuse shared hooks from features/_shared/hooks/ if extracted)
  landing/
    BannerLandingPage.tsx
    useBannerLandingData.ts
    types.ts
    sections/
      FlagMasthead.tsx
      StickySubBar.tsx
      WelcomeSection.tsx
      ParticularsSection.tsx
      JudgesSection.tsx
      RosterSection.tsx
      PlanSection.tsx
      OnTheDaySection.tsx
      OfficersSection.tsx
      FinalFlagBand.tsx
      BannerFooter.tsx
    utils/
  wizard/
    BannerEntryReceived.tsx
  fonts.ts
  banner.css
  index.ts
  tokens.ts

packages/email/src/
  bannerTokens.ts
  templates/BannerConfirmationEmail.tsx
  __tests__/BannerConfirmationEmail.test.ts
```

## Token map

### `apps/myk9show/src/features/banner/tokens.ts`

```ts
export const bannerColors = {
  paper: '#fafaf8',
  paperWarm: '#f0eeea',
  ink: '#111111',
  soft: '#2a2a2a',
  mute: '#6b6b6b',
  hair: '#d8d8d4',
  flag: '#0d4d4f',          // PER-CLUB CONFIGURABLE — see "Per-club flag color" below
  flagDeep: '#093234',
  flagBright: '#1a7679',
  warn: '#d97742',          // single accent — status-dot only
} as const;

export const bannerSpacing = {
  sectionPaddingY: 96,
  pageGutterX: 64,
  contentMax: 1280,
  flagPaddingY: 56,
} as const;

export const bannerTypography = {
  display: "'Inter Tight', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
} as const;

export const bannerDurations = {
  mastheadStagger: 120,
  mastheadFade: 600,
  capacityBarFill: 1200,
  capacityBarDelay: 600,
  statusDotPulse: 2400,
} as const;
```

### `packages/email/src/bannerTokens.ts`

```ts
export const BN = {
  INK: '#111',
  PAPER: '#fafaf8',
  FLAG: '#0d4d4f',
  MUTE: '#6b6b6b',
  HAIR: '#d8d8d4',
  DISPLAY: "'Inter Tight', Arial, sans-serif",
  BODY: "'Inter', Arial, sans-serif",
} as const;
```

The Deno edge function in `supabase/functions/send-confirmation-email/index.ts` needs a parallel `BN` block (existing pattern from Heritage / Headline / Monogram).

## Per-club flag color

Banner is the first style where the **primary accent is meant to vary per club**. Suggested mechanism:

1. Add a `shows.brand_color` column (`text not null default '#0d4d4f'`).
2. `BannerLandingPage` reads `show.brand_color` and overrides `--bn-flag` via inline style on the root:
   ```tsx
   <div data-banner style={{ '--bn-flag': show.brand_color ?? '#0d4d4f' } as React.CSSProperties}>
   ```
3. Compute `--bn-flag-deep` and `--bn-flag-bright` from `--bn-flag` at runtime, or store all three on the row, or use CSS `color-mix(in oklch, var(--bn-flag) X%, black)` if browser support is acceptable.
4. **Luminance fallback**: if the supplied color is too light (e.g., L > 0.7 in OKLCH), swap the masthead text from white to `--bn-ink`. Heritage's `useHeritageLandingData` should be the parallel for the runtime logic. Add `useBannerBrandColor(show)` that returns `{ flag, flagDeep, flagBright, textOnFlag }`.

This is the **main architectural extension** Banner introduces that Heritage / Headline / Monogram did not need. The reconciliation work is non-trivial — schema migration, runtime hook, ContrastSwap helper, type updates — and worth scoping as its own ticket before the Banner visual work.

## Wizard completion: prop-interface parity

`BannerEntryReceived.tsx` consumes the **same** `HeritageEntryReceivedProps` interface (rename to `BannerEntryReceivedProps`, keep shape identical), plus:

```ts
  /** Per-club flag color override. Falls back to bannerColors.flag. */
  brandColor?: string;
```

| Prop | Where it shows in mock |
|---|---|
| `brandColor` (or default flag) | Masthead background |
| `clubName` | "BCKC" in byline |
| `showName` + `dateRange` | "Spring Scent Work · BCKC · Jun 12–14, 2026" byline |
| `dogRegisteredName` | Big Inter Tight 800 name |
| `dogCallName` | `"Pointe" · ...` mono-feel uppercase tracked |
| `classSummary` | "3 runs · Excellent Containers..." |
| `totalFeesFormatted` | "$69.00" big flag-colored display |
| `registrationNumber` | "Receipt 2026-0137" in masthead kicker |
| `confirmationDateLabel` | "Jun 6, 2026" inline in caption |
| `onPrintEntryBlank` | Wires to primary CTA |

## Migration changes required for Banner

### 1. `shows.landing_style` check constraint

Add `'banner'`. If a previous handoff already expanded to all 8 (Option B in the Headline reconciliation notes), this is a no-op.

### 2. New `shows.brand_color` column

```sql
alter table public.shows
  add column brand_color text default '#0d4d4f' not null
  check (brand_color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.shows.brand_color is
  'Per-club accent color hex. Used by Banner landing-style masthead. Other landing styles ignore this value (their tokens are fixed).';
```

This column is **Banner-specific**. Other landing styles ignore it. Not gated behind a feature flag — adding a default value means existing rows pick up the teal automatically.

### 3. Email template registration

Add `BannerConfirmationEmail` export to `packages/email/src/index.ts`. The send function switch already exists from Heritage/Headline/Monogram; add the `'banner'` case.

The email template **must read the brand color from props**, not hardcode it. The Deno function passes `brandColor: show.brand_color` to the template.

## Tests to mirror

| Heritage test file | Banner equivalent |
|---|---|
| `__tests__/HeritageOrnamentRule.test.tsx` | `BannerFlagBar.test.tsx` (top + bottom variants, configurable color, contrast fallback) |
| `__tests__/HeritageSectionFolio.test.tsx` | `BannerSectionFolio.test.tsx` |
| `__tests__/HeritageHeading.test.tsx` | `BannerHeading.test.tsx` |
| `__tests__/landingUtils.test.ts` | `banner/landing/__tests__/landingUtils.test.ts` |
| `email/__tests__/HeritageConfirmationEmail.test.ts` | `email/__tests__/BannerConfirmationEmail.test.ts` (snapshot + brand-color override + contrast assertion) |
| `wizard/__tests__/HeritageEntryReceived.test.tsx` | `wizard/__tests__/BannerEntryReceived.test.tsx` |

Plus `useBannerBrandColor.test.ts`:
- Returns default flag when `show.brand_color` is null
- Returns supplied color when valid
- Returns `textOnFlag = 'ink'` when supplied color luminance > 0.7
- Returns `textOnFlag = 'paper'` otherwise
- Validates hex format and falls back on invalid input

Plus Playwright visual snapshots at 375/768/1280 in `tests/visual-references/banner/`, **including one variant with a non-default brand color** to catch the luminance-fallback path.

## Open questions for engineering

1. **Brand color storage** — single column (`shows.brand_color`) vs three (`flag`, `flag_deep`, `flag_bright`)? My recommendation is one column + runtime derivation, but if the OKLCH math fails on Safari edge cases, fall back to three columns + an admin color-picker UI that auto-generates the deep/bright siblings.
2. **Default flag color** — should it be teal `#0d4d4f` (this handoff's pick) or fall back to `bannerColors.ink` (more conservative)? My pick is teal as the "demo" color but expose it as an admin choice on first show creation under the Banner style.
3. **Email rendering & brand color** — when a club's color is too dark, the email-safe contrast check needs to flip white-on-color to white-on-ink. Outlook does not support OKLCH or `color-mix`. Solution: pass computed `textOnFlag` and `flag` values from the Deno function to the email template; don't compute in inline CSS.
4. **Sub-bar status dot** — should the dot color also be per-club configurable, or always `--bn-warn` (warm orange)? My instinct is keep the warning color universal — it signals "live" status, not brand identity.
5. **PDF cover alignment** — the existing Banner premium PDF (`features/premium/pdf/covers/TopblockCover.tsx` per the codebase) uses a black bar. Should the PDF cover update to teal (or per-club brand) in this same PR, or stay black for now? Aligning is the right call; doing it in this PR keeps Banner visually consistent across the four artifacts + premium.

## Files in the design handoff

| File | Implementation target |
|---|---|
| `Banner Landing Page.html` | `features/banner/landing/BannerLandingPage.tsx` + sections |
| `Banner Entry Blank.html` | `features/banner/entry-blank/BannerEntryBlankDocument.tsx` (@react-pdf) |
| `Banner Confirmation Email.html` | `packages/email/src/templates/BannerConfirmationEmail.tsx` (React Email) |
| `Banner Wizard Completion.html` | `features/banner/wizard/BannerEntryReceived.tsx` |
| `README.md` | Design system, tokens, motion vocabulary |
| `Banner Reconciliation Notes.md` | This file — codebase mapping + brand-color schema |
