# myK9Show Design System

> A custom design system for myK9Show — adapted from the Claude (Anthropic) design language for the context of dog sport management. For reference against the source, see [`/DESIGN.md`](../../DESIGN.md).

---

## 1. Visual Theme & Atmosphere

myK9Show is built for dog sport secretaries, exhibitors, and judges — people who work long hours at trial sites, often on mobile devices, under pressure. The design must feel **trustworthy and calm without being sterile**. It borrows the warm parchment foundation of the Claude design language because it evokes the printed trial catalog and ribbon tradition that dog sport participants already associate with quality.

Where Claude's design feels like a literary salon, myK9Show feels like a **well-organized premium trial**. The serif headings carry the authority of an AKC catalog. The teal/green primary accent is a deliberate semantic choice: teal is the AKC qualifying ribbon color and the color that signals achievement in dog sports. Warm olive-dark surfaces replace cold blue-black in dark mode.

**Key Characteristics:**

- Warm parchment canvas (`#f5f4ed`) — premium paper, not a screen
- Fraunces for editorial headings (authority, hierarchy, AKC catalog feel)
- Montserrat for all UI text (quiet efficiency, high legibility)
- Teal (`#14b8a6`) as the semantic default accent — qualifying ribbons, AKC brand, achievement
- Warm-toned neutrals everywhere — every gray carries a yellow-brown undertone
- Ring shadows (`0px 0px 0px 1px`) for interactive elevation — not traditional drop shadows
- Whisper shadow (`rgba(0,0,0,0.05) 0px 4px 24px`) for card elevation
- Warm olive-dark surfaces in dark mode (`#141413`, `#1e1e1b`) — not cold blue-black
- User-selectable accent color system (4 options) with semantic teal as default
- Per-show/club branding override (logo, cover image, accent hex)

---

## 2. Color Palette

### Light Mode Base Surfaces

| Name         | Hex       | Use                                        |
| ------------ | --------- | ------------------------------------------ |
| Parchment    | `#f5f4ed` | Primary page background                    |
| Ivory        | `#faf9f5` | Cards, elevated containers on Parchment    |
| Warm Sand    | `#e8e6dc` | Sidebar, dividers, secondary surfaces      |
| Border Cream | `#f0eee6` | Standard light-mode borders (barely-there) |
| Border Warm  | `#e8e6dc` | Prominent borders, section dividers        |

### Dark Mode Surfaces

| Name               | Hex       | Use                                            |
| ------------------ | --------- | ---------------------------------------------- |
| Deep Dark          | `#141413` | Page background — warm olive-tinted near-black |
| Dark Elevated      | `#1e1e1b` | Cards, muted containers                        |
| Dark Card          | `#252522` | Secondary cards, nested containers             |
| Dark Hover         | `#2e2e2b` | Hover state surfaces                           |
| Dark Border        | `#2e2e2b` | Standard dark-mode borders                     |
| Dark Border Strong | `#3a3a36` | Focused/hovered borders in dark mode           |

### Text & Foreground

| Name             | Hex       | Use                                   |
| ---------------- | --------- | ------------------------------------- |
| Foreground       | `#141413` | Primary text (light mode)             |
| Secondary Text   | `#5e5d59` | Secondary body text — warm olive gray |
| Muted Text       | `#87867f` | Metadata, de-emphasized content       |
| Light Foreground | `#faf9f5` | Primary text (dark mode)              |
| Warm Silver      | `#b0aea5` | Secondary text on dark surfaces       |

### Brand Accent (Default: Teal)

The **platform accent** is user-configurable (4 options). The default is teal — never replace this without explicit consent. The semantic reasons are:

1. AKC qualifying ribbons are teal/green
2. Teal is the established myK9 brand color across both apps
3. It represents achievement and passage — the core emotional reward in dog sports

