# Poster Style — Design Handoff

The **Poster** style renders the trial as a contemporary graphic-design poster: massive condensed display type stacked vertically, a red ink-blot shape in the upper right, an olive square rotating into the lower left, monospace running strips across the top and bottom. This is the *loudest* style in the system. Built for clubs that want their trial to feel like a Pentagram poster — graphic, confident, unmistakable.

This is the most *graphic* style. Where Magazine reserves space for photography, Poster reserves space for *shapes*: the ink-blot circle and rotating square are load-bearing elements, not decoration. Removing them gutts the identity.

## Visual system

### Color tokens

| Token | Value | Used for |
|---|---|---|
| `--po-cream` | `#f3ede0` | Page background — warm cream |
| `--po-cream-warm` | `#e9dfc8` | Alt-section background |
| `--po-ink` | `#1f1d18` | Body type, dark bands, footer |
| `--po-ink-soft` | `#3a342a` | Body copy |
| `--po-mute` | `#7a7466` | Captions, labels |
| `--po-hair` | `#cabe9f` | Internal hairlines |
| `--po-red` | `#c83b1a` | **The hero accent** — circle, italic emphasis, totals |
| `--po-red-deep` | `#8a2810` | Gradient stop within the ink-blot |
| `--po-olive` | `#3d3a2a` | Rotating square, dark-band variant |
| `--po-olive-deep` | `#1f1d18` | Deepest ink, same as `--po-ink` |

The palette is intentionally restricted to **three colors** — cream, ink, red — with olive as the only modulation between black and dark. No grays, no warm-cool shifts, no expansions. Restraint is the discipline.

### Type stack

| Role | Font | Notes |
|---|---|---|
| **Display** | `Archivo Black` | Single weight (`400` which reads as 900). Used at 56–224px. Letter-spacing tight (`-0.035em` to `-0.05em`). |
| **Body display** | `Inter Tight` 800 | When display weight is needed at body sizes (sub-headlines, judge names in places). |
| **Body** | `Inter` 400 / 500 / 600 | Workhorse. Note prose paragraphs use this; nowhere does Archivo Black drop below 18px. |
| **Mono** | `IBM Plex Mono` 500 / 600 | Tracked tight at `0.04em` (not 0.32em like other styles). Used for top strip, section numbers, metadata, footer. |

**Archivo Black is the entire identity.** When it lands wrong — too small, anti-aliased poorly, in the wrong color — the system collapses. Never use it below 18px and never use it for body copy.

### Graphic elements

- **Red ink-blot circle** — 720px diameter, positioned `right: -180px; top: 80px`, with `mix-blend-mode: multiply`. Renders as a wash on the cream paper that lets the page texture show through.
- **Olive rotating square** — 320px, rotated `8deg`, positioned `left: -80px; bottom: -80px`. Same blend mode.
- **Mono strip top + bottom** — page is bracketed by two ink-on-cream mono strips (`8px 32px`) carrying the show abbreviation, dates, status counter, and CTA.
- **Outline text** — large display text occasionally rendered as outline only (`-webkit-text-stroke: 3px var(--po-ink); color: transparent`). Used once per major section as a graphic accent.

### Motion

Punchy, deliberate. Ink-blot scales in from `0.7` over 1.4s. Square rotates from `-4deg` to its final `8deg` over 1s. Hero title words rise sequentially in 120ms increments. Capacity bar fills like a printer's roll over 1.2s. Nothing eases into nothing — everything has a moment.

## Files in this handoff

| File | Purpose | Format |
|---|---|---|
| `Poster Landing Page.html` | Public trial-detail page | Responsive web, 1280px content max |
| `Poster Entry Blank.html` | Mail-in entry form | US Letter portrait, single page, print-ready |
| `Poster Confirmation Email.html` | Post-confirmation transactional email | 600px email-safe HTML, table-based, inline styles |
| `Poster Wizard Completion.html` | Final wizard step | Component preview, matches HeritageEntryReceived.tsx props |
| `README.md` | This document | — |
| `Poster Reconciliation Notes.md` | Codebase mapping for engineering | — |

## Cross-style differentiation

- **vs Headline (the other newsroom sans)** — Headline is hot red on white with kicker tags + marker highlights. Poster is red ink-blot circle on cream with Archivo Black at 224px. Headline shouts in column inches; Poster shouts in pure scale.
- **vs Banner (the other dark-band sans)** — Banner has *one* teal block as masthead. Poster has graphic shapes + dark bands + mono strips. Banner is corporate Bauhaus; Poster is concert poster.
- **vs Magazine (the warm photographic style)** — Magazine reserves space for photography. Poster reserves space for shapes. Same paper tone (cream-ish) but completely different relationship to figure/ground.
- **vs original Poster premium PDF** — the existing PDF was a single-page hero. This bundle keeps the hero punch but extends the graphic system: ink-blots and rotated squares recur, dark bands break up the cream, mono strips top-and-tail every page. Same DNA, full extension.

## Known caveats

- Archivo Black has no italic. The system never uses italic, anywhere. If you find yourself wanting italic emphasis, use either color (`var(--po-red)`) or a red highlight box (`background: var(--po-red); color: var(--po-cream); padding: 0 4px`) — both shown in mocks.
- `mix-blend-mode: multiply` on the shapes works in all modern browsers but fails in Outlook (email). The email template renders the ink-blot as a solid red circle with reduced opacity instead.
- `-webkit-text-stroke` outline text is webkit/blink only. Firefox renders it as solid (no outline) — acceptable degradation. The mocks rely on `-webkit-text-stroke` for the outlined headline word; Firefox users see a solid headline.
- The ink-blot at 720px will overflow even at desktop widths. The mock uses `overflow: hidden` on its container. **Do not** add scroll containers around it — it's meant to crop.

## Implementation notes

The ink-blot and square should be `<div>` elements absolutely positioned within the section, not background images or SVGs. CSS-only because:
1. Survives CMS edits without losing layer order
2. Animates with `transform` rather than `background-position`
3. Inherits the page's dark/light context for `mix-blend-mode` to work

The mono strip should be a *container query* in the React port — the top strip wraps differently at narrow widths than the bottom CTA strip. Mock currently uses a media query at 960px.

## Next styles in queue

Gazette (newspaper broadsheet — multi-column, sepia, classifieds), Field Guide (utility/reference — dense tables, indicator orange, no decoration). Both sit far from Poster: Gazette is wordy where Poster is graphic; Field Guide is functional where Poster is expressive.
