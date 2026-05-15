# Handoff: myK9Show Landing Page Redesign (Pre-launch)

## Overview

This is the redesigned landing page for **myk9show.com** — a pre-launch waitlist page positioning myK9Show as scent-sport-first dog show management software, built by the team behind mySWT, myNWT, and myK9Q (RyKris, since 2013).

The redesign replaces the existing landing page (`apps/myk9show/src/pages/Home.tsx`) and was driven by the May 2026 critique included in `source/landing-page-critique-2026-05.md`. The previous page was generic SaaS — six undifferentiated feature cards, a cyborg dog hero, pricing above the fold, and no waitlist anywhere. The new design is editorial, photo-led, credibility-anchored, and waitlist-centric.

## About the Design Files

The files in `design/` are **design references created in HTML** — a working prototype showing intended look and behavior. They are **not production code to copy directly**. The HTML uses static markup + a small vanilla JS layer + a Babel-loaded React component for an in-page Tweaks panel; none of that pattern belongs in the production codebase.

**Your task is to recreate this design as a new `Home.tsx` (or a sibling like `LandingPage.tsx`) in the existing `apps/myk9show` React + Vite + Tailwind + shadcn/ui codebase**, using established patterns. The existing `src/components/landing/` folder already holds the legacy components (`Hero.tsx`, `FeaturesSection.tsx`, `HowItWorks.tsx`, `Pricing.tsx`, `FAQSection.tsx`, etc.) — most of these should be replaced or deprecated, since the new IA differs significantly. Keep the file naming consistent with that folder.

The design system (colors, fonts, spacing, shadows) is already in `apps/myk9show/src/index.css` as CSS custom properties — use those tokens, not the values redefined in the prototype's `assets/colors_and_type.css` (which is a copy of the same token file).

## Fidelity

**High-fidelity (hifi).** The mocks show final colors, typography, spacing, and intended interactions. Recreate pixel-perfect using the existing Tailwind config + design tokens. All values come from `apps/myk9show/src/index.css` and are documented under **Design Tokens** below.

