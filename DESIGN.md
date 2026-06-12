---
name: myK9 Platform
description: Calm, warm, outdoor-legible design system for the myK9Show dog-show platform
colors:
  clay: "#c96442"
  clay-bright: "#d97757"
  clay-deep: "#b05338"
  grove: "#2f8a7f"
  dusk: "#3d6d8c"
  heather: "#7b5aa6"
  catalog-cream: "#f5f4ed"
  ivory: "#faf9f5"
  sand: "#e8e6dc"
  cream-border: "#f0eee6"
  ink: "#141413"
  ink-warm: "#181411"
  card-dark: "#1e1c19"
  border-dark: "#2e2b27"
  olive: "#5e5d59"
  stone: "#87867f"
  silver-warm: "#b0aea5"
  ring-green: "#4e7c53"
  success: "#4e7c53"
  warning: "#c88b1a"
  danger: "#b04835"
  info: "#3d6d8c"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
  mono:
    fontFamily: "JetBrains Mono, SF Mono, Consolas, monospace"
    fontSize: "0.94rem"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
  "24": "96px"
components:
  button-primary:
    backgroundColor: "{colors.clay}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "8px 24px"
  button-outline:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "8px 24px"
  button-icon:
    backgroundColor: "transparent"
    rounded: "{rounded.md}"
    size: "44px"
  card:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.catalog-cream}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "8px 12px"
  chip-status:
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    typography: "{typography.label}"
---

# Design System: myK9 Platform

## 1. Overview

**Creative North Star: "The Show Morning"**

Warm early light at the venue. Rings taped, catalogs stacked, armbands sorted, coffee in hand — everything laid out and ready before the first dog runs. The interface should feel like that hour: calm, prepared, unhurried, and quietly warm. PRODUCT.md's doctrine is "the software disappears so the dogs can shine," and this system serves it by being a competent backdrop, never a performance. It explicitly rejects flashy or trendy product UI that competes with the work, dense passive tool palettes, and anything that makes poor connectivity feel like user failure.

The visual foundation is warm paper, not cold glass: a catalog-cream canvas (`#f5f4ed`) with ivory cards, sand borders, and ink text — every neutral carries a yellow-brown undertone, with no cool grays anywhere. Color arrives through a **user-selectable accent**: Clay terracotta by default, with Grove teal, Dusk slate-blue, and Heather aubergine as the exhibitor's choice. Components never hardcode an accent; they speak `var(--primary)` and let the user's preference flow through. Dark mode is not an inversion but a different time of day — warm olive-dark surfaces (`#181411`, `#1e1c19`) like the show grounds after sunset, with the accent brightened one step for legibility.

Built for older, non-technical users operating outdoors under time pressure: 44px minimum touch targets, 16px+ body text with a user-controlled font scale (`--font-scale`), user-selectable layout density (compact / comfortable / spacious), high contrast, and no hover-only or gesture-only interactions. Components feel **calm and tactile** — soft 8px corners, gentle 1px hover lifts, quiet feedback.

**Key Characteristics:**

- Warm catalog-cream canvas (`#f5f4ed`) with exclusively warm-toned neutrals
- User-selectable accent system (Clay / Grove / Dusk / Heather) wired through `--primary`, each with light and dark variants
- Montserrat for all UI; Fraunces serif reserved for celebration moments only
- Flat by default; soft warm shadows appear in response to interaction
- A semantic status-color vocabulary for check-in, class, and result states that is never used decoratively
- Accessibility as identity: 44px targets, font scaling, density preferences, calm offline states
- Token layering: base UI tokens (`design-tokens.css`) → accent system (`index.css [data-accent]`) → additive redesign tokens (`redesign-tokens.css`) → chip pairs. New values join the right layer; they don't fork a new one.

## 2. Colors

A warm paper-and-clay palette where the only persistent chroma is the user's chosen accent; everything else is warm neutral or semantic status.

### Primary

- **Clay** (`#c96442`, hover `#b05338`): The default accent — earthy terracotta for primary buttons, links, focus rings, and brand moments. In dark mode it brightens to **Clay Bright** (`#d97757`). Full tonal ramp available as `--terra-50` through `--terra-900`.
- **Grove** (`#2f8a7f`), **Dusk** (`#3d6d8c`), **Heather** (`#7b5aa6`): Alternate user-selectable accents, applied via `html[data-accent]`. Each ships a matched hover, tint (`--accent-50`...`--accent-700`), glow, and dark-mode variant.

**The Accent Is the User's Rule.** Components never hardcode `#c96442` or any accent hex. Always `var(--primary)`, `var(--accent)`, `var(--ring)`. A component that only looks right in Clay is broken.

### Secondary

- **Ring Green** (`#4e7c53`, tint `#f1f8f1`, ink `#385a3b`): Reserved **exclusively** for LIVE / judging-in-progress status. It means "a dog is in the ring right now" and nothing else.

**The Ring Green Rule.** Ring Green appears only on live-judging indicators. Never for success states, never for decoration — `--success` shares the hex but flows through its own token.

