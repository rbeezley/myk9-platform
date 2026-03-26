# Elevated Neutral Palette — Design Spec

**Date:** 2026-03-25
**Status:** Draft
**Scope:** Replace current warm-cream palette with neutral zinc-based palette in both light and dark modes

## Problem

The current palette uses warm cream tones (`#f5f2ed` background, `#faf8f4` cards, warm-tinted shadows with `rgba(180, 160, 130, ...)`). This competes with the user-selectable accent color system — warm surfaces clash with cool accents (blue, purple) and make the orange accent less distinct. A neutral foundation lets the accent color carry all the personality.

## Design Decisions

| Decision           | Choice                                   | Rationale                                                  |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------- |
| Temperature        | Neutral (no warm/cool tint)              | Accent colors do the personality work                      |
| Surface hierarchy  | Three-level (page, sidebar, card)        | Matches existing structure; clear depth without complexity |
| Card edges         | Subtle border + light shadow             | Structured but not heavy; Linear/Vercel style              |
| Text hierarchy     | Three levels (primary, secondary, muted) | Covers all UI needs without inconsistent usage             |
| Accent interaction | Light tinting of highlights              | Active sidebar, badges, hover states get accent wash       |

## Color Tokens

### Light Mode

| Token                | Current                | New                  | Notes                   |
| -------------------- | ---------------------- | -------------------- | ----------------------- |
| `--background`       | `#f5f2ed` (warm cream) | `#F2F2F5` (zinc-100) | Page background         |
| `--sidebar`          | `#edeae3` (warm)       | `#E8E8EC` (zinc-200) | Sidebar background      |
| `--card`             | `#faf8f4` (warm)       | `#FFFFFF`            | Cards, header, popovers |
| `--foreground`       | `#0a0a0a`              | `#18181B` (zinc-900) | Primary text            |
| `--muted-foreground` | `#6b7280`              | `#71717A` (zinc-500) | Secondary text          |
| `--border`           | `#e0dbd3` (warm)       | `rgba(0,0,0,0.06)`   | Card/section borders    |
| `--sidebar-border`   | `#ddd6ca` (warm)       | `rgba(0,0,0,0.06)`   | Sidebar edge            |
| `--input`            | `#efece6` (warm)       | `#F2F2F5` (zinc-100) | Input backgrounds       |
| `--muted`            | `#f0ede7` (warm)       | `#F2F2F5` (zinc-100) | Muted backgrounds       |
| `--secondary`        | `#f5f2ed`              | `#F2F2F5`            | Secondary bg            |
| `--popover`          | `#faf8f4`              | `#FFFFFF`            | Popover bg              |
| `--background-alt`   | `#f5f2ed`              | `#F2F2F5`            | Alt bg                  |
| `--card-secondary`   | `#f5f2ed`              | `#F2F2F5`            | Nested card bg          |
| `--dialog-input-bg`  | `#efece6`              | `#F2F2F5`            | Dialog inputs           |

### Dark Mode

| Token                | Current   | New                      | Notes                                           |
| -------------------- | --------- | ------------------------ | ----------------------------------------------- |
| `--background`       | `#1a1a1e` | `#0F0F12` (near-black)   | Page background                                 |
| `--sidebar`          | `#17171b` | `#141417`                | Sidebar — one step above page                   |
| `--card`             | `#26292e` | `#1A1A1F`                | Cards, header, popovers                         |
| `--foreground`       | `#ffffff` | `#F4F4F5` (zinc-100)     | Primary text — slightly off-white reduces glare |
| `--muted-foreground` | `#9ca3af` | `#71717A` (zinc-500)     | Secondary text                                  |
| `--border`           | `#4a5568` | `rgba(255,255,255,0.06)` | Semi-transparent borders                        |
| `--sidebar-border`   | `#252528` | `rgba(255,255,255,0.06)` | Sidebar edge                                    |
| `--input`            | `#1f2937` | `#1A1A1F`                | Input backgrounds                               |
| `--muted`            | `#26292e` | `#1A1A1F`                | Muted backgrounds                               |
| `--secondary`        | `#2a2a2a` | `#1A1A1F`                | Secondary bg                                    |
| `--popover`          | `#26292e` | `#1A1A1F`                | Popover bg                                      |
| `--background-alt`   | `#26292e` | `#1A1A1F`                | Alt bg                                          |
| `--card-secondary`   | `#2a2d33` | `#141417`                | Nested card bg (step down)                      |
| `--dialog-input-bg`  | `#1a1a1e` | `#0F0F12`                | Dialog inputs                                   |

