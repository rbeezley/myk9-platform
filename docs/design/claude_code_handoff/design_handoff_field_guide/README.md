# Field Guide Style — Design Handoff

The **Field Guide** style renders the trial as a utility reference document: chip-tagged headers, dense data tables with alternating row backgrounds, §-numbered sections, IBM Plex Sans + Mono throughout, parchment paper with indicator-orange accents. Tone: USGS field guide meets technical spec sheet meets API documentation. Built for clubs whose exhibitors want one document they can look things up in fast — at home before entry, on their phone at the trial.

This is the most *functional* style in the system. No italics. No drop caps. No display serifs. The hero is a quick-reference grid of six data cells, not a title. Where Magazine wants you to *read*, Field Guide wants you to *scan*.

## Visual system

### Color tokens

| Token | Value | Used for |
|---|---|---|
| `--fg-paper` | `#f6f1e6` | Page background — pale parchment |
| `--fg-paper-warm` | `#ebe4cf` | Alternating row, header cell backgrounds |
| `--fg-paper-deep` | `#1f2a24` | Dark band (top strip, footer, mail-to) |
| `--fg-ink` | `#1f2a24` | Body type, rules — same as paper-deep |
| `--fg-soft` | `#3a4339` | Body copy |
| `--fg-mute` | `#6b6e5e` | Captions, mono labels |
| `--fg-hair` | `#c4bba0` | Internal table hairlines |
| `--fg-orange` | `#c96442` | **Indicator accent** — chips, totals, CTA, status |
| `--fg-orange-deep` | `#8a3e21` | Folio numbers, links, deeper accent text |
| `--fg-cyan` | `#3a6e72` | **Secondary indicator** — used sparingly for "extra info" chips (HD Master, 24-hour vet) |

The system is mostly **monochrome** (ink + parchment) with two indicator colors. The cyan should appear at most 2–3× per page; orange is the dominant accent for status, totals, primary CTA.

### Type stack

| Role | Font | Notes |
|---|---|---|
| **Display** | `IBM Plex Sans` 700 | Titles at 22–56px. Tight tracking (`-0.02em` to `-0.025em`). |
| **Body** | `IBM Plex Sans` 400 / 500 / 600 | 14px main. 13px in tables. |
| **Mono** | `IBM Plex Mono` 500 / 600 | The voice of the system. Used for *every* label, section folio, chip, ID code, time, status. Tight tracking (`0.04em`, never 0.32em). |
| **Serif** | `IBM Plex Serif` 500 / 700 | Used **only** in the welcome prose paragraph and the agreement block. The single concession to readability for long-form text. |

**No italics.** Anywhere. The system uses chips, weight, color, and indentation for emphasis — never slant.

### Chips & status indicators

The most distinctive element is the **chip system**:

```css
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 6px;
  font-family: var(--fg-mono); font-weight: 500; font-size: 10.5px;
  letter-spacing: 0.04em;
  background: var(--fg-paper-warm); color: var(--fg-ink);
  border: 1px solid var(--fg-ink);
}
.chip.orange { background: var(--fg-orange); color: var(--fg-paper); border-color: var(--fg-orange); }
.chip.cyan   { background: var(--fg-cyan);   color: var(--fg-paper); border-color: var(--fg-cyan); }
```

Used everywhere: in the hero (`<span class="chip orange">OPEN</span>`), in particulars rows (level names, element names), in judge cards (trial assignments), in cards (HOTEL, VENUE, 24-HOUR VET). They are the system's load-bearing affordance.

### Layout signatures

- **Top ID bar** — dark band with show identifier (`BCKC.2026.SS`), section anchor nav, primary CTA. Sticky.
- **Quick-reference hero** — 6-cell horizontal grid for the most-asked-for facts (dates, opens, closes, draw, confirm, capacity). Below an h1 with subtitle in mono ("FIELD GUIDE · BCKC.2026.SS · REV 04").
- **Three-column section heads** — `[folio] [title] [meta]` grid with double-rule beneath. Folio is mono orange, title is sans bold, meta is mono mute.
- **Data tables with alternating rows** — `tr.alt { background: var(--fg-paper-warm) }`. This is the dominant content layout.
- **Stat grid** — 4-column row of mini-cards with mono label, big sans tabular number, mono sub-caption.
- **Reference cards** — 2-col grid of bordered cards with ID code chip (LDG.01, VET.01, VEN.01) + chip-tagged title + mono data row + body.
- **Timetable** — proper 4-column data table with time / duration / item / hall columns.

### Motion

Almost none. Capacity bar fills over 1.1s with 400ms delay. That is the only animation on the page. Reduced motion fallback disables it. **This style does not animate** — it's a reference document.