### Tertiary

- **Semantic status:** Success (`#4e7c53`), Warning (`#c88b1a`), Danger (`#b04835`), Info (`#3d6d8c`) — muted, warm-leaning versions of the standard meanings.
- **Check-in vocabulary** (high-saturation, white text, identical in both themes): Checked-in teal (`#14b8a6`), At-gate violet (`#8b5cf6`), Come-to-gate blue (`#3b82f6`), In-ring blue (`#2563eb`), Conflict amber (`#f59e0b`), Pulled red (`#ef4444`). Class-status and result colors extend the same family (`--status-*` tokens).
- **Chip pairs** (`--chip-*-bg` / `--chip-*-fg`): soft tinted backgrounds with dark ink of the same hue, named by hue not meaning — green=good, amber=caution, red=problem, blue=informational, purple=tag, teal=brand-neutral, stone=inactive. Dark mode swaps to deep tints with bright ink.
- **Heritage sub-palette** (registry-show landing style only): Paper (`#f8f4ea`), Ink (`#1a1612`), Claret (`#8a1818`), Gold (`#8a6a45`), Quill (`#6b4f3a`).

**The Status Is Sacred Rule.** Status colors are a vocabulary the whole show day depends on. Never repurpose a status color for decoration, and never invent a new status color when one exists.

### Neutral

- **Catalog Cream** (`#f5f4ed`): The page background and input surface — warm morning paper, never pure white.
- **Ivory** (`#faf9f5`): Card and elevated surface on light theme.
- **Sand** (`#e8e6dc`): Standard border and secondary-button surface.
- **Cream Border** (`#f0eee6`): The gentlest containment — muted backgrounds, subtle dividers.
- **Ink** (`#141413`): Primary text. **Ink Warm** (`#181411`): dark-theme page background. **Card Dark** (`#1e1c19`) and **Border Dark** (`#2e2b27`): dark-theme surfaces and borders.
- **Olive** (`#5e5d59`): Secondary text. **Stone** (`#87867f`): tertiary text and muted foreground. **Warm Silver** (`#b0aea5`): faintest text, and body text on dark surfaces.

## 3. Typography

**Display Font:** Fraunces (with Georgia fallback) — celebration moments only
**Body Font:** Montserrat (with system-ui fallback)
**Mono Font:** JetBrains Mono (with SF Mono, Consolas fallback)

**Character:** Montserrat carries the entire working interface with quiet geometric clarity. Fraunces, with its soft optical-size variants (`opsz 144` display, `opsz 24` text), appears only when something is worth celebrating — a podium, a title earned — so the serif itself signals "this moment matters."

### Hierarchy

- **Display** (Fraunces 600): The Podium, qualification celebrations, editorial headers on heritage landings. Nowhere else.
- **Headline** (Montserrat 600, 1.875rem × `--font-scale`, 1.25): Page titles (h1).
- **Title** (Montserrat 600, 1.25–1.5rem × `--font-scale`, 1.3): Section and card titles (h2/h3).
- **Body** (Montserrat 400, 1rem × `--font-scale`, 1.5): All standard text. 16px minimum before scaling; respect a 65–75ch line cap in prose contexts.
- **Label** (Montserrat 500, 0.75rem, 1.25): Chips, badges, form labels, metadata.
- **Mono** (JetBrains Mono 400, 0.94rem): Armband numbers, times, scores — tabular data where digit alignment matters.

**The Podium Rule.** Fraunces is forbidden in working UI. If the screen helps someone do a task, it is Montserrat. If the screen honors something a dog just did, Fraunces may speak.

**The Font Scale Rule.** All body and heading sizes multiply by `--font-scale` (user preference). Never set text in fixed px that escapes the scale, and never below 12px equivalent.

## 4. Elevation

Flat by default, lift on touch. Surfaces at rest sit flush on the warm canvas, separated by sand borders and tone shifts (cream → ivory), not by floating. Shadows are warm-tinted (brown-black `rgba(61,37,22,…)`, never cool gray-black) and appear as a *response* — hover, focus, drag, or a modal taking the stage. Dark mode deepens shadows rather than adding glow.

### Shadow Vocabulary

- **Card rest** (`box-shadow: rgba(61, 37, 22, 0.05) 0 4px 24px`): Whisper-soft ambient lift for elevated cards. Optional; borders alone are often enough.
- **Card hover** (`0 0 0 1px var(--border), rgba(61, 37, 22, 0.06) 0 8px 28px`): Ring plus soft lift, paired with a 1–2px `translateY` rise.
- **Header** (`0 1px 3px rgba(61, 37, 22, 0.04)`): The faintest separation under sticky headers.
- **Primary ring** (`0 0 0 1px var(--primary)`): Selected / active state containment.
- **Token scale** (`--token-shadow-sm/md/lg/xl`): Neutral black at 0.10–0.15 opacity for modals and overlays.

**The Flat-by-Default Rule.** A surface earns a shadow by being interacted with or by floating above the page (modal, popover, toast). Resting content stays flat.

## 5. Components

