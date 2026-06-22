# Public Show Landing — Brand & A11y Pass

> **Status:** Active

Live-browser / brand follow-ups deferred from the impeccable mechanical sweep of the public
show landing (`/shows/:id`). PR #899 fixed only the accent-hardcoded entry CTA. This plan
covers the four findings that required design/product decisions and live verification.

Context that reshaped the original findings:

- The public landing has **7 hand-styled themes** (`heritage`, `magazine`, `banner`,
  `monogram`, `poster`, `gazette`, `fieldGuide`), each re-implementing
  `StickyNav` / hero / final-CTA with its own `--xx-*` token prefix. A bug found in one is a
  template for the other six. This is DRY debt worth naming but out of scope to refactor here.
- **Finding #2's contrast premise was wrong.** The report said gold `#8a6a45` on Paper
  `#f8f4ea` ≈ 3.6:1. Verified: gold-on-paper is **4.52:1 (passes)**. The 3.6:1 failure is
  gold on the dark **ink** band (`FinalCtaBand` / `HeritageFooter`). The fix is therefore to
  **lighten** the on-ink accents, not darken the shared token (darkening would regress the
  paper surface, which sits at only 4.52). Decided: add dark-surface tokens.

## Decisions (confirmed with owner, 2026-06-21)

- Touch targets + tokenize → **all 7 themes**.
- Heritage AA → **add gold-on-dark + lighten muted**; leave gold/quill-on-paper untouched.

## Phase 1 — Touch targets ≥44px (all 7 themes)

Exhibitor touch floor is 44px. Landing CTAs/nav buttons are under it. Fix: add
`min-h-[44px]` + `inline-flex items-center justify-center` to interactive `<a>`/`<button>`
CTAs (not body text). Known offenders (non-exhaustive — agents audit each theme):

- heritage `HeroBlock.tsx:216` (`py-3` ≈42px), `StickyNav.tsx:105,116` (`py-1.5` ≈28px)
- magazine `StickyNav.tsx:137,148` (`py-2` ≈32px)
- gazette `StickyNav.tsx:108,120` (`py-1` ≈24px)
- banner / monogram / poster / fieldGuide — audit hero + nav + final-CTA per theme

Do **not** enlarge the non-interactive "Entries are not available yet" / "Classes pending"
status pills — those are text, not tap targets (but keep them visually aligned with siblings).

## Phase 2 — Heritage AA palette + tokenize dark band

New tokens (additive — shared paper palette unchanged, so `pdfTokens.ts` needs no sync):

| New token | Value | On ink | Replaces |
| --- | --- | --- | --- |
| `--hl-gold-on-dark` | `#a3855c` | 5.20:1 | gold accents on ink (seal, "cordially", method titles, footer headers) |
| `--hl-paper-muted` | `#a39383` | 6.05:1 | raw `#8a7a6a` (4.35 ❌), `#5a4a3a` (2.12 ❌) |
| `--hl-paper-soft` | `#b8a99a` | 7.86:1 | raw `#b8a99a` (already AA — tokenize only) |
| `--hl-ink-border` | `#3a3028` | 1.40 (decorative divider — no AA req) | raw `#3a3028` |

Add to both `heritage.css` (CSS custom props) and `tokens.ts` (`heritageColors`). Then
tokenize raw hexes in `FinalCtaBand.tsx` (52,81,91,102), `HeritageFooter.tsx` (28,33,40,49,59),
`RosterSection.tsx` (54 — `paperDark` fallback). Gold used **on ink** switches to
`--hl-gold-on-dark`; gold on paper keeps `--hl-gold`.

## Phase 3 — Tokenize off-token hex (other 6 themes)

Pure refactor — replace raw hexes with each theme's `--xx-*` tokens (add tokens where a value
has no home). **No color changes** for non-heritage themes (their palettes were not
AA-audited; that's a separate pass). Agents report "none found" where clean.

## Phase 4 — Default (non-heritage) landing IA

`/shows/:id` default landing reuses the shared product `DetailHero` — product-template chrome
on a brand slot, with raw `green-500/orange-500` badges.

- **Heading-order finding was a FALSE POSITIVE.** The audit said the show name renders as `<h2>`
  with no `<h1>`. Verified: `PageHeader` (rendered directly above `DetailHero` on the default/
  tabbed path) emits `<h1 className="sr-only">{title}</h1>`. So the page already has a proper
  h1 and `DetailHero`'s `<h2>` is correctly subordinate. Adding an h1 to `DetailHero` would
  create two h1s. **No change made.** (The auditor scanned visible text and missed the `sr-only`
  h1.)
- **Badge tokens — DONE.** `DetailHero` `badgeStyles` swapped `green-500`/`orange-500` →
  `success`/`warning` semantic tokens (AA-tuned, documented in `index.css` as the correct
  replacement for the `bg-X/10 + text-X` tint pattern). Affects all `DetailHero` consumers
  (ShowDetailsPage, TrialDetailsPage, ClassCompactHeader) — a strict AA improvement.
- **Larger question deferred:** committed default landing vs. extend a theme. Needs a design
  pass before build. **Decision pending** — do not build the redesign blind.

## Testing

- Unit: themed CTAs render with a ≥44px min-height (heritage RTL render assertions).
- Unit: the shared `SeeClassesLink` carries the 44px tap-target default and still honors
  caller `style` overrides (defaults precede the spread).
- Unit: heritage token contrast — a small test pinning the new hex values + a ratio assertion
  (mirror the contrast helper) so the palette can't silently regress below AA.
- Unit: `DetailHero` success/warning badges use the semantic tokens, not raw green/orange.
- No `DetailHero` `headingLevel` test — the heading-order finding was a false positive
  (`PageHeader` already emits an `sr-only` `<h1>`); no prop was added. Do not chase this.
- `pnpm typecheck` + affected vitest green before each PR.

## Shipped as one PR

Owner chose a single cohesive PR over the per-phase split. Contents:

- Phase 1 — touch targets across all 7 themes **plus** the shared `SeeClassesLink` (fixed once
  at the source so every themed caller inherits the 44px floor).
- Phase 2 — heritage AA palette + tokenize.
- Phase 3 — tokenize other 6 themes (only `rgba()` alpha variants existed; no color change).
- Phase 4 — `DetailHero` badge tokens only. Heading-order skipped (false positive, above).
  Committed default-landing redesign still **deferred** to its own plan — not built here.
