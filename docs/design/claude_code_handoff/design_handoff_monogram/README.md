# Monogram Style — Design Handoff

The **Monogram** style renders the trial as private-club stationery: an oversized embossed monogram pressed into cream paper, Bodoni Moda display italic, generous whitespace, bronze accent. It's the *quietest* of the eight styles — built for clubs that want their trial to feel like a personal letterhead arriving in the mail.

This style was already in production as the default "classic" treatment. The new four-artifact bundle keeps the **buildMonogram()** initials logic and the embossed-stamp signature, but lifts the visual quality to match Heritage/Headline polish: real letterpress emboss effect, didone display type, deliberate small-caps voice, and a single bronze accent instead of pure black.

## Visual system

### Color tokens

| Token | Value | Used for |
|---|---|---|
| `--mg-paper` | `#f3eee4` | Page background — cream-warm |
| `--mg-paper-deep` | `#ece5d4` | Card/inset surfaces — slightly deeper cream |
| `--mg-ink` | `#1c1815` | Body type, rules, footers |
| `--mg-soft` | `#3a342c` | Body copy on paper |
| `--mg-mute` | `#7a6f5e` | Mid-tone captions, footnotes |
| `--mg-quill` | `#5a4f3e` | Italic muted text |
| `--mg-bronze` | `#8a6938` | **Accent** — italic display, folios, kickers, rules |
| `--mg-leaf` | `#c9a14b` | Highlight on dark backgrounds, capacity-bar terminus |

The palette is **two-tone with a single warm metallic**: ink + cream + bronze. Do not introduce other colors. The leaf gold (`#c9a14b`) is bronze's brighter sibling, used *only* on dark surfaces or when bronze needs to read against a deep tone.

### Type stack

| Role | Font | Notes |
|---|---|---|
| **Monogram letterforms** | `Italiana` | Single-purpose face — used *only* for the BC/CB/etc. initials. Italiana's contrast and condensed proportions make small initials feel monumental. |
| **Display** | `Bodoni Moda` | Optical-size variable. Use at 24px+ for proper hairline strokes. Pair italic with bronze for emphasis. |
| **Body** | `Crimson Pro` | Workhorse serif. 17–19px for prose; 13–15px for tables and forms. |
| **Small caps / labels** | `Crimson Pro` 500 | Set at 11px, letter-spacing 0.32em, uppercase. The voice of every kicker, folio label, and metadata strip. |

Folios are lowercase roman numerals (`i`, `ii`, `iii`...) in Italiana — not the Heritage section sign. This is intentional: the Monogram style is *less ecclesiastical, more bibliophile*.

### The embossed monogram — the signature element

Letterpress emboss is achieved with **layered text-shadow on a gradient background-clip**. The technique is in `Monogram Landing Page.html` under `.mg-monogram`:

```css
.mg-monogram {
  font-family: 'Italiana', serif;
  color: transparent;
  background: linear-gradient(180deg, #ece5d4 0%, #f3eee4 50%, #d8cfb8 100%);
  -webkit-background-clip: text; background-clip: text;
  text-shadow:
    1px 1px 0 rgba(255, 252, 240, 0.95),       /* highlight */
    -1px -1px 0 rgba(28, 24, 21, 0.18),        /* shadow */
    2px 2px 4px rgba(28, 24, 21, 0.12),        /* blur shadow */
    -2px -2px 4px rgba(255, 252, 240, 0.55);   /* blur highlight */
  filter: drop-shadow(0 2px 1px rgba(28, 24, 21, 0.08));
}
```

This **must be preserved verbatim** in the React port. Substituting an SVG or image would lose the dependency on the page's actual background color (the gradient deliberately samples paper tones). When porting:

- Inline the technique in a `<MonogramEmboss letters="BC" size={640} />` component
- Pass `letters` from `buildMonogram(clubName)` — the helper already exists in `pdfStyles.ts`
- Variants: large bleed (hero, 640px), card centerpiece (280px), nav inline (32px solid, no emboss), footer (96px solid)

The monogram appears in **5 contexts** on the landing page:
1. Hero — massive bleed centerpiece (640px)
2. Welcome aside card — 280px tonal centerpiece behind a quote
3. Each judge — 64px solid bronze (CB, MW)
4. Final CTA — 580px embossed in the dark band (deeper gradient)
5. Footer — 96px solid ink

### Motion vocabulary

Light, gentle, no bouncing — per the brief:

| Element | Motion | Duration | Easing |
|---|---|---|---|
| Hero monogram | Fade + tiny scale (0.98 → 1) | 1600ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Hero title / subtitle / meta / CTA | Fade up 12px | 900ms | same, staggered 200ms |
| Capacity bar fill | Width 0 → 78% | 2000ms | same, 400ms delay |
| Section heads on scroll | Fade up 8px | 720ms ease-out | IntersectionObserver, threshold 0.18 |
| Reduced motion | All durations → 0.01ms | — | — |

No flips, no slides from edges, no bounces. The motion should feel like sliding a sheet of paper into view.

## Files in this handoff

| File | Purpose | Format |
|---|---|---|
| `Monogram Landing Page.html` | Public trial-detail page | Responsive web, 1200px content max |
| `Monogram Entry Blank.html` | Mail-in entry form | US Letter portrait, single page, print-ready |
| `Monogram Confirmation Email.html` | Post-confirmation transactional email | 600px email-safe HTML, table-based, inline styles |
| `Monogram Wizard Completion.html` | Final wizard step | Component preview, matches HeritageEntryReceived.tsx props |
| `README.md` | This document | — |
| `Monogram Reconciliation Notes.md` | Codebase mapping for engineering | — |

## Cross-style consistency

This bundle is the third style packet (after Heritage and Headline). Conventions that carry across the three:

- **Section folios** — every style has a folio system. Heritage uses `§ I`. Headline uses `§ 01`. Monogram uses lowercase roman in Italiana (`i`, `ii`...).
- **Two-judge layout** — `JudgesSection` shows two judges per row with credentials, photo placeholder slot, bio. Monogram swaps the photo for the judge's initials in Italiana.
- **Capacity meter** — every landing has the "X of Y" entries-received counter. Monogram styles it as a big Italiana numeral with a thin bronze-to-leaf gradient bar beneath.
- **Final CTA band** — every landing closes with a dark band CTA. Monogram makes that band's background the embossed monogram in deeper tones.
- **Wizard completion → email visual parity** — the wizard final step uses the same header treatment as the confirmation email. This is a Heritage convention worth preserving across all 8 styles.

## Known caveats

- **Italiana** is a single-weight Google Font. Don't try to apply weight 500/600 — it'll fall back. Use scale instead.
- The embossed monogram **only works on cream**. If you change `--mg-paper`, also re-tune the gradient stops on `.mg-monogram` or the effect will look muddy.
- Bodoni at small sizes (<18px) loses its hairlines on Windows ClearType. Use Crimson Pro for body and Bodoni for display only.
- Roman-numeral folios above `viii` start to read as letters not numbers. If a future style needs >8 sections, switch to arabic.

## Next styles in queue

Banner, Magazine, Poster, Gazette, Field Guide. Banner is the next obvious existing-style upgrade. Magazine and Poster sit furthest from Monogram (loud, contemporary). Gazette and Field Guide are utilitarian-leaning and will share more DNA with Headline than Monogram.