Calm and tactile: soft 8px corners, generous touch targets, gentle 1px hover lifts, quiet 150ms ease-out transitions. Nothing delicate, nothing loud.

### Buttons

- **Shape:** Comfortably rounded (8px, `rounded-lg`), Montserrat 500 at 14px.
- **Sizes:** Default 44px height (`h-11 px-6`) — full touch compliance; small 40px, large 48px, icon 44×44px. The 44px floor is an `// INTENT` commitment for exhibitor-facing UI.
- **Primary:** `var(--primary)` background, white text, `hover:opacity-90` plus a 1px lift (`hover:-translate-y-[1px]`, settles on `:active`).
- **Outline:** Sand background (`var(--secondary)`), ink text, 1px sand border; hover shifts to muted.
- **Ghost:** Transparent until hover (muted background). **Destructive:** `var(--destructive)` with white text.
- **Focus:** 2px ring at `var(--primary)/30` with 1px offset — visible in every accent.

### Chips

- **Style:** Pill-shaped (9999px), label typography (12px / 500), tinted `--chip-*-bg` background with same-hue `--chip-*-fg` ink. No borders.
- **Status chips:** Check-in and class statuses use the saturated `--status-*` colors with white text — these are signals, not decoration, and read identically in light and dark.

### Cards / Containers

- **Corner Style:** Generously rounded (12px standard, 16px featured).
- **Background:** Ivory (`var(--card)`) on light; Card Dark (`#1e1c19`) on dark.
- **Border:** 1px Sand (`var(--border)`); border is the default containment, shadow optional (see Elevation).
- **Internal Padding:** 16–24px (`--space-4` to `--space-6`), scaled by the user's density preference.
- **Never nested.** A card inside a card means the structure is wrong.

### Inputs / Fields

- **Style:** Catalog Cream fill (`var(--input-bg)`), 1px Sand border, 8–12px radius, ink text, 44px height.
- **Focus:** Border and 2px ring shift to `var(--ring)` (accent-tinted, e.g. `#f2c8a8` in Clay).
- **Hover:** Fill warms one step (`#ede9e0`). **Error:** Danger border with calm, plain-English message below — never a technical string.

### Navigation

- **Shell:** Sidebar 248px (`--sidebar-w`), topbar 72px (`--topbar-h`), content max 1240px. Sticky headers use `--token-z-raised`.
- **Items:** Montserrat 500, stone at rest, ink on hover, accent tint background (`var(--accent)`) plus `var(--accent-foreground)` text when active. Active state is a filled tint, not an underline.
- **Mobile:** Bottom-safe PWA insets via `--app-top-inset`; touch targets stay at 44px.

### The Podium (signature)

Result celebrations break the working-UI rules on purpose: Fraunces display type, placement medal colors, and the only sanctioned use of playful motion (`wag`, `happy-bounce`). Delight concentrates here — at the moment a dog earns it — instead of leaking into the workday screens.

## 6. Do's and Don'ts

### Do:

- **Do** keep every neutral warm-toned — if a gray has no yellow-brown undertone, it doesn't belong here.
- **Do** route all accent color through `var(--primary)` / `var(--accent)` tokens so Clay, Grove, Dusk, and Heather all render correctly.
- **Do** keep touch targets at 44px minimum and body text at 16px+ before user scaling — the audience is older, outdoors, often wearing gloves.
- **Do** use the existing status vocabulary (`--status-*`, chip pairs) for any state communication; check both light and dark renderings.
- **Do** make offline and sync states quiet and reassuring — "Offline is normal, not broken" (PRODUCT.md).
- **Do** write plain-English microcopy in dog-show terminology; "plain language beats clever language."
- **Do** add new tokens to the layer they belong to (base / accent / redesign / chip) rather than introducing one-off values.

### Don't:

- **Don't** build "flashy or trendy product UI that competes with the work" (PRODUCT.md anti-reference) — no gradient text, no glassmorphism as decoration, no hero-metric dashboards.
- **Don't** create "dense passive tool palettes that leave a new secretary wondering what to do next" — each role gets one clear home and one clear next step.
- **Don't** use "wizard-heavy workflows for interrupt-driven show-day tasks" or confirmation dialogs for routine actions — show-day changes are one or two taps, calm and recoverable.
- **Don't** ship "tiny controls, hover-only affordances, gesture-only actions, or text that is hard to read outdoors" — every interaction must work with a thumb in sunlight.
- **Don't** show "technical error messages, sync anxiety, or anything that makes poor connectivity feel like user failure."
- **Don't** use pure white (`#ffffff`) as a page background, pure black as text, or cool blue-grays anywhere outside the status vocabulary.
- **Don't** hardcode `#c96442` (or any accent hex) in a component — it breaks the other three accents.
- **Don't** use Fraunces in working UI, Ring Green outside live-judging, or status colors as decoration.
- **Don't** use colored side-stripe borders (`border-left` > 1px) on cards or alerts; use full borders, tints, or nothing.
- **Don't** reach for a modal first — exhaust inline and progressive disclosure; modals are for genuine interruptions.
