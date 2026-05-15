# Banner Style — Design Handoff

The **Banner** style renders the trial as Swiss-modern corporate identity: a single dominant flag bar in deep teal, monolithic condensed type, zero ornamentation, left-aligned everything. It's the *calmest* of the eight styles — built for clubs that want their trial to feel solid, institutional, current.

This style was already in production as one of the three existing premium PDFs ("Banner" — black bar across top, left-aligned title). The new four-artifact bundle preserves the *flag-bar concept* but commits to it harder: the bar is the brand, the bar carries the masthead, and a second bar appears at the bottom as the final CTA — bracketing the whole experience.

## Visual system

### Color tokens

| Token | Value | Used for |
|---|---|---|
| `--bn-paper` | `#fafaf8` | Page background |
| `--bn-paper-warm` | `#f0eeea` | Alt-section background (Roster) |
| `--bn-ink` | `#111` | Body type, footer flag |
| `--bn-soft` | `#2a2a2a` | Body copy |
| `--bn-mute` | `#6b6b6b` | Captions, mid-tone labels |
| `--bn-hair` | `#d8d8d4` | Internal cell borders |
| `--bn-flag` | `#0d4d4f` | **THE banner color** — deep teal |
| `--bn-flag-deep` | `#093234` | Hover state, deeper accent on dark |
| `--bn-flag-bright` | `#1a7679` | Single bright accent for "Today." emphasis in dark final |
| `--bn-warn` | `#d97742` | Single warm accent — used 1× for the live-status dot |

**Per-club configurable**: The flag color (`--bn-flag` and its two siblings) is the *only* token expected to vary per club. Different kennel clubs swap in their own brand color (navy, forest, oxblood, etc.). Default ships as deep teal.

### Type stack

| Role | Font | Notes |
|---|---|---|
| **Display** | `Inter Tight` 800 / 900 | Set tight (`-0.035em` to `-0.05em`), huge (64–144px). The voice. |
| **Body** | `Inter` 400 / 500 / 600 | 16–19px. No italics anywhere in the system. |
| **Labels / kickers** | `Inter` 500 | 11–13px, letter-spacing 0.2em–0.32em, uppercase. |
| **Section numbers** | `Inter Tight` 800/900 | `01 / WELCOME` format. Color is `--bn-flag`. |

**No italics. No serifs. No script.** Banner's aesthetic discipline is monolithic sans throughout.

### Layout system

- **Two flag bars** — masthead (top) + final CTA (bottom). Both span full bleed. The footer adds a third minor accent: a 12px vertical teal stripe inside the dark final-CTA band.
- **Left-aligned, every element** — including the hero title. Heritage and Headline have moments of centered hierarchy; Banner never does.
- **Section heads on a fixed 240px column** with the section number, then a giant left-aligned title. The constancy of that grid is what makes the page feel architectural.
- **Cards / judges / fees use hairline cell borders** — never rounded corners, never card shadows. Tables with deliberate weight: 2px top/bottom rules in ink, 1px internal hairlines.
- **One pulsing dot** — sub-bar status indicator (`#d97742`). The only animated, colored, non-teal element on the page.

### Motion vocabulary

Swiss-snap. Quick, decisive, mechanical. No bouncing, no eases-in:

| Element | Motion | Duration | Easing |
|---|---|---|---|
| Flag masthead children | Fade + slide up 8px, staggered 120ms | 600ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Capacity bar fill | Width 0 → 78% | 1200ms | same, 600ms delay |
| Subbar status dot | Opacity pulse 1 → 0.35 → 1 | 2400ms infinite | `ease-in-out` |
| Sticky nav active state | Color swap, no transition | instant | — |
| Reduced motion | All animations → 0.01ms | — | — |

## Files in this handoff

| File | Purpose | Format |
|---|---|---|
| `Banner Landing Page.html` | Public trial-detail page | Responsive web, 1280px content max |
| `Banner Entry Blank.html` | Mail-in entry form | US Letter portrait, single page, print-ready |
| `Banner Confirmation Email.html` | Post-confirmation transactional email | 600px email-safe HTML, table-based, inline styles |
| `Banner Wizard Completion.html` | Final wizard step | Component preview, matches HeritageEntryReceived.tsx props |
| `README.md` | This document | — |
| `Banner Reconciliation Notes.md` | Codebase mapping for engineering | — |

## Differentiation against other styles

The Banner style is *deliberately the quietest sans style* in the system. To keep that contrast clear:

- **vs Headline (the loud sans)** — Headline = red kicker tags + marker-yellow highlights + one bright accent per page. Banner = single colored block, zero accents in body, no italics, no highlights. If Headline is "newsroom front page," Banner is "annual report cover."
- **vs Monogram (the quiet serif)** — Monogram leans on Bodoni + cream + embossed letters. Banner leans on Inter + paper + colored masthead. They could share a club whose identity is split between two contexts (e.g., heritage events use Monogram, modern events use Banner).
- **vs the original production Banner** — production was a thin black bar + small Inter title. New Banner makes the bar the *whole* hero, with the title set huge inside it, and adds a matching bottom band that closes the page. Same DNA, much more committed expression.

## Known caveats

- Inter Tight 900 below 16px on Windows ClearType can render slightly muddy. Don't use it below 18px.
- The teal `#0d4d4f` is dark enough to pass WCAG AA against `#fafaf8` (12.4:1) but the brighter `#1a7679` only hits 4.8:1 — fine for display copy, *don't* use it for body copy.
- The sub-bar's pulsing dot is the only animation a screen-reader would announce. It's wrapped in `aria-label` text ("Open · 281 / 360 entries") so the dot is purely decorative.
- When a club's brand color is very light (e.g., yellow), the white-on-color masthead will fail contrast. The `MonogramEmboss`-equivalent for this style — the flag itself — needs a fallback to ink-on-flag when the flag is below a certain luminance. See reconciliation notes for the algorithm.

## Next styles in queue

Magazine, Poster, Gazette, Field Guide. Magazine sits closest to Heritage tonally (serif + warm + literary). Poster is the loudest of the remaining four. Gazette and Field Guide are both utility-leaning and will likely share extracted primitives.
