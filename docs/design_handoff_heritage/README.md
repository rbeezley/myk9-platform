# Handoff: Heritage Style — Public Trial Pages (myK9Show)

## Overview

This package contains design references for the **Heritage style** applied to three trial-publishing artifacts beyond the premium PDF:

1. **Heritage Landing Page** — the public-facing web page exhibitors see when a club shares a trial link. Replaces or sits alongside the current trial-detail page for clubs that pick the Heritage style.
2. **Heritage Entry Blank** — a printable, single-page (US Letter portrait) PDF/HTML form for the **mail-in entry path**. Exhibitors print it, fill in by hand, and post it to the trial secretary.
3. **Heritage Confirmation Email** — the formal HTML email sent to **all entrants** (online and mail-in) on the confirmation date once the draw is set. Engraved typography, table-based layout for email-client compatibility.

A fourth touch-point is also in scope:

4. **Wizard completion screen restyle** — when an exhibitor finishes the existing entry wizard, the *final summary screen* should be re-rendered in the Heritage style to mirror the confirmation email. The wizard's earlier steps (data collection) stay as-is. A "Print my entry blank" action on this screen should generate a populated copy of the Heritage Entry Blank.

The Heritage **Premium PDF** itself is **not** in this handoff — it shipped in the previous Premium Designs handoff (`design_handoff_premiums/`, Style 8).

## About the Design Files

The HTML files in this bundle are **design references**, not production code. They are prototypes built in plain HTML/CSS so the design is viewable without a build step. **The task is to recreate these designs in myK9Show's existing React codebase** — using the project's real component library, routing, and data model. Lift the visual decisions (typography, color tokens, layout structure, spacing, ornaments, micro-animations); do not copy the HTML verbatim.

The confirmation email is the exception: that file is intentionally written in **email-safe HTML** (table-based layout, inline styles on critical elements, 600px width) and should be ported to the project's transactional-email pipeline (SendGrid / Postmark / Mailgun template, MJML, etc.) preserving the table structure. Modern CSS techniques used elsewhere in the system will not render reliably in Outlook/Gmail.

## Fidelity

**High-fidelity.** Colors, typography, spacing, and ornaments are final. Match the system pixel-close.

---

## Multi-Registry Note

A separate scoping document, **`Multi-Registry Scoping.md`**, is included in this handoff. It describes how the system will eventually support sanctioning bodies beyond AKC (UKC, ASCA, CKC, etc.). **Implement the registry-config layer now, with AKC populated as the only registry.** This avoids retrofitting later. All registry-specific copy in the design files (license language, exhibitor agreement text, class structure, member-club footer line) should be read from a `registries.AKC.*` config rather than hardcoded.

Specifically, these strings/structures must come from config:
- "An A.K.C. Licensed Trial" / "American Kennel Club" / "A.K.C." (license language, registry name, short name)
- "A member club of the American Kennel Club" (footer line)
- The full ~300-word exhibitor agreement in §V of the entry blank
- Class levels (Novice, Advanced, Excellent, Master) and elements (Containers, Interiors, Exteriors, Buried, Handler Discrimination, Detective)
- Required dog fields (registered name, breed, sire, dam, breeder, registration number, etc.)

See the scoping doc for the proposed schema shape.

---

## Design Tokens

Used by all three artifacts. Define once in the React app's theme/tokens module.

### Colors
| Token | Hex | Usage |
|---|---|---|
| `paper` | `#f8f4ea` | Page background, card surfaces |
| `ink` | `#1a1612` | Primary text, borders, dark headings |
| `claret` | `#8a1818` | Accent / italic highlights / corner dots / footer headers |
| `gold` | `#8a6a45` | Secondary rules, dotted underlines, panel borders |
| `quill` | `#6b4f3a` | Italic muted text, captions, labels |
| `paperDark` | `#d9d2c2` | Off-page background (browser preview gutter only — not used in prod) |

### Typography
- **`Cormorant Garamond`** (italic 400/500/600, regular 400/500/600) — display, italics, ornaments, section folios. Loaded from Google Fonts.
- **`EB Garamond`** (regular 400/500, italic 400/500) — body copy, labels, lists. Loaded from Google Fonts.

