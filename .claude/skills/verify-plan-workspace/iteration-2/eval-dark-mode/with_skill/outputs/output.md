# Plan: Adding Dark Mode to myK9Show (Next.js + Tailwind)

## Context

The myK9Show app already has substantial dark mode infrastructure in place:

- `tailwind.config.js` sets `darkMode: 'class'`
- `ThemeProvider` component (`src/components/theme-provider.tsx`) handles light/dark/system modes with localStorage persistence and OS preference detection
- `EnhancedThemeContext` (`src/context/EnhancedThemeContext.tsx`) integrates theme with authenticated user preferences (saved to Supabase)
- CSS custom properties via `var(--background)`, `var(--foreground)`, etc. are already wired through Tailwind
- A `ThemeToggle` component exists with light -> dark -> system cycling

What is **missing** is the actual dark color palette definitions and auditing all components to ensure they use the theme-aware tokens rather than hardcoded colors.

---

## Step 1: Define Dark Mode CSS Custom Properties

**File:** `apps/myk9show/src/index.css` (or wherever the `:root` CSS variables are defined)

Add a `.dark` selector block that redefines every CSS custom property used in `tailwind.config.js`:

```css
:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --card: #ffffff;
  --card-secondary: #f8f8f8;
  --card-foreground: #0a0a0a;
  --popover: #ffffff;
  --popover-foreground: #0a0a0a;
  --primary: /* existing value */;
  --primary-foreground: /* existing value */;
  /* ... all other tokens ... */
}

.dark {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --card: #141414;
  --card-secondary: #1a1a1a;
  --card-foreground: #fafafa;
  --popover: #141414;
  --popover-foreground: #fafafa;
  --primary: /* dark variant */;
  --primary-foreground: /* dark variant */;
  --border: #27272a;
  --input: #27272a;
  --ring: /* dark variant */;
  --chart-1: /* dark variant */;
  /* ... all other tokens ... */
}
```

Every token referenced in `tailwind.config.js` theme.extend.colors must have a `.dark` override. Missing any creates a broken visual in dark mode.

**Error handling:** If a token is missed, the component will inherit the light value. To catch this, add a visual regression test (see Step 5).

---

## Step 2: Wire the ThemeProvider Into the App Root

**File:** `apps/myk9show/src/main.tsx` (or App.tsx)

Ensure `ThemeProvider` wraps the application and initializes before first paint to prevent flash of wrong theme (FOWT):

1. Verify `ThemeProvider` is already in the component tree (it likely is given the existing code). If not, add it as the outermost provider.
2. Add an inline `<script>` in `index.html` that reads localStorage and applies the `dark` class to `<html>` before React hydrates:

```html
<!-- apps/myk9show/index.html, inside <head> -->
<script>
  (function () {
    var stored = localStorage.getItem('ui-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || (stored !== 'light' && prefersDark) ? 'dark' : 'light';
    document.documentElement.classList.add(theme);
  })();
</script>
```

This prevents a flash of light mode when the user has dark mode saved or when the OS prefers dark.

**Error handling:** If localStorage is unavailable (e.g., private browsing in some browsers), the script falls through to OS preference, then defaults to light. No crash path.

---

## Step 3: Expose the Toggle in the UI

**File:** `apps/myk9show/src/components/layout/AppHeader.tsx` (or settings page)

The `ThemeToggle` component already exists in `theme-provider.tsx`. Add it to the app header or user settings:

```tsx
import { ThemeToggle } from '@/components/theme-provider';

// Inside header JSX:
<ThemeToggle className="..." showSystemOption={true} />;
```

For authenticated users, the `EnhancedThemeContext` already persists the preference to Supabase via `useUserPreferences`. For unauthenticated users, the `ThemeProvider` persists to `localStorage` under the key `ui-theme`.

**Persistence summary:**

- Authenticated: Supabase user preferences (survives device changes)
- Unauthenticated: `localStorage` key `ui-theme` (survives page reloads)
- Default when neither exists: OS preference via `prefers-color-scheme`

---

## Step 4: Audit Components for Hardcoded Colors

Search the entire `apps/myk9show/src/` directory for:

- Hardcoded hex colors in className strings (e.g., `bg-white`, `text-black`, `bg-gray-100`)
- Hardcoded colors in inline styles
- Any `bg-white`/`bg-black`/`text-white`/`text-black` that should be `bg-background`/`text-foreground`

