# Plan — Monogram Landing Page (PR #183)

Companion to PR #182 (Monogram email pipeline + emboss primitive). This PR
ships the public trial-detail landing page in the Monogram visual style.
Until this lands, shows with `style='monogram'` render the Heritage landing
page as a fallback.

## Source of truth

- Visual mock: `docs/design/claude_code_handoff/design_handoff_monogram/Monogram Landing Page.html`
- Implementation contract: `docs/design/claude_code_handoff/design_handoff_monogram/Monogram Reconciliation Notes.md`
- Pattern to clone: `apps/myk9show/src/features/heritage/landing/`
- Primitive already shipped in PR #182: `MonogramEmboss` from `features/monogram/components/`

## Goal

Render a polished, on-brand landing page for any trial whose show has
`style='monogram'` (or legacy `'banner'` until Banner ships its own
landing). Match the Heritage landing's content sections one-for-one but
swap the engraved-document visual register for the embossed-monogram
register.

## Non-goals (deferred to PR #184)

- `MonogramEntryReceived` wizard completion step
- Monogram entry-blank PDF
- Playwright visual snapshots at 375 / 768 / 1280

## File tree to add

Mirror `features/heritage/landing/` exactly:

```
apps/myk9show/src/features/monogram/
├── landing/
│   ├── MonogramLandingPage.tsx              (~120 lines — entry component, lazy-loaded)
│   ├── useMonogramLandingData.ts            (~190 lines — clone of useHeritageLandingData)
│   ├── types.ts                             (~40 lines — landing-specific types)
│   ├── sections/
│   │   ├── StickyNav.tsx                    (top nav, inline monogram, anchor links)
│   │   ├── HeroBlock.tsx                    (640px embossed monogram bleed, countdown, capacity)
│   │   ├── WelcomeSection.tsx               (280px monogram aside card + welcome prose)
│   │   ├── ParticularsSection.tsx           (dates, venue, fee summary, class lineup)
│   │   ├── JudgesSection.tsx                (2-per-row, 64px solid bronze monogram as photo placeholder)
│   │   ├── RosterSection.tsx                (entries-received list, capacity meter)
│   │   ├── PlanSection.tsx                  (day-by-day timeline)
│   │   ├── OfficersSection.tsx              (club officers grid)
│   │   ├── FinalCtaBand.tsx                 (dark band with 580px embossed-dark monogram)
│   │   └── MonogramFooter.tsx               (96px solid ink monogram)
│   ├── utils/
│   │   └── dateFormat.ts                    (clone heritage's dateFormat verbatim)
│   └── __tests__/
│       ├── useMonogramLandingData.test.ts
│       └── landingUtils.test.ts
└── components/
    ├── MonogramHeading.tsx                  (Bodoni Moda display heading)
    ├── MonogramSectionFolio.tsx             (lowercase roman numeral folio, italic Italiana)
    └── MonogramJudgeCard.tsx                (judge card with monogram-as-portrait)
```

Plus router wiring:

```
apps/myk9show/src/pages/PublicTrial/PublicTrialPage.tsx
  → resolve getShowStyle(show), dispatch on 'monogram' → MonogramLandingPage
```

## Per-section implementation notes

### MonogramLandingPage.tsx (entry)

- Wrap in `<div data-monogram>` so `monogram.css` scoping kicks in.
- Call `useMonogramLandingData(showSlug)` once; pass slices to each section.
- Call `ensureMonogramFontsLoaded()` in a `useEffect`.
- Skeleton state: show 12 horizontal placeholder bars in monogram colors (not generic gray) while data loads.
- Error state: Bodoni Moda apology block with retry CTA. Match the Heritage tone.

### useMonogramLandingData.ts

- **Clone `useHeritageLandingData.ts` verbatim**, rename, then change:
  - Result type → `MonogramLandingData`
  - Derive `monogramLetters` via `buildMonogram(show.club_name ?? show.name)` — this is the bit Heritage doesn't have. Stash in the result.
  - All other fields (show, trials, judges, officers, roster, capacity) reuse the same Supabase queries unchanged.
- Wrap in `useQuery` with the same staleTime as Heritage (5min).

### StickyNav.tsx

- 32px solid-ink monogram on the left (`<MonogramEmboss letters={M} size={32} variant="solid" />`).
- Anchor links: Welcome / Particulars / Judges / Roster / Plan / Officers, Bodoni Moda small-caps.
- Sticky behavior: shadow appears after 24px scroll (same threshold as Heritage).
- INTENT: nav is functional, not decorative — calm authority, not a CTA.

### HeroBlock.tsx

- Massive 640px embossed-paper monogram as the visual centerpiece, dead-center.
- Show title in Bodoni Moda 56px above the monogram on small screens, overlapping below on desktop.
- Date range in Bodoni Moda italic.
- Countdown digits (Bodoni Moda 64px) below — `useCountdown(closeDate, timezone)`.
- Capacity meter: italic Italiana big numeral with thin bronze-to-leaf gradient bar.
- Reveal: paper monogram fades in 1200ms after mount (gate on `useReducedMotion`).

### WelcomeSection.tsx

- 280px embossed monogram as **right-aside card** (not full bleed).
- Welcome prose runs to the left.
- Section folio: `i.` in italic Italiana.

### ParticularsSection.tsx

- Date / Venue / Closing / Fees / Class lineup in a 2-column grid.
- Ornament rule between rows: ◆ glyph centered, thin bronze line on both sides.
- INTENT: dense, scannable, formal. Reader should feel like they're holding a printed program.

### JudgesSection.tsx

