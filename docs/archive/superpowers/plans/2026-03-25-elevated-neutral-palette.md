# Elevated Neutral Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace warm-cream palette with zinc-based neutral palette in both light and dark modes.

**Architecture:** Two CSS files define all color tokens. `index.css` has the main `:root`/`.dark` variables consumed by Tailwind and components. `design-tokens.css` (imported from myK9Q scoring styles) has overlapping surface/text/shadow tokens used by the scoring UI. Both must update in sync. No component files need changes — all warm colors are centralized in CSS variables.

**Tech Stack:** CSS custom properties, Tailwind CSS (consumes variables via `tailwind.config.js`)

**Spec:** `docs/superpowers/specs/2026-03-25-elevated-neutral-palette-design.md`

**Note:** `--token-shadow-sm/md/lg/xl` in design-tokens.css already use pure black `rgba(0,0,0,...)` — no changes needed. The spec's "shadow values updated" requirement is satisfied by the `--shadow-card`/`--shadow-card-hover`/`--shadow-header` changes in Tasks 1-2.

---

## File Map

| File                                                       | Action | Responsibility                                                                      |
| ---------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `apps/myk9show/src/index.css`                              | Modify | Main palette: `:root` light vars, `.dark` vars, scrollbar colors                    |
| `apps/myk9show/src/pages/scoring/styles/design-tokens.css` | Modify | Shared tokens: `:root` surfaces/text, `.theme-dark` surfaces/text/shadows/skeletons |

---

### Task 1: Update Light Mode Variables in index.css

**Files:**

- Modify: `apps/myk9show/src/index.css:384-427` (`:root` block in `@layer base`)

- [ ] **Step 1: Replace all light mode CSS variables**

In `apps/myk9show/src/index.css`, inside the `@layer base { :root { ... } }` block (starts around line 384), replace the warm-cream values with zinc neutrals:

```css
:root {
  color-scheme: light dark;
  /* Neutral zinc backgrounds */
  --background: #f2f2f5;
  --foreground: #18181b;
  --background-alt: #f2f2f5;
  --card: #ffffff;
  --card-foreground: #18181b;
  --sidebar: #e8e8ec;
  --sidebar-foreground: #18181b;
  --card-secondary: #f2f2f5;
  --card-secondary-foreground: #18181b;
  /* Zinc neutrals */
  --muted: #f2f2f5;
  --muted-foreground: #71717a;
  /* Default primary - teal (overridden by accent color classes) */
  --primary: #14b8a6;
  --primary-foreground: #ffffff;
  --secondary: #f2f2f5;
  --secondary-foreground: #18181b;
  --accent: #f0fdfa; /* Teal-tinted accent */
  --accent-foreground: #0f766e;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: rgba(0, 0, 0, 0.06);
  --input: #f2f2f5;
  --chart-1: #ef4444;
  --chart-2: #22c55e;
  --chart-3: #3b82f6;
  --chart-4: #a855f7;
  --chart-5: #f97316;
  --radius: 0.5rem;
  --dialog-input-bg: #f2f2f5;
  --popover: #ffffff;
  --popover-foreground: #18181b;
  --show-secondary-bg: transparent;
  /* Card elevation — neutral multi-layer shadows */
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.03);
  --shadow-card-hover: 0 2px 4px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.06);
  /* Header elevation */
  --shadow-header: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03);
  --sidebar-border: rgba(0, 0, 0, 0.06);
}
```

- [ ] **Step 2: Verify the file saved correctly**

