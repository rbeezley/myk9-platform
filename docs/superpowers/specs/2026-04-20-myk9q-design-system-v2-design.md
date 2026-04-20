# myK9Q Design System v2 — Design Spec

**Date:** 2026-04-20
**Status:** Draft — awaiting user review
**Source TODO:** `TO-DOS.md` — "Design system v2 follow-ups — 2026-04-18" → "myK9Q app (`apps/myk9q/`) design system v2 — separate plan needed"
**Companion:** [`apps/myk9show/DESIGN.md`](../../../apps/myk9show/DESIGN.md) (v2 reference), [`apps/myk9q/docs/DESIGN_REFERENCE.md`](../../../apps/myk9q/docs/DESIGN_REFERENCE.md) (current v1)

---

## 1. Context & Goals

myK9Show recently completed a design system v2 refresh (Parchment canvas, editorial serif headings, warm neutrals, teal accent). myK9Q is the cousin app — a mobile-first, offline-first ringside tool used by judges, stewards, and exhibitors during competitions — and has not yet received the v2 treatment.

The two apps share a brand identity but solve different UX problems:

- **myK9Show** — platform chrome, desktop-capable, dense secretary tooling.
- **myK9Q** — ringside tool, touch-optimized, often outdoors, used under time pressure with wet/gloved hands.

Because of those different contexts, myK9Show's v2 cannot be ported verbatim. v2 for myK9Q must share the design _language_ while staying truthful to the ringside brief.

**Goals:**

1. Bring myK9Q onto the same visual vocabulary as myK9Show v2 — shared tokens, same accent palette, same typographic family.
2. Preserve the ringside-first character of myK9Q — high contrast for outdoor use, generous touch targets, fast scan-and-act hierarchy.
3. Introduce a small set of new ringside-specific patterns (outdoor mode, per-show accent honor) that v1 does not have.
4. Consolidate organic growth in the existing token system (three overlapping status vocabularies, misnamed accent labels).

**Success criteria:**

- A secretary switching between myK9Show and myK9Q feels like they are in the same product family.
- A judge at 12 pm under a tent can read the app without shielding the screen.
- No existing feature regresses — v2 is purely skin + structure, no functional changes.

---

## 2. Design Philosophy — "Cousins, not twins"

myK9Q v2 is **inspired by myK9Show v2 but adapted for ringside**. Same accent, same typographic family (Montserrat everywhere), same status-color vocabulary, same warm foundation. But surfaces, contrast ratios, touch targets, and shadow treatments are chosen for ringside context, not editorial continuity.

This framing governs every decision below. When a choice falls between "match myK9Show exactly" and "pick what's better for ringside," ringside wins.

---

## 3. Non-Goals

Explicitly out of scope for v2:

- **Do not migrate myK9Q to Tailwind or shadcn/ui.** The root `CLAUDE.md` rule stands: "UI library (myK9Q): Semantic CSS — do not add Tailwind to myK9Q." Unifying CSS frameworks across the two apps is not a goal; unifying the _design language_ via shared tokens is.
- **Do not change component behaviors.** v2 is skin + structure. No new features, no moved components, no refactored interactions beyond the new ringside-specific patterns called out in §6.
- **Do not redesign scoresheets.** AKC/UKC/ASCA scoresheet layouts are tuned for specific judge workflows and are out of scope. They will inherit new tokens automatically but no layout edits.
- **Do not add glove mode.** Discussed, parked for post-fall. Outdoor mode covers the higher-value case today.
- **Do not reduce density options.** The existing 3 density modes (compact/comfortable/spacious) stay. No evidence "spacious" is unused; don't fix what isn't broken.

---

## 4. Visual Language

### 4.1 Surfaces — Parchment canvas + white cards (hybrid)