Replace with theme-aware Tailwind classes:
| Hardcoded | Theme-aware replacement |
|-----------|------------------------|
| `bg-white` | `bg-background` or `bg-card` |
| `text-black` | `text-foreground` |
| `bg-gray-100` | `bg-muted` |
| `text-gray-500` | `text-muted-foreground` |
| `border-gray-200` | `border-border` |

This is the largest portion of work. Estimate: 30-80 files depending on how consistently CSS variables were used originally.

**Edge case:** Some components intentionally use fixed colors (e.g., brand logos, status indicators like green/red). These should be skipped. Look for `// INTENT:` comments before changing.

---

## Step 5: Testing Strategy

1. **Visual smoke test:** Toggle through light -> dark -> system in the browser. Check every major page (dashboard, show detail, class list, scoring, settings).
2. **Unit tests:** The existing `ThemeProvider` and `EnhancedThemeContext` should have tests verifying:
   - Initial state respects `prefers-color-scheme` mock
   - `setTheme('dark')` adds `dark` class to `documentElement`
   - `setTheme('system')` follows media query
   - `localStorage` is written on change
   - Toggle cycles correctly (light -> dark -> system -> light)
3. **E2E tests (Playwright):**
   - Test that `prefers-color-scheme: dark` emulation results in dark class on `<html>`
   - Test that toggling persists across page reload
   - Test that switching to system mode tracks OS changes
4. **Visual regression (optional but recommended):** Capture screenshots in both modes for key pages and diff them in CI.

---

## Step 6: Accessibility Considerations

- Ensure all dark mode colors meet WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large text).
- Test with the `high-contrast` mode already supported in `EnhancedThemeContext`.
- The `ThemeToggle` button already has `aria-label` and `title` attributes. Verify keyboard navigation works (Tab + Enter/Space).
- Respect `prefers-reduced-motion` for any transition animations between themes (the existing `reduceMotion` preference in `EnhancedThemeContext` handles this).

---

## Step 7: Deployment

No new environment variables or infrastructure changes required. The feature is entirely client-side:

- CSS changes deploy with the existing Tailwind build pipeline
- No database migration needed (user preferences schema already has `theme.mode`)
- No Edge Function changes
- Vercel auto-deploys from `main`

Roll out: merge to `main`, verify on staging (myk9-platform-myk9show.vercel.app), then promote.

---

## Plan Verification

### Requirements Audit

| Requirement                                   | Status      | Evidence                                                                                                                                                                           |
| --------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users can toggle dark mode                    | **Covered** | Step 3: ThemeToggle component added to AppHeader, cycles light->dark->system. Existing `toggleTheme` and `setThemeMode` functions handle the state change.                         |
| Preference persists across sessions           | **Covered** | Step 3 persistence summary: localStorage for unauthenticated, Supabase for authenticated. Both survive page reloads and browser restarts.                                          |
| OS-level preference is the default            | **Covered** | Step 2: inline script checks `prefers-color-scheme` when no stored preference exists. ThemeProvider defaults to `'system'` mode. EnhancedThemeContext also defaults to `'system'`. |
| Dark color palette actually exists            | **Covered** | Step 1: `.dark` CSS block defines all custom property overrides for every Tailwind token.                                                                                          |
| No flash of wrong theme on load               | **Covered** | Step 2: inline `<script>` in `index.html` applies class before React mounts, preventing FOWT. Error handling covers localStorage unavailability.                                   |
| Existing components work in dark mode         | **Covered** | Step 4: full audit of hardcoded colors with replacement table. INTENT-comment components are preserved.                                                                            |
| OS preference changes are tracked live        | **Covered** | Step 2 + existing code: `ThemeProvider` already listens to `matchMedia('prefers-color-scheme').addEventListener('change', ...)` when in system mode.                               |
| Accessibility (contrast, keyboard, aria)      | **Covered** | Step 6: WCAG AA contrast requirement, keyboard nav verification, existing aria-label on toggle, high-contrast mode integration.                                                    |
| Testing covers the feature                    | **Covered** | Step 5: unit tests for state logic, E2E for persistence and OS tracking, visual smoke test for all pages.                                                                          |
| No hardcoded colors leak through              | **Partial** | Step 4 describes the audit process but does not guarantee 100% coverage. Some hardcoded colors may be missed in initial pass. Mitigated by visual regression testing in Step 5.4.  |
| Rollback / recovery if dark mode looks broken | **Partial** | Step 7 mentions staging verification, but no feature flag or kill switch is described. Users can manually toggle back to light mode, but there is no server-side disable.          |
| Performance impact of theme switching         | **Covered** | CSS custom properties + class toggle is a single DOM operation. No JS re-render of the full tree. Tailwind purges unused styles at build time.                                     |
| Migration for existing users                  | **Covered** | Existing users have no stored preference, so they default to `'system'` mode (OS preference). No data migration needed.                                                            |