## Files in this handoff

| File | Purpose | Format |
|---|---|---|
| `Field Guide Landing Page.html` | Public trial-detail page | Responsive web, 1200px content max |
| `Field Guide Entry Blank.html` | Mail-in entry form | US Letter portrait, single page, print-ready |
| `Field Guide Confirmation Email.html` | Post-confirmation transactional email | 600px email-safe HTML, table-based, inline styles |
| `Field Guide Wizard Completion.html` | Final wizard step | Component preview, matches HeritageEntryReceived.tsx props |
| `README.md` | This document | — |
| `Field Guide Reconciliation Notes.md` | Codebase mapping for engineering | — |

## Cross-style differentiation

- **vs Headline (the other sans system)** — Headline = Inter Tight 900, kicker tags, marker highlights, hot newsroom red. Field Guide = IBM Plex Sans, chip system, indicator orange, no italics. Both sans-only, but Headline is *editorial* and Field Guide is *technical*.
- **vs Banner (the other corporate-modern sans)** — Banner = single flag-bar masthead, monolithic. Field Guide = no masthead, just an ID strip + quick-ref grid. Banner shouts in scale; Field Guide whispers in data density.
- **vs Gazette (its prose opposite)** — Gazette = 3-column drop-cap welcome, classifieds boxes, italics everywhere. Field Guide = compact prose paragraph max, dense data tables, no italics. Gazette is *publication*; Field Guide is *reference document*.

## Known caveats

- **IBM Plex Sans + Mono + Serif** = three families to load. Each is ~30–60kb subset. Consider preloading just Sans + Mono and lazy-loading Serif only when the welcome section comes into view.
- The chip system has accessibility considerations: chips are decorative but carry data. Screen readers will announce them in reading order. Make sure chip text is meaningful as a plain word ("OPEN", "TRIAL 01·03·05") not as a glyph or single character.
- Alternating row backgrounds (`tr.alt`) **work in modern email clients** (Apple Mail, Gmail, Outlook 365) but render flat in Outlook 2007–2019. Acceptable degradation.
- The indicator orange `#c96442` has WCAG AA contrast against `#f6f1e6` at 4.6:1 — fine for buttons and chips, **not for body text**. Don't use orange for paragraphs.
- The cyan `#3a6e72` is reserved for "additional info" indicators (HD chip, 24-HR VET chip). **Do not use it for navigation or primary CTAs** — that role belongs exclusively to orange.

## Cross-style decisions worth noting

This is the **last of the eight bundles**. A few decisions made consistently across all seven new-bundle styles (Heritage shipped first; Headline, Monogram, Banner, Magazine, Poster, Gazette, Field Guide follow the same template):

1. **Same `HeritageEntryReceivedProps` interface** for every wizard completion screen — no style invents new props
2. **Same component file structure** under `apps/myk9show/src/features/<style>/`
3. **Same email-template registry pattern** in `packages/email/src/templates/`
4. **Same `<style>Tokens.ts` shape** in both `features/<style>/tokens.ts` and `packages/email/src/<style>Tokens.ts`
5. **Same migration constraint** — all 8 values allowed in `shows.landing_style`
6. **Each style adds at most ONE new architectural concept**: Banner adds `brand_color`, Magazine adds image columns, Poster adds graphic-shape components, Field Guide adds the chip system

After Field Guide ships, the architecture is fully validated.

## End of the eight-style series

This is the final visual style. The complete set is:

| Style | Identity | Voice | Best for |
|---|---|---|---|
| **Heritage** | engraved certificate · Cormorant Garamond · claret + gold | formal, ceremonial | traditional clubs |
| **Headline** | newsroom front · Inter Tight 900 · hot red kicker tags | loud, contemporary | high-energy events |
| **Monogram** | private-club stationery · Bodoni + embossed initials · cream + bronze | quiet, refined | small invitational shows |
| **Banner** | corporate-Bauhaus · Inter Tight · single colored flag-bar | confident, institutional | mid-sized established clubs |
| **Magazine** | editorial spread · Cormorant Garamond + photography · warm gold | literary, photographic | clubs with strong visuals |
| **Poster** | graphic poster · Archivo Black + ink-blot · cream + red + olive | maximalist, expressive | flagship championship events |
| **Gazette** | newspaper broadsheet · Playfair Display + 3-column body · sepia + brown | wordy, nostalgic | old-guard regional clubs |
| **Field Guide** | utility reference · IBM Plex + chips · parchment + indicator orange | technical, scannable | data-heavy multi-trial weekends |

Each is a complete four-artifact bundle (landing + entry blank + email + wizard completion) plus README + reconciliation notes.
