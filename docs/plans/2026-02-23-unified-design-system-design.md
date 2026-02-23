# Unified Design System: Evolve @myk9/ui as Single Source of Truth

## Context

myK9Show and myK9Q have divergent UI systems. myK9Show uses `@myk9/ui` (shadcn/ui + Base UI + Tailwind v3). myK9Q uses 43 custom components + 54 CSS files + Tailwind v4 and does not consume `@myk9/ui` at all. The goal is to evolve `@myk9/ui` to absorb the best of both, then migrate myK9Q to use it — achieving visual and UX consistency across the monorepo.

### User Decisions
- **Typography**: Montserrat (body) + Playfair Display (headings) — premium/elegant
- **Accessibility**: Bring myK9Q's high-contrast, one-handed mode, 44px touch targets, reduce-motion into @myk9/ui
- **Migration scope**: Full — myK9Q in monorepo is not production (separate repo)

---

## Phase 1: Enhance @myk9/ui Package

**Goal**: Make @myk9/ui good enough for both apps by adding missing tokens, typography, accessibility, and component variants.

### 1a. Typography — Add Montserrat + Playfair Display

**Files to modify:**
- `packages/ui/src/tailwind-preset.ts` — Change `fontFamily.sans` to Montserrat stack, add `fontFamily.display` for Playfair Display
- `packages/ui/src/styles/index.css` — Update `body { font-family }` to Montserrat, add `@import` for Google Fonts (or document self-hosting)
- `apps/myk9show/src/index.css` — Add font imports (Google Fonts link or local `@font-face`)
- `apps/myk9q/src/index.css` — Already has Montserrat/Playfair (verify and align)

### 1b. Design Tokens — Merge best of both into @myk9/ui

**Files to modify:**
- `packages/ui/src/styles/index.css` — Add missing tokens from myK9Q's design-tokens.css:
  - Spacing scale: `--space-xs` through `--space-4xl`
  - Surface colors: `--surface`, `--surface-subtle`, `--surface-elevated`
  - Touch target tokens: `--touch-target-min: 44px`, `--touch-target-comfortable: 48px`
  - Class workflow status colors: `--status-setup`, `--status-briefing`, `--status-break`, `--status-in-progress`, `--status-completed`
  - Result colors: `--status-qualified`, `--status-not-qualified`, `--status-excused`
  - Brand colors: `--brand-blue`, `--brand-purple`, `--brand-gradient`
- `packages/ui/src/tailwind-preset.ts` — Map new CSS variables to Tailwind utilities (spacing, surface colors, additional status colors, font-size scale)

**Note**: Both apps already share the same accent color system (green/blue/orange/purple) and light/dark theme approach — keep those as-is.

### [ADDED] 1b-ii. Tailwind v4 Compatibility

myK9Q uses Tailwind v4 which uses CSS-based config (`@theme` directives) rather than JS `tailwind.config.js`. Two options:
- **Option A (recommended)**: Keep myK9Q on its JS tailwind.config.js (Tailwind v4 still supports it via `@config` directive). Import the @myk9/ui preset there.
- **Option B**: Convert @myk9/ui preset to also export CSS `@theme` tokens for Tailwind v4 native consumption.

**Action**: Verify myK9Q's current Tailwind v4 setup. If it already uses a JS config file, Option A works with no changes to @myk9/ui. Add a verification step in Phase 3b to confirm the preset loads correctly in Tailwind v4.

### 1c. Accessibility CSS Utilities

**Files to create in `packages/ui/src/styles/`:**
- `accessibility/high-contrast.css` — Port from `apps/myk9q/src/styles/high-contrast.css` (~260 lines). Enhanced contrast ratios, dark outlines, high-visibility focus rings. Activated by `.high-contrast` class on `<html>`.
- `accessibility/touch-targets.css` — Port from `apps/myk9q/src/styles/touch-targets.css` (~220 lines). 44px minimum touch targets, spacing between targets. Utility classes: `.touch-target`, `.touch-target-comfortable`, `.touch-target-large`.
- `accessibility/reduce-motion.css` — Port from `apps/myk9q/src/styles/reduce-motion.css` (~280 lines). Disables all animations/transitions when `.reduce-motion` class active.
- `accessibility/one-handed-mode.css` — Port from `apps/myk9q/src/styles/one-handed-mode.css` (~260 lines). FAB positioning, bottom-aligned actions, hand-specific layouts.