- 2 per row on desktop, 1 per row on mobile.
- Photo slot replaced with 64px solid bronze monogram (clone of `MonogramEmboss` solid variant).
- Credentials line below name in Bodoni Moda italic 12px.
- Bio in Crimson Pro.

### RosterSection.tsx

- Entries received list, capacity meter at top.
- Italian Italiana big numeral `${entriesReceived}` / `${cap}`.
- Below: thin bronze gradient bar showing fill ratio.
- Each entry row: armband + dog registered name + handler. Dotted underline separator.

### PlanSection.tsx

- Day-by-day timeline. Each day = a folio (`ii.`, `iii.`, `iv.`).
- Briefing → first run → lunch → final run. All times in italic Bodoni Moda.

### OfficersSection.tsx

- Club officers in a 3-column grid (President / Secretary / Treasurer / Show Chair / etc.).
- Title in Bodoni Moda small-caps, name in Bodoni Moda italic.

### FinalCtaBand.tsx

- Dark band (`#1c1815` background).
- 580px embossed-**dark** monogram as the band's background (positioned absolute, opacity 0.15).
- Big "Enter Now" CTA in Bodoni Moda small-caps over the top.
- Below: closing date + entries fees recap in paper-colored text.
- INTENT: the close of the page — feel decisive, not desperate.

### MonogramFooter.tsx

- 96px solid-ink monogram, centered.
- Club name + "Est. YYYY" if available.
- Member-club language.
- Small "myK9Show" attribution in Crimson Pro 10px.

## Router wiring

In `PublicTrialPage.tsx`:

```tsx
import { getShowStyle } from '@/features/registries';
import { lazy, Suspense } from 'react';

const HeritageLandingPage = lazy(() => import('@/features/heritage/landing/HeritageLandingPage'));
const MonogramLandingPage = lazy(() => import('@/features/monogram/landing/MonogramLandingPage'));

// ...
const style = getShowStyle(show);
return (
  <Suspense fallback={<LandingSkeleton />}>
    {style === 'monogram' || style === 'banner' ? (
      <MonogramLandingPage showSlug={slug} />
    ) : style === 'heritage' ? (
      <HeritageLandingPage showSlug={slug} />
    ) : style === 'headline' ? (
      <HeadlineLandingPage showSlug={slug} />
    ) : (
      <DefaultLandingPage showSlug={slug} />
    )}
  </Suspense>
);
```

Banner falls through to Monogram for the same reason it does in the email
registry — closer visual register, and Banner's own landing ships in PR #185.

## Tests

| Test file                                            | What it covers                                                             | Approx lines |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | ------------ |
| `landing/__tests__/useMonogramLandingData.test.ts`   | Loading / error / empty-trial / monogramLetters derivation / capacity math | ~120         |
| `landing/__tests__/landingUtils.test.ts`             | Roman-numeral folio formatter / date range / dateFormat utility            | ~80          |
| `components/__tests__/MonogramHeading.test.tsx`      | Renders, applies display font, ariaLevel                                   | ~30          |
| `components/__tests__/MonogramSectionFolio.test.tsx` | Numeral conversion (1→i, 5→v, 10→x)                                        | ~30          |
| `components/__tests__/MonogramJudgeCard.test.tsx`    | Renders monogram-as-portrait, credentials, bio                             | ~50          |

**Mirror the heritage test files** — the assertion shapes carry over almost
unchanged. Use `src/test/utils/testUtils.tsx` `render` (not raw RTL render)
so the QueryClient + Auth + Router providers wrap correctly.

## Out-of-scope but adjacent

- **Banner-specific landing page** — defer to PR #185. Until then, Banner
  shows render the Monogram landing (acceptable per the visual proximity).
- **Playwright visual snapshots** — they're cheaper to write once the
  landing is mounted somewhere the playwright harness can hit. Bundle into
  PR #184 (wizard + entry-blank) since it's the same Playwright setup
  effort.

## Effort estimate

- Section components (10 × ~80 lines avg) — 1 day
- `useMonogramLandingData` + landing entry + router wiring — 0.5 day
- Tests (5 files, ~300 lines total) — 0.5 day
- Manual QA on staging — 0.5 day

**Total: 2.5 days, single-person.** Reviewable diff size: ~1500–2000 lines,
about the same as PR #182.

## Verification checklist (run before merging PR #183)

- [ ] `pnpm typecheck` clean (21/21)
- [ ] `npx vitest run src/features/monogram/landing/` passes
- [ ] `npx vitest run src/features/heritage/` still passes (no regression in shared hooks)
- [ ] Manual: visit a Monogram trial on staging, check (a) embossed hero monogram renders, (b) capacity bar animates, (c) `prefers-reduced-motion` skips the animations, (d) the page degrades gracefully on a browser without `background-clip:text` (use Edge legacy mode or a JSDOM-style spoof).
- [ ] Manual: visit a Heritage trial — confirm no visual change (the router dispatch isolates Monogram).
- [ ] Lighthouse: LCP under 2.5s on the staging Monogram page (hero font + monogram should not block paint).

## Open questions for PR #183

1. **Should the hero monogram be a single `<span>` or split into per-letter spans for stagger animation?** Heritage's hero animates via opacity, not per-character — recommend matching for consistency.
2. **Mobile breakpoint for the 2-column judges grid:** Heritage uses 640px. Monogram should match.
3. **Roman-numeral folio cap:** lowercase roman degrades after ~12 (xii, xiii…). Trials with >12 entries shouldn't break. Cap at xii and fall back to arabic afterward, or extend? Defer to mock — the handoff probably never tested past 5.