### Additional Text Tokens

Note: `--muted-foreground` follows shadcn convention — it's the secondary text color, not the "muted" visual level. The third (muted) level is applied via Tailwind utility classes (`text-zinc-400` / `dark:text-zinc-600`), not a new CSS variable.

| Token                         | Light                | Dark                 | Usage                                                                   |
| ----------------------------- | -------------------- | -------------------- | ----------------------------------------------------------------------- |
| Third text level (no var)     | `#A1A1AA` (zinc-400) | `#52525B` (zinc-600) | Labels, placeholders, disabled — use `text-zinc-400 dark:text-zinc-600` |
| `--secondary-foreground`      | `#18181B`            | `#F4F4F5`            | Text on secondary surfaces                                              |
| `--card-foreground`           | `#18181B`            | `#F4F4F5`            | Text on cards                                                           |
| `--sidebar-foreground`        | `#18181B`            | `#F4F4F5`            | Text on sidebar                                                         |
| `--popover-foreground`        | `#18181B`            | `#F4F4F5`            | Text on popovers                                                        |
| `--card-secondary-foreground` | `#18181B`            | `#F4F4F5`            | Text on nested cards                                                    |

### Shadows

| Token                 | Light                                                     | Dark                                                     |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `--shadow-card`       | `0 1px 2px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)`  | `0 1px 2px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.15)`  |
| `--shadow-card-hover` | `0 2px 4px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)` | `0 2px 4px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.3)` |
| `--shadow-header`     | `0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)`  | `0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)`   |

### Accent Tinting

The accent color system (green, blue, orange, purple) is unchanged. The following patterns use accent tinting:

- **Active sidebar item background:** `rgba(accent, 0.10)` light / `rgba(accent, 0.12)` dark
- **Status badge backgrounds:** `rgba(accent, 0.10)` light / `rgba(accent, 0.15)` dark
- **Hover states on interactive cards:** border shifts to `rgba(accent, 0.20)` on hover
- **"View All" / link text:** Uses `var(--primary)` directly (existing behavior, unchanged)

These patterns already work via `color-mix()` utilities defined in `index.css`. No new accent infrastructure needed.

### Scrollbar Colors

| Element     | Light              | Dark                     |
| ----------- | ------------------ | ------------------------ |
| Thumb       | `rgba(0,0,0,0.15)` | `rgba(255,255,255,0.15)` |
| Thumb hover | `rgba(0,0,0,0.25)` | `rgba(255,255,255,0.25)` |
| Track       | `transparent`      | `transparent`            |

Replaces warm-tinted `rgba(180, 160, 130, ...)` scrollbar colors.

## Design Token File Changes

The `design-tokens.css` file (imported from myK9Q scoring styles) also declares `:root` and `.theme-dark` surface/text variables that overlap with `index.css`. These must be updated in sync:

**`:root` surface variables:**

| Token                 | Current    | New                                                             |
| --------------------- | ---------- | --------------------------------------------------------------- |
| `--surface`           | `#f5f2ed`  | `#F2F2F5`                                                       |
| `--surface-subtle`    | `#f0ede7`  | `#EDEDF0`                                                       |
| `--surface-muted`     | `#f0ede7`  | `#EDEDF0`                                                       |
| `--surface-elevated`  | `#faf8f4`  | `#FFFFFF`                                                       |
| `--background-subtle` | `#f5f2ed`  | `#F2F2F5`                                                       |
| `--background-soft`   | `#f5f2ed`  | `#F2F2F5`                                                       |
| `--foreground-muted`  | `#374151`  | `#71717A`                                                       |
| `--foreground-dark`   | `#1e293b`  | `#18181B`                                                       |
| `--border-light`      | `#e0e0e0`  | `#E4E4E7` (zinc-300)                                            |
| `--border-subtle`     | `#e5e7eb`  | `#E4E4E7`                                                       |
| `--text-gray`         | `#6b7280`  | `#71717A`                                                       |
| `--text-light-gray`   | `#9ca3af`  | `#A1A1AA`                                                       |
| `--input-bg`          | `#efece6`  | `#F2F2F5`                                                       |
| `--skeleton-gradient` | warm greys | `linear-gradient(90deg, #F2F2F5 25%, #E8E8EC 50%, #F2F2F5 75%)` |