| Token                 | Light                         | Dark                      | Role                                                         |
| --------------------- | ----------------------------- | ------------------------- | ------------------------------------------------------------ |
| `--background`        | `#f5f4ed` (Parchment)         | `#141413` (Deep Dark)     | Page canvas                                                  |
| `--background-subtle` | `#f0eee6` (Border Cream)      | `#1e1e1b` (Dark Elevated) | Empty-state backgrounds                                      |
| `--surface`           | `#faf9f5` (Ivory)             | `#1e1e1b`                 | Sidebar, muted containers                                    |
| `--card`              | `#ffffff` (Pure white)        | `#252522` (Dark Card)     | Data containers — class tiles, entry rows, scoresheet fields |
| `--card-foreground`   | `#141413`                     | `#faf9f5`                 | Text on cards                                                |
| `--border`            | `#d9d6c8` (warm cream border) | `#2e2e2b`                 | Standard borders                                             |
| `--border-strong`     | `#b8b4a5`                     | `#3a3a36`                 | Focus/hover borders                                          |

Rationale: warm parchment canvas reinforces the platform family feel; pure-white cards give data the contrast it needs to be read outdoors at a glance. The warm border cream keeps cards distinct from canvas without the cool gray that fought the warmth in v1.

### 4.2 Typography — Montserrat + Fraunces (celebration only)

```css
--font-family:
  'Montserrat', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
--font-display: 'Fraunces', Georgia, serif;
```

**Policy:**

- Montserrat for **all UI chrome, data, and controls** — page titles, class names, entry tiles, buttons, tabs, inputs.
- Fraunces (variable font, optical-size axis) reserved for **celebration/reward surfaces only** — The Podium, qualification reveals, trial completion screens.
- Fraunces replaces Playfair Display in the existing v1 policy. No other changes to where serif appears.

Font imports update in `apps/myk9q/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;590;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap"
  rel="stylesheet"
/>
```

Font sizes, weights, and line heights from the current `DESIGN_REFERENCE.md` §Typography carry forward unchanged.

**[ADDED] Font loading strategy.** Google Fonts URL uses `&display=swap` so the fallback stack renders immediately and swaps to Fraunces/Montserrat when the webfont arrives. Fraunces is only used on The Podium and similar celebration surfaces — if it fails to load (offline first-run, slow ringside LTE), the Georgia fallback is acceptable. Preload budget: do not add `<link rel="preload">` for Fraunces — it is not on the critical path. The existing service worker caches Google Fonts on first successful load so subsequent offline sessions render it.

### 4.3 Color System

**Accent palette** — aligned 1:1 with myK9Show v2:

| Accent             | Hex       | CSS class            | Previous label                 |
| ------------------ | --------- | -------------------- | ------------------------------ |
| **Teal (default)** | `#14b8a6` | `.accent-teal`       | `.accent-green` (renamed)      |
| Terracotta         | `#c96442` | `.accent-terracotta` | `.accent-orange` (hex changed) |
| Blue               | `#3b82f6` | `.accent-blue`       | (unchanged)                    |
| Purple             | `#8b5cf6` | `.accent-purple`     | (unchanged)                    |

Migration shim for existing users (details in §7.2).

**Warm-tone neutrals** — grays shift from cool to warm to continue the parchment palette:

| Token                | v1        | v2                                   | Use                     |
| -------------------- | --------- | ------------------------------------ | ----------------------- |
| `--muted-foreground` | `#6b7280` | `#5e5d59`                            | Secondary body text     |
| `--text-gray`        | `#6b7280` | `#87867f`                            | Metadata, de-emphasized |
| `--foreground-muted` | `#374151` | `#5e5d59`                            | Muted headings          |
| `--text-light-gray`  | `#9ca3af` | `#b0aea5` (dark) / `#87867f` (light) | Placeholder text        |

**Status colors — consolidation** covered in §5.1.

**Per-show branding** covered in §6.2.

### 4.4 Elevation — Ring shadows

Adopt myK9Show v2's ring-shadow pattern:

```css
--token-shadow-sm: 0 0 0 1px rgba(20, 20, 19, 0.08);
--token-shadow-md: 0 0 0 1px rgba(20, 20, 19, 0.08), 0 2px 8px rgba(20, 20, 19, 0.05);
--token-shadow-lg: 0 0 0 1px rgba(20, 20, 19, 0.1), 0 4px 24px rgba(20, 20, 19, 0.05);
--token-shadow-xl: 0 0 0 1px rgba(20, 20, 19, 0.12), 0 12px 32px rgba(20, 20, 19, 0.08);
```

