# Gazette Style — Design Handoff

The **Gazette** style renders the trial as a small-town newspaper broadsheet: Playfair Display masthead with edition meta, 3-column body type, drop-cap leads, dotted-rule classifieds boxes, sepia paper tone, brown accent. Tone: *The New York Times* circa 1947 meets a working kennel-club newsletter. Built for clubs that want their trial to feel like a printed publication — wordy, considered, faintly nostalgic.

This is the most *text-dense* style in the system. The hero is a 3-column article body with a drop cap, not a giant headline. Where Poster shouts in scale, Gazette whispers in column inches.

## Visual system

### Color tokens

| Token | Value | Used for |
|---|---|---|
| `--gz-paper` | `#f7f1e3` | Page background — warm ivory with subtle texture |
| `--gz-paper-warm` | `#ede5d2` | Inset/footer background |
| `--gz-ink` | `#2a2520` | Body type, rules, masthead |
| `--gz-soft` | `#3d352c` | Body copy |
| `--gz-mute` | `#7a6e58` | Captions, mono labels |
| `--gz-brown` | `#6b4f3a` | **Accent** — italic emphasis, kickers, classifieds tags |
| `--gz-hair` | `#b8a98a` | Internal hairlines, dotted rules |
| `--gz-deep` | `#1a1611` | Final-ad band background |

The body background uses a subtle 45° repeating gradient at `0.018` opacity to suggest letterpress paper texture. **Do not increase the opacity** — at higher values it competes with text and reads as digital noise.

### Type stack

| Role | Font | Notes |
|---|---|---|
| **Display** | `Playfair Display` 700 / 900 (italic 400 / 700) | The masthead, all headlines, drop caps. Note: italics drop weight to 400 for that classical newspaper look — italic 700 is too "feature article." |
| **Body** | `Source Serif 4` (variable optical) | 15px main, 13–14px in classifieds. The reading face. |
| **Meta / labels** | `IBM Plex Mono` 500 / 600 | Tracked 0.18em–0.32em depending on context. Used for masthead meta, section kickers, "VOL LXXIX" type material. |

The system also uses **old-style figures** (`font-feature-settings: "onum" 1`) on the body for that newsprint typography touch. Numbers in masthead and headlines stay lining (default).

### Layout signatures

- **Masthead with edition strip** — top thin rule, edition + city + date, big Playfair title with italic articles ("*The* … *Gazette*"), bottom rule with sub-strip carrying established date, motto, and license. This is the single most recognizable element.
- **3-column drop-cap body** — true `column-count: 3` newspaper layout for the welcome/lead article. `column-rule: 1px solid` between columns. Drop cap at 72px.
- **"Continued on §02" rule** — pseudo-newspaper page break between major sections. Functional only on landing page; signals "the rest of the article is in the next section."
- **Classifieds boxes** — bordered cards with category caps, italic title, body, dotted-bottom meta line. Used for hotels, vet, awards, hospitality.
- **Double-rule sectioning** — major section breaks use `4px double var(--gz-ink)` rules with section letters ("SECTION B · PARTICULARS").
- **Schedule with hall column** — 3-column row (time / event / hall location). Mono hall labels on the right.

### Motion

Almost none. Title rises 6px on load over 800ms with 100ms delay. Lead article title and dek rise sequentially. Capacity bar fills over 1.4s. Nothing else moves. This is a print publication; print doesn't animate.

## Files in this handoff

| File | Purpose | Format |
|---|---|---|
| `Gazette Landing Page.html` | Public trial-detail page | Responsive web, 1100px content max |
| `Gazette Entry Blank.html` | Mail-in entry form | US Letter portrait, single page, print-ready |
| `Gazette Confirmation Email.html` | Post-confirmation transactional email | 600px email-safe HTML, table-based, inline styles |
| `Gazette Wizard Completion.html` | Final wizard step | Component preview, matches HeritageEntryReceived.tsx props |
| `README.md` | This document | — |
| `Gazette Reconciliation Notes.md` | Codebase mapping for engineering | — |

## Cross-style differentiation

- **vs Heritage (the other formal warm serif)** — Heritage = engraved certificate, ✦ ornaments, claret + gold. Gazette = newspaper masthead, dotted rules, brown sepia. Heritage feels like a *document*; Gazette feels like a *publication*.
- **vs Magazine (the editorial serif)** — Magazine = Cormorant gold-gradient, drop caps in 2-col, photographic. Gazette = Playfair brown, drop cap in 3-col, classifieds. Magazine is *quarterly print*; Gazette is *daily local paper*.
- **vs the original Gazette premium PDF** — the existing PDF was a single-page newspaper-style front. This bundle keeps the masthead concept but extends it across pages with section letters ("SECTION B/C/D"), classifieds boxes, and "continued on §" rules. Same DNA, fully extended.

## Known caveats

- **3-column body at narrow widths** — the design switches to `column-count: 1` below 900px. Drop cap remains in the single column. Test at 375px to verify the drop cap floats correctly.
- **Old-style figures** — `font-feature-settings: "onum" 1` is well-supported but doesn't render in older Outlook. The email template uses lining figures (default). Acceptable degradation.
- **Texture gradient** — the repeating background gradient at 45° can interact with Chrome's printing pipeline to render as banding stripes. Print stylesheet sets `background-image: none` on body. Already handled in the entry-blank file.
- **Playfair Display italic at 400** — at body sizes (16px and below) renders thin on Windows. Don't use italic Playfair below 16px. Use Source Serif italic instead.

## Implementation notes

- Drop cap is a `<span class="drop-cap">F</span>` wrapping just the first letter of the lead paragraph. **Don't** use `::first-letter` — it doesn't accept `float` reliably across browsers and floats poorly out of `column-count` flows.
- "Continued on §02" is a `<div class="gz-continued">` between sections. In code, this should be a `<ContinuedRule to="particulars" />` component that takes the target section name.
- Section letters (`SECTION B · PARTICULARS · PAGE 02 · VOL. LXXIX`) appear as the page rule between sections. They're labels for the visual system, not metadata — `vol` is always the same (the club's current Gazette volume), `page` increments per section.

## Next style in queue

Field Guide. Field Guide is the *opposite* of Gazette: utilitarian, mono-heavy, dense data tables, indicator-orange accents, no italics, no decoration. Where Gazette is *prose*, Field Guide is *spec sheet*.
