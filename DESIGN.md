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
  catalog-cream: "#faf7f2"
  card-white: "#ffffff"
  ivory: "#faf9f5"
  sidebar-sand: "#ede9e0"
  cream-border: "#f0eee6"
  sand: "#e8e6dc"
  border-sand: "#e4dccc"
  ink: "#181411"
  card-dark: "#1e1c19"
  border-dark: "#2e2b27"
  olive: "#5e5d59"
  stone: "#8c8376"
  silver-warm: "#b0aea5"
  ring-green: "#4e7c53"
  success: "#4e7c53"
  warning: "#c88b1a"
  danger: "#b04835"
  info: "#3d6d8c"
typography:
  display:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "clamp(36px, 5vw, 60px)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.5vw, 40px)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  celebration:
    fontFamily: "Fraunces, Georgia, serif"
    fontWeight: 450
    lineHeight: 1.2
  title:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
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
    backgroundColor: "var(--primary)"
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
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.card-white}"
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

The visual foundation is warm paper, not cold glass: a catalog-cream canvas (`#faf7f2`) carrying pure-white cards with warm sand borders and ink text — every neutral has a yellow-brown undertone, with no cool grays anywhere. Montserrat carries the entire working interface; Fraunces serif appears only at celebration moments (The Podium), so the typeface itself signals that something was earned. Color arrives through a **user-selectable accent**: Clay terracotta by default, with Grove teal, Dusk slate-blue, and Heather aubergine as the exhibitor's choice. Components never hardcode an accent; they speak `var(--primary)` and let the user's preference flow through. Dark mode is not an inversion but a different time of day — warm olive-dark surfaces (`#181411`, `#1e1c19`) like the show grounds after sunset, with the accent brightened one step for legibility.

Built for older, non-technical users operating outdoors under time pressure: 44px minimum touch targets, 16px+ body text with a user-controlled font scale (`--font-scale`), user-selectable layout density (compact / comfortable / spacious), high contrast, and no hover-only or gesture-only interactions. Components feel **calm and tactile** — soft 8px corners, gentle 1px hover lifts, quiet feedback.

**Key Characteristics:**

- Warm catalog-cream canvas (`#faf7f2`) with exclusively warm-toned neutrals; pure white reserved for cards and inputs
- User-selectable accent system (Clay / Grove / Dusk / Heather) wired through `--primary`, each with light and dark variants
- Montserrat for all working UI, including display headings; Fraunces serif reserved for celebration moments (The Podium)
- Flat by default; warm ring shadows and soft lifts appear in response to interaction
- A semantic status-color vocabulary for check-in, class, and result states that is never used decoratively
- Accessibility as identity: 44px targets, font scaling, density preferences, calm offline states
- Token layering: base UI tokens (`design-tokens.css`) → v2 surface overrides (`index.css @layer base`) → accent system (`index.css [data-accent]`) → additive redesign tokens (`redesign-tokens.css`) → chip pairs. The `@layer base` block in `index.css` is the canonical surface layer (it wins the cascade); new values join the right layer rather than forking a new one.

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

The canonical surface values live in `index.css`'s `@layer base :root` block (the v2 layer) — it overrides the older `design-tokens.css` values in the cascade. These are the values below; the legacy `#f5f4ed`-era tokens survive only in scoring-page-specific tokens (`--surface`, `--dialog-input-bg`).

- **Catalog Cream** (`#faf7f2`, ivory-50): The page background — warm morning paper, never pure white.
- **Card White** (`#ffffff`): Card and input surfaces — the one sanctioned use of pure white, so content lifts crisply off the cream canvas.
- **Ivory** (`#faf9f5`): Popover surface.
- **Sidebar Sand** (`#ede9e0`): The sidebar surface, one step warmer than the canvas.
- **Cream Border** (`#f0eee6`): Muted backgrounds and the gentlest containment.
- **Sand** (`#e8e6dc`): Secondary-button surface.
- **Border Sand** (`#e4dccc`, ivory-200): The standard border on light surfaces.
- **Ink** (`#181411`, ink-900): Primary text and the dark-theme page background. **Card Dark** (`#1e1c19`) and **Border Dark** (`#2e2b27`): dark-theme surfaces and borders.
- **Olive** (`#5e5d59`): Secondary text. **Stone** (`#8c8376`, stone-500): muted foreground and tertiary text. **Warm Silver** (`#b0aea5`): faintest text, and body text on dark surfaces.

## 3. Typography

**UI Font:** Montserrat (with system-ui fallback) — the entire working interface, display headings included
**Celebration Font:** Fraunces (with Georgia fallback) — variable; `.display-serif` (450, `opsz 144`) for large moments, `.celebration-serif` (500, `opsz 24`) at text sizes
**Mono Font:** JetBrains Mono (with SF Mono, Consolas fallback) — tabular numerals