| Accent             | Hex       | Semantic Reason                                  |
| ------------------ | --------- | ------------------------------------------------ |
| **Teal (default)** | `#14b8a6` | AKC qualifying ribbon color; myK9 brand identity |
| Terracotta         | `#c96442` | Warm earthy alternative; used by Claude itself   |
| Blue               | `#3b82f6` | Classic tech/trust                               |
| Purple             | `#8b5cf6` | Elegant alternative                              |

### Status Colors (Pipeline)

These are semantic, non-negotiable. Never remap them to accent colors.

| Status       | Color                        | Notes                              |
| ------------ | ---------------------------- | ---------------------------------- |
| Checked In   | `var(--status-checked-in)`   | Green — present and confirmed      |
| Come to Gate | `var(--status-come-to-gate)` | Amber/orange — action required now |
| At Gate      | `var(--status-at-gate)`      | Yellow — standing by               |
| In Ring      | `var(--status-in-ring)`      | Blue — actively competing          |
| Completed    | `var(--status-completed)`    | Muted/gray — run is done           |
| Pulled       | `var(--status-pulled)`       | Red — withdrawn                    |
| Conflict     | `var(--status-conflict)`     | Red/destructive — scheduling error |
| No Status    | `var(--status-no-status)`    | Neutral — not yet checked in       |

### Per-Show Branding

Individual shows and clubs can override the accent color with any hex value via `resolveShowBranding()` in `src/lib/branding.ts`. The 10 preset options:

Blue, Red, Green, Purple, Terracotta, Cyan, Gold, Pink, Indigo, Emerald.

Per-show branding affects show-specific UI surfaces (cover image, logo, accent stripe) — not the platform UI chrome.

---

## 3. Typography

### Font Families

| Family         | Use                            | Rationale                                                        |
| -------------- | ------------------------------ | ---------------------------------------------------------------- |
| **Fraunces**   | h1, h2 — page/section headings | Graceful serif; carries the authority of a printed catalog entry |
| **Montserrat** | h3, h4, body, all UI           | Clean geometric sans; reliable at small sizes on mobile          |

_Note: Fraunces is our substitute for Anthropic Serif. Montserrat substitutes for Anthropic Sans. Both are loaded from Google Fonts._

Google Fonts load line: `Montserrat:wght@400;500;600;700` and `Fraunces:opsz,wght@9..144,600;9..144,700` (variable axis, `display=swap`).

### Heading Hierarchy

| Level | Font       | Weight | Line Height  | Use                                             |
| ----- | ---------- | ------ | ------------ | ----------------------------------------------- |
| h1    | Fraunces   | 500    | 1.10 (tight) | Page title, hero headline — book-title presence |
| h2    | Fraunces   | 500    | 1.20         | Section anchor — feature section headers        |
| h3    | Montserrat | 600    | 1.30         | Sub-section — card titles, group headers        |
| h4    | Montserrat | 600    | 1.30         | Component heading — table titles, form sections |

**Single weight for serifs**: All Fraunces headings use weight 500. No bold serif. This creates a consistent editorial voice — like one author wrote every heading. Bold Fraunces looks aggressive; weight 500 looks considered.

### Body

- **Line height**: 1.6 — generous, editorial, closer to a book than a dashboard. This is applied globally to `body` and carries through all text unless overridden.
- **Weight**: 400 for body, 500 for emphasis, 600 for UI labels
- **Small text / labels**: `letter-spacing: 0.01em` applied globally to `label` and `.text-xs` elements — maintains readability at 12px and below

### Principles

- Serif for **authority** (page/section headings that establish context)
- Sans for **utility** (anything a user acts on — buttons, form labels, table headers, nav)
- Never bold (`700`) a Fraunces heading — weight 500 is the ceiling
- Never use Fraunces for UI elements (buttons, labels, inputs) — that's Montserrat's domain

---

## 4. Shadows & Elevation

Claude's design communicates depth through **warm-toned ring shadows** rather than traditional drop shadows. myK9Show adopts this fully.

### Elevation Levels

