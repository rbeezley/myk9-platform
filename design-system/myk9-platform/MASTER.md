# myK9 Platform Design System

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** myK9 Platform
**Updated:** 2026-01-27
**Style:** Apple HIG + Warm Minimalism + Subtle Glassmorphism

---

## Design Philosophy

The myK9 Platform uses an **Apple Human Interface Guidelines (HIG)** foundation with warm neutrals and subtle glassmorphism. This creates a professional, familiar interface that feels premium without being clinical.

### Core Principles

1. **Apple HIG Foundation** — SF Pro system fonts, semantic colors, signature animations
2. **Warm Minimalism** — Cream backgrounds instead of pure white, softer feel
3. **Subtle Glassmorphism** — Blur effects on cards/dropdowns, used sparingly
4. **Playful Brand Touches** — Dog-themed micro-animations for celebrations and delight

---

## Color Palette

### Light Mode

| Role | Value | CSS Variable | Usage |
|------|-------|--------------|-------|
| Background | `#F8F7F4` | `--background` | Page backgrounds (warm off-white) |
| Card | `#FEFDFB` | `--card` | Card surfaces (subtle cream tint) |
| Foreground | `#0a0a0a` | `--foreground` | Primary text |
| Muted | `#f6f6f6` | `--muted` | Secondary backgrounds |
| Muted Foreground | `#6b7280` | `--muted-foreground` | Secondary text |
| Border | `#e5e7eb` | `--border` | Borders and dividers |

### Dark Mode

| Role | Value | CSS Variable | Usage |
|------|-------|--------------|-------|
| Background | `#1a1a1e` | `--background` | Page backgrounds (warm charcoal) |
| Card | `#26292e` | `--card` | Elevated card surfaces |
| Foreground | `#ffffff` | `--foreground` | Primary text |
| Muted | `#26292e` | `--muted` | Secondary backgrounds |
| Muted Foreground | `#9ca3af` | `--muted-foreground` | Secondary text |
| Border | `#4a5568` | `--border` | Borders and dividers |

### Accent Colors (User-Selectable)

Users can choose their accent color in settings. Default is **Teal**.

| Accent | Primary | Hover | Ring | Best For |
|--------|---------|-------|------|----------|
| **Teal (Default)** | `#14b8a6` | `#0d9488` | `#5eead4` | Brand primary, professional |
| Blue | `#3b82f6` | `#2563eb` | `#93c5fd` | Classic professional |
| Orange | `#f97316` | `#ea580c` | `#fdba74` | Energetic, warm |
| Purple | `#8b5cf6` | `#7c3aed` | `#c4b5fd` | Royal, elegant |

### Semantic Colors (Apple-Inspired)

| Role | Value | Usage |
|------|-------|-------|
| Success | `rgb(52, 199, 89)` / `#34C759` | Qualifying scores, success states |
| Warning | `rgb(255, 149, 0)` / `#FF9500` | Cautions, pending states |
| Error | `rgb(255, 59, 48)` / `#FF3B30` | Errors, NQ results, destructive |
| Info | `#007AFF` | Links, informational |

---

## Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';
```

This is the **SF Pro system font stack** — native on Apple devices, falls back gracefully elsewhere.

### Scale

| Element | Size | Weight | Letter Spacing |
|---------|------|--------|----------------|
| Page Title | `24px` / `text-2xl` | 700 | Normal |
| Section Header | `18px` / `text-lg` | 600 | Normal |
| Card Title | `16px` / `text-base` | 600 | Normal |
| Body | `15px` | 400 | Normal |
| Table Header | `11px` | 590 | `0.06em` (uppercase) |
| Caption/Muted | `13px` / `text-sm` | 400 | Normal |
| Badge | `11px` | 590 | `0.02em` (uppercase) |

---

## Spacing & Layout

### Border Radius

| Element | Radius | Tailwind |
|---------|--------|----------|
| Cards, Containers | `20px` | `rounded-2xl` |
| Modals, Dropdowns | `16px` | `rounded-xl` |
| Buttons, Inputs | `8px` | `rounded-lg` |
| Badges | `50px` (pill) | `rounded-full` |
| Checkboxes | `4px` | `rounded` |

### Shadows

| Level | Value | Usage |
|-------|-------|-------|
| Subtle | `0 2px 8px rgba(0,0,0,0.1)` | Hover states |
| Card | `0 4px 12px rgba(0,0,0,0.08)` | Elevated cards |
| Dropdown | `0 12px 32px rgba(0,0,0,0.12)` | Popovers, dropdowns |
| Modal | `0 20px 40px rgba(0,0,0,0.15)` | Modals, dialogs |

### Container Widths

Use consistent max-widths across pages:
- Content areas: `max-w-6xl` or `max-w-7xl`
- Narrow content (forms): `max-w-2xl`
- Full-width tables: No max-width constraint

---

## Animation & Transitions

### Timing

| Type | Duration | Easing |
|------|----------|--------|
| Micro-interactions | `150-200ms` | `ease` |
| State changes | `200-300ms` | `ease` |
| Page transitions | `300ms` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` |
| Apple signature | `300ms` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` |

### Glassmorphism

```css
backdrop-filter: blur(20px);  /* Standard */
backdrop-filter: blur(40px);  /* Heavy (modals, dark mode) */
```

### Dog-Themed Animations (Use Sparingly)

| Animation | Duration | Usage |
|-----------|----------|-------|
| `animate-wag` | `0.6s` | Celebration icons |
| `animate-tail-wag` | `0.4s` | Success states |
| `animate-happy-bounce` | `0.8s` | Achievement unlocks |
| `animate-heartbeat` | `2s` | Favorites, likes |

Use only for:
- Empty states
- Success celebrations
- Easter eggs
- Loading states (shimmer)

---

## Component Patterns

### Cards (Apple-Inspired)

```css
.apple-card {
  background: var(--card);
  border: 0.5px solid var(--border);
  border-radius: 20px;
  backdrop-filter: blur(20px);
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: pointer;
}

.apple-card:hover {
  background: rgba(var(--muted-rgb), 0.4);
}
```

### Buttons

- Primary: `bg-primary text-primary-foreground` with hover opacity
- Secondary: `bg-secondary text-secondary-foreground` with border
- Destructive: `bg-destructive text-destructive-foreground`
- All buttons: `cursor-pointer`, `transition-colors duration-200`

### Tables

Use the `apple-table-*` class system:
- `apple-table-container` — Rounded container with blur
- `apple-table-header-cell` — 11px uppercase, 590 weight
- `apple-table-row` — 0.5px inset border, hover background
- `apple-table-cell` — 15px body text, 16px padding

---

## Anti-Patterns (NEVER Use)

### Icons & Visual Elements
- ❌ **Emojis as icons** — Use SVG icons (Lucide icons via shadcn/ui)
- ❌ **Inconsistent icon sizes** — Always use `w-4 h-4` or `w-5 h-5`
- ❌ **Layout-shifting hovers** — Don't use scale transforms that shift layout

### Interaction
- ❌ **Missing cursor:pointer** — All clickable elements must have it
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **No hover feedback** — Interactive elements need visual feedback

### Accessibility
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Invisible focus states** — Focus rings must be visible
- ❌ **Ignoring reduced motion** — Respect `prefers-reduced-motion`

### Layout
- ❌ **Pure white backgrounds** — Use warm `#F8F7F4` in light mode
- ❌ **Mixed container widths** — Use consistent `max-w-6xl` or `max-w-7xl`
- ❌ **Content behind fixed elements** — Account for navbar height

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

### Visual Quality
- [ ] No emojis used as icons (use Lucide via shadcn/ui)
- [ ] All icons from consistent set with matching sizes
- [ ] Hover states don't cause layout shift
- [ ] Uses theme colors (`bg-primary`) not hardcoded values

### Interaction
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Focus states visible for keyboard navigation

### Accessibility
- [ ] Light mode text contrast 4.5:1 minimum
- [ ] `prefers-reduced-motion` respected
- [ ] Form inputs have associated labels
- [ ] Images have alt text

### Layout
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile
- [ ] No content hidden behind fixed navbars
- [ ] Consistent container widths

### Dark Mode
- [ ] Test both light and dark modes
- [ ] Glass/transparent elements visible in both modes
- [ ] Borders visible in both modes

---

## File References

| File | Purpose |
|------|---------|
| `apps/myk9show/src/index.css` | Root CSS variables, accent colors, animations |
| `apps/myk9show/tailwind.config.js` | Tailwind theme extensions |
| `apps/myk9show/src/styles/apple-table.css` | Apple-inspired table styles |
| `apps/myk9show/src/styles/apple-*.css` | Component-specific Apple styles |
