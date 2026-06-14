# Gazette — Codebase Reconciliation Notes

Companion to `README.md`. Gazette's 3-column body and masthead are the most copy-heavy primitives in the system. This doc covers the standard four-artifact port plus the column-layout component contracts.

---

## Where Gazette files should land

```
apps/myk9show/src/features/gazette/
  components/
    GazetteMasthead.tsx              ← NEW: thin strip + Playfair title + sub-strip (configurable vol/edition/date)
    GazetteColumnArticle.tsx         ← NEW: 3-column body wrapper with drop cap support
    GazetteDropCap.tsx               ← Wraps first character of first paragraph
    GazetteClassified.tsx            ← Bordered classifieds-style card
    GazetteContinuedRule.tsx         ← "Continued on §02" inter-section rule
    GazettePageRule.tsx              ← Section letter / page / volume strip
    GazetteSectionFolio.tsx          ← Lowercase-roman folio (i, ii, iii in Playfair italic)
    GazetteHeading.tsx               ← Playfair Display, italic-emphasis support
  email/
    buildConfirmationProps.ts
  entry-blank/
    GazetteEntryBlankDocument.tsx
    GazetteEntryBlankButton.tsx
    buildEntryBlankProps.ts
    sections/
    types.ts
    index.ts
  hooks/
    (reuse shared hooks)
  landing/
    GazetteLandingPage.tsx
    useGazetteLandingData.ts
    types.ts
    sections/
      MastheadHeader.tsx
      FrontPageLead.tsx               ← Centered Playfair lead + dek + byline
      ThreeColumnBody.tsx             ← Welcome article in 3 columns
      ParticularsSection.tsx          ← 2-column definition list
      JudgesSection.tsx               ← Two-byline columns
      RosterSection.tsx
      ScheduleSection.tsx             ← Time / event / hall rows
      ClassifiedsSection.tsx          ← Classifieds grid (hotels, vet, awards)
      OfficersSection.tsx
      FinalAdvertisement.tsx          ← Deep-band CTA
      GazetteFooter.tsx
    utils/
  wizard/
    GazetteEntryReceived.tsx
  fonts.ts
  gazette.css
  index.ts
  tokens.ts

packages/email/src/
  gazetteTokens.ts
  templates/GazetteConfirmationEmail.tsx
  __tests__/GazetteConfirmationEmail.test.ts
```

## Token map

### `apps/myk9show/src/features/gazette/tokens.ts`

```ts
export const gazetteColors = {
  paper: '#f7f1e3',
  paperWarm: '#ede5d2',
  ink: '#2a2520',
  soft: '#3d352c',
  mute: '#7a6e58',
  brown: '#6b4f3a',
  hair: '#b8a98a',
  deep: '#1a1611',
} as const;

export const gazetteSpacing = {
  sectionPaddingY: 48,
  pageGutterX: 48,
  contentMax: 1100,
  columnGap: 32,
  classifiedGap: 24,
} as const;

export const gazetteTypography = {
  display: "'Playfair Display', Georgia, serif",
  body: "'Source Serif 4', Georgia, serif",
  meta: "'IBM Plex Mono', ui-monospace, monospace",
  bodyFeatureSettings: '"onum" 1, "liga" 1',  // old-style figures
} as const;

export const gazetteDurations = {
  titleFade: 800,
  titleDelay: 100,
  leadTitleDelay: 280,
  leadDekDelay: 420,
  capacityBarFill: 1400,
  capacityBarDelay: 400,
} as const;

/** The gazette uses lowercase roman numerals for section folios. */
export const gazetteFolios = ['i','ii','iii','iv','v','vi','vii','viii'] as const;

/** And section letters for "page" rules between major divisions. */
export const gazetteSectionLetters = ['A','B','C','D','E','F','G','H'] as const;
```

### `packages/email/src/gazetteTokens.ts`

```ts
export const GZ = {
  INK: '#2a2520',
  PAPER: '#f7f1e3',
  PAPER_WARM: '#ede5d2',
  BROWN: '#6b4f3a',
  MUTE: '#7a6e58',
  HAIR: '#b8a98a',
  DISPLAY: "'Playfair Display', Georgia, serif",
  BODY: "'Source Serif 4', Georgia, serif",
  META: "'IBM Plex Mono', Courier, monospace",
} as const;
```

The Deno edge function needs a parallel `GZ` block.

## Component contracts

### `<GazetteMasthead>`

```tsx
interface GazetteMastheadProps {
  clubName: string;                 // "Bexar County" — italic articles wrap automatically
  /** Volume number for this club's gazette. Roman. */
  volume?: number;                  // 79 → "LXXIX"
  /** Issue/edition number this year. Arabic. */
  edition?: number;                 // 47 → "NO 47"
  /** Date in long form: "Friday, May 28, 2026" */
  date?: Date | string;
  /** Single line motto in italic. */
  motto?: string;
  /** License or footer info on the right. */
  rightSlot?: React.ReactNode;
  /** City of publication */
  city?: string;
}
```

The masthead automatically wraps the first and last word of `clubName` in italic small-weight Playfair to get the "*The* Bexar County *Gazette*" effect. To override (e.g., the club name has 4 words), pass `titleSlot` instead of `clubName`.

### `<GazetteColumnArticle>`

```tsx
interface GazetteColumnArticleProps {
  columns?: 1 | 2 | 3;              // Default 3
  dropCap?: boolean;                 // Wraps first letter of first paragraph
  signature?: {
    name: string;
    role: string;
  };
  children: React.ReactNode;
}
```

