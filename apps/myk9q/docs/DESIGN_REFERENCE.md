# Design Reference

**Source of Truth for myK9Q UI/UX patterns**
Last updated: 2025-12-15

> For layout standards (page structure, spacing, headers), see [LAYOUT_STANDARDS.md](./LAYOUT_STANDARDS.md)

---

## Color System

### Primary Color (User-Selectable Accent)

Users choose their accent color in Settings. This maps to `--primary`:

| Accent | Color | CSS Class |
|--------|-------|-----------|
| **Green (default)** | `#14b8a6` (Teal) | `.accent-green` |
| **Blue** | `#3b82f6` | `.accent-blue` |
| **Orange** | `#f97316` | `.accent-orange` |
| **Purple** | `#8b5cf6` | `.accent-purple` |

```css
/* Accent colors automatically set --primary */
:root.accent-green { --primary: #14b8a6; --primary-hover: #0d9488; }
:root.accent-blue  { --primary: #3b82f6; --primary-hover: #2563eb; }
:root.accent-orange { --primary: #f97316; --primary-hover: #ea580c; }
:root.accent-purple { --primary: #8b5cf6; --primary-hover: #7c3aed; }
```

### Theme Colors

| Token | Light Mode | Dark Mode |
|-------|------------|-----------|
| `--background` | `#F8F7F4` (warm off-white) | `#1a1a1e` |
| `--foreground` | `#0a0a0a` | `#ffffff` |
| `--card` | `#FEFDFB` (subtle cream) | `#26292e` |
| `--border` | `#e5e7eb` | `#4a5568` |
| `--muted` | `#f6f6f6` | `#26292e` |
| `--muted-foreground` | `#6b7280` | `#ffffff` |

### Semantic Colors

```css
--success-green: #34C759;
--error-red: #FF3B30;
--warning-amber: #FF9500;
```

### Status Colors (Check-in)

| Status | Color | Usage |
|--------|-------|-------|
| No Status | `#9ca3af` | Default/unset |
| Checked In | `#14b8a6` | Ready to compete |
| At Gate | `#8b5cf6` | Final waiting |
| In Ring | `#2563eb` | Active competing |
| Conflict | `#f59e0b` | Needs attention |
| Pulled | `#ef4444` | Withdrawn |

### Status Colors (Class)

| Status | Color |
|--------|-------|
| Setup | `#b45309` |
| Briefing | `#ff6b00` |
| Break | `#c000ff` |
| Start Time | `#14b8a6` |
| In Progress | `#0066ff` |
| Offline Scoring | `#f59e0b` |
| Completed | `#00cc66` |

---

## Typography

### Font Stack

```css
--font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
--font-display: 'Playfair Display', Georgia, serif; /* Celebration moments only (The Podium) */
```

### Font Sizes

| Token | Size |
|-------|------|
| `--token-font-xs` | 10px |
| `--token-font-sm` | 12px |
| `--token-font-md` | 14px |
| `--token-font-lg` | 16px |
| `--token-font-xl` | 18px |
| `--token-font-2xl` | 20px |
| `--token-font-3xl` | 24px |

### Font Weights

| Token | Weight | Usage |
|-------|--------|-------|
| `--token-font-weight-normal` | 400 | Body text |
| `--token-font-weight-medium` | 500 | Emphasis |
| `--token-font-weight-semibold` | 590 | Buttons, badges |
| `--token-font-weight-bold` | 600 | Headings |
| `--token-font-weight-extrabold` | 700 | Strong emphasis |

---

## Spacing

8px-based grid system:

| Token | Size | Usage |
|-------|------|-------|
| `--token-space-xs` | 2px | Micro spacing |
| `--token-space-sm` | 4px | Tight spacing |
| `--token-space-md` | 8px | Default gap |
| `--token-space-lg` | 12px | **Mobile container padding** |
| `--token-space-xl` | 16px | Section spacing |
| `--token-space-2xl` | 20px | Large gaps |
| `--token-space-3xl` | 24px | **Desktop container padding** |
| `--token-space-4xl` | 32px | Major sections |

---

## Border Radius

| Token | Size |
|-------|------|
| `--token-radius-sm` | 6px |
| `--token-radius-md` | 8px |
| `--token-radius-lg` | 12px |
| `--token-radius-xl` | 16px |
| `--token-radius-full` | 50% |

