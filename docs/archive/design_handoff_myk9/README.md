# Handoff: myK9 Design System

## Overview
This bundle delivers the v2 design system for the **myK9 Platform** — covering both `myK9Show` (exhibitor web app) and `myK9Q` (ring-side scoring PWA). It establishes a single brand identity (terracotta + rosette motif + Fraunces display), a user-selectable accent system, and strict rules about what colors mean what.

## How to use this bundle with Claude Code

Give Claude Code this exact prompt:

> Implement this design system in our existing React codebase. Start by reading `design_handoff_myk9/README.md` in full. Then map each token in `colors_and_type_v2.css` onto our existing theme system (investigate what we use — Tailwind config, CSS vars, styled-components, etc.).
>
> **PR 1 — Visual tokens + accent picker only.** Colors, typography, the rosette SVG, the four-accent `[data-accent]` system, the "Your ring color" picker wired to user preferences + localStorage. Do not change any screen's information architecture.
>
> **Do NOT implement in this round** (requires product review):
> - Green "IN RING · elapsed time" banner on the score screen
> - Elapsed-time counter
> - "UP NEXT — armband · ring · N away" strip on the Home dashboard
> - "Favorites" filter in the segmented control
> - Progress bars on the classes-today cards (if not already present)
>
> Ask me before adding any new UI that doesn't already exist in the app.

## ⚠ UX additions — product review required

The HTML prototypes include several UX ideas that were **not in the original myK9Q app**. They are flagged here so they don't ship silently:

| Addition | Risk |
|---|---|
| Green "IN RING · 2:47 elapsed" banner | Adds perceived pressure on judges — validate with real users |
| Elapsed-time counter | Some judges may dislike being timed |
| "Up next · N away" strip on Home | New info; check data availability |
| "Favorites" segmented filter | Verify feature exists |
| Classes-today progress bars | May be new info architecture |

**Rosette motif, accent picker, color/typography tokens, and card styling are pure visual** — no UX change, safe to ship.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look, tokens, and behavior. They are **not production code to copy directly**. Your task is to recreate these designs in the myK9 codebase's existing environment (React + whatever CSS/theming system the app uses today) using its established patterns, routing, and component libraries. If a token, rule, or pattern below conflicts with the existing codebase, prefer adapting the token system to the codebase over restructuring the app — the goal is pixel fidelity, not architectural change.

## Fidelity
**High-fidelity.** Pixel-perfect token values, typography, spacing, and behaviors. Recreate using your existing React component library and styling approach (CSS variables recommended — the `[data-accent]` attribute pattern maps 1:1).

---

## Design tokens

All tokens defined in `colors_and_type_v2.css`. Canonical file — port values into your theme.

### Brand palette (never user-overridable)

| Token | Hex | Use |
|---|---|---|
| `--terra-500` | `#c96442` | **Primary brand.** Logo, marketing hero, emails, app icon. |
| `--terra-600` | `#b05338` | Primary hover |
| `--terra-700` | `#7c4a2e` | Ink on tint |
| `--terra-50`  | `#fdf5ef` | Primary tint / subtle backgrounds |
| `--terra-200` | `#f2c8a8` | Primary border on tint |

### Ivory / ink surfaces

| Token | Hex |
|---|---|
| `--ivory-50`  | `#faf7f2` (page bg) |
| `--ivory-100` | `#f3efe6` (alt bg) |
| `--ivory-200` | `#e4dccc` (borders) |
| `--stone-500` | `#8c8376` (muted fg) |
| `--stone-700` | `#403a31` (strong body) |
| `--ink-900`   | `#181411` (foreground) |

### Status (system-owned, never user-overridable)

| Token | Hex | Meaning |
|---|---|---|
| `--ring-green-500` | `#4e7c53` | **LIVE / JUDGING IN PROGRESS.** Reserved exclusively for this. |
| `--ring-green-700` | `#385a3b` | Ink on live tint |
| `--ring-green-50`  | `#f1f8f1` | Live tint background |
| `--warning`        | `#c88b1a` | Warn/amber |
| `--danger`         | `#b04835` | Error/destructive |
| `--info`           | `#3d6d8c` | Info |

### User-selectable accents (`[data-accent="..."]`)

Applies only to in-app chrome: buttons, active tabs, progress bars, selected states, form focus rings. **Default: Clay.** Setting name in UI: **"Your ring color."**

| `data-accent` | 500 | 600 | 700 | tint | border |
|---|---|---|---|---|---|
| `clay` (default) | `#c96442` | `#b05338` | `#7c4a2e` | `#fdf5ef` | `#f2c8a8` |
| `grove`          | `#2f8a7f` | `#226b63` | `#184d47` | `#ecf6f4` | `#b9dcd6` |
| `dusk`           | `#3d6d8c` | `#305875` | `#213e53` | `#edf2f6` | `#b9cbd9` |
| `heather`        | `#7b5aa6` | `#634689` | `#432f61` | `#f1ecf6` | `#cdbedb` |

These map to `--primary` / `--primary-hover` / `--primary-tint` / `--primary-tint-ink` / `--ring` at runtime. Your React app should set `data-accent` on `<html>` or `<body>` from user preferences; all component styling references the `--primary*` vars.