**Character:** Montserrat carries everything with quiet geometric clarity — the software disappearing behind the task. Fraunces appears only when a dog earns it: podium names, class titles on result cards. Its rarity is what makes it festive; the typeface change *is* the celebration.

### Hierarchy

- **Display / h1** (Montserrat 600, `clamp(36px, 5vw, 60px)`, 1.05, -0.01em): Page titles.
- **Headline / h2** (Montserrat 600, `clamp(28px, 3.5vw, 40px)`, 1.2, -0.01em): Major section headings.
- **Title / h3–h4** (Montserrat 600, 1.125–1.25rem × `--font-scale`, 1.3): Card titles, sub-sections.
- **Body** (Montserrat 400, 1rem × `--font-scale`, 1.6): All standard text. 16px minimum before scaling; generous book-like line height is deliberate. Respect a 65–75ch line cap in prose contexts.
- **Label** (Montserrat 500, 0.75rem, 1.25): Chips, badges, form labels, metadata.
- **Eyebrow** (Montserrat 600, 12px, 0.12em tracking, uppercase, terra-700): Kicker labels above display headings.
- **Celebration** (Fraunces via `.display-serif` at heading sizes, `.celebration-serif` at text sizes): The Podium and result celebrations only.
- **Mono** (JetBrains Mono 400, `tabular-nums`): Armband numbers, times, scores — the `.numeric` utility, plus `code` and `kbd`.

**The Podium Rule.** Fraunces is forbidden in working UI. If the screen helps someone do a task, it is Montserrat. If the screen honors something a dog just did — a placement, a title, a qualifying run — Fraunces may speak. Use `.display-serif` above ~20px and `.celebration-serif` below it (the text optical axis keeps small sizes sturdy).

**The Font Scale Rule.** Body and h3-and-below sizes multiply by `--font-scale` (user preference); h1/h2 use viewport clamps instead. Never set working text in fixed px that escapes the scale, and never below 12px equivalent.

