# Magazine Style — Design Handoff

The **Magazine** style renders the trial as a designed editorial spread: oversized italic display serif, warm gold gradient hairlines, drop-cap openings, multi-column body type, and a feature photograph slot on the cover. Tone: *Kinfolk* meets a print quarterly. Built for clubs that want the trial to feel slow-read, considered, and beautifully made.

This is the most *photographic* style in the system. Even with no images supplied, the page reserves space for them via gradient-filled placeholder rectangles labeled "Cover photograph · Club to supply" — so the layout never looks broken when copy lands without art, but the cost of *not* uploading art is visible (and a gentle push to do so).

## Visual system

### Color tokens

| Token | Value | Used for |
|---|---|---|
| `--mz-paper` | `#f6f1e8` | Page background — warm cream |
| `--mz-paper-deep` | `#ece4d3` | Inset surfaces, footer band |
| `--mz-ink` | `#1a1a1a` | Body type, rules |
| `--mz-soft` | `#2e2820` | Body copy |
| `--mz-mute` | `#7a6e58` | Captions, labels |
| `--mz-quill` | `#5c4f3a` | Italic muted text, deks |
| `--mz-gold-1` | `#c9a87c` | Lightest gold — gradient stop, dark-band accent |
| `--mz-gold-2` | `#a8814f` | Mid gold — gradient stop, dotted hairlines |
| `--mz-gold-3` | `#4a3826` | Darkest gold — italic emphasis text, eyebrows |

The gold is a **gradient, not a single color** — used as a horizontal hairline rule (`linear-gradient(90deg, gold-1, gold-2)`), as italic emphasis text (clipped from the same gradient), and as the dark-band background (`gold-3 → 2e2820 → 1a1a1a`). One palette, three depths, three textures.

### Type stack

| Role | Font | Notes |
|---|---|---|
| **Display** | `Cormorant Garamond` 500 / italic | Headline at 72–112px. Italic for emphasis, gold-clipped. |
| **Body** | `Source Serif 4` (variable optical) | Workhorse — 15–18px. Multi-column body uses 18px / 1.75. |
| **Drop cap** | `Cormorant Garamond` 500 | 88px, in `--mz-gold-3`. One per major prose section. |
| **Meta / labels** | `Inter Tight` 500 | Caps tracked 0.28em–0.32em. The only sans in the system — used sparingly. |

The system deliberately mixes **two serifs** (one for display, one for body), which is unusual. Cormorant carries the editorial flair; Source Serif sits quietly underneath and does the heavy reading work. **Do not substitute** Cormorant body for Source Serif — Cormorant at body sizes loses its hairlines and becomes hard to read.

### Layout signatures

- **Two-column hero spread** — text on the left (~55% column), feature photo on the right (~45% column, 4:5 aspect). The cover photograph slot is required infrastructure even when no image is provided (gradient placeholder).
- **Multi-column body in Welcome** — actual `column-count: 2` with `column-gap: 56px`. Drop cap floats on the first paragraph. Pull quote breaks back to full width via `column-span: all`.
- **Pull quote** — bordered top/bottom with gold-gradient stripe, oversized italic display, attribution in caps mono-tracked. This is the single most "magazine-y" element in the system.
- **Editorial portraits for judges** — 4:5 aspect gradient placeholder with the judge's initials, a "Plate I / Plate II" caption tag. Photographic, not databasic.
- **Definition list for particulars** — two columns of `dl` with dotted-gold hairlines and italic gold emphasis for numbers/dates.
- **Final CTA** — dark gradient band (gold-3 → ink) with gold-clipped italic display and a paper-on-ink CTA button.

### Motion

Soft and slow. Cover image fades in over 1.2s. Hero text staggers up 150ms apart over 900ms. Capacity bar fills over 1.8s with bronze-to-leaf gradient. No bouncing. No sliding from edges. The page composes itself like a printed page being lifted into view.

## Files in this handoff

| File | Purpose | Format |
|---|---|---|
| `Magazine Landing Page.html` | Public trial-detail page | Responsive web, 1280px content max |
| `Magazine Entry Blank.html` | Mail-in entry form | US Letter portrait, single page, print-ready |
| `Magazine Confirmation Email.html` | Post-confirmation transactional email | 600px email-safe HTML, table-based, inline styles |
| `Magazine Wizard Completion.html` | Final wizard step | Component preview, matches HeritageEntryReceived.tsx props |
| `README.md` | This document | — |
| `Magazine Reconciliation Notes.md` | Codebase mapping for engineering | — |

## Cross-style differentiation

- **vs Heritage (the other warm serif)** — Heritage = engraved double borders, Cormorant + EB Garamond, claret accent. Magazine = gold gradient + drop caps + photographic layout. Heritage is *certificate*; Magazine is *editorial*. They share Cormorant Garamond as a display face but couldn't read more differently in execution.
- **vs Monogram (the other quiet serif)** — Monogram is letterpress emboss + Bodoni. Magazine is gradient gold + Cormorant. Heritage and Monogram both feel like *stationery*; Magazine feels like *publication*.
- **vs the original Magazine premium PDF** — The PDF was a single magazine cover with an "At a Glance" panel. This bundle extends the magazine *system*: drop caps, pull quotes, multi-column body, editorial photo slots. Same DNA, full system expression.

## Photographic asset slots

This is the only style with **photo asset infrastructure**. Three locations:

1. **Hero feature** — 4:5 aspect, cover spread
2. **Judge portraits** (×2) — 4:5 aspect, full-bleed within their cards
3. **(Optional)** — pull-quote backdrop, currently solid; could host a venue exterior shot

The mocks show what each looks like *without* an uploaded image: gradient with club monogram and a caption explaining the asset is missing. When an image is provided, it replaces the gradient entirely (and the caption + monogram move into a corner overlay).

This is **net-new infrastructure** for the codebase — no other style needs image upload UX. The reconciliation notes detail the schema additions and component contract.

## Known caveats

- Cormorant Garamond at >96px on Windows renders with visible vertical-stroke aliasing in some browsers. Acceptable trade-off for the aesthetic; do not switch to a "smoother" face — Cormorant's quirk is the point.
- `column-count: 2` breaks unpredictably with embedded media (pull quotes, signature blocks). Use `break-inside: avoid` on every block that should stay intact, and `column-span: all` on full-width interruptions.
- Drop-cap floats can collide with following paragraphs at narrow widths. Below 640px the design switches to single-column with no drop cap.
- Gradient text (`-webkit-background-clip: text`) renders as solid color in Outlook and older clients. The email template falls back to `color: var(--mz-gold-3)` for any italic emphasis — see the email file's inline styles.

## Next styles in queue

Poster (the loud opposite of Magazine), Gazette (newspaper to Magazine's magazine), Field Guide (utility/reference, the antithesis of editorial). All three sit further from Magazine than Heritage/Monogram do, which is the right shape — Magazine occupies the *photographic editorial serif* slot uniquely.