The `0 0 0 1px` ring reads as a crisp edge in direct sunlight where traditional blurred drop shadows wash out. The secondary soft shadow adds depth indoors without becoming the primary separator.

### 4.5 Dark mode — Warm olive-dark

Shift from current cool charcoal (`#1a1a1e`) to warm olive-dark, matching myK9Show v2:

| Token                | v1 dark   | v2 dark                 |
| -------------------- | --------- | ----------------------- |
| `--background`       | `#1a1a1e` | `#141413`               |
| `--card`             | `#26292e` | `#252522`               |
| `--muted`            | `#26292e` | `#2e2e2b`               |
| `--border`           | `#4a5568` | `#2e2e2b`               |
| `--foreground`       | `#ffffff` | `#faf9f5`               |
| `--muted-foreground` | `#ffffff` | `#b0aea5` (Warm Silver) |

Accent hex values are identical in light and dark (teal `#14b8a6` works in both).

---

## 5. Structural Changes

### 5.1 Status vocabulary consolidation

Today `apps/myk9q/src/styles/design-tokens.css` defines three overlapping status color vocabularies:

- `--status-*` (e.g., `--status-checked-in`, `--status-pulled`)
- `--checkin-*` (e.g., `--checkin-checked-in`, `--checkin-pulled`)
- `--class-status-*` wrapped as `--status-setup`, `--status-briefing`, `--status-completed`

Consolidation policy:

- **Canonical vocabulary: `--status-*`.** One namespace for all status colors.
- `--checkin-*` aliases are deprecated. Add comment `/* @deprecated — use --status-* */` and leave as aliases pointing at canonical tokens so nothing breaks during migration.
- Class-status tokens (`--status-setup`, `--status-briefing`, `--status-break`, `--status-start-time`, `--status-in-progress`, `--status-offline-scoring`, `--status-completed`) stay in the `--status-*` namespace — they are already canonical.
- Legacy `--token-status-*` aliases stay for v2 Phase 2; removed in Phase 3 cleanup.

Canonical light-mode values after consolidation (unchanged from v1 — just the namespace cleans up):

| Status       | Token                   | Hex       |
| ------------ | ----------------------- | --------- |
| No status    | `--status-no-status`    | `#9ca3af` |
| Checked in   | `--status-checked-in`   | `#14b8a6` |
| Come to gate | `--status-come-to-gate` | `#3b82f6` |
| At gate      | `--status-at-gate`      | `#8b5cf6` |
| In ring      | `--status-in-ring`      | `#2563eb` |
| Conflict     | `--status-conflict`     | `#f59e0b` |
| Pulled       | `--status-pulled`       | `#ef4444` |
| Completed    | `--status-completed`    | `#00cc66` |

### 5.2 Accent palette migration

**Rename `accent-green` → `accent-teal`** (same hex). Users who had "Green" selected are automatically on "Teal" — zero visual change, label updates in settings.

**Replace `accent-orange` (`#f97316`) with `accent-terracotta` (`#c96442`).** Requires a one-time localStorage migration shim at app boot:

```typescript
// apps/myk9q/src/lib/settings-migrate.ts (new file)
export function migrateV1AccentKeys(): void {
  const legacyAccent = localStorage.getItem('myk9q.accent');
  if (legacyAccent === 'green') {
    localStorage.setItem('myk9q.accent', 'teal');
  } else if (legacyAccent === 'orange') {
    localStorage.setItem('myk9q.accent', 'terracotta');
  }
}
```

Shim runs once on app bootstrap (in `main.tsx` before React mounts). Idempotent — safe to ship and leave in place.

**[ADDED] Storage robustness.** Wrap every `localStorage` call in try/catch. Safari private mode throws on write; quota-exceeded can throw mid-session. If the shim throws, log and proceed — do not block app boot. All v2 localStorage reads must fall back to the default value when storage is unavailable.

The CSS class names update atomically:

