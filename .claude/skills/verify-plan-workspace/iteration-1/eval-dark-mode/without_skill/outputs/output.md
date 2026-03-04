# Plan: Adding Dark Mode to myK9Show

## Current State Assessment

The myK9Show app already has **extensive dark mode infrastructure** in place. After reviewing the codebase, here is what exists:

### Already Implemented

1. **Tailwind config** (`apps/myk9show/tailwind.config.js`): `darkMode: 'class'` is already set.

2. **CSS variables** (`apps/myk9show/src/index.css`): Both light and dark color palettes are fully defined:
   - Light: `:root` block with `--background: #f8f7f4`, `--foreground: #0a0a0a`, etc.
   - Dark: `.dark` block with `--background: #1a1a1e`, `--foreground: #ffffff`, etc.
   - Accent color variants (green, blue, orange, purple) each have dark mode versions.

3. **Three overlapping theme providers** exist:
   - `ThemeContext.tsx` -- Simple light/dark toggle with localStorage persistence and OS preference detection.
   - `theme-provider.tsx` -- More complete: supports `light | dark | system` tri-state, localStorage persistence, OS media query listener, `useTheme` hook, `useThemeToggle` hook, and a `ThemeToggle` component.
   - `EnhancedThemeContext.tsx` -- Full-featured: ties into user preferences (Supabase), supports `ThemeMode` (`light | dark | system`), localStorage fallback for logged-out users, accessibility settings (reduce motion, high contrast, font scale, layout density).

4. **Dark mode CSS** exists in 15+ stylesheet files (registration, dialogs, calendar, class details, dog details, template management, user details, club details, table styles, etc.).

### What This Means

**Dark mode is already built.** The requirements -- toggle, persistence, and OS-level preference as default -- are all satisfied by the existing code. The real work is not "adding" dark mode but rather **consolidating and verifying** the existing implementation.

---

## Plan

### Phase 1: Consolidate Theme Providers (High Priority)

There are three separate theme providers doing overlapping work. This creates confusion and potential for bugs where one provider's state diverges from another.

**Action items:**

1. **Audit which provider is actually mounted in the app tree.**
   - Read `apps/myk9show/src/main.tsx` and the root layout to determine which providers are active.
   - Check if multiple providers are nested (causing redundant DOM manipulation).

2. **Choose one canonical provider:**
   - For logged-in users: `EnhancedThemeContext` (it persists to Supabase and has localStorage fallback).
   - For the base app shell: `theme-provider.tsx`'s `ThemeProvider` is the most complete standalone option.
   - `ThemeContext.tsx` is the simplest but lacks `system` mode -- candidate for removal.

3. **Consolidate to a single provider:**
   - Keep `EnhancedThemeProvider` as the primary (it already handles auth/no-auth gracefully with localStorage fallback).
   - Remove or deprecate `ThemeContext.tsx` and `theme-provider.tsx` if they are not in active use.
   - Ensure the `useTheme` hook in `src/hooks/useTheme.ts` points to the canonical context.

4. **Resolve the duplicate `useTheme` export:**
   - `src/hooks/useTheme.ts` exports `useTheme` from `ThemeContext`.
   - `src/components/theme-provider.tsx` also exports `useTheme`.
   - Grep all imports and unify to one source.

### Phase 2: Verify Dark Mode CSS Coverage (Medium Priority)

The CSS variable system means most Tailwind-based components automatically support dark mode (they reference `var(--background)`, `var(--primary)`, etc.). However:

1. **Audit for hardcoded colors:**
   - Search for hardcoded hex colors (`#fff`, `#000`, `bg-white`, `bg-gray-*`, `text-gray-*`, `text-black`, `text-white`) in JSX/TSX files that bypass the CSS variable system.
   - These will not respond to dark mode and need to be replaced with semantic tokens (`bg-background`, `text-foreground`, `bg-card`, etc.).

2. **Audit custom CSS files:**
   - The 15+ custom CSS files already have `.dark` selectors, but verify coverage is complete.
   - Check for any `background-color`, `color`, or `border-color` declarations that lack a `.dark` counterpart.

3. **Check image and SVG assets:**
   - Logos, icons, or illustrations with hardcoded light backgrounds will look wrong in dark mode.
   - Add `dark:invert` or swap assets as needed.

### Phase 3: Flash-of-Incorrect-Theme Prevention (High Priority)

This is the most common dark mode bug: on page load, the page briefly shows light mode before JavaScript runs and applies the `dark` class.

**Action items:**

1. **Add an inline script to `index.html`** that runs before React hydration:

   ```html
   <script>
     (function () {
       var stored =
         localStorage.getItem('theme-mode') ||
         localStorage.getItem('ui-theme') ||
         localStorage.getItem('theme');
       var theme = stored || 'system';
       if (theme === 'system') {
         theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
       }
       if (theme === 'dark') {
         document.documentElement.classList.add('dark');
       }
     })();
   </script>
   ```

   This eliminates the flash because the `dark` class is applied before any CSS renders.

2. **Verify `index.html` does not have conflicting class logic** on `<html>` or `<body>`.

### Phase 4: Toggle UI Component (Low Priority -- May Already Exist)

