# Tailwind CSS v4 Migration Plan

## Overview

This document outlines the steps to migrate myK9Show from Tailwind CSS v3.4 to v4.x.

**Estimated effort:** 1-2 hours
**Risk level:** Low (easily reversible)
**Priority:** Non-urgent (v3.4 is stable and supported)

## Pre-Migration Checklist

- [ ] Ensure all tests pass on v3
- [ ] Create a feature branch: `git checkout -b feat/tailwind-v4`
- [ ] Commit current working state

## Migration Steps

### Step 1: Update Dependencies

```bash
cd apps/myk9show
pnpm remove tailwindcss postcss autoprefixer
pnpm add -D tailwindcss@latest @tailwindcss/postcss@latest
```

### Step 2: Update PostCSS Config

Replace `apps/myk9show/postcss.config.js`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### Step 3: Update index.css Entry Point

Replace the Tailwind directives in `apps/myk9show/src/index.css`:

**Before (v3):**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**After (v4):**
```css
@import "tailwindcss";
```

### Step 4: Migrate tailwind.config.js to CSS

Tailwind v4 uses CSS-first configuration. Move theme customizations to `index.css`.

**Delete:** `apps/myk9show/tailwind.config.js`

**Add to index.css** (after `@import "tailwindcss"`):

```css
@theme {
  /* Border radius */
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  /* Colors - these map CSS variables to Tailwind utilities */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-background-alt: var(--background-alt);

  --color-card: var(--card);
  --color-card-secondary: var(--card-secondary);
  --color-card-foreground: var(--card-foreground);

  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);

  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);

  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);

  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);

  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);

  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  /* Animations */
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;
}

@keyframes accordion-down {
  from { height: 0; }
  to { height: var(--radix-accordion-content-height); }
}

@keyframes accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to { height: 0; }
}
```

### Step 5: Fix CSS Files Using @apply (CRITICAL)

These 7 files use `@apply` with Tailwind utilities and need the `@reference` directive:

| File | @apply Count |
|------|--------------|
| `src/styles/apple-club-details.css` | 5 |
| `src/styles/apple-dog-details.css` | 12 |
| `src/styles/apple-show-details-optimized.css` | 12 |
| `src/styles/apple-show-details.css` | 10 |
| `src/styles/apple-template-management.css` | 8 |
| `src/styles/apple-user-details.css` | 12 |
| `src/styles/template-management.css` | 9 |

**Add to the TOP of each file:**

```css
@reference "tailwindcss";
```

**Example - apple-club-details.css:**
```css
@reference "tailwindcss";

/* Apple-Inspired Club Details Styles */
.apple-club-page {
  @apply px-6;
}
/* ... rest of file */
```

### Step 6: Handle tailwindcss-animate Plugin

The `tailwindcss-animate` plugin may need updates for v4 compatibility. Check for a v4-compatible version:

```bash
pnpm add -D tailwindcss-animate@latest
```

If not compatible, the animations can be manually added to the `@theme` block (see Step 4).

### Step 7: Verify Dark Mode

Tailwind v4 supports dark mode via CSS `@media (prefers-color-scheme: dark)` or class-based. Since we use `darkMode: 'class'` in v3, verify dark mode still works by adding to index.css if needed:

```css
@variant dark (&:where(.dark, .dark *));
```

## Post-Migration Verification

1. **Start dev server:** `pnpm dev:show`
2. **Check for CSS errors** in browser console
3. **Visual regression testing:**
   - [ ] Home page layout
   - [ ] Navigation styling
   - [ ] Cards and buttons
   - [ ] Dark mode toggle
   - [ ] Forms and inputs
   - [ ] Modals and dialogs
4. **Run build:** `pnpm build`
5. **Run tests:** `pnpm test`

## Rollback Plan

If issues arise:

```bash
git checkout main -- apps/myk9show/package.json apps/myk9show/postcss.config.js apps/myk9show/tailwind.config.js apps/myk9show/src/index.css apps/myk9show/src/styles/
pnpm install
```

## Alternative: Gradual Migration

Instead of `@reference`, you could refactor `@apply` usages to plain CSS:

**Before:**
```css
.apple-club-page {
  @apply px-6;
}
```

**After:**
```css
.apple-club-page {
  padding-left: 1.5rem;
  padding-right: 1.5rem;
}
```

This removes the Tailwind dependency from those CSS files entirely, making them more portable. However, it's more work upfront (68 `@apply` usages to convert).

## Resources

- [Tailwind v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind v4 Documentation](https://tailwindcss.com/docs)
- [@reference directive](https://tailwindcss.com/docs/functions-and-directives#reference-directive)