| Level         | CSS Variable               | Pattern                                  | Use                                        |
| ------------- | -------------------------- | ---------------------------------------- | ------------------------------------------ |
| 0 — Flat      | none                       | No shadow, no border                     | Page background, inline text areas         |
| 1 — Contained | `var(--border)` border     | `1px solid var(--border)`                | Standard cards, sections, dividers         |
| 2 — Ring      | `var(--shadow-ring)`       | `0px 0px 0px 1px var(--border)`          | Interactive card hover, button focus halos |
| 3 — Whisper   | `var(--shadow-card)`       | `rgba(0,0,0,0.05) 0px 4px 24px`          | Elevated feature cards, dialogs            |
| 4 — Inset     | `var(--shadow-ring-inset)` | `inset 0px 0px 0px 1px rgba(0,0,0,0.15)` | Active/pressed button states               |

### Card Hover Pattern

Cards on hover transition from Level 1 (border) to Level 2+3 (ring + whisper):

```css
box-shadow: var(--shadow-card-hover);
/* = 0px 0px 0px 1px var(--border), rgba(0,0,0,0.05) 0px 8px 24px */
```

### CSS Variables

```css
--shadow-card: rgba(0, 0, 0, 0.05) 0px 4px 24px;
--shadow-card-hover: 0px 0px 0px 1px var(--border), rgba(0, 0, 0, 0.05) 0px 8px 24px;
--shadow-ring: 0px 0px 0px 1px var(--border);
--shadow-ring-primary: 0px 0px 0px 1px var(--primary);
--shadow-ring-inset: inset 0px 0px 0px 1px rgba(0, 0, 0, 0.15);
```

### Philosophy

Do not use heavy drop shadows. `box-shadow: 0 4px 6px rgba(0,0,0,0.1)` is a cold-palette pattern. The warm ring system creates containment that feels part of the surface rather than cast from it.

---

## 5. Component Patterns

### Buttons

The shadcn/ui button component is the primary action element. Color is driven by `--primary` (teal by default).

| Variant     | Background                    | Text                          | Use                               |
| ----------- | ----------------------------- | ----------------------------- | --------------------------------- |
| Default     | `var(--primary)`              | `var(--primary-foreground)`   | Primary CTA — qualifying action   |
| Secondary   | `var(--secondary)`            | `var(--secondary-foreground)` | Supporting action                 |
| Outline     | transparent + `var(--border)` | `var(--foreground)`           | Less prominent action             |
| Ghost       | transparent                   | `var(--foreground)`           | Navigation, icon buttons          |
| Destructive | `#dc2626`                     | white                         | Delete, remove, dangerous actions |

Radius: `var(--radius)` = `0.5rem` (8px) — comfortably rounded, not pill-shaped.

Focus rings use the ring shadow pattern: `box-shadow: 0 0 0 2px var(--ring)` where `--ring` is the accent color.

### Cards

Standard shadcn Card component. Surface: `var(--card)` = `#faf9f5` light / `#1e1e1b` dark. Border: `1px solid var(--border)`.

For hoverable/clickable cards, apply `box-shadow: var(--shadow-card-hover)` on hover and `transition: box-shadow 0.15s ease`.

### Inputs & Forms

