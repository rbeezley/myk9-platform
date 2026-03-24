# Soften Light Mode — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Problem

Light mode uses backgrounds so close to pure white (`#f8f7f4`, `#fefdfb`) that they're visually indistinguishable from `#ffffff`. The app feels harsh and overly bright. Additionally, 63 component files use hardcoded `bg-white` Tailwind classes and 18 CSS files contain hardcoded `#ffffff`/`#fff` values, bypassing the theme system entirely.

## Goal

Shift light mode to a noticeably warm "subtle cream" palette. All surfaces should feel soft and approachable without looking heavy or yellowed.

## Palette: Subtle Warm

### CSS Variable Changes (`:root` in `index.css`)

| Variable            | Current   | New       | Role                          |
| ------------------- | --------- | --------- | ----------------------------- |
| `--background`      | `#f8f7f4` | `#f5f2ed` | Page background               |
| `--background-alt`  | `#f8f7f4` | `#f5f2ed` | Alternate background          |
| `--card`            | `#fefdfb` | `#faf8f4` | Card/elevated surfaces        |
| `--sidebar`         | `#f8f7f4` | `#f5f2ed` | Sidebar background            |
| `--card-secondary`  | `#f8f7f4` | `#f5f2ed` | Secondary card surfaces       |
| `--secondary`       | `#f8f7f4` | `#f5f2ed` | Secondary UI surfaces         |
| `--popover`         | `#ffffff` | `#faf8f4` | Dropdowns, popovers, tooltips |
| `--muted`           | `#f6f6f6` | `#f0ede7` | Muted/disabled backgrounds    |
| `--input`           | `#f3f4f6` | `#efece6` | Form input backgrounds        |
| `--dialog-input-bg` | `#f2f2f2` | `#efece6` | Dialog-specific inputs        |
| `--border`          | `#e5e7eb` | `#e0dbd3` | Borders (warmed to match)     |

### Values NOT Changed

- `--foreground`, `--card-foreground`, `--sidebar-foreground`: Text colors stay as-is (`#0a0a0a`)
- `--primary`, `--primary-foreground`: Teal branding + white text on buttons unchanged
- `--destructive`, `--destructive-foreground`: Error red unchanged
- `--accent`, `--accent-foreground`: Teal accent unchanged
- `--muted-foreground`: Gray text unchanged (`#6b7280`)
- `--secondary-foreground`: Dark text unchanged (`#0f172a`)
- `--popover-foreground`: Dark text unchanged (`#0f172a`)
- All `--chart-*` colors: Unchanged
- All `.dark` variables: Dark mode is already warm, no changes

### Scoring `design-tokens.css` Variables

The scoring UI (`src/pages/scoring/styles/design-tokens.css`) defines its own parallel surface variables. Warm these to match:

| Variable              | Current   | New       | Notes                |
| --------------------- | --------- | --------- | -------------------- |
| `--surface`           | `#F8F7F4` | `#f5f2ed` | Match `--background` |
| `--surface-elevated`  | `#ffffff` | `#faf8f4` | Match `--card`       |
| `--input-bg`          | `#ffffff` | `#efece6` | Match `--input`      |
| `--surface-subtle`    | `#f3f4f6` | `#f0ede7` | Cool gray → warm     |
| `--surface-muted`     | `#f5f5f5` | `#f0ede7` | Neutral gray → warm  |
| `--background-subtle` | `#f8fafc` | `#f5f2ed` | Cool-tinted → warm   |
| `--background-soft`   | `#f8f9fa` | `#f5f2ed` | Cool-tinted → warm   |

### `--show-secondary-bg`

Currently `transparent` — stays unchanged.

## Hardcoded White Sweep

### Tailwind `bg-white` (~63 occurrences across ~41 files)

Replace with semantic theme classes:

- `bg-white` → `bg-card` (for card-like surfaces, the most common case)
- `bg-white` → `bg-background` (for page-level backgrounds)
- `bg-white` → `bg-popover` (for dropdown/popover containers)

Use judgment per-context. Most `bg-white` in this codebase is used on card-like containers and should become `bg-card`.

**Exceptions:**

- Print/report components (`PrintableReport.tsx`, `PrintManager.tsx`) may legitimately need `bg-white` for paper output. Leave as-is or guard with `print:bg-white`.
- Also check CSS files using `@apply bg-white` (at least `template-management.css`).

### CSS `#ffffff` / `#fff` (~99 occurrences across ~18 files)

Replace with CSS variable references:

- `background: #ffffff` → `background: var(--card)` or `var(--background)`
- `background-color: #fff` → `background-color: var(--card)`
- `color: #ffffff` / `color: #fff` on dark backgrounds → **leave as-is** (white text on colored backgrounds is correct)
- `border-color: #fff` → evaluate per-context

**Key CSS files to update:**

- `src/index.css` (many are in `.dark` or `--*-foreground` definitions — leave those)
- `src/styles/theme-preferences.css`
- `src/styles/myk9-show-details.css`
- `src/styles/myk9-class-selection.css`
- `src/pages/scoring/styles/design-tokens.css` (scoring UI — see table above)

### Decision Rules for `#fff` Replacement

1. **Background on a surface** → `var(--card)` or `var(--background)`
2. **Text color on a dark/colored background** → keep `#ffffff` (contrast requirement)
3. **Border on a dark background** → keep `#ffffff`
4. **Box-shadow using white** → keep (visual effect, not a surface)
5. **Foreground CSS variables** (`--primary-foreground`, `--destructive-foreground`, etc.) → keep `#ffffff`
6. **CSS `mask` using `linear-gradient(#fff 0 0)`** → keep `#fff` (opacity mask, not a visible surface)

## Testing

- Visual inspection in light mode across key pages: landing, show details, trial details, class details, browse shows, secretary dashboard, scoring UI
- Verify dark mode is unaffected
- Verify `bg-accent` surfaces still look intentional against warm backgrounds
- Check print styles still produce white backgrounds
- Run `pnpm typecheck` and `pnpm lint`

## Out of Scope

- Dark mode changes (already warm)
- myK9Q app changes (separate app, separate concern)
- Color contrast accessibility audit (the palette shift is subtle and maintains WCAG AA ratios)
- Accent color overrides (per-club branding classes)
- `.high-contrast` class overrides in `theme-preferences.css` (deliberately uses pure white/black for accessibility — leave as-is)
- Rollback: purely visual, revert the commit if needed