Run: `head -n 430 apps/myk9show/src/index.css | tail -n 50`
Expected: The new zinc values visible in the `:root` block.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/index.css
git commit -m "style(palette): replace warm-cream light mode with zinc neutrals in index.css"
```

---

### Task 2: Update Dark Mode Variables in index.css

**Files:**

- Modify: `apps/myk9show/src/index.css:429-468` (`.dark` block in `@layer base`)

- [ ] **Step 1: Replace all dark mode CSS variables**

In `apps/myk9show/src/index.css`, replace the `.dark` block inside `@layer base`:

```css
.dark {
  color-scheme: dark;
  /* Neutral dark backgrounds */
  --background: #0f0f12;
  --foreground: #f4f4f5;
  --background-alt: #1a1a1f;
  --card: #1a1a1f;
  --card-foreground: #f4f4f5;
  --sidebar: #141417;
  --sidebar-foreground: #f4f4f5;
  --card-secondary: #141417;
  --card-secondary-foreground: #f4f4f5;
  --muted: #1a1a1f;
  --muted-foreground: #71717a;
  /* Default primary - teal (overridden by accent color classes) */
  --primary: #14b8a6;
  --primary-foreground: #ffffff;
  --secondary: #1a1a1f;
  --secondary-foreground: #f4f4f5;
  --accent: #134e4a; /* Dark teal accent */
  --accent-foreground: #5eead4;
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --border: rgba(255, 255, 255, 0.06);
  --input: #1a1a1f;
  --chart-1: #ef4444;
  --chart-2: #22c55e;
  --chart-3: #3b82f6;
  --chart-4: #a855f7;
  --chart-5: #f97316;
  --dialog-input-bg: #0f0f12;
  --popover: #1a1a1f;
  --popover-foreground: #f4f4f5;
  /* Card elevation — deeper shadows for dark mode */
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15);
  --shadow-card-hover: 0 2px 4px rgba(0, 0, 0, 0.25), 0 8px 24px rgba(0, 0, 0, 0.3);
  /* Header elevation */
  --shadow-header: 0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
  --sidebar-border: rgba(255, 255, 255, 0.06);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/myk9show/src/index.css
git commit -m "style(palette): replace warm dark mode with neutral zinc in index.css"
```

---

### Task 3: Update Scrollbar Colors in index.css

**Files:**

- Modify: `apps/myk9show/src/index.css:480-515` (scrollbar styles after `@layer base`)

- [ ] **Step 1: Replace warm-tinted scrollbar colors with neutral**

Find the scrollbar section (starts around line 480 with `/* Global scrollbar */`). Replace the warm `rgba(180, 160, 130, ...)` values:

```css
/* Global scrollbar — thin, neutral, appears on hover */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.dark ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
}

.dark ::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
}