**Files to modify:**
- `packages/ui/src/styles/index.css` — Import the 4 new accessibility CSS files via `@import` directives. This bundles them into the single distributed `index.css`.
- `packages/ui/package.json` — [EXPANDED] The current `build:css` script only copies `src/styles/index.css` → `dist/styles/index.css`. Since the accessibility files are `@import`ed into index.css, we need to either:
  - **Option A (recommended)**: Use a PostCSS build step that resolves `@import` directives and outputs a single bundled CSS file. Add `postcss-import` plugin.
  - **Option B**: Concatenate all CSS files into index.css at build time with a simple script.
  - The package already has `postcss` as a devDependency, so Option A is natural.

### 1d. Component Variant Enhancements

**Files to modify:**
- `packages/ui/src/components/Button/buttonVariants.ts` — Add `gradient` variant (from myK9Q: `bg-gradient-to-r from-brand-blue to-brand-purple`)
- `packages/ui/src/components/Card/Card.tsx` — Add `variant` prop with `scored` and `unscored` variants (from myK9Q: teal border for scored, orange border/glow for unscored)
- `packages/ui/src/components/Badge/Badge.tsx` — Export `ArmbandBadge` sub-component (44x44px circular badge for armband numbers, from myK9Q)

### 1e. Build & Verify Phase 1

- Run `pnpm build` from `packages/ui/`
- Run `pnpm typecheck` across monorepo
- Verify myK9Show still renders correctly (existing consumer — should not break)

---

## Phase 2: Align myK9Show with Enhanced @myk9/ui

**Goal**: Update myK9Show to use the new typography and any changed tokens. Small phase since myK9Show already consumes @myk9/ui.

### 2a. Typography Update

**Files to modify:**
- `apps/myk9show/src/index.css` — Add Google Fonts import for Montserrat + Playfair Display. Update any hardcoded `font-family` declarations.
- `apps/myk9show/tailwind.config.js` — Verify it picks up the updated preset (already imports `myk9Preset`)
- Apply `font-display` class to headings where appropriate (h1, h2, hero text)

### 2b. Accessibility Utilities

**Files to modify:**
- `apps/myk9show/src/index.css` — Import `@myk9/ui/styles` (if not already importing all styles)
- `apps/myk9show/src/stores/settingsStore.ts` — Verify settings for reduce-motion, high-contrast can toggle the CSS classes

### 2c. Verify Phase 2

- Start myK9Show dev server, visually verify typography change
- Verify dark mode, accent colors still work
- Run `pnpm typecheck`

---

## Phase 3: Migrate myK9Q to @myk9/ui

**Goal**: Replace myK9Q's custom components with @myk9/ui equivalents. Keep app-specific components (offline, sync, filtering) local but restyle them with @myk9/ui tokens.

### 3a. Add @myk9/ui Dependency

**Files to modify:**
- `apps/myk9q/package.json` — Add `"@myk9/ui": "workspace:*"` to dependencies
- Run `pnpm install`

### 3b. Update Tailwind Config

**Files to modify:**
- `apps/myk9q/tailwind.config.js` — Import and apply `myk9Preset` from `@myk9/ui/tailwind-preset`. Remove duplicate token definitions that now come from the preset. Keep any myK9Q-specific extensions (app-unique colors, etc).

### 3c. Migrate Core Components (one-by-one)

Each migration follows this pattern:
1. Update `apps/myk9q/src/components/ui/index.ts` to re-export from `@myk9/ui` instead of local file
2. Verify page-level imports still work (barrel export keeps same API)
3. Fix any prop mismatches at call sites
4. Delete the local component file once all consumers are updated

**Migration order** (least dependencies first):

| Component | Local file | @myk9/ui replacement | Prop changes needed |
|-----------|-----------|---------------------|-------------------|
| **Button** | `Button.tsx` | `@myk9/ui Button` | `gradient` variant added in Phase 1. Size mapping: myK9Q `md` → @myk9/ui `default` |
| **Card** | `Card.tsx` | `@myk9/ui Card` | `CardActions` → `CardFooter`. Add `scored`/`unscored` variants in Phase 1 |
| **Badge** | `Badge.tsx` | `@myk9/ui Badge` | `ArmbandBadge` added in Phase 1. `StatusIndicator` stays local (app-specific) |
| **StatusBadge** | `StatusBadge.tsx` | `@myk9/ui StatusBadge` | API difference: myK9Q uses `statusType`+`statusColor`, @myk9/ui uses `variant`. Create adapter or update call sites |
| **TabBar** | `TabBar.tsx` | `@myk9/ui TabBar` | Similar API — verify `Tab` interface compatibility |