Handles `column-count`, `column-gap`, `column-rule`, plus signature row that breaks back to full width via `column-span: all`. Reduced motion respected.

### `<GazettePageRule>`

```tsx
interface GazettePageRuleProps {
  /** Section letter, e.g. "B" */
  letter: string;
  /** Section title, e.g. "PARTICULARS" */
  title: string;
  /** Page number within this volume. Optional. */
  page?: number;
  /** Volume. Defaults to current gazette volume. */
  volume?: string;
}
```

Renders the `4px double` rule + 3-column mono strip below it.

### `<GazetteContinuedRule>`

```tsx
interface GazetteContinuedRuleProps {
  /** Target section folio, e.g. "02" or "ii" */
  to: string;
  /** Optional context: "Particulars", "Classifieds" */
  context?: string;
}
```

Renders the italic right-aligned "Continued on §02 — Particulars ▸" line.

## Old-style figures in email

The body uses `font-feature-settings: "onum" 1` (old-style figures). Email clients have inconsistent support:
- Apple Mail: works
- Gmail web: works
- Outlook 2007–2019: ignored (renders lining)
- Outlook 365: works (recently)

The email template **does not** opt into old-style figures — uses default lining figures throughout. This is acceptable degradation; preserves cross-client consistency. Web landing has the feature on; email forgoes it.

## Wizard completion: prop-interface parity

`GazetteEntryReceived` uses the **same** `HeritageEntryReceivedProps` interface, no extensions. The Gazette style's identity is text-and-masthead, not data-driven.

The mock includes a mini-masthead at the top of the receipt (`<GazetteMasthead>` reused at small size). Pass `volume={gazetteVolume}` and `date={Date.now()}` — these are *display* metadata, not real database fields.

## Migration changes required

### 1. `shows.landing_style` constraint

Add `'gazette'` (no-op if previously batched).

### 2. Email template registration

Add `GazetteConfirmationEmail` export. Update send-function switch.

### 3. Optional: `clubs.gazette_volume` column

For clubs that want a club-wide "Gazette volume" counter (auto-incremented per year), add:

```sql
alter table public.clubs
  add column gazette_volume integer default 1;

comment on column public.clubs.gazette_volume is
  'Per-club gazette volume number. Used by Gazette landing style masthead. Increment annually. Falls back to "current" when null.';
```

This is **optional**. If unset, the masthead renders without the volume number (or computes one from the club's age: `current_year - established_year`). Recommend leaving null in MVP and adding the column only if clubs ask for it.

## Tests to mirror

| Heritage test file | Gazette equivalent |
|---|---|
| — | `GazetteMasthead.test.tsx` (renders italic articles around club name; volume converts to roman; date formats correctly) |
| — | `GazetteColumnArticle.test.tsx` (3-col → 1-col at narrow widths; drop cap renders correctly; signature spans all columns) |
| — | `GazetteContinuedRule.test.tsx` |
| `__tests__/HeritageSectionFolio.test.tsx` | `GazetteSectionFolio.test.tsx` |
| `__tests__/HeritageHeading.test.tsx` | `GazetteHeading.test.tsx` |
| `__tests__/landingUtils.test.ts` | `gazette/landing/__tests__/landingUtils.test.ts` |
| `email/__tests__/HeritageConfirmationEmail.test.ts` | `email/__tests__/GazetteConfirmationEmail.test.ts` |
| `wizard/__tests__/HeritageEntryReceived.test.tsx` | `wizard/__tests__/GazetteEntryReceived.test.tsx` |

Plus visual snapshots at 375 / 768 / 1280 in `tests/visual-references/gazette/`. The drop cap rendering across browsers is worth capturing.

## Open questions for engineering

1. **Volume / edition autoincrement** — should each club have a "gazette volume" counter, or is it pure visual metadata (fixed at "Vol LXXIX No 47" forever)? Recommend pure visual for MVP; revisit if clubs want it dynamic.
2. **`column-count` browser compat** — Safari and Chrome render `column-count: 3` with column-rules slightly differently. Spacing may need browser-specific tweaks. Verify with Playwright at 1280px on both browsers.
3. **Drop cap reading order** — the floated `<span class="drop-cap">F</span>` is read by screen readers as part of the first paragraph (correct). But if you implement with `::first-letter` you lose this. Use the span pattern.
4. **Masthead italic wrapping** — for clubs like "Atlanta Kennel Club" → "*The* Atlanta Kennel Club"? Or "*Atlanta* Kennel *Club*"? The component logic should let clubs override the auto-wrap. Default rule: wrap first and last word in italic only if `clubName.split(' ').length >= 3`.
5. **Texture print stripes** — the body texture gradient renders fine on screen but some printers struggle with the 45° repeating pattern. The entry-blank file already disables background-image in print media query. Verify on a real printer.

## Files in the design handoff

| File | Implementation target |
|---|---|
| `Gazette Landing Page.html` | `features/gazette/landing/GazetteLandingPage.tsx` + sections |
| `Gazette Entry Blank.html` | `features/gazette/entry-blank/GazetteEntryBlankDocument.tsx` |
| `Gazette Confirmation Email.html` | `packages/email/src/templates/GazetteConfirmationEmail.tsx` |
| `Gazette Wizard Completion.html` | `features/gazette/wizard/GazetteEntryReceived.tsx` |
| `README.md` | Design system, tokens, motion vocabulary, newspaper rationale |
| `Gazette Reconciliation Notes.md` | This file — component contracts, old-style figures, masthead wrapping rules |