```css
:root.accent-teal {
  --primary: #14b8a6;
  --primary-hover: #0d9488;
}
:root.accent-terracotta {
  --primary: #c96442;
  --primary-hover: #a0502f;
}
:root.accent-blue {
  --primary: #3b82f6;
  --primary-hover: #2563eb;
}
:root.accent-purple {
  --primary: #8b5cf6;
  --primary-hover: #7c3aed;
}
```

Deprecation aliases `.accent-green` and `.accent-orange` remain for two releases (Phase 2 ships them; Phase 3 removes them).

---

## 6. New Ringside-Specific Patterns

### 6.1 Outdoor mode

A user-toggleable high-contrast mode for outdoor use. Lives as a settings toggle alongside Theme / Accent / Density.

**Activation:**

- User setting: `localStorage.getItem('myk9q.mode') === 'outdoor'` → adds `.mode-outdoor` class to `<html>`.
- Optional auto-detection: `window.matchMedia('(prefers-contrast: more)')` can hint the toggle. Not forced — respect user choice.

**What it changes (CSS overrides in `apps/myk9q/src/styles/mode-outdoor.css` — new file):**

```css
html.mode-outdoor {
  --background: #ffffff;
  --card: #ffffff;
  --foreground: #000000;
  --muted-foreground: #374151;
  --border: #9ca3af;
  --border-strong: #4a5568;
  --primary: #0f766e; /* darker teal */
  --primary-hover: #115e59;

  /* Remove soft shadows — rings only */
  --token-shadow-sm: 0 0 0 2px #4a5568;
  --token-shadow-md: 0 0 0 2px #4a5568;
  --token-shadow-lg: 0 0 0 2px #4a5568;
}
```