```html
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&display=swap" rel="stylesheet" />
```

### Spacing & layout
- Section padding: `48px` vertical between sections, `72px` page horizontal padding (landing page is centered, max-width ~960px content).
- Engraved double border: outer 1px solid ink, 6px gap, inner 1px solid ink. Used on entry blank and on hero ornament.
- Corner dots: 4–7px claret radial-gradient circles at each corner of bordered elements.

### Ornaments
- **`✦`** (U+2726) — diamond glyph used as the centerpiece of horizontal rules. Typeset in Cormorant Garamond at 16–22px.
- **Rule ornament**: thin line, gap, ✦, gap, thin line. Two variants: ink-colored (default) and gold (`gold` modifier).
- **Section folio**: `§ I`, `§ II`, etc. — Cormorant Garamond italic, claret color, used as section markers.

---

## Artifact 1: Heritage Landing Page

**File:** `Heritage Landing Page.html` · **CSS:** `heritage.css`

### Purpose
The public web face of a trial. Exhibitors land here from a shared link, search results, or the club's own website. They can read all trial particulars, see judges, plan logistics, and click through to the entry wizard.

### Route
Suggested: `/trials/:trialId` (or whatever myK9Show's existing public-trial route is). When a club has selected the Heritage style, render this layout instead of the default. Style choice should already be a field on the trial record.

### Layout & Sections

Centered single-column page, max-width ~960px content, `paper` background.

1. **Sticky nav** — top of page, ~64px tall, `paper` background with bottom hairline rule. Contains:
   - Left: club seal mark ("B" in claret circle) + "Bexar County K.C."
   - Center: section anchor links (Overview · Judges · Plan · On the Day) — small caps, italic, 12px, claret on active section
   - Right: "share ✦" button + "Submit Entry" button (claret-bordered, fills on hover)

2. **Hero** — `#overview` — full-bleed engraved title block:
   - Top corner dots (claret radial gradients)
   - "The Officers & Members do present" supra-line (italic quill)
   - "Bexar County Kennel Club" club name (uppercase, letter-spaced 0.18em)
   - Establishment line (italic, quill)
   - First ornament rule (✦)
   - "the" italic transition word
   - Title: "Spring *Scent Work* Trial" — 84px Cormorant Garamond, italic *Scent Work* in claret
   - Subtitle: "An A.K.C. Licensed Trial · Six Trials Over Three Days" (uppercase, letter-spaced 0.32em, quill)
   - Second ornament rule (gold variant)
   - Three-column meta grid (held on / at the / in)
   - **Live countdown** to entry close, four blocks (days/hours/minutes/until close). Updates every second. When a digit changes, it fades+drifts up briefly (240ms ease-out) before settling on the new value.
   - Submit Entry CTA + "Entries close..." caption

3. **§ I — Welcome** — short prose from trial chair. Section folio + h2 + italic English subtitle ("By way of greeting"). Two paragraphs centered prose, em italic for emphasis. Italic signature line.

4. **§ II — Judges** — `#judges` — two-column judge cards. Each card: trials assigned (italic, quill, e.g. "Trials I · III · V") → name (32px Cormorant Garamond) → city (italic) → panel chip (small caps "Panel" label + element list).

5. **§ III — Trial Particulars** — section folio + h2 + English subtitle. One paragraph of prose, then a `<dl>` "detail list" of trial particulars (sanctioning, format, levels, entry limit, opening date, closing date, confirmation date) with dotted leader lines between term and description. Below: "Of the Fees" sub-header and three fee blocks (first entry / each additional / junior handler) in a row.

6. **§ IV — The Roster** — capacity meter:
   - Big number "137 / 360" with italic "runs claimed at this hour" caption
   - Horizontal bar that fills to ~38% on first scroll (1400ms ease)
   - Below: ornament rule, then **journey timeline** — six rows, each with a date column ("15 Apr"), a dot column (with claret color for `done`/`active`, ink dot for future), and a description column. The active step ("3 Jun · Entries close") gets a soft pulsing claret ring (2.4s ease-in-out infinite loop). Steps reveal sequentially top→bottom with 140ms stagger.

7. **§ V — Plan Your Sojourn** — `#sojourn` — one paragraph prose, then a 2×2 grid of "card-formal" cards. Each card: roman-numeral number (italic claret) → title (Cormorant Garamond 24px) → meta line (italic quill) → info paragraph. Three lodging cards + one emergency vet card.

8. **§ VI — On the Day** — `#day` — flow strip ("check-in › briefing › trials › lunch › awards") with chevron arrows; small caption beneath. Then a 2×2 grid of card-formal cards: Hospitality, Awards & Honours, The Venue, House Rules.

9. **§ VII — In Whose Care** — small officers list, centered, dotted underlines.

10. **§ VIII — Final CTA** — `#enter` — `ink`-colored band (dark, paper text), centered seal mark, "You are *cordially* invited." headline, descriptive paragraph, big Submit Entry button. Below: gold ornament rule, then three entry-method cards (Online / By Post / By Email).

11. **Footer** — `ink` background, paper text. Club name (uppercase letter-spaced), establishment line, divider, secretary contact, sponsors list, fine print with copyright and links.

### Micro-animations

All defined in `heritage.css` under "MICRO-ANIMATIONS" comment block. All respect `prefers-reduced-motion`.

| Element | Animation | Trigger |
|---|---|---|
| Hero composition (each child element) | Fade up 10px → settled, 800ms ease-out, staggered 100–1100ms | On load |
| Hero corner dots | Scale 0 → 1.4 → 1, 1200ms ease-out | On load (200ms / 320ms delays) |
| Section headings (`.hl-section-head`) | Fade up 12px, 720ms ease-out | IntersectionObserver, threshold 0.18, once |
| Ornament rules (`.hl-rule-orn`) | Lines `scaleX(0)` → `scaleX(1)` from center, 900ms cubic-bezier; ✦ glyph fades in 200ms after | Intersection, once |
| Capacity bar fill | `width: 0` → `width: 38%`, 1400ms cubic-bezier | Intersection, once |
| Journey timeline steps | Fade + slide-right, 540ms ease-out, 140ms stagger | Intersection on parent, once |
| Active timeline dot | Pulsing claret ring, 2.4s infinite | After reveal |
| Countdown digit change | translateY(-2px) + fade 0.4 for 120ms, then text swaps | Each second when digit actually changes |

The IntersectionObserver pattern: observe targets `.hl-section-head, .hl-rule-orn, .hl-capacity, .hl-journey`; on first intersection add `.in` class (which triggers the CSS transition); unobserve. Reduced-motion fallback adds `.in` immediately.

### Interactions
- All section anchor links smooth-scroll to their target.
- Sticky nav active state: tracks scroll position; the link whose section's top is most recently passed gets `.active` (italic + claret).
- Share button copies `window.location.href` to clipboard, shows a small ink-colored toast bottom-right ("Link copied to clipboard ✦") for 1800ms.
- Submit Entry buttons all scroll to `#enter`. In production: link to the existing entry wizard route.

---

## Artifact 2: Heritage Entry Blank

**File:** `Heritage Entry Blank.html`

### Purpose
A printable, mail-in entry form. Single page, US Letter portrait (8.5" × 11"). Exhibitors print, fill in by hand, sign §V, and mail to the trial secretary or scan/email a PDF.

### Two delivery modes
1. **Static blank** — empty form for download from the landing page (under "Plan Your Sojourn" or near the entry-method cards). Currently just the prototype — in production this is generated as a PDF from the trial record (so club name, dates, judges, fees populate automatically).
2. **Pre-filled** — generated from the wizard completion screen (Artifact 4 below) populated with the entrant's data. Allows the user to print a paper record of what they entered online.

### Layout

Single page, paper background, engraved double-border frame with claret corner dots.

- **Header** (centered): "Official Entry Blank" supra → club name → establishment line → ornament rule → "Spring *Scent Work* Trial" title → AKC license subtitle → gold ornament rule → meta line ("Entries close 3 June 2026 · 8:00 PM Central · One dog per blank · Please print clearly in ink").
- **§ I — Particulars of the Dog** — 12-column field grid: registered name (8 cols) + call name (4); breed / variety / sex / DOB / place of birth / AKC reg # — three rows of 4-col fields; sire / dam / breeder / actual owner — two rows of 6-col dotted-underline fields.
- **§ II — Classes Entered** — trials table (6 rows: trial roman numeral, day, element list, judge, single checkbox cell with "level ↓" caption pointing to the level grid below). Then: 4-row × 4-column class-level grid with checkboxes for every Level × Element combination (Novice/Advanced/Excellent/Master × Containers/Interiors/Exteriors/Buried), plus an "Other" row for Handler Discrimination and Detective (Master).
- **§ III — Owner & Handler** — 12-col field grid for owner name, handler name, mailing address, city/state/ZIP, phone, email, junior handler age.
- **§ IV — Fees Tendered** — fee box with two columns of dotted lines (first entry $25 / additional $22 each / junior $18 / mail-in processing $3) plus a Total line with a $-prefixed signature blank. Below: payment-method checkboxes (check / money order / online).
- **§ V — Agreement & Signature** — 300-word AKC agreement block in a gold-bordered panel. Two-column signature row: signature line (2 cols wide) + date line (1 col wide).
- **§ VI — Mail-to panel** — engraved double-border box with two columns: postal address and email address.
- **Foot rule + small italic foot-line** with closing date and online-entry URL.

### Section folio rule
`.sec-folio` must have `white-space: nowrap` and `min-width: 32px` to prevent "§" and the roman numeral from breaking onto separate lines.

### Print
- `@media print { @page { size: letter; margin: 0; } body { background: #fff; } .screen-bar { display: none; } .page { box-shadow: none; margin: 0; } }`
- `screen-bar` is the dark "Print / Save as PDF" bar shown on screen only.

### Form fields (for the pre-filled version)
When generating a pre-filled blank from a completed wizard entry, populate every text-input slot. The dotted-underline fields (`.f .ln`) should render the value above the line, italic. Checkbox cells (`.cb`) should render as filled (✕ or ✓ glyph in claret) when selected. Render the agreement text as a fully-justified read-only block (not editable).

---

## Artifact 3: Heritage Confirmation Email

**File:** `Heritage Confirmation Email.html`

### Purpose
Sent to **all entrants** (both online and mail-in) on the trial's **confirmation date** (~6 days before trial) once the draw is complete and armband numbers are assigned. Communicates: entry confirmed, runs they're in, judges, armband number, what to expect on the day, withdrawal policy, contact.

### Note on entry receipts
A separate **online-receipt email** is sent immediately when an exhibitor finishes the wizard — confirming payment received and entry recorded. That receipt is **transactional and short** (uses the wizard's existing email template). It is **not** in scope for this handoff.

This Heritage confirmation is the formal "your entry is confirmed and the draw is set" email — sent later, to everyone, in the engraved style.

### Email-safe constraints

This email **must** render correctly in Outlook 2007–2021, Gmail web/iOS/Android, Apple Mail, Yahoo, and dark-mode clients. Do not introduce modern CSS features. Specifically:

- **Table-based layout** (`<table role="presentation">` with `cellpadding="0" cellspacing="0" border="0"`).
- **Inline styles** on every visible element. The `<style>` block in the prototype is for browser preview only.
- **600px max-width** outer body.
- **No flexbox, grid, custom fonts loaded via `@import`** in the body. Web fonts must come via `<link>` in `<head>` only and should be paired with **Georgia / serif fallbacks** for clients that strip them (Outlook desktop will drop EB Garamond → Georgia).
- **Image-free** — no logos, no decorative imagery. Pure typographic email; survives image-blocking.
- **Unicode ornament `✦`** is fine; renders as text glyph.

### Critical bug-fix to preserve
Horizontal ornament rules use a `<table>` with three `<td>`s: line / glyph / line. The line cells contain a 1px-tall `<div>` with `font-size:0; line-height:0` (not just `height:1px` on the `<td>`, which gets overridden by the row's natural height and renders as a 22px-tall solid block). **Keep the `<div>` wrapper** when porting.

### Layout (top to bottom)

1. **Header** (centered, 36px top padding):
   - "A formal confirmation from" italic supra-line
   - "Bexar County Kennel Club" club name (uppercase, letter-spaced)
   - Establishment line (italic quill)
   - Ornament rule (✦)
   - "Your entry is *confirmed*." headline (38px, italic *confirmed* in claret)
   - Trial subtitle (uppercase, letter-spaced, quill)

2. **Greeting** — "Dear *{salutation + last name}*" + paragraph confirming entry recorded and draw complete.

3. **Entry detail card** — bordered top + bottom (1px ink), contains:
   - "§ The Dog" italic claret folio
   - Dog's registered name (24px Cormorant)
   - Call name + breed + sex (italic quill, 13px)
   - Runs table: trial roman / day / class / judge / armband number
   - Footer line: total runs, total fees, receipt number

4. **§ On the Day** section — italic claret folio + h2 → 2-column grid: doors / first class / crating | venue / parking / hospitality. Each cell has italic-quill label above ink value. Below: gold-bordered panel with bring-this-to-check-in reminder and armband callout.

5. **Gold ornament rule divider.**

6. **§ If you must withdraw** — short paragraph on refund/withdrawal policy, then contact line with mailto link.

7. **CTA** — dark ink button "View trial particulars ›" linking back to the landing page. Italic caption beneath ("Add to calendar · directions · order of running").

8. **Sign-off** — "We look forward to seeing you and {call name} at {venue short}." → "— Sarah Whitman" italic signature → "Trial Chair, Bexar County Kennel Club" italic quill caption.

9. **Footer** (ink background, paper text) — club name + establishment + transactional fine print + manage-preferences and view-in-browser links.

### Personalization fields
Variables to merge in:
- `{exhibitorSalutation}` `{exhibitorLastName}` (greeting)
- `{dogRegisteredName}` `{dogCallName}` `{dogBreed}` `{dogSex}` (entry card)
- `{runs[]}` (for each: `trialRoman` `dayLabel` `className` `judgeShort` `armband`)
- `{totalRuns}` `{totalFees}` `{receiptNumber}` (entry card footer)
- `{venueShort}` `{venueAddress}` (on the day)
- `{trialChair}` (sign-off name)
- `{trialUrl}` (CTA link)

---

## Artifact 4: Wizard Completion Screen Restyle

The existing entry wizard's data-collection steps are unchanged. **Only the final summary/completion screen** picks up the Heritage style.

### Layout & content
Mirror the structure of Artifact 3 (Confirmation Email):
1. Engraved header — "Your entry has been received" headline (italic *received* in claret) + trial subtitle
2. Entry detail card — same dog + runs + total layout as the email
3. **Two prominent actions**:
   - Primary: "Print my entry blank" button (claret-filled, paper text) — generates the populated Heritage Entry Blank PDF (Artifact 2 in pre-filled mode)
   - Secondary: "Return to dashboard" or equivalent ghost button
4. Italic-quill caption: "A formal confirmation will be emailed on {confirmationDate} once the draw is complete."

### Note
This screen is **not** the same as the confirmation email — it's the *immediate* end-of-wizard moment. The email comes later. But the visual language matches so the exhibitor sees a coherent identity from entry → confirmation.

---

## Files in this bundle

- `Heritage Landing Page.html` — Artifact 1 (full HTML, references `heritage.css`)
- `heritage.css` — All landing-page styles including micro-animations
- `Heritage Entry Blank.html` — Artifact 2 (HTML + inline styles, print-ready)
- `Heritage Confirmation Email.html` — Artifact 3 (email-safe table HTML)
- `Multi-Registry Scoping.md` — Scoping doc for the registry-config layer (implement now, AKC-only)
- `README.md` — this file

## Out of scope

- The Heritage **Premium PDF** (in the previous handoff: `design_handoff_premiums/`)
- The wizard's data-collection steps (existing UI, unchanged)
- The transactional online-receipt email sent at wizard finish (use the wizard's existing template)
- Other 7 styles' landing/entry/email packets (only Style 8 / Heritage is in scope)
- Real reference data for non-AKC registries (the registry-config layer is built but only AKC is populated)