The one exception: the **Tweaks panel** in the prototype is a designer tool for exploring variants (3 hero layouts, 3 headline rewrites, accent color, form depth) — it is NOT a production feature. Pick the **selected** variant (the user landed on Hero variant C "photo-led" + headline #2 "Without the paperwork" + Teal accent + email-role form depth) as the production design. Do not ship a variant switcher.

## Positioning Decision

The page assumes **pre-launch** stance:
- Primary CTA: **Join the waitlist** (everywhere)
- Secondary header link: small **Early access →** text link (for the small number of users with credentials to sign in to the existing app)
- **No** Sign Up button. **No** pricing on the page (link only). **No** search bar. **No** product screenshots beyond the offline-ringside phone mockup.

If positioning changes later, this is the file to revisit first.

## Page Structure (top → bottom)

Eight sections total. Background alternates `--ivory-50` ↔ `--ivory-100` for editorial rhythm.

### 1. Sticky Header — `--ivory-50` (with backdrop blur)
- Brand mark (rosette SVG + "myK9Show" in Playfair Display 22px/500)
- "Waitlist · launching 2026" status chip (terracotta-50 bg, terracotta-700 text, pulsing terracotta-500 dot)
- Nav: Features · Offline · Who we are · Pricing (links to `/pricing`)
- "Join the waitlist" ghost button (scrolls to closing waitlist)
- "Early access →" text link (routes to `/signin`)
- `position: sticky; top: 0; z-index: 30; backdrop-filter: blur(14px) saturate(140%); background: rgba(250, 249, 245, 0.88);`
- 1px border-bottom in `--border` (#e8e6dc)

### 2. Hero — Variant C "Photo-led" (selected)
- **Photo band**: full-width, `height: min(56vh, 520px)` (min 380px), Ziva & Tera photo (`assets/hero-ziva-tera.jpg`), `object-fit: cover; object-position: center 38%`
- Bottom-aligned gradient fade to ivory-50 over the bottom 40% (so type sits cleanly)
- Floating photo caption pill (bottom-left, 32px in): `<em>Ziva & Tera</em>` only — terracotta swatch dot, white-ivory pill bg, stone-700 text
- **Below the photo**: two-column grid (1.1fr / 1fr), -32px negative margin pulls it up over the gradient
  - **Left**: eyebrow ("Dog-sport software · Scent work first"), serif h1 (clamp 40–68px), 18px lede
  - **Right**: waitlist form card (bottom-aligned)
- Selected headline (option #2): *From premium list to **final placements** — without the paperwork.* (with `final placements` in italic terracotta-600)
- Selected lede: "Online entries, ringside scoring, and exhibitor tracking — **built for AKC Scent Work, UKC Nosework, and ASCA Scent Detection.** Obedience, agility, and conformation arrive in 2027."

#### Two unused hero variants (for reference, don't ship)
- **Variant A "Editorial split"**: copy left, 4/5 aspect photo right with floating caption pill at bottom
- **Variant B "Full-bleed photo"**: photo as full background with dark gradient + copy overlaid in white

### 3. Tagline Strip — `--ivory-100`
Slim horizontal band, 22px vertical padding. Three tags separated by 4px stone-300 dots:
- 📶 "Local-first PWA · works offline at venues" (icon = wifi)
- ✓ "AKC Scent Work · UKC Nosework · ASCA Scent Detection" (icon = check-square)
- 🕓 "Obedience, agility & conformation in 2027" (icon = clock, dimmed stone-500 text, terracotta icon)

Icons in `--primary` (teal-500), except the future one in `--terracotta-500`.

### 4. Credibility Band — `--ivory-50`
Two-column grid (0.9fr / 1.1fr), 72px gap, 80px top / 64px bottom padding.
- **Left**: eyebrow "Who we are", h2 "The same team you've trusted at trial since *2013.*" (with "2013." in italic terracotta-600), 16px body about RyKris.
- **Right**: 2×2 grid of small credibility cards:
  - **mySWT** (teal-500 dot) — "AKC Scent Work entries & results — since 2017." — "9 years · Filemaker"
  - **myNWT** (purple-500 dot) — "UKC Nosework trial management." — "7 years · 1,400+ trials"
  - **myK9Q** (terracotta-500 dot) — "Ringside PWA for judges & exhibitors." — "Offline-first · 2024"
  - **myK9Show** (primary/teal dot, dashed border, ivory-100 bg) — "One platform. All three sanctioning bodies. Modern web." — "Joining the waitlist · 2026"

Cards: 22px padding, 16px border-radius, 1px border in `--border`, white bg (dashed + ivory-100 for the "new" card).

### 5. For Clubs — `--ivory-100` (`section.alt`)
- Audience tag: "FOR CLUBS & SECRETARIES" small uppercase pill with terracotta-500 dot
- h2: "Run a trial without *the paperwork* — from premium list to final placements." (italic terracotta-600 on "the paperwork")
- Right-aligned aside: "One system replaces the spreadsheet, the entry form, the catalog, and the scoresheet. Offline at the venue, synced when you're back."
- 3-column feature grid, 20px gap:
  1. **Offline-first *ringside.*** — wifi icon, terracotta tones
  2. **Scent-sport rules, *built in.*** — clock icon
  3. **One flow. *Entry to ribbon.*** — list icon
- Each card: white bg, 1px border, 16px radius, 28px top / 24px side padding. 40×40 icon-wrap in terracotta-50/600. Serif 22px h3 (italic terracotta accent in the second clause). 14px body. Footnote with 11px uppercase labels + small ivory-100 badge.
- Hover: translateY(-2px) + `--shadow-card-hover` (210ms ease).

### 6. For Exhibitors — `--ivory-50`
Mirror of section 5, with **teal tones** (teal-50 bg / teal-700 icon color on icon-wrap):
- Audience tag: "FOR EXHIBITORS" with teal/primary dot
- h2: "Your dog's career — *in one place.* Forever."
- Cards:
  1. **Find your trial. *Enter in minutes.*** — search icon
  2. **Live from *ringside.*** — activity/pulse icon
  3. **Titles, trends, *the whole story.*** — bar-chart icon

### 7. Offline / Ringside Callout — `--ivory-100`
Two-column grid (1.05fr / 1fr), 72px gap, 96px vertical padding.
- **Left**: eyebrow "Offline-first · myK9Q" (terracotta-600), h2 "Trial venues have *terrible signal.* So we built for none." (italic terracotta-600 on "terrible signal"), body about queue-based replication, 3-item check list (terracotta-600 check icons).
- **Right**: **phone-card mockup** — dark `#1a1a18` card, 28px radius, framed by an 8px ivory-100 photo border + 1px outer border in `--border` (so it sits like a Polaroid on the cream page). Inside:
  - Phone head: "Ring 2 · Container · Novice A" + "Offline" pulsing pill (teal-on-rgba-teal-15)
  - 4 entry rows: armband (mono 16px) / dog name + breed/handler / result chip
    - 112 · Tera · Dutch Shepherd · Beezley · Q · 24.81
    - 113 · Ziva · Belgian Tervuren · Beezley · Q · 31.04
    - 114 · Juno · Labrador · Patel · NQ
    - 115 · Mosby · Vizsla · Chen · Next up
  - Footer: "3 of 12 scored · queued to sync" / "last sync 11:48"
- Result chips: rgba(34,197,94,0.16) bg + #6ee7a8 text for Q; rgba(220,38,38,0.18) + #fda4a4 for NQ; rgba(255,255,255,0.06) + 55% white for pending.
- Two soft radial glows on the section background (terracotta in top-right, teal in bottom-left, both at ~10% opacity).

### 8. Closing Waitlist — `--ivory-50`
- Centered, 100px top / 80px bottom padding
- Eyebrow "Joining the waitlist"
- h2 (clamp 32–56px): "Be in the room when *the first trial* goes live." (italic terracotta-600 on "the first trial")
- 17px body, 560px max-width: "We're shipping to a handful of clubs across AKC, UKC, and ASCA in late 2026. Tell us who you are and we'll keep you in the loop — no spam, no hype."
- Waitlist form (centered, 540px max-width)

### 9. Footer — `--ivory-100`
4-column grid (1.3fr / 1fr / 1fr / 1fr), 40px gap:
- **Brand column**: "myK9Show" in Playfair 22px + blurb "Dog-sport software for the working-line community. Built by RyKris, since 2013."
- **Product**: For clubs · For exhibitors · Offline / myK9Q · Pricing
- **Sanctioning**: AKC Scent Work · UKC Nosework · ASCA Scent Detection · Obedience & agility · 2027 (last item dimmed)
- **Company**: About RyKris · Contact (mailto) · Legal · Early access
- Bottom row: "© 2026 RyKris LLC · myK9 Platform" / "v0.9.4 · pre-launch" (mono)

## Waitlist Form

The prototype's slim 3-field form is a **design placeholder**. The **production form is `source/WaitlistForm.tsx`** — six fields (email, name, role, sports[], current_system, switch_reason), submits to `supabase.from('platform_waitlist')`.

When implementing, **use `WaitlistForm.tsx` directly** with the source prop set to `'myk9show.com'`. The slim 3-field design in the prototype was chosen for visual density on the landing page — if you prefer to keep the full form here, that's fine; otherwise the slim form should expand to the full one in a modal/drawer triggered by the slim form's submit (email captured, then "tell us more" reveals the rest).

The form is mounted in **two places** in the prototype (hero + closing section). Both should use the same `<WaitlistForm>` component instance, just with different surrounding chrome.

The closing-section h3 "Join the waitlist" + small "487 · waiting" mono counter is a design flourish — the counter is placeholder and should either (a) be wired to a real count from `platform_waitlist` or (b) removed entirely. Don't ship the placeholder number.

## Interactions & Behavior

- **Header "Join the waitlist"**: scroll to `.closing` section, `behavior: smooth`
- **Hero CTA**: same scroll-to-closing, or if the hero form is visible, focus the email input
- **Card hover**: feature/credibility cards lift `translateY(-2px)` with `--shadow-card-hover` ring, 200ms ease — already implemented in `apps/myk9show/src/index.css` design tokens
- **Status chip in header**: subtle 1.8s opacity pulse on the terracotta dot (no other animation)
- **Offline pill in phone mockup**: same dot-pulse, teal version
- **Form submit**: handled by `WaitlistForm.tsx` (existing logic — success state replaces the form inline)
- **No scroll animations / parallax / fade-ins.** The page is editorial-static. Resist adding entrance animations.

## Responsive

- **Desktop (>960px)**: layouts as described
- **Tablet (640–960px)**: hero collapses to single column (photo above, then copy + form); feature grids stay 3-up where possible; offline callout collapses to single column with phone below copy
- **Mobile (<640px)**: everything single-column; horizontal padding drops to 20px; nav links hide (keep brand + waitlist button + early-access link only); feature/cred grids 1-up; closing section padding drops to 64px

Max container width: **1200px**, **32px horizontal padding** on desktop.

## State Management

Minimal. The page is mostly static content. State lives in the waitlist form component (`WaitlistForm.tsx` — already handles its own `useState` + Supabase submit).

If implementing the "487 waiting" counter for real:
- Query `select count() from platform_waitlist` from a Supabase RPC
- Render server-side in the Vite build or hydrate from a small loader query at the top of the page
- Don't block the page on this — show without the count, then update if it loads

## Design Tokens

All tokens are already in `apps/myk9show/src/index.css` (also mirrored in `design/assets/colors_and_type.css`). Use the CSS custom properties via Tailwind theme extension or directly via `var(--*)`.

### Colors
| Token | Hex | Used for |
|---|---|---|
| `--ivory-50` | `#faf9f5` | Page background (default sections) |
| `--ivory-100` | `#f5f4ed` | Alt sections (alternating rhythm) |
| `--ivory-200` | `#e8e6dc` | Subtle borders |
| `--stone-300` | `#b7b5a9` | Disabled / dividers |
| `--stone-500` | `#87867f` | Muted text |
| `--stone-700` | `#3a3a36` | Body text on light bg |
| `--ink-900` | `#141413` | Primary text, warm black |
| `--teal-500` | `#14b8a6` | `--primary`, accent dots, exhibitor tone |
| `--teal-600` | `#0d9488` | `--primary-hover` |
| `--terracotta-500` | `#c96442` | Brand accent, italic emphasis, club tone |
| `--terracotta-600` | `#b05338` | Italic terracotta text |
| `--terracotta-50` | `#fdf5ef` | (not used in final, was in offline section pre-iteration) |
| `--purple-500` | `#8b5cf6` | myNWT credibility dot |
| `--success` | `#22c55e` | Q chip |
| `--danger` | `#dc2626` | NQ chip |

**Italic emphasis**: any inline `<em>` in serif headings = `color: var(--terracotta-600); font-style: italic; font-weight: 400;`. This is the editorial signature — use it consistently for the one or two emphasized words per heading.

### Type
- `--font-serif`: `'Playfair Display', Georgia, serif` (weight 500, letter-spacing -0.015em, line-height 1.05) — display headings, brand, card names, h3
- `--font-sans`: `'Montserrat', system-ui, sans-serif` — body, UI, labels, lede
- `--font-mono`: `'JetBrains Mono', SF Mono, monospace` — armbands, scores, version, sync time, "487 waiting" counter, tabular numerics

Hero h1: `clamp(40px, 5.4vw, 68px)`, weight 500, letter-spacing -0.02em, line-height 1.02, `text-wrap: balance`
Section h2: `clamp(28px, 3.2vw, 40px)` (closing pushes to 56px max), weight 500, letter-spacing -0.015em, line-height 1.12
Feature h3: Playfair 22px / 500 / line-height 1.18
Lede: 18px / 1.55, max-width 540–560px, `text-wrap: pretty`
Body: 16px / 1.65
Eyebrow: 11px / 600 / letter-spacing 0.14em / uppercase / stone-500 (or terracotta-600 in section 7)
Audience tag: 11px / 600 / letter-spacing 0.08em / uppercase, pill with 8px colored dot

### Spacing & Radii
- Section vertical padding: **80px** (sections), **96px** (offline callout), **100/80px** (closing)
- Container: 1200px max, 32px horizontal padding (20px on mobile)
- Card radius: **16px** (`--radius-lg`)
- Hero photo radius: **24px** (`--radius-xl`) — applies to variant A's split layout
- Phone card radius: **28px**
- Pill / chip radius: `9999px` (`--radius-full`)
- Button radius: **10px** (regular), **12px** (`btn-lg`)
- Grid gap on feature cards: **20px**

### Shadows
- `--shadow-card`: `rgba(0,0,0,0.05) 0px 4px 24px` (default card resting)
- `--shadow-card-hover`: `0px 0px 0px 1px var(--border), rgba(0,0,0,0.05) 0px 8px 24px`
- Hero photo (variant A): `0 30px 60px -25px rgba(60,40,20,0.28), 0 0 0 1px rgba(60,40,20,0.05)`
- Phone card: `0 30px 50px -20px rgba(60,40,20,0.35), 0 12px 24px -12px rgba(60,40,20,0.25), 0 0 0 8px var(--ivory-100), 0 0 0 9px var(--border)` (the inner inset rings create the "photo frame" effect)

## Assets

In `design/assets/`:
- `hero-ziva-tera.jpg` — **Customer-provided hero photo** of two working-line dogs (Belgian Tervuren + Dutch Shepherd) in a golden autumn field. 1963×1711, ~797KB. **Replace the existing cyborg-dog image** at `apps/myk9show/public/`. Suggested optimization: re-export at 1600px wide WebP + JPG fallback, ~200KB. Use `object-position: center 38%` to keep the dogs anchored when cropped.
- `myk9show-logo.webp` — primary wordmark (already in production, included for completeness)
- `rosette.svg` — rosette mark used in the header brand SVG (inline in `index.html`, can stay inline)
- `colors_and_type.css` — full token sheet (already in production at `apps/myk9show/src/index.css`)
- `fonts/montserrat-latin.woff2` — already self-hosted in production

### Icons
The prototype uses **inline SVG paths** copied from Lucide for the tagline strip and feature/check icons. In the production codebase, use the existing **`lucide-react`** package — keep stroke-width 2, rounded caps. Icons used:
- `Wifi`, `CheckSquare`, `Clock` (tagline strip)
- `Wifi`, `Clock`, `Menu` or `List` (club features)
- `Search`, `Activity`, `BarChart3` (exhibitor features)
- `Check` (offline callout checklist)
- All sized 20×20 in icon-wraps, 16×16 inline.

## Meta Tags

Per the critique, update `apps/myk9show/index.html`:
- `<title>`: "myK9Show · Dog show management built for scent work"
- `<meta name="description">`: "Dog show management built for AKC, UKC, and ASCA scent sports. Local-first software that works offline at trial venues. From the team behind mySWT, myNWT, and myK9Q."
- `<meta property="og:image">`: a 1200×630 crop of the Ziva & Tera photo with the wordmark overlaid (create a separate `/public/og-image.jpg`)
- `<meta name="twitter:card" content="summary_large_image">`

## Production Wiring Checklist

Suggested order of implementation:

1. **Drop the cyborg image.** Add the new hero photo at `apps/myk9show/public/hero-ziva-tera.jpg` (optimized) and update `og-image.jpg` for social.
2. **Update meta tags** in `apps/myk9show/index.html` per the critique block above.
3. **Create `apps/myk9show/src/components/landing/HeroPhotoLed.tsx`** — the photo-band hero from variant C (use as the only hero; archive the existing `Hero.tsx`).
4. **Update `apps/myk9show/src/components/landing/`** — replace the existing structure:
   - Remove `Pricing.tsx` from the landing page (link only via header nav)
   - Remove the search bar and "Welcome to myK9Show" copy
   - Replace `FeaturesSection.tsx` with **two** sections: `ClubFeatures.tsx` + `ExhibitorFeatures.tsx`
   - Add `TaglineStrip.tsx`, `CredibilityBand.tsx`, `OfflineCallout.tsx`, `ClosingWaitlist.tsx`
   - Update `LandingFooter.tsx` to the 4-column layout above
5. **Wire `WaitlistForm.tsx`** (from `source/`) into hero + closing slots. Confirm the `platform_waitlist` Supabase table exists with the schema `WaitlistForm.tsx` expects.
6. **Update `apps/myk9show/src/pages/Home.tsx`** to compose the new sections in order:
   ```tsx
   <HeroPhotoLed />
   <TaglineStrip />
   <CredibilityBand />
   <ClubFeatures />
   <ExhibitorFeatures />
   <OfflineCallout />
   <ClosingWaitlist />
   <LandingFooter />
   ```
7. **Remove `<UpcomingShows>` and `<FAQSection>`** from Home — they don't appear in the new design.
8. **Replace Sign In / Sign Up buttons** in `apps/myk9show/src/components/Header.tsx` with the new waitlist + early-access pattern (Tier 1 pre-launch posture).
9. **Add the "Waitlist · launching 2026" status chip** to the header — small terracotta pill with pulsing dot.
10. **Verify offline / responsive behavior** on actual phones.

## Files in This Bundle

```
design_handoff_landing_page/
├── README.md                          ← this file
├── design/                            ← HTML prototype (design reference)
│   ├── index.html
│   ├── landing.css                    ← all page styles
│   ├── page.js                        ← form clone + smooth-scroll + tweak apply
│   ├── tweaks-app.jsx                 ← Tweaks panel React app (do NOT ship)
│   ├── tweaks-panel.jsx               ← Tweaks framework (do NOT ship)
│   └── assets/
│       ├── colors_and_type.css        ← copy of myK9 design tokens (already in prod)
│       ├── hero-ziva-tera.jpg         ← NEW hero photo (ship this)
│       ├── myk9show-logo.webp
│       ├── rosette.svg
│       └── fonts/montserrat-latin.woff2
├── screenshots/                       ← desktop captures, top-to-bottom
│   ├── 01-hero-top.png                ← header + photo band
│   ├── 02-hero-form.png               ← copy + waitlist form below photo
│   ├── 03-credibility.png             ← "since 2013" + product cards
│   ├── 04-for-clubs.png               ← three club feature cards
│   ├── 05-for-exhibitors.png          ← three exhibitor feature cards
│   ├── 06-offline-ringside.png        ← dark phone mockup on ivory
│   ├── 07-closing-waitlist.png        ← centered closing CTA
│   └── 08-footer.png                  ← 4-column footer
└── source/
    ├── WaitlistForm.tsx               ← production form to wire in (Supabase-backed)
    └── landing-page-critique-2026-05.md   ← the brief that drove this redesign
```

## Out of Scope (Don't Ship)

- The Tweaks panel (`tweaks-app.jsx`, `tweaks-panel.jsx`) and the variant-switching logic in `page.js` are designer tools. Production should have one hero, one headline, one accent.
- The two unused hero variants (A split, B full-bleed). They're documented above only for the record.
- The `__myk9_submit` UI-only form handler in `page.js` — replace with `WaitlistForm.tsx`.
- The placeholder "487 · waiting" counter unless you wire it to a real count.

## Questions / Decisions to Confirm

1. **Headline copy**: The selected headline is "From premium list to *final placements* — without the paperwork." Confirm this lands with the audience, or swap to one of the alternates (#0 "built for scent work first", #1 "ready for every ring by 2027"). All three are in the prototype HTML for reference.
2. **Caption on the hero photo**: Currently just "*Ziva & Tera*". The earlier drafts included "co-founders' dogs · AKC Scent Work Master" — confirmed dropped per customer feedback.
3. **"487 · waiting" counter**: ship with real count, or remove?
4. **Footer "Contact" link**: prototype uses `mailto:hello@myk9show.com` — confirm that address exists or use a different one.
5. **Pricing page** (`/pricing`) is referenced from the header nav and footer but is outside this handoff's scope — confirm that the existing `PricingPage.tsx` is still serving from `/pricing` or whether it also needs an update.