> Note: global serif h1/h2 existed briefly during the Fall 2026 redesign and was deliberately reverted (PR #659) — don't reintroduce it. The original `design-tokens.css` intent ("Reserved for celebration/editorial moments — The Podium") is the standing doctrine. The public landing page keeps its own editorial serif (Playfair) scoped under `.landing-v2`.

## 4. Elevation

Flat by default, lift on touch. Surfaces at rest sit flush on the warm canvas, separated by sand borders and tone shifts (cream → white), not by floating. Shadows are warm-tinted (brown-black `rgba(61,37,22,…)`, never cool gray-black) and appear as a *response* — hover, focus, drag, or a modal taking the stage. Dark mode deepens shadows rather than adding glow.

### Shadow Vocabulary

- **Ring** (`--shadow-ring: 0 0 0 1px var(--border)`): Border-as-shadow containment for interactive surfaces at rest.
- **Card rest** (`box-shadow: rgba(61, 37, 22, 0.05) 0 4px 24px`): Whisper-soft ambient lift for elevated cards. Optional; borders alone are often enough.
- **Card hover** (`0 0 0 1px var(--border), rgba(61, 37, 22, 0.06) 0 8px 28px`): Ring plus soft lift, paired with a 1–2px `translateY` rise.
- **Header** (`0 1px 3px rgba(61, 37, 22, 0.04)`): The faintest separation under sticky headers.
- **Primary ring** (`--shadow-ring-primary: 0 0 0 1px var(--primary)`): Selected / active state containment in the user's accent.
- **Token scale** (`--token-shadow-sm/md/lg/xl`): Neutral black at 0.10–0.15 opacity for modals and overlays.

**The Flat-by-Default Rule.** A surface earns a shadow by being interacted with or by floating above the page (modal, popover, toast). Resting content stays flat.

## 5. Components

Calm and tactile: soft 8px corners, generous touch targets, gentle 1px hover lifts, quiet 150ms ease-out transitions. Nothing delicate, nothing loud.

### Buttons

- **Shape:** Comfortably rounded (8px, `rounded-lg`), Montserrat 500 at 14px.
- **Sizes:** Default 44px height (`h-11 px-6`) — full touch compliance; small 40px, large 48px, icon 44×44px. The 44px floor is an `// INTENT` commitment for exhibitor-facing UI.
- **Primary:** `var(--primary)` background (the user's accent — never a hardcoded hex), white text, `hover:opacity-90` plus a 1px lift (`hover:-translate-y-[1px]`, settles on `:active`).
- **Outline:** Sand background (`var(--secondary)`), ink text, 1px border; hover shifts to muted.
- **Ghost:** Transparent until hover (muted background). **Destructive:** `var(--destructive)` with white text.
- **Focus:** 2px ring at `var(--primary)/30` with 1px offset — visible in every accent.

### Chips

- **Style:** Pill-shaped (9999px), label typography (12px / 500), tinted `--chip-*-bg` background with same-hue `--chip-*-fg` ink. No borders.
- **Status chips:** Check-in and class statuses use the saturated `--status-*` colors with white text — these are signals, not decoration, and read identically in light and dark.

### Cards / Containers

- **Corner Style:** Generously rounded (12px standard, 16px featured).
- **Background:** Card White (`var(--card)`, `#ffffff`) on light; Card Dark (`#1e1c19`) on dark.
- **Border:** 1px Border Sand (`var(--border)`, `#e4dccc`); border is the default containment, shadow optional (see Elevation).
- **Internal Padding:** 16–24px (`--space-4` to `--space-6`), scaled by the user's density preference.
- **Never nested.** A card inside a card means the structure is wrong.

### Inputs / Fields

- **Style:** Card White fill (`var(--input)`, `#ffffff` — inputs match cards), 1px Border Sand border, 8–12px radius, ink text, 44px height.
- **Focus:** Border and 2px ring shift to `var(--ring)` (accent-tinted, e.g. `#f2c8a8` in Clay).
- **Hover:** Border deepens to `#d1cfc5`. **Error:** Danger border with calm, plain-English message below — never a technical string.

### Navigation

- **Shell:** Sidebar 248px (`--sidebar-w`) on Sidebar Sand (`#ede9e0`), topbar 72px (`--topbar-h`), content max 1240px. Sticky headers use `--token-z-raised`.
- **Items:** Montserrat 500, stone at rest, ink on hover, accent tint background (`var(--accent)`) plus `var(--accent-foreground)` text when active. Active state is a filled tint, not an underline.
- **Mobile:** Bottom-safe PWA insets via `--app-top-inset`; touch targets stay at 44px.

### The Podium (signature)

Result celebrations get the fullest editorial voice: Fraunces on the class title and the dog's name (`.celebration-serif`), placement medal colors, and the only sanctioned use of playful motion (`wag`, `happy-bounce`, the spring curve). Delight concentrates here — at the moment a dog earns it — instead of leaking into the workday screens.

## 6. Do's and Don'ts

### Do:

- **Do** keep every neutral warm-toned — if a gray has no yellow-brown undertone, it doesn't belong here.
- **Do** route all accent color through `var(--primary)` / `var(--accent)` tokens so Clay, Grove, Dusk, and Heather all render correctly.
- **Do** keep touch targets at 44px minimum and body text at 16px+ before user scaling — the audience is older, outdoors, often wearing gloves.
- **Do** use the existing status vocabulary (`--status-*`, chip pairs) for any state communication; check both light and dark renderings.
- **Do** make offline and sync states quiet and reassuring — "Offline is normal, not broken" (PRODUCT.md).
- **Do** write plain-English microcopy in dog-show terminology; "plain language beats clever language."
- **Do** add new tokens to the layer they belong to (base / v2 surface / accent / redesign / chip) rather than introducing one-off values — and treat `index.css @layer base` as the canonical surface layer.

### Don't:

- **Don't** build "flashy or trendy product UI that competes with the work" (PRODUCT.md anti-reference) — no gradient text, no glassmorphism as decoration, no hero-metric dashboards.
- **Don't** create "dense passive tool palettes that leave a new secretary wondering what to do next" — each role gets one clear home and one clear next step.
- **Don't** use "wizard-heavy workflows for interrupt-driven show-day tasks" or confirmation dialogs for routine actions — show-day changes are one or two taps, calm and recoverable.
- **Don't** ship "tiny controls, hover-only affordances, gesture-only actions, or text that is hard to read outdoors" — every interaction must work with a thumb in sunlight.
- **Don't** show "technical error messages, sync anxiety, or anything that makes poor connectivity feel like user failure."
- **Don't** use pure white as a *page background* (cards and inputs are the sanctioned white surfaces), pure black as text, or cool blue-grays anywhere outside the status vocabulary.
- **Don't** hardcode `#c96442` (or any accent hex) in a component — it breaks the other three accents.
- **Don't** use Fraunces in working UI (headings, body, buttons, labels, tables), Ring Green outside live-judging, or status colors as decoration.
- **Don't** use colored side-stripe borders (`border-left` > 1px) on cards or alerts; use full borders, tints, or nothing.
- **Don't** reach for a modal first — exhaust inline and progressive disclosure; modals are for genuine interruptions.