- Background: `var(--input)`
- Border: `1px solid var(--input-border)`
- Focus ring: the only context where a cool blue (`#3898ec`) is acceptable — WCAG focus accessibility
- Radius: 8px (matches cards)
- Vertical padding: tight (matches Claude's compact form aesthetic)

### Status Badges

Use `var(--status-*)` variables. Never use accent colors for pipeline status — they carry distinct semantic meaning independent of user preferences.

### Navigation

Sticky top nav. The platform nav chrome always uses the platform's primary teal — not per-show accent colors.

---

## 6. Accent Color System

Two separate color systems exist. Do not conflate them.

### Platform Accent (User Preference)

Applied as a class on `:root` by `settingsStore.ts`. Controls `--primary` and related variables globally.

| Class                     | Primary   | Semantic                      |
| ------------------------- | --------- | ----------------------------- |
| `.accent-green` (default) | `#14b8a6` | Teal — AKC ribbon, myK9 brand |
| `.accent-terracotta`      | `#c96442` | Terracotta — warm earthy      |
| `.accent-blue`            | `#3b82f6` | Blue — classic trust          |
| `.accent-purple`          | `#8b5cf6` | Purple — elegant              |

Default fallback (no class on `:root`): teal. CSS selector pattern:

```css
:root.accent-green,
:root:not(.accent-blue):not(.accent-terracotta):not(.accent-purple) {
  --primary: #14b8a6;
}
```

User selection is persisted to `localStorage` (`myK9Q_settings` key via Zustand persist). The blocking init script in `index.html` reads this to apply the class before first paint, preventing FOUC.

### Per-Show Branding (Show/Club Data)

Resolved via `resolveShowBranding(show, club)` in `src/lib/branding.ts`. Returns a `ShowBranding` object with `accentColor: string | null`. Applied as an inline CSS variable on show-specific surfaces.

`generatePalette(hex)` derives `primaryLight`, `primaryDark`, `primaryMuted`, and `onPrimary` (auto-computed for accessibility) from any arbitrary hex.

---

## 7. Layout Principles

### Spacing

Base unit: 8px. Tailwind's default spacing scale. Prefer:

- `p-4` (16px) for card internal padding on desktop
- `p-3` (12px) on mobile
- `gap-4` (16px) for component grids
- `gap-6` (24px) for section-level spacing

### Container

Max width: `max-w-7xl` (1280px), centered. Full-bleed sections use `-mx-4` or negative margins within a padded parent.

### Responsive

Primary breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px). Mobile-first: stack on small, 2–3 column grids from `md` up.

Touch targets: minimum 44×44px for all interactive elements. Inputs use generous vertical padding for thumb-friendliness.

### Border Radius Scale

| Size                | Value                 | Use                    |
| ------------------- | --------------------- | ---------------------- |
| `rounded-sm`        | 4px                   | Tags, badges           |
| `rounded` (default) | 6px                   | Minor UI elements      |
| `rounded-md`        | 6px                   | Medium elements        |
| `rounded-lg`        | `var(--radius)` = 8px | Buttons, cards, inputs |
| `rounded-xl`        | 12px                  | Feature cards, modals  |
| `rounded-2xl`       | 16px                  | Hero containers        |
| `rounded-full`      | 9999px                | Avatars, pill badges   |

---

## 8. Dark Mode

Dark mode is controlled by `.dark` and `.theme-dark` classes on `:root`, set by `settingsStore.ts`. System preference auto-detection is active when `settings.theme === 'auto'`.

### Dark Mode Rules

- **No cool blue-black** — all surfaces use warm olive-dark tones (`warm-950` = `#141413`, `warm-900` = `#1e1e1b`)
- **Warm gray text** — `#87867f` for muted text, `#faf9f5` for primary — never pure `#ffffff`
- **Deeper ring shadows** — ring variables auto-adjust via `var(--border)` which is `#2e2e2b` in dark mode
- **TVDisplay exception** — the TV display pages (`/tv/*`) are intentionally cool/high-contrast for visibility at a distance. Do not apply warm surface classes there.

### Tailwind Custom Dark Scale

```js
// tailwind.config.js
warm: {
  950: '#141413',  // page background
  900: '#1e1e1b',  // cards
  800: '#252522',  // nested cards
  700: '#2e2e2b',  // borders
  600: '#3a3a36',  // hover borders
}
```

Use `bg-warm-950` / `bg-warm-900` / `border-warm-700` in dark mode instead of `bg-gray-900` / `bg-zinc-800`.

---

## 9. Role-Based Emotional Intent

Every UI surface in myK9Show serves one of three roles. Read [`docs/INTENT.md`](../../docs/INTENT.md) before making changes to role-facing pages.