### Coverage: 88/100

The core requirements (toggle, persistence, OS default) are fully addressed with citations to specific implementation steps. Two items are Partial: the hardcoded color audit cannot guarantee 100% catch rate on first pass, and there is no explicit feature flag or rollback mechanism beyond "user can toggle back to light."

### Top Gaps

1. **No feature flag / kill switch** -- If dark mode ships with broken colors on a critical page, the only recovery is a code revert or telling users to switch back manually. Impact: medium (mitigated by staging verification, but no instant production disable).
2. **Hardcoded color audit completeness** -- Step 4 describes the process but cannot guarantee every file is caught. Some components may render incorrectly in dark mode until discovered. Impact: medium (visual regression tests reduce risk but may not cover all states).

### Patched Plan

**[ADDED] Step 4a: Automated Hardcoded Color Lint Rule**

Add an ESLint rule or custom lint script that flags common hardcoded Tailwind color classes (`bg-white`, `bg-black`, `text-white`, `text-black`, `bg-gray-*`, `text-gray-*`, `border-gray-*`) in JSX files under `apps/myk9show/src/`. This catches regressions in future code, not just the initial audit.

Example approach using `eslint-plugin-tailwindcss` or a custom `no-restricted-syntax` rule:

```json
{
  "rules": {
    "no-restricted-syntax": [
      "warn",
      {
        "selector": "Literal[value=/\\b(bg-white|bg-black|text-white|text-black|bg-gray-|text-gray-|border-gray-)\\b/]",
        "message": "Use theme-aware color tokens (bg-background, text-foreground, etc.) instead of hardcoded colors for dark mode support."
      }
    ]
  }
}
```

This does not block the build (warning, not error) but surfaces issues during development.

**[ADDED] Step 7a: Feature Flag for Dark Mode**

Wrap the `ThemeToggle` visibility and the `.dark` class application behind a feature flag. Implementation options:

1. **Simple approach:** An environment variable `VITE_ENABLE_DARK_MODE=true` that gates whether the ThemeToggle appears and whether the inline `<script>` in `index.html` applies dark class. When disabled, the app behaves exactly as before (light only).
2. **Runtime approach:** A Supabase `app_config` row or a simple JSON endpoint that the app checks on mount. More complex but allows instant toggle without redeployment.

Recommended: start with the environment variable approach (option 1). It is simple, zero-cost when disabled, and can be promoted to a runtime flag later if needed.

```tsx
// In AppHeader.tsx
{
  import.meta.env.VITE_ENABLE_DARK_MODE === 'true' && (
    <ThemeToggle className="..." showSystemOption={true} />
  );
}
```

```html
<!-- In index.html -->
<script>
  (function () {
    // Only apply dark mode if feature is enabled
    // The env var is replaced at build time by Vite
    if ('__DARK_MODE_ENABLED__' !== 'true') return;
    var stored = localStorage.getItem('ui-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || (stored !== 'light' && prefersDark) ? 'dark' : 'light';
    document.documentElement.classList.add(theme);
  })();
</script>
```

This provides a clean rollback path: set `VITE_ENABLE_DARK_MODE=false` and redeploy. Users who had dark mode enabled will revert to light on next page load.

**[EXPANDED] Step 4: Audit Components for Hardcoded Colors**

In addition to the manual search-and-replace, run the audit in two passes:

1. **Automated grep pass:** Search for `bg-white`, `bg-black`, `text-white`, `text-black`, and all `bg-gray-*`, `text-gray-*`, `border-gray-*` patterns across `apps/myk9show/src/`. Generate a file list.
2. **Manual review pass:** For each flagged file, determine whether the hardcoded color is intentional (brand, status indicator, logo) or should be replaced. Mark intentional uses with `{/* INTENT: fixed color for ... */}` comments.

This two-pass approach ensures completeness while respecting intentional design decisions.