1. **Check if `ThemeToggle` from `theme-provider.tsx` is rendered anywhere in the app.**
   - It supports a 3-way cycle: light -> dark -> system.
   - If not rendered, add it to the app header (`AppHeader.tsx`).

2. **Replace emoji icons with proper SVG icons** (sun, moon, monitor) for a polished look. The current implementation uses emoji (`☀️`, `🌙`, `🌓`) which may render inconsistently across platforms.

3. **Ensure the toggle is accessible:**
   - `aria-label` is already present in the existing component.
   - Verify keyboard navigation works (focusable, Enter/Space triggers).

### Phase 5: Testing (Medium Priority)

1. **Unit tests for the consolidated theme provider:**
   - Test: defaults to OS preference when no stored value exists.
   - Test: reads stored preference from localStorage on mount.
   - Test: `setThemeMode('dark')` adds `dark` class to `documentElement`.
   - Test: `setThemeMode('system')` follows `prefers-color-scheme` media query.
   - Test: toggling persists to localStorage.
   - Test: media query change listener updates theme when in `system` mode.

2. **Visual regression / E2E test:**
   - Navigate key pages in dark mode and verify no broken layouts.
   - Check form inputs, modals, tables, and cards specifically.

---

## Verification: Gap Analysis

### Requirements Checklist

| Requirement                     | Status  | Notes                                                          |
| ------------------------------- | ------- | -------------------------------------------------------------- |
| Users can toggle dark mode      | COVERED | Multiple toggle mechanisms exist; need consolidation           |
| Preference persists             | COVERED | localStorage (all providers) + Supabase (EnhancedThemeContext) |
| OS-level preference as default  | COVERED | All three providers check `prefers-color-scheme: dark`         |
| Real-time OS preference changes | COVERED | Media query listener in all providers                          |

### Identified Gaps

1. **Flash of unstyled content (FOUC):** No inline script in `index.html` to apply theme before React mounts. This is the biggest functional gap -- users will see a white flash on every page load if their preference is dark.

2. **Three competing providers:** Risk of state divergence. If `ThemeContext` says "light" but `EnhancedThemeContext` says "dark", the DOM class could flip-flop. Must consolidate.

3. **Duplicate `useTheme` hooks:** `src/hooks/useTheme.ts` imports from `ThemeContext`, while `src/components/theme-provider.tsx` exports its own `useTheme`. Components importing from different sources will get different state.

4. **Hardcoded colors in components:** Likely some components use Tailwind's default palette (`bg-white`, `text-gray-700`) instead of the semantic tokens (`bg-background`, `text-foreground`). These won't respond to dark mode.

5. **Third-party component styling:** Any third-party UI components (date pickers, rich text editors, etc.) may need dark mode overrides.

6. **Meta theme-color:** The browser's address bar color (`<meta name="theme-color">`) should update to match the active theme for a polished mobile experience.

7. **Transition smoothness:** No `transition` on `background-color`/`color` when toggling. Without it, the switch is jarring. Consider adding `transition-colors` to the `<html>` or `<body>` element.

### Edge Cases

- **SSR/SSG considerations:** The app is a Vite SPA (not Next.js SSR despite the task description saying "Next.js"), so server-side rendering flash is not a concern -- but the pre-React-mount flash still is.
- **User logs in with different preference than localStorage:** `EnhancedThemeContext` handles this -- Supabase preference overrides localStorage on auth.
- **Multiple tabs:** localStorage changes in one tab don't automatically propagate to other tabs. Consider adding a `storage` event listener to sync across tabs.
- **Reduced motion preference:** `EnhancedThemeContext` already supports `reduceMotion` -- theme transitions should respect this.

### Implied Requirements Not Explicitly Stated

1. **Smooth transition animation** when toggling (not just an instant swap).
2. **Cross-tab synchronization** of theme preference.
3. **Mobile browser chrome** matching (theme-color meta tag).
4. **Print styles** should always use light mode regardless of user preference.

---

## Recommended Execution Order

1. **Phase 3** (FOUC prevention) -- Quick win, biggest user-visible improvement.
2. **Phase 1** (Consolidate providers) -- Reduces complexity, prevents bugs.
3. **Phase 2** (CSS audit) -- Ensures visual correctness.
4. **Phase 4** (Toggle UI) -- Verify or add the user-facing control.
5. **Phase 5** (Testing) -- Lock it down.

## Estimated Effort

- Phase 1: ~2-3 hours (grep all imports, consolidate, verify)
- Phase 2: ~3-4 hours (full audit of hardcoded colors, fix outliers)
- Phase 3: ~30 minutes (inline script + meta tag)
- Phase 4: ~1 hour (verify toggle placement, swap emoji for SVGs)
- Phase 5: ~2-3 hours (unit tests + manual visual check)

**Total: ~9-11 hours**

## Important Note

The task description mentions "Next.js app" but myK9Show is actually a **Vite + React SPA** (not Next.js). The plan above is tailored to the actual architecture. If this is intended for a different app or a future migration to Next.js, the FOUC prevention approach would change (using Next.js `Script` component or `_document.tsx` instead of raw `index.html` inline script).