### Typography

Fonts:
- `--font-serif` — **Fraunces** (Google Fonts, load opsz 9..144, wght 300..700)
- `--font-sans` — **Montserrat** (self-hosted `.woff2` preferred; fallback to system)
- `--font-mono` — **JetBrains Mono** (tabular numerals required for scores/armbands)

Variable-axis settings for Fraunces:
```
display: "opsz" 144, "SOFT" 50, "WONK" 0
text:    "opsz" 24,  "SOFT" 30, "WONK" 0
italic accent (h1 <em>): "opsz" 144, "SOFT" 100, "WONK" 1
```

Scale: `--text-xs 12` · `sm 14` · `base 16` · `lg 18` · `xl 20` · `2xl 24` · `3xl 30` · `4xl 36` · `5xl 48` · `6xl 60`.

Headings:
- `h1` — Fraunces, weight **450**, clamp(36, 5vw, 60), line-height 1.05, letter-spacing -0.018em
- `h2` — Fraunces, weight **450**, clamp(28, 3.5vw, 40), line-height 1.2, -0.015em
- `h3/h4` — Montserrat, weight 600
- `.eyebrow` — uppercase, 12px, letter-spacing 0.12em, `--terra-700`
- `.numeric` — JetBrains Mono, tabular-nums

### Spacing & radius

Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96 — tokens `--space-1..24`.

Radius: `sm 4` · base `8` · `md 12` · `lg 16` · `xl 24` · `full 9999`.

Shadows — warm-biased (brown-tinted rgba `61,37,22,0.xx`):
- `--shadow-card`: `rgba(61,37,22,0.05) 0 4px 24px`
- `--shadow-card-hover`: `0 0 0 1px var(--border), rgba(61,37,22,0.06) 0 8px 28px`

---

## Color governance rules

These rules are non-negotiable and should be enforced in code review:

| Surface | Rule |
|---|---|
| **Brand identity** | Always terracotta (`--terra-500`). Logo, hero on marketing, emails, app icon. Never follows the user's accent. |
| **In-app chrome** | Uses user's accent via `--primary*` tokens. Buttons, active tabs, progress, selection, form focus. |
| **LIVE / judging** | Always `--ring-green-500`. Signals "a judge is scoring right now." Never overridable. |
| **Warning/error/info** | System palette only. Never follows accent. |
| **Placements on rosettes** | AKC-standard: **blue 1st**, **red 2nd**, **yellow 3rd**, **white 4th**. These are convention, not theme — don't re-skin. |

---

## Brand motif — the rosette

Signature mark used across both products. SVG is in `assets/rosette.svg`. Ships monochrome via `fill="currentColor"` so it can be tinted.