**`.theme-dark` surface variables:**

| Token                      | Current         | New                                                             |
| -------------------------- | --------------- | --------------------------------------------------------------- |
| `--surface`                | `#2a2a2a`       | `#1A1A1F`                                                       |
| `--surface-subtle`         | `#262626`       | `#141417`                                                       |
| `--surface-muted`          | `#1a1a1a`       | `#0F0F12`                                                       |
| `--surface-elevated`       | `#2c3e50`       | `#222227`                                                       |
| `--background-subtle`      | `#1f2937`       | `#141417`                                                       |
| `--background-soft`        | `#334155`       | `#222227`                                                       |
| `--foreground-muted`       | `#e5e7eb`       | `#A1A1AA`                                                       |
| `--foreground-dark`        | `#ffffff`       | `#F4F4F5`                                                       |
| `--border-light`           | `#3a3a3a`       | `#27272A` (zinc-800)                                            |
| `--border-subtle`          | `#4a5568`       | `rgba(255,255,255,0.06)`                                        |
| `--text-gray`              | `#9ca3af`       | `#71717A`                                                       |
| `--text-light-gray`        | `#6b7280`       | `#52525B`                                                       |
| `--input-bg`               | `#1f2937`       | `#1A1A1F`                                                       |
| `--skeleton-gradient-dark` | warm dark greys | `linear-gradient(90deg, #1A1A1F 25%, #141417 50%, #1A1A1F 75%)` |

**Text tokens (both themes):**

| Token                    | Light                | Dark                 |
| ------------------------ | -------------------- | -------------------- |
| `--token-text-primary`   | `#18181B`            | `#F4F4F5`            |
| `--token-text-secondary` | `#52525B` (zinc-600) | `#A1A1AA` (zinc-400) |
| `--token-text-tertiary`  | `#71717A` (zinc-500) | `#71717A` (zinc-500) |
| `--token-text-muted`     | `#A1A1AA` (zinc-400) | `#52525B` (zinc-600) |

**Shadow values** updated to pure black rgba (removing any warm tint) — same values as the main shadows table above applied to `--token-shadow-sm/md/lg/xl`.

## Hardcoded Color Sweep

After updating CSS variables, sweep component files for hardcoded colors that bypass the token system:

- `bg-white` Tailwind classes (63 instances were replaced in the previous warm-up; verify none crept back)
- Inline `#fff` or `#ffffff` in component styles
- Warm-tinted `rgba(180, 160, 130, ...)` values anywhere outside `index.css`
- Any remaining `#f5f2ed`, `#faf8f4`, `#edeae3`, `#e0dbd3`, `#efece6`, `#f0ede7` hardcoded references

## What Does NOT Change

- Accent color system (green, blue, orange, purple) — values and structure unchanged
- Status colors (checked-in, conflict, pulled, etc.) — functional colors stay vibrant
- Chart colors (`--chart-1` through `--chart-5`)
- Typography (Montserrat, Playfair Display)
- Border radius (`--radius: 0.5rem`)
- Spacing tokens
- Density system
- Z-index scale
- Tailwind config structure (just consumes CSS variables)

## Testing

- Visual regression: check all accent colors (green, blue, orange, purple) in both modes
- Contrast: verify WCAG AA (4.5:1 for body text, 3:1 for large text) for all three text levels against each surface
- Verify `.high-contrast` mode and print stylesheets still work (those use intentional white)
- Verify status badges remain readable on new surfaces
- Check popovers, dialogs, and toasts render correctly on new backgrounds