[ADDED] **Secondary migration candidates** (generic components that could move to @myk9/ui later but are lower priority for Phase 3):

| Component | Rationale |
|-----------|-----------|
| **EmptyState** | Generic pattern — both apps need empty state UI |
| **ErrorState** | Generic pattern — both apps need error display |
| **Popover** | Generic primitive — @myk9/ui could benefit from it |
| **BottomSheet** | Mobile pattern — useful for both apps |
| **CollapsibleSection** | Generic accordion pattern |

These are **not blocking** for Phase 3. The 5 core components above establish consistency for the most visible UI elements. The secondary candidates can be migrated in a follow-up effort once the core is stable.

### 3d. Update App-Specific Components to Use @myk9/ui Tokens

Components that stay local in myK9Q (offline, sync, filtering, etc.) should be updated to reference `@myk9/ui` CSS variables and tokens instead of local design-tokens.css values. This ensures they match the visual system even though they remain app-specific.

**Files to modify:**
- `apps/myk9q/src/styles/design-tokens.css` — Reduce to only myK9Q-unique overrides (warm background `#F8F7F4`, teal primary `#14b8a6`, app-specific status colors). Remove anything now provided by @myk9/ui's styles.
- `apps/myk9q/src/index.css` — Add `@import '@myk9/ui/styles'` at the top. Remove imports for CSS files that are now in @myk9/ui (accessibility files).

### 3e. Clean Up Redundant CSS

**Files to remove or reduce:**
- `apps/myk9q/src/styles/high-contrast.css` — Replaced by @myk9/ui version
- `apps/myk9q/src/styles/touch-targets.css` — Replaced by @myk9/ui version
- `apps/myk9q/src/styles/reduce-motion.css` — Replaced by @myk9/ui version
- `apps/myk9q/src/styles/one-handed-mode.css` — Replaced by @myk9/ui version
- `apps/myk9q/src/styles/apple-design-system.css` — Evaluate: merge useful parts into @myk9/ui or keep as app-specific

### 3f. Verify Phase 3

- Start myK9Q dev server, visually verify each migrated page
- Run `pnpm typecheck`
- Run `pnpm test` in both apps

---

## Phase 4: Final Verification

### 4a. Cross-App Visual Comparison
- Screenshot both apps' common elements (buttons, cards, badges, status indicators)
- Verify typography matches (Montserrat body, Playfair Display headings)
- Verify dark mode works in both
- Verify accent color switching works in both

### 4b. Accessibility Verification
- Toggle high-contrast mode in both apps
- Toggle reduce-motion in both apps
- Verify 44px touch targets on mobile viewport

### 4c. Build & Typecheck
- `pnpm build` — full monorepo build
- `pnpm typecheck` — zero new errors
- `pnpm lint` — clean

---

## Critical Files Summary

| File | Role |
|------|------|
| `packages/ui/src/styles/index.css` | Central CSS variables — foundation of everything |
| `packages/ui/src/tailwind-preset.ts` | Tailwind token mappings consumed by both apps |
| `packages/ui/src/components/Button/buttonVariants.ts` | Add gradient variant |
| `packages/ui/src/components/Card/Card.tsx` | Add scored/unscored variants |
| `packages/ui/src/components/Badge/Badge.tsx` | Add ArmbandBadge |
| `apps/myk9q/src/components/ui/index.ts` | Barrel export — swap local → @myk9/ui re-exports |
| `apps/myk9q/tailwind.config.js` | Adopt @myk9/ui preset |
| `apps/myk9q/src/styles/design-tokens.css` | Reduce to app-specific overrides only |
| `apps/myk9q/src/index.css` | Add @myk9/ui style import |
| `apps/myk9show/src/index.css` | Add Montserrat/Playfair font imports |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Tailwind v3 vs v4 incompatibility | The @myk9/ui preset uses standard Tailwind config format compatible with both. Test in both apps. |
| StatusBadge API mismatch | Create a thin adapter in myK9Q that maps `statusType`+`statusColor` → `variant` prop |
| Font loading performance | Use `font-display: swap` and preload critical fonts |
| Breaking myK9Show during @myk9/ui changes | Phase 1 is additive only — new tokens, new variants. Nothing is removed. |
| Large blast radius in Phase 3 | Migrate one component at a time, typecheck after each |