Placement rules:
- **Logo mark** — simplified rosette (solid center + ribbon tails). Always terracotta.
- **Hero watermark** on marketing — large, low-opacity (`--terra-100` ≈ 0.85 opacity), centered behind title.
- **Show card corners** — very subtle (opacity 0.12, brightness filter). Decorative only.
- **Score entry background** — full rosette at 6% opacity in the top-right, color follows `--primary` (i.e. user's accent). Theatrical, not loud.
- **Placement pills** on judging screen — small rosette (14px) + mono numeral. Pill is filled `--primary` when active; outline when inactive.

Do **not** use the rosette as decoration in generic UI (empty states, loading spinners). It should feel rare.

---

## Screens / views in this bundle

### 1. myK9Show — Exhibitor landing & shows browse
**File:** `ui_kits/myk9show/index-v2.html`

- **Sticky header**: logo (rosette mark + wordmark), nav (Shows active, My entries, Dogs, Results), "Host a show" ghost button, user avatar circle (terracotta gradient).
- **Hero**: eyebrow ("DOG SHOW MANAGEMENT, END TO END") with 24px dividers flanking, h1 "Every ribbon, *remembered.*" (italic word uses Fraunces WONK axis, terracotta color), paragraph, primary + ghost CTAs. Large translucent rosette watermark behind title.
- **Inline search bar**: white card, three divided segments (query / location / dates), primary "Search" pill.
- **Shows grid**: `repeat(auto-fill, minmax(320px, 1fr))` — each card has:
  - 16:9 cover with gradient from ivory to one of {terracotta, clay-brown, sage, slate, coral, olive}. Rosette watermark bottom-right at 12% opacity.
  - Date chip top-left (mono, month eyebrow + big day).
  - Status pill top-right: either white-on-white info pill OR green "● Premium live" for live shows (pulsing dot).
  - Body: Fraunces h3 show name, meta row (pin icon + city, users icon + entries), footer with price (mono-numeric) and primary Enter pill.
- **How it works section** (on `--ivory-100` bg): 4-step grid (Browse / Enter / Compete / Track). Each step has a Fraunces display numeral (terracotta) + sans heading + body.
- **Footer**: version (mono), nav links.

### 2. myK9Q — Ring-side PWA (3 screens)
**Files:** `ui_kits/myk9q/index-v2.html` (loader), `components-v2.jsx`, `screens-v2.jsx`

Rendered inside iOS device frames. Each screen has:
- **Header**: 58px top padding (clears Dynamic Island), centered title + subtitle (sec color), left/right 32px slots.
- **Tab bar**: bottom, 4 tabs (Home / Classes / Results / Settings). Active tab color = `--primary`. Blurred translucent ivory background.

**Home**
- Big venue header with date + entry count.
- "YOUR DOGS" / "UP NEXT" strip — two-column white card. Mono-numeric "3/5", armband, ring, "2 away."
- Segmented control: All / My ring / Favorites.
- Classes list — each card:
  - Has active class get green 1.5px border + 3px left accent bar (ring-green).
  - Title + ring/time meta + status pill (green "● JUDGING" or primary "NEXT").
  - Progress bar (green if active, else primary) + "done/total" mono.

**Entry list**
- Header with back chevron (primary color) and kebab menu.
- Green "LIVE" judge strip with pulsing dot + judge name + mono "LIVE" badge.
- Entry rows — `QEntryCard`:
  - 52px armband tile (white bg default / primary bg for `inring` / gray strike-through for `done`).
  - Name (600) + "breed · handler" (sec).
  - Right slot: chevron (pending) / green ● IN RING pill / rosette + place numeral (done with placement) / green check (done, unplaced).

**Score entry (theatrical)**
- Rosette watermark, top-right, 280px, 6% opacity, colored primary.
- Green "IN RING · 2:47 elapsed" banner.
- Identity card: big 64px armband (primary inring state) + Fraunces dog name (weight 500, opsz 48).
- **Total score** card: `--terra-500` 3px top border, 64px mono score number, "out of 200.0 possible" sub.
- **Result** segmented: Q / NQ / ABS / EX.
- **Placement**: 5 pills (1, 2, 3, 4, —). Active fills with `--primary`, white text; each has a rosette icon above the numeral.
- Sticky submit bar: full-width primary button, box-shadow with primary-tinted rgba.

### 3. Accent picker
**File:** `accents.html`

- Four swatches in a 2x2 grid (or 4-across on wide). Each: 32px colored chip + name (Clay / Grove / Dusk / Heather) + mono meta.
- Active swatch: ink-900 border, ivory-50 bg.
- Click → `root.setAttribute('data-accent', name)` + localStorage persistence.
- Setting label: **"Your ring color."**
- Help text: "Pick the accent you want to see in the app."
- Info note beneath in terracotta tint: explains rule of thumb (brand = terra, status = system-owned, chrome = user pick).

---

## Interactions & behavior

- **Accent switching**: setting `[data-accent="..."]` should re-theme instantly with no flicker. CSS transition on `background-color` and `color` is OK but keep under 150ms to feel responsive. Persist to user preferences (server + localStorage).
- **LIVE pulse**: 1.8s infinite `opacity 1 → 0.5 → 1` on the `::before` dot of a live badge.
- **Entry card hover** (web only): translateY(-2px), shadow upgrade.
- **Armband in-ring**: 1.5px primary border around the row, subtle elevation.
- **Placement pills**: 150ms box-shadow transition on selection.

## State management

Per user preference state:
- `accent` — `clay | grove | dusk | heather` — persisted server-side + in localStorage for instant boot.

Per judging session (myK9Q):
- Which entry is currently `inring`, which are `done`, placements assigned.

No design-specific state beyond what the existing scoring app already manages.

---

## Assets

- `assets/rosette.svg` — monochrome SVG, inherits `currentColor`. Copy into app's static assets.
- Fraunces: Google Fonts import, variable-axis. Self-host for production if privacy/perf matters.
- JetBrains Mono: Google Fonts import.
- Montserrat: existing `montserrat-latin.woff2` ships with brand; keep.

Icons in this bundle use **Lucide** via CDN. If your app already uses a different icon library (Phosphor, Heroicons, custom), swap 1:1 — icon names in the HTML map directly to Lucide.

No photography is included. Show card covers use gradients as placeholders. If the real app has photography, replace the `.cover` gradient with a real `<img>` at 16:9.

---

## Files in this bundle

```
colors_and_type_v2.css      # canonical tokens — port these values
accents.html                # accent picker + governance table
comparison.html             # v1 vs v2 switcher (context; not for prod)
assets/
  rosette.svg               # brand motif
ui_kits/
  myk9show/
    index-v2.html           # exhibitor landing + browse
  myk9q/
    index-v2.html           # PWA loader (React/Babel)
    ios-frame.jsx           # device bezel (not for prod)
    components-v2.jsx       # QHeader, QTabBar, QArmband, QRosette, QEntryCard, QBadge, QSegmented
    screens-v2.jsx          # ScreenHomeV2, ScreenEntriesV2, ScreenScoreV2
```

**Note on the `.jsx` files**: these use hard-coded color literals (`Q.terra = '#c96442'`) because they were built before the accent system was finalized. When porting, replace those literals with `var(--primary)` or `var(--terra-500)` as appropriate per the governance rules above. The CSS-only screens on `accents.html` already demonstrate the correct token-driven approach.