Status color hexes stay the same (they're already high-contrast). The border thickens from 1px to 2px to survive sunlight glare.

**Settings surface:** add a "Display Mode" row alongside existing Theme / Accent / Density in the Settings page. Options: `Default` / `Outdoor`.

**[ADDED] Accessibility target.** Outdoor mode must meet WCAG 2.1 AA contrast at minimum — 4.5:1 for body text, 3:1 for large text (18pt+ or 14pt bold) and UI components. Stretch target: AAA (7:1) for primary action buttons and status badges, since those are the scan-and-act elements at ringside. Default mode matches myK9Show v2's AA compliance and is not regressed by v2. Phase 2 testing includes a contrast sweep using axe-core or equivalent on the five canonical screens (show detail, class list, entry list, scoresheet, The Podium), in light + dark + outdoor.

### 6.2 Per-show accent honor

myK9Show v2 introduced per-show branding via `resolveShowBranding()` in `apps/myk9show/src/lib/branding.ts`, which reads `shows.accent_color` from the replicated shows table.

myK9Q should honor that value for **show-scoped chrome only** — not platform chrome:

**In scope:**

- Show detail header background
- Class tile left-border accent (when viewing a class inside that show)
- Trial detail page accent treatments

**Out of scope (stays platform teal/user-selected accent):**

- Bottom tab bar
- Settings screen
- System dialogs
- Status badges (checked-in, pulled, etc. — those are semantic, never remapped)

Consumer side:

```typescript
// apps/myk9q/src/hooks/useShowAccent.ts (new file)
export function useShowAccent(showId: string | undefined) {
  const { data: show } = useShowQuery(showId);
  const hex = show?.accent_color;
  return hex ? ({ '--show-accent': hex } as React.CSSProperties) : undefined;
}
```

Components wrap show-scoped regions with `<div style={useShowAccent(showId)}>` and use `var(--show-accent, var(--primary))` where appropriate. Fallback to platform accent if the show has none set.

No database changes — the column already exists in the replicated `shows` table.

**[ADDED] Hex validation (security).** `shows.accent_color` is operator-entered data. Before injecting into a `style` prop, validate strictly: `/^#[0-9a-fA-F]{6}$/`. Any string that does not match the pattern is treated as "no accent set" — fall back to the platform accent. This prevents CSS injection (e.g., `red; background: url(...)`) from a malicious or malformed value.

```typescript
export function useShowAccent(showId: string | undefined) {
  const { data: show } = useShowQuery(showId);
  const hex = show?.accent_color;
  const isValid = typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex);
  return isValid ? ({ '--show-accent': hex } as React.CSSProperties) : undefined;
}
```

**[ADDED] Replication compatibility.** `useShowQuery` must read from the replicated `shows` table (`@myk9/replication`), not call Supabase directly. Per root `CLAUDE.md`: "Always use replicated tables — never bypass with direct Supabase calls (breaks offline)." Phase 2 implementation confirms the hook is built on the replicated table before shipping.

---

## 7. Architecture

### 7.1 Shared `@myk9/design-tokens` package

Extract a new workspace package under `packages/design-tokens/`:

```
packages/design-tokens/
├── package.json       # name: "@myk9/design-tokens"
├── src/
│   ├── tokens.css     # :root variables — the canonical token set
│   ├── dark.css       # .theme-dark overrides
│   ├── accents.css    # .accent-teal / .accent-terracotta / .accent-blue / .accent-purple
│   └── index.ts       # JS-side token constants (optional — for Tailwind's theme.extend on the show side)
└── README.md
```

Both apps import the CSS:

```css
/* apps/myk9q/src/index.css */
@import '@myk9/design-tokens/src/tokens.css';
@import '@myk9/design-tokens/src/dark.css';
@import '@myk9/design-tokens/src/accents.css';
/* then myk9q-specific overrides */
```

```typescript
// apps/myk9show/tailwind.config.ts
import { tokens } from '@myk9/design-tokens';
export default {
  theme: { extend: { colors: tokens.colors /* ... */ } },
};
```

This package replaces duplicated hex values in both apps. **Only tokens move here** — component CSS stays in each app.

**[ADDED] Performance budget.** New payload = Fraunces variable font (~60–70KB woff2, lazily loaded via `display: swap`) + token CSS package (<5KB). Initial-route bundle size must not increase by more than 10KB uncompressed. Phase 1 PR description includes before/after `pnpm build` size comparison for `apps/myk9q` to confirm.

### 7.2 CSS architecture stays semantic

No change to the existing semantic CSS architecture in `apps/myk9q/src/styles/`. The 20+ stylesheets remain organized by concern. Some may be archived in Phase 3 cleanup if the audit finds them dead.

---

## 8. Stylesheet Audit (to be filled in Phase 1)

Produced as a deliverable inside Phase 1 PR. Template:

| Stylesheet                                                  | Category          | v2 changes                                                                     |
| ----------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `design-tokens.css`                                         | v2-relevant       | Replace with `@import '@myk9/design-tokens/...'` + ringside-specific overrides |
| `apple-design-system.css`                                   | v2-relevant       | Update to use new tokens (ring shadows, warm neutrals)                         |
| `shared-components.css`                                     | v2-relevant       | Update card/button/badge styles for v2                                         |
| `green-theme.css` / `orange-theme.css` / `purple-theme.css` | archive-candidate | Evaluate: may be dead if accent system works via tokens alone                  |
| `critical.css` / `critical-inline.css`                      | v2-relevant       | Update surface/font references                                                 |
| `empty-state.css`                                           | v2-relevant       | Verify contrast + tokens                                                       |
| `landing-background.css`                                    | v2-relevant       | May need surface refresh                                                       |
| `viewport.css`                                              | token-agnostic    | No change                                                                      |
| `touch-feedback.css`                                        | token-agnostic    | No change                                                                      |
| `micro-animations.css`                                      | token-agnostic    | No change                                                                      |
| `mobile-optimizations.css`                                  | token-agnostic    | No change                                                                      |
| `page-container.css`                                        | v2-relevant       | Parchment canvas color                                                         |
| `page-transitions.css`                                      | token-agnostic    | No change                                                                      |
| `containers.css`                                            | v2-relevant       | Surface/border updates                                                         |
| `utilities.css`                                             | token-agnostic    | No change                                                                      |
| `tailwind-utilities.css`                                    | evaluate          | Likely dead — myK9Q doesn't use Tailwind; check if still imported              |
| `message-banner.css`                                        | v2-relevant       | Status token consolidation                                                     |
| `_archived/performance.css`                                 | already archived  | No change                                                                      |

The Phase 1 PR fills in this table definitively and may split some rows into separate migration tickets if any file is larger than a clean PR.

---

## 9. Migration Plan — 3 PRs

### Phase 1 — Shared tokens + visual refresh (one PR)

**Scope:**

1. Create `packages/design-tokens/` workspace package.
2. Populate with v2 tokens (surfaces §4.1, typography §4.2, accent palette §4.3, ring shadows §4.4, warm neutrals §4.3, dark mode §4.5).
3. Update `apps/myk9q/src/styles/design-tokens.css` to import from the new package + keep ringside-specific overrides.
4. Update `apps/myk9q/index.html` Google Fonts imports (add Fraunces, keep Montserrat).
5. Update `apps/myk9show/DESIGN.md` and `apps/myk9q/docs/DESIGN_REFERENCE.md` to reflect v2 values — **this resolves the sibling Todo item that flagged myK9Show's DESIGN.md is still referencing Playfair Display in ~12 places.**
6. Fill in the Phase 1 audit table (§8) as part of the PR description.
7. Visual smoke test: log in as each role (admin / judge / steward / exhibitor) on `develop` branch staging and confirm no broken screens.

**Out of scope for Phase 1:** structural changes (status vocab, accent rename), new features (outdoor mode, per-show branding).

### Phase 2 — Structural + new features (one PR)

**Scope:**

1. Status vocabulary consolidation (§5.1) — promote `--status-*` as the canonical namespace, annotate existing `--checkin-*` and `--token-status-*` aliases with `/* @deprecated */`, verify no visual regression.
2. Accent palette migration (§5.2) — rename classes, add localStorage shim, update settings page component for new labels.
3. Outdoor mode (§6.1) — create `mode-outdoor.css`, add settings toggle, wire up `<html>` class.
4. Per-show accent honor (§6.2) — create `useShowAccent` hook, integrate into show detail header + class tiles.
5. Unit tests:
   - `migrateV1AccentKeys()` idempotence + all migration paths.
   - `useShowAccent` fallback when show has no accent set.
   - Settings page renders new accent options and persists selection.
6. Visual smoke test across all roles on staging.

**[ADDED] Phase 2 feature-flag rollout.** Outdoor mode and per-show accent honor ship behind a simple toggle gate. For outdoor mode, the gate is user-opt-in (default `off`) — no flag needed because the blast radius is one user. Per-show accent honor ships fleet-wide by default, but the hex-validation gate (§6.2 `[ADDED]`) means any show with a malformed or missing value falls back to platform accent automatically — no feature flag needed. If a post-launch issue appears, operators can clear `shows.accent_color` in the admin UI to disable per-show accent for a specific show without a code push.

**[ADDED] Rollback per phase.**

- **Phase 1 rollback:** revert the PR. Fonts, tokens, and visuals snap back to v1. Zero user-data impact.
- **Phase 2 rollback:** revert the PR _and_ leave the `migrateV1AccentKeys` shim in place for one additional release — reverting alone leaves users whose localStorage has been rewritten (`green` → `teal`) with no matching class in the v1 codepath. Alternative: ship a compensating "reverse migration" shim as part of the revert commit. Capture this decision during Phase 2 code review.
- **Phase 3 rollback:** revert the PR. Deprecation aliases come back. Safe.

### Phase 3 — Cleanup (one PR)

**Scope:**

1. Remove `--checkin-*` deprecation aliases from §5.1.
2. Remove `--token-status-*` deprecation aliases from §5.1.
3. Remove `.accent-green` / `.accent-orange` deprecation aliases from §5.2.
4. Delete any stylesheet flagged as dead in the Phase 1 audit.
5. Delete the unused Playfair Display font import if it's still loaded anywhere.
6. Update `DESIGN_REFERENCE.md` to reflect final state (no deprecations called out).

Phase 3 ships only after Phase 2 has been on staging for at least one full trial weekend to confirm no migration shim edge cases.

---

## 10. Testing Strategy

Per root `CLAUDE.md`: "Every plan must include a testing phase — unit tests for new components, hooks, and utilities. Do not consider a phase complete until its tests are written and passing."

### Unit tests

- `migrateV1AccentKeys()` — idempotence, handles `green`/`orange`/`teal`/`terracotta`/`null` inputs correctly. **[EXPANDED]** Also covers: localStorage unavailable (Safari private mode) does not throw; quota-exceeded does not throw.
- `useShowAccent(showId)` — returns style object with hex when show has accent; returns `undefined` when show has no accent; returns `undefined` for undefined showId. **[EXPANDED]** Also: returns `undefined` for malformed hex (`"red"`, `"#zzz"`, `"#ff0000; background:url(x)"`, empty string); verifies the hook reads from the replicated `shows` table, not direct Supabase.
- Settings page accent picker — renders 4 options, persists selection to localStorage, applies class to `<html>`.
- **[ADDED]** Outdoor mode toggle — persists to localStorage, toggles `.mode-outdoor` on `<html>`, survives reload.

### [ADDED] Accessibility tests

- Automated contrast sweep (axe-core or equivalent) on the five canonical screens (show detail, class list, entry list, scoresheet, The Podium), in light + dark + outdoor modes. WCAG 2.1 AA is the minimum bar; flag any regression vs. v1.
- Spot-check status badges against `--card` and `--background` surfaces in all three modes — these are the highest-stakes combinations at ringside.

### Visual regression

- Playwright screenshot tests for: show detail page, class list, entry list, scoresheet, settings page, The Podium. Capture in default / outdoor mode. Light + dark.
- Run before and after each phase to confirm no unintended visual drift.

### Manual QA checklist per phase

1. Log in as admin / judge / steward / exhibitor (four passcodes in `CLAUDE.md`).
2. Walk the golden path for each role — no broken screens, no missing text, no washed-out status badges.
3. Toggle Settings → Theme, Accent, Density, and (Phase 2+) Display Mode. Confirm each persists across reload.
4. Outdoor mode readability — load a class list, go outside (or stand near a sunny window), confirm scannable.
5. Offline behavior — toggle airplane mode mid-class; confirm no token-related crashes. (v2 is pure skin, but worth sanity-checking.)

---

## 11. Open Questions / Deferred

**Deferred to post-fall:**

- Glove mode (larger touch targets, gesture disable). Real need, low urgency — park until a user asks.
- Density policy review — whether to keep 3 modes or cut to 2. No evidence-based change needed now.
- Print stylesheet refresh (if myK9Q ever grows print surfaces — today it doesn't).

**Open questions for Phase 1 author:**

- Does `tailwind-utilities.css` actually get imported anywhere in myK9Q? If not, delete in Phase 1 (not Phase 3).
- Do the three "theme" stylesheets (`green-theme.css` / `orange-theme.css` / `purple-theme.css`) exist because accent switching predates the tokenized accent system? If so, they're dead after Phase 1 — confirm during audit.

**Confirmed outside v2 scope (do not pull in):**

- Scoresheet layout redesigns.
- myK9Show `apps/myk9show/DESIGN.md` Fraunces update — lives in sibling Todo, but this spec's Phase 1 resolves it collaterally.
- Any non-visual regressions or bugs found during v2 walk. Log those as separate TODOs; do not drive-by.

---

## 12. Glossary

| Term                    | Meaning in this spec                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| **v1**                  | Current myK9Q design system as of 2026-04-20 (see `DESIGN_REFERENCE.md`)         |
| **v2**                  | This spec's target state                                                         |
| **Parchment**           | `#f5f4ed` — warm off-white canvas, shared with myK9Show v2                       |
| **Ivory**               | `#faf9f5` — elevated warm surface                                                |
| **Ring shadow**         | `0 0 0 1px rgba(...)` — crisp 1px border-like shadow                             |
| **Celebration surface** | The Podium page, qualification reveal, trial completion — where Fraunces appears |
| **Platform chrome**     | Navigation, tabs, settings, system dialogs — always uses platform accent         |
| **Show-scoped chrome**  | Show detail header, class tiles within a show — honors per-show accent           |

---

## 13. Handoff

Upon user approval of this spec, next step is the `superpowers:writing-plans` skill to produce a step-by-step implementation plan for **Phase 1 only** (the plan document that lives alongside this spec). Phases 2 and 3 get their own plan documents written at the start of each phase, so plan-level detail stays fresh rather than speculative.