---

## Component Patterns

### Buttons

**Default (.btn-primary)**: Solid color, not gradient

```css
.btn-primary {
  background: var(--primary);  /* Solid, not gradient */
  color: var(--primary-foreground);
  border-radius: 0.75rem;
  font-weight: 590;
}
```

**Variants:**
- `.btn-primary` - Solid accent color (default)
- `.btn-secondary` - Light background, border
- `.btn-outline` - Transparent with border
- `.btn-ghost` - No background
- `.btn-gradient` - Blue-to-purple gradient (special use only)

**Sizes:**
- `.btn-sm` - 36px min-height
- `.btn-md` - 52px min-height (stress-optimized)
- `.btn-lg` - 56px min-height

### Cards

**Default (.card)**: Solid background, no gradient

```css
.card {
  background: var(--card);  /* Solid, not gradient */
  border: 1px solid var(--border);
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
}
```

**Status variants** (left border accent):
- `.card.scored` - Green left border
- `.card.checkin-checked-in` - Green
- `.card.checkin-conflict` - Yellow
- `.card.checkin-pulled` - Red

### Badges

```css
.badge {
  display: inline-flex;
  border-radius: 1rem;
  font-weight: 590;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
```

**Sizes:** `.badge-sm`, `.badge-md`, `.badge-lg`

**Variants:** `.badge-default`, `.badge-success`, `.badge-warning`, `.badge-error`, `.badge-info`

---

## Shadows

| Token | Value |
|-------|-------|
| `--token-shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.1)` |
| `--token-shadow-md` | `0 2px 8px rgba(0, 0, 0, 0.1)` |
| `--token-shadow-lg` | `0 8px 24px rgba(0, 0, 0, 0.12)` |
| `--token-shadow-xl` | `0 12px 32px rgba(0, 0, 0, 0.15)` |

---

## Transitions

```css
--token-transition-fast: 0.15s ease;
--token-transition-normal: 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
--token-transition-slow: 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
--apple-ease: cubic-bezier(0.25, 0.46, 0.45, 0.94);
```

---

## Hover Effects

```css
--token-hover-lift: translateY(-2px);
--token-hover-scale: scale(1.05);
--token-hover-scale-sm: scale(1.02);
```

---

## Touch Targets

```css
--min-touch-target: 44px;
--comfortable-touch-target: 36px;
--stress-touch-target: 52px;  /* For high-stress scenarios */
```

---

## Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--token-z-base` | 0 | Default |
| `--token-z-raised` | 10 | Elevated cards |
| `--token-z-overlay` | 100 | Overlays |
| `--token-z-modal` | 1000 | Modals/dialogs |
| `--token-z-toast` | 2000 | Toasts |
| `--z-menu` | 10000 | Menus |

---

## User Preferences (Settings)

These are applied via CSS classes on `<html>`:

| Setting | Options | CSS Class |
|---------|---------|-----------|
| Theme | auto/light/dark | `.theme-auto`, `.theme-light`, `.theme-dark` |
| Accent Color | green/blue/orange/purple | `.accent-green`, `.accent-blue`, etc. |
| Font Size | small/medium/large | `.font-small`, `.font-medium`, `.font-large` |
| Density | compact/comfortable/spacious | `.density-compact`, `.density-comfortable`, `.density-spacious` |
| High Contrast | on/off | `.high-contrast` |

---

## Key Files

- **CSS Tokens**: `src/styles/design-tokens.css`
- **Accent Colors**: `src/index.css` (lines 183-217)
- **Shared UI**: `src/components/ui/shared-ui.css`
- **Layout Standards**: `docs/LAYOUT_STANDARDS.md`
- **Page Container**: `src/styles/page-container.css`

---

## Quick Reference: What NOT to Do

| Don't | Do Instead |
|-------|------------|
| Gradient buttons by default | Use solid `.btn-primary` |
| Gradient card backgrounds | Use solid `var(--card)` |
| Backdrop blur on cards | Not implemented - skip it |
| Blue as primary | Teal `#14b8a6` is default |
| Hardcoded colors | Use CSS variables |
| `max-width` on containers | Full width with padding |