.dark * {
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/myk9show/src/index.css
git commit -m "style(palette): neutralize scrollbar colors"
```

---

### Task 4: Update Light Mode Tokens in design-tokens.css

**Files:**

- Modify: `apps/myk9show/src/pages/scoring/styles/design-tokens.css:6-50` (`:root` block, surface/text/input vars only)

- [ ] **Step 1: Replace warm surface, text, border, and input values in `:root`**

In `design-tokens.css`, inside the `:root` block, update these specific variables (leave status colors, spacing, typography, z-index etc. untouched):

```css
/* ===== UI COLORS (Light Theme) ===== */
/* Neutral zinc backgrounds */
--background: #f2f2f5;
--foreground: #18181b;
--card: #ffffff;
--card-foreground: #18181b;
--muted: #f2f2f5;
--muted-foreground: #71717a;
--border: rgba(0, 0, 0, 0.06);
--input: #f2f2f5;
--input-bg: #f2f2f5;
--input-border: #e4e4e7;
--input-text: #18181b;
--input-bg-hover: #e8e8ec;
--primary: #14b8a6;
--primary-hover: #0d9488;
--primary-foreground: #ffffff;
--accent-color: var(--primary);
--secondary: #f2f2f5;
--secondary-foreground: #18181b;

/* Neutral Grays (Light Theme) */
--surface: #f2f2f5;
--surface-subtle: #ededf0;
--surface-muted: #ededf0;
--surface-elevated: #ffffff;
--background-subtle: #f2f2f5;
--background-soft: #f2f2f5;
--foreground-muted: #71717a;
--foreground-dark: #18181b;
--border-light: #e4e4e7;
--border-subtle: #e4e4e7;
--text-gray: #71717a;
--text-light-gray: #a1a1aa;
```

- [ ] **Step 2: Update text tokens in `:root`**

In the same `:root` block, find the `/* Text Colors */` section and update:

```css
/* Text Colors */
--token-text-primary: #18181b;
--token-text-secondary: #52525b;
--token-text-tertiary: #71717a;
--token-text-muted: #a1a1aa;
--token-text-white: #ffffff;
```

- [ ] **Step 3: Update skeleton gradient in `:root`**

Find `--skeleton-gradient` in `:root` and replace:

```css
--skeleton-gradient: linear-gradient(90deg, #f2f2f5 25%, #e8e8ec 50%, #f2f2f5 75%);
```

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/scoring/styles/design-tokens.css
git commit -m "style(palette): neutralize light mode tokens in design-tokens.css"
```

---

### Task 5: Update Dark Mode Tokens in design-tokens.css

**Files:**

- Modify: `apps/myk9show/src/pages/scoring/styles/design-tokens.css:340-458` (`.theme-dark` block)

- [ ] **Step 1: Replace dark mode surface, text, border, and input values in `.theme-dark`**

In `design-tokens.css`, inside the `.theme-dark` block, update these specific variables (leave status colors untouched):

```css
/* UI Colors (Dark Mode) */
--background: #0f0f12;
--foreground: #f4f4f5;
--card: #1a1a1f;
--card-foreground: #f4f4f5;
--muted: #1a1a1f;
--muted-foreground: #71717a;
--border: rgba(255, 255, 255, 0.06);
--input: #1a1a1f;
--input-bg: #1a1a1f;
--input-border: #27272a;
--input-text: #f4f4f5;
--input-bg-hover: #222227;
--primary: #14b8a6;
--primary-hover: #0d9488;
--primary-foreground: #ffffff;
--secondary: #1a1a1f;
--secondary-foreground: #f4f4f5;

/* Neutral Grays (Dark Theme) */
--surface: #1a1a1f;
--surface-subtle: #141417;
--surface-muted: #0f0f12;
--surface-elevated: #222227;
--background-subtle: #141417;
--background-soft: #222227;
--foreground-muted: #a1a1aa;
--foreground-dark: #f4f4f5;
--border-light: #27272a;
--border-subtle: rgba(255, 255, 255, 0.06);
--text-gray: #71717a;
--text-light-gray: #52525b;
```

- [ ] **Step 2: Update dark mode text tokens**

In the `.theme-dark` block, find the `/* Text Colors (Dark Mode) */` section and update:

```css
/* Text Colors (Dark Mode) */
--token-text-primary: #f4f4f5;
--token-text-secondary: #a1a1aa;
--token-text-tertiary: #71717a;
--token-text-muted: #52525b;
--token-text-white: #ffffff;
```

- [ ] **Step 3: Update dark mode glass morphism and overlay** [EXPANDED]

```css
/* Glass Morphism (Dark Mode) */
--glass-bg: rgba(15, 15, 18, 0.9);
--glass-border: rgba(255, 255, 255, 0.06);
```

Also update `--overlay-dark-heavy` in `:root` (line ~280) to match new dark bg:

```css
--overlay-dark-heavy: rgba(15, 15, 18, 0.8);
```

- [ ] **Step 4: Update dark mode skeleton gradient**

Find `--skeleton-gradient` in `.theme-dark` and replace:

```css
--skeleton-gradient: linear-gradient(90deg, #1a1a1f 25%, #141417 50%, #1a1a1f 75%);
```

Also update the `:root` dark skeleton fallback:

```css
--skeleton-gradient-dark: linear-gradient(90deg, #1a1a1f 25%, #141417 50%, #1a1a1f 75%);
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/styles/design-tokens.css
git commit -m "style(palette): neutralize dark mode tokens in design-tokens.css"
```

---

### Task 6: Update design-tokens.css `:root` Light Mode Comments

**Files:**

- Modify: `apps/myk9show/src/pages/scoring/styles/design-tokens.css:20` (comment on `--background`)

- [ ] **Step 1: Update comments referencing "warm" in design-tokens.css**

The `:root` block in design-tokens.css has comments like `/* Warm off-white */` and `/* Warm premium backgrounds */`. Update them to reflect the new neutral direction:

Replace: `/* Warm premium backgrounds for Hero/Ruler brand archetype */`
With: `/* Neutral zinc backgrounds */`

Replace: `/* Warm off-white (was #fefefe) */` on `--background`
With: `/* Zinc-100 neutral */`

Replace: `/* Subtle cream tint (was #ffffff) */` on `--card`
With: `/* Pure white card surface */`

Replace: `/* Warm off-white (was #f1f5f9) */` on `--surface` and `--secondary`
With: `/* Zinc-100 neutral */`

Replace all warm-referencing comments in the surface variables section with neutral equivalents.

- [ ] **Step 2: Update comments in index.css**

In index.css, update the `:root` and `.dark` comments:

Replace: `/* Warm cream (was #f8f7f4) */` with `/* Zinc-100 neutral */`
Replace: `/* Elevated cream (was #fefdfb) */` with `/* Pure white card surface */`
Replace: `/* Subtle warmth — perceptible but not heavy */` with `/* Zinc-200 sidebar */`
Replace: `/* Warmer charcoal */` with `/* Near-black neutral */`
Replace: `/* (was #f6f6f6) */` with `/* Zinc-100 */`
Replace: `/* (was #e5e7eb) */` with `/* Semi-transparent neutral */`
Replace: `/* (was #f3f4f6) */` with `/* Zinc-100 */`
Replace: `/* (was #f2f2f2) */` with `/* Zinc-100 */`
Replace: `/* (was #ffffff) */` on popover with `/* Pure white */`
Replace: `/* Warm backgrounds matching myK9Q */` with `/* Neutral zinc backgrounds */`
Replace: `/* Gray neutrals matching myK9Q */` with `/* Zinc neutrals */`
Replace: `/* Card elevation — warm-tinted multi-layer shadows */` with `/* Card elevation — neutral multi-layer shadows */`
Replace: `/* Header elevation — subtle floating shadow */` with `/* Header elevation */`
Replace: `/* Warm dark backgrounds matching myK9Q */` with `/* Neutral dark backgrounds */`

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/index.css apps/myk9show/src/pages/scoring/styles/design-tokens.css
git commit -m "style(palette): update comments to reflect neutral palette"
```

---

### Task 7: Verify — Typecheck, Lint, and Tests

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: 0 errors. CSS changes don't affect TypeScript, but verify nothing broke.

- [ ] **Step 2: Run lint**

Run: `cd apps/myk9show && pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass. CSS variable changes don't affect test logic (JSDOM doesn't evaluate CSS), but run to confirm nothing references old values.

- [ ] **Step 4: Visual check** [EXPANDED]

Run: `pnpm dev:show`
Open `http://localhost:5173` and check:

- Light mode: neutral grey page bg, white cards, no warm tint
- Dark mode: near-black page bg, dark neutral cards, no warm tint
- Toggle all 4 accent colors (green, blue, orange, purple) — each should pop against neutral backgrounds
- Check sidebar has distinct surface from page
- Check scrollbars are neutral (no warm brown tint)
- Check print/high-contrast modes still use white (should be unaffected)
- Check status badges (Registered, Checked In, Conflict, Pulled) remain readable on new card/page surfaces
- Check popovers (dropdowns, select menus) render with correct bg on both modes
- Check dialogs (any modal) have correct card-level bg, not page bg
- Check toast notifications are readable on both modes

- [ ] **Step 5: WCAG AA contrast spot-check** [ADDED]

Verify these key combinations meet WCAG AA (4.5:1 body text, 3:1 large text). Use browser DevTools color picker or https://webaim.org/resources/contrastchecker/:

| Text                                      | Surface    | Expected Ratio                         |
| ----------------------------------------- | ---------- | -------------------------------------- |
| `#18181B` (primary) on `#FFFFFF` (card)   | Light card | >15:1 ✅                               |
| `#71717A` (secondary) on `#FFFFFF` (card) | Light card | ~4.7:1 ✅                              |
| `#A1A1AA` (muted) on `#FFFFFF` (card)     | Light card | ~2.8:1 — OK for labels/large text only |
| `#71717A` (secondary) on `#F2F2F5` (page) | Light page | ~4.4:1 — borderline, verify            |
| `#F4F4F5` (primary) on `#1A1A1F` (card)   | Dark card  | >14:1 ✅                               |
| `#71717A` (secondary) on `#1A1A1F` (card) | Dark card  | ~4.5:1 ✅                              |
| `#52525B` (muted) on `#1A1A1F` (card)     | Dark card  | ~2.5:1 — OK for labels/large text only |

If `#71717A` on `#F2F2F5` fails (below 4.5:1), darken secondary text to `#636369` for light page surfaces only.

- [ ] **Step 6: Final commit if any fixups needed**

If visual check reveals issues, fix and commit:

```bash
git add -A
git commit -m "fix(palette): visual polish after neutral palette migration"
```