| Role          | Target Feeling                         | Design Notes                                                              |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| **Secretary** | Confident control, zero cognitive load | Dense information, clear hierarchy, no decoration that competes with data |
| **Exhibitor** | Excitement and calm — "I'm prepared"   | More generous whitespace, progress cues, run number prominently displayed |
| **Judge**     | Focused, uninterrupted flow            | Minimal chrome, large touch targets, no distractions during scoring       |

---

## 10. Do's and Don'ts

### Do

- Use `#f5f4ed` (Parchment) as the light page background — the warmth IS the brand
- Use Fraunces weight 500 for h1/h2 — single weight, always
- Use teal (`#14b8a6`) for the default primary accent — it carries semantic meaning
- Use ring shadows (`0px 0px 0px 1px`) for interactive hover/focus states
- Use status colors (`--status-*`) for pipeline states — never remap them to accent
- Apply `line-height: 1.6` to body text — editorial spacing is intentional
- Keep all neutrals warm-toned — no cool blue-grays
- Use `bg-warm-950` / `bg-warm-900` for dark mode surfaces, not `bg-gray-900` / `bg-zinc-800`

### Don't

- Don't swap teal for terracotta as the default without explicit user request — teal has semantic meaning
- Don't bold (`weight: 700`) Fraunces headings — 500 is the ceiling
- Don't use status colors as decorative accent colors — they are semantic
- Don't apply heavy drop shadows — ring shadows + whisper shadows only
- Don't use cool blue-grays anywhere outside of the focus ring accessibility context
- Don't use Fraunces for button labels, form inputs, or navigation
- Don't apply platform accent color to TV display pages — they have their own display-optimized palette
- Don't introduce pure `#ffffff` as a page background — always Parchment or Ivory

---

## 11. Agent Prompt Guide

### Quick Variable Reference

```
Page background:     var(--background)   = #f5f4ed (light) / #141413 (dark)
Card surface:        var(--card)         = #faf9f5 (light) / #1e1e1b (dark)
Primary text:        var(--foreground)   = #141413 (light) / #faf9f5 (dark)
Muted text:          var(--muted-foreground) = #87867f
Primary accent:      var(--primary)      = #14b8a6 (teal default)
Border:              var(--border)       = #e8e6dc (light) / #2e2e2b (dark)
Card shadow:         var(--shadow-card)  = rgba(0,0,0,0.05) 0px 4px 24px
Card hover shadow:   var(--shadow-card-hover) = 0px 0px 0px 1px var(--border), rgba(0,0,0,0.05) 0px 8px 24px
Ring shadow:         var(--shadow-ring)  = 0px 0px 0px 1px var(--border)
```

### Example Component Prompts

- "Create a page heading at `text-3xl` in Fraunces weight 500, `text-foreground`, `line-height: 1.1`."
- "Design a hoverable card on `var(--card)` background with `1px solid var(--border)` border, `rounded-lg`, shadow `var(--shadow-card)` at rest, `var(--shadow-card-hover)` on hover."
- "Add a status badge using `var(--status-in-ring)` background and white text, `rounded-full`, `text-xs` with `letter-spacing: 0.01em`."
- "Build a primary CTA button with `var(--primary)` background, `var(--primary-foreground)` text, `rounded-lg`, focus ring via `box-shadow: 0 0 0 2px var(--ring)`."
- "Create a dark mode surface using `bg-warm-900` (`#1e1e1b`) with `border-warm-700` (`#2e2e2b`) border."

### Iteration Rules

1. Reference specific variable names — `var(--muted-foreground)` not "gray text"
2. Always specify warm-toned variants — no cool grays
3. Specify serif vs sans explicitly — "Fraunces for the heading, Montserrat for the label"
4. For shadows, use ring or whisper patterns — never generic drop shadow
5. For status indicators, use `--status-*` variables — never accent colors
6. Check `docs/INTENT.md` before changing role-facing page layouts
