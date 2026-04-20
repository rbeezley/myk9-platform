# myK9Q Design System v2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the myK9Q v2 visual refresh — warm parchment surfaces, Fraunces celebration font, ring shadows, warm-olive dark mode — by hoisting the canonical v2 tokens into the shared `@myk9/ui` package and swapping Playfair Display for Fraunces on celebration surfaces.

**Architecture:** The existing `@myk9/ui/styles` package already ships shared CSS variables imported by myK9Q. We extend it with v2 values (surfaces, warm neutrals, ring shadows, Fraunces font token, warm-olive dark mode) — this becomes the canonical v2 token layer. myK9Q's app-level `design-tokens.css` is trimmed to only the ringside-specific overrides that genuinely differ from myK9Show (check-in status vocabulary, density classes, etc.). No structural or behavioral changes — pure visual refresh.

**Tech Stack:** CSS custom properties, Google Fonts (Fraunces — celebration only), Vitest (token computed-style assertions), Playwright (visual regression snapshots).

---

## Spec Reconciliation

The spec (§7.1) proposed creating a new `packages/design-tokens/` workspace package. During implementation exploration we found that `packages/ui/` already ships an `@myk9/ui/styles` entry (see `packages/ui/package.json` `exports."./styles"`), imported by myK9Q at [apps/myk9q/src/index.css:8](apps/myk9q/src/index.css). This is the shared token layer the spec described — already wired up, already used by both apps' token consumers. Creating a second package would duplicate the abstraction.

**Decision (YAGNI):** extend `packages/ui/src/styles/index.css` with v2 tokens instead of creating a new package. All spec outcomes ("shared tokens between both apps," "only tokens move here," "component CSS stays in each app") are preserved. The Phase 2 and Phase 3 plans will reference the same location.

**Hex-value drift:** spec §4.1 lists `--background: #f5f4ed` / `--foreground: #141413`. myK9Show's live v2 (in [apps/myk9show/src/index.css:380-381](apps/myk9show/src/index.css)) has evolved to `#faf7f2` / `#181411` (annotated as "v2 ivory-50" / "v2 ink-900"). Because the spec's intent is "share the design language with myK9Show v2," we use **myK9Show's current live values** where they differ from the spec's snapshot. The spec will be patched to match at the end of Phase 1.

---

## File Structure

**New files:**

- `packages/ui/src/styles/tokens-v2.css` — canonical v2 token definitions (surfaces, typography, warm neutrals, ring shadows)
- `packages/ui/src/styles/dark-v2.css` — warm-olive dark mode overrides
- `packages/ui/src/__tests__/tokens-v2.test.ts` — computed-style assertions that the v2 tokens resolve to their spec'd hex values
- `apps/myk9q/tests/visual/v2-smoke.spec.ts` — Playwright visual regression for 5 canonical screens in light + dark
- `docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-1-audit.md` — filled stylesheet audit (the PR description pulls from this)

**Modified files:**

- `packages/ui/src/styles/index.css` — `@import` the new v2 partials (additive; existing HSL tokens remain for compatibility)
- `packages/ui/package.json` — no change (exports already expose `./styles`)
- `apps/myk9q/index.html` — add Fraunces font link (preconnect + stylesheet with `display=swap`)
- `apps/myk9q/src/styles/design-tokens.css` — replace surface/typography/shadow values with `var(--…)` references sourced from `@myk9/ui/styles`; remove duplicated literal hex where the shared layer now owns them; keep ringside-specific status colors untouched
- `apps/myk9q/src/components/podium/podium.css` — swap Playfair Display for Fraunces (font-family + Google Fonts `@import` URL)
- `apps/myk9q/docs/DESIGN_REFERENCE.md` — update typography + surface sections to v2 values
- `apps/myk9show/DESIGN.md` — update typography section to say Fraunces (not Playfair Display) in the ~12 places flagged by the sibling Todo

**Unchanged but imported by v2:**

- `apps/myk9q/src/styles/apple-design-system.css`, `shared-components.css`, `message-banner.css`, `page-container.css`, `containers.css`, `empty-state.css`, `critical.css`, `critical-inline.css`, `landing-background.css` — these already reference `var(--…)` tokens, so v2 values flow through automatically. The audit task confirms this file-by-file.

---

## Task 1 — Scaffold v2 token partial in `@myk9/ui`

**Files:**

- Create: `packages/ui/src/styles/tokens-v2.css`
- Create: `packages/ui/src/__tests__/tokens-v2.test.ts`
- Modify: `packages/ui/src/styles/index.css` (add `@import './tokens-v2.css';` after the existing accessibility imports)

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/__tests__/tokens-v2.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('tokens-v2.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../styles/tokens-v2.css'), 'utf-8');
  });

  it('defines v2 parchment canvas surfaces', () => {
    expect(css).toMatch(/--background:\s*#faf7f2/);
    expect(css).toMatch(/--background-alt:\s*#f3efe6/);
    expect(css).toMatch(/--card:\s*#ffffff/);
  });

  it('defines v2 warm-ink foreground', () => {
    expect(css).toMatch(/--foreground:\s*#181411/);
    expect(css).toMatch(/--card-foreground:\s*#141413/);
  });

  it('defines warm-cream border', () => {
    expect(css).toMatch(/--border:\s*#e4dccc/);
  });

  it('defines Fraunces as the serif display font', () => {
    expect(css).toMatch(/--font-serif:\s*'Fraunces'/);
  });

  it('keeps Montserrat as the sans body font', () => {
    expect(css).toMatch(/--font-sans:\s*'Montserrat'/);
  });

  it('defines ring shadows (0 0 0 1px ring + soft drop)', () => {
    expect(css).toMatch(/--token-shadow-sm:\s*0 0 0 1px rgba\(20, 20, 19, 0\.08\)/);
    expect(css).toMatch(/--token-shadow-md:\s*0 0 0 1px rgba\(20, 20, 19, 0\.08\),\s*0 2px 8px/);
  });

  it('defines warm-tone muted neutrals', () => {
    expect(css).toMatch(/--muted-foreground:\s*#8c8376/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ui && pnpm vitest run src/__tests__/tokens-v2.test.ts`
Expected: FAIL — `tokens-v2.css` does not exist, `fs.readFileSync` throws ENOENT.

- [ ] **Step 3: Create the v2 tokens partial**

Create `packages/ui/src/styles/tokens-v2.css`:

```css
/* =====================================================================
   myK9 v2 Design Tokens
   Canonical surfaces, typography, neutrals, and elevation for v2.
   Consumed by both myK9Q and myK9Show via @myk9/ui/styles.
   See docs/superpowers/specs/2026-04-20-myk9q-design-system-v2-design.md
   ===================================================================== */

:root {
  /* ---- Surfaces — Parchment canvas + pure white cards ---- */
  --background: #faf7f2;
  --background-alt: #f3efe6;
  --background-subtle: #f3efe6;
  --surface: #faf9f5;
  --card: #ffffff;
  --card-foreground: #141413;
  --card-secondary: #f0eee6;

  /* ---- Foreground — warm ink ---- */
  --foreground: #181411;
  --foreground-muted: #5e5d59;

  /* ---- Borders — warm cream ---- */
  --border: #e4dccc;
  --border-strong: #b8b4a5;

  /* ---- Warm-tone neutrals ---- */
  --muted: #f0eee6;
  --muted-foreground: #8c8376;
  --text-gray: #87867f;
  --text-light-gray: #87867f;

  /* ---- Typography ---- */
  --font-sans:
    'Montserrat', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
  --font-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-family: var(--font-sans);
  --font-display: var(--font-serif);

  /* ---- Elevation — ring shadows (crisp edge for outdoor readability) ---- */
  --token-shadow-sm: 0 0 0 1px rgba(20, 20, 19, 0.08);
  --token-shadow-md: 0 0 0 1px rgba(20, 20, 19, 0.08), 0 2px 8px rgba(20, 20, 19, 0.05);
  --token-shadow-lg: 0 0 0 1px rgba(20, 20, 19, 0.1), 0 4px 24px rgba(20, 20, 19, 0.05);
  --token-shadow-xl: 0 0 0 1px rgba(20, 20, 19, 0.12), 0 12px 32px rgba(20, 20, 19, 0.08);
}
```

- [ ] **Step 4: Run the token test — should pass now**

Run: `cd packages/ui && pnpm vitest run src/__tests__/tokens-v2.test.ts`
Expected: PASS — all 7 assertions green.

- [ ] **Step 5: Wire the partial into the package entry**

Edit `packages/ui/src/styles/index.css`. Locate the accessibility import block near the top:

```css
/* Accessibility utilities */
@import './accessibility/high-contrast.css';
@import './accessibility/touch-targets.css';
@import './accessibility/reduce-motion.css';
@import './accessibility/one-handed-mode.css';
```

Add immediately after (before the existing `:root` block):

```css
/* v2 canonical tokens — see tokens-v2.css header */
@import './tokens-v2.css';
```

- [ ] **Step 6: Rebuild the UI package CSS output**

Run: `cd packages/ui && pnpm build:css`
Expected: `dist/styles/index.css` exists and contains v2 hex values.

Verify: `grep '#faf7f2' packages/ui/dist/styles/index.css` returns at least one line.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/styles/tokens-v2.css \
        packages/ui/src/__tests__/tokens-v2.test.ts \
        packages/ui/src/styles/index.css
git commit -m "feat(ui): add v2 canonical design tokens partial

Hoists myK9Show v2 surfaces, Fraunces font, warm neutrals, and ring
shadows into @myk9/ui/styles so both apps consume them from one place.
Phase 1 of myK9Q design system v2."
```

---

## Task 2 — Scaffold v2 dark-mode partial

**Files:**

- Create: `packages/ui/src/styles/dark-v2.css`
- Modify: `packages/ui/src/__tests__/tokens-v2.test.ts` (add dark-mode assertions)
- Modify: `packages/ui/src/styles/index.css` (add `@import './dark-v2.css';`)

- [ ] **Step 1: Extend the failing test with dark-mode assertions**

Append to `packages/ui/src/__tests__/tokens-v2.test.ts`:

```typescript
describe('dark-v2.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../styles/dark-v2.css'), 'utf-8');
  });

  it('scopes to .theme-dark', () => {
    expect(css).toMatch(/\.theme-dark\s*\{/);
  });

  it('uses warm olive-dark canvas', () => {
    expect(css).toMatch(/--background:\s*#141413/);
    expect(css).toMatch(/--card:\s*#252522/);
  });

  it('uses warm-silver muted foreground', () => {
    expect(css).toMatch(/--muted-foreground:\s*#b0aea5/);
  });

  it('keeps teal primary accent in dark mode', () => {
    expect(css).toMatch(/--primary:\s*#14b8a6/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ui && pnpm vitest run src/__tests__/tokens-v2.test.ts`
Expected: FAIL — `dark-v2.css` does not exist.

- [ ] **Step 3: Create the dark-mode partial**

Create `packages/ui/src/styles/dark-v2.css`:

```css
/* =====================================================================
   myK9 v2 Dark Mode — warm olive-dark
   See docs/superpowers/specs/2026-04-20-myk9q-design-system-v2-design.md §4.5
   ===================================================================== */

.theme-dark {
  --background: #141413;
  --background-alt: #1e1e1b;
  --background-subtle: #1e1e1b;
  --surface: #1e1e1b;
  --card: #252522;
  --card-foreground: #faf9f5;
  --card-secondary: #2e2e2b;

  --foreground: #faf9f5;
  --foreground-muted: #b0aea5;

  --border: #2e2e2b;
  --border-strong: #3a3a36;

  --muted: #2e2e2b;
  --muted-foreground: #b0aea5;

  --primary: #14b8a6;
  --primary-hover: #0d9488;
  --primary-foreground: #ffffff;
}
```

- [ ] **Step 4: Run the token tests — all should pass**

Run: `cd packages/ui && pnpm vitest run src/__tests__/tokens-v2.test.ts`
Expected: PASS — all assertions (light + dark) green.

- [ ] **Step 5: Wire the dark partial into the package entry**

Edit `packages/ui/src/styles/index.css`. Below the `@import './tokens-v2.css';` line added in Task 1, add:

```css
@import './dark-v2.css';
```

- [ ] **Step 6: Rebuild and verify**

Run: `cd packages/ui && pnpm build:css && grep '#252522' packages/ui/dist/styles/index.css`
Expected: exit 0 with at least one matching line.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/styles/dark-v2.css \
        packages/ui/src/__tests__/tokens-v2.test.ts \
        packages/ui/src/styles/index.css
git commit -m "feat(ui): add v2 warm olive-dark mode partial

Shifts dark-mode canvas from cool charcoal (#1a1a1e) to warm
olive-dark (#141413) matching myK9Show v2."
```

---

## Task 3 — Load Fraunces font in myK9Q

**Files:**

- Modify: `apps/myk9q/index.html`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9q/tests/unit/index-html-v2.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('apps/myk9q/index.html', () => {
  let html: string;

  beforeAll(() => {
    html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8');
  });

  it('preconnects to fonts.googleapis.com for Fraunces', () => {
    expect(html).toMatch(/<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"/);
  });

  it('preconnects to fonts.gstatic.com with crossorigin', () => {
    expect(html).toMatch(
      /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin/
    );
  });

  it('loads Fraunces with variable optical-size axis and display=swap', () => {
    expect(html).toMatch(
      /fonts\.googleapis\.com\/css2\?[^"]*family=Fraunces[^"]*opsz[^"]*display=swap/
    );
  });

  it('keeps self-hosted Montserrat (no regression)', () => {
    expect(html).toMatch(/href="\/fonts\/fonts\.css"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9q && pnpm vitest run tests/unit/index-html-v2.test.ts`
Expected: FAIL — Fraunces link is not yet in `index.html`.

- [ ] **Step 3: Add Fraunces link tag to `index.html`**

Edit `apps/myk9q/index.html`. Locate the existing self-hosted Montserrat block:

```html
<!-- Self-hosted Montserrat font (eliminates render-blocking Google Fonts request) -->
<link rel="stylesheet" href="/fonts/fonts.css" />
```

Immediately after that block, insert:

```html
<!-- Fraunces — celebration only (The Podium). Lazy via display=swap; falls back to Georgia. -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 4: Run the test — should pass**

Run: `cd apps/myk9q && pnpm vitest run tests/unit/index-html-v2.test.ts`
Expected: PASS — 4/4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9q/index.html apps/myk9q/tests/unit/index-html-v2.test.ts
git commit -m "feat(myk9q): load Fraunces via Google Fonts with display=swap

Variable-axis Fraunces is loaded with display=swap so the Georgia
fallback renders immediately and swaps in when the webfont arrives.
Used only on celebration surfaces (The Podium)."
```

---

## Task 4 — Swap Playfair Display → Fraunces on The Podium

**Files:**

- Modify: `apps/myk9q/src/components/podium/podium.css`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9q/src/components/podium/__tests__/podium-css.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('podium.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../podium.css'), 'utf-8');
  });

  it('uses Fraunces for celebration typography', () => {
    expect(css).toMatch(/font-family:\s*'Fraunces'/);
  });

  it('does not reference Playfair Display anywhere', () => {
    expect(css).not.toMatch(/Playfair\s*Display/i);
  });

  it('does not import Playfair Display from Google Fonts', () => {
    expect(css).not.toMatch(/family=Playfair/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9q && pnpm vitest run src/components/podium/__tests__/podium-css.test.ts`
Expected: FAIL — `Playfair Display` is still in the file (5 references found during exploration).

- [ ] **Step 3: Swap font references**

Edit `apps/myk9q/src/components/podium/podium.css`.

At the top of the file (~line 4-6), replace:

```css
/* Playfair Display: Reserved for celebration moments (The Podium) */
/* Montserrat is loaded globally in index.html */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&display=swap');
```

with:

```css
/* Fraunces: Reserved for celebration moments (The Podium). Loaded globally in index.html. */
/* Montserrat is loaded globally in index.html. */
```

(The `@import` is removed — Fraunces is now loaded from `index.html`, so the stylesheet doesn't need its own import.)

Then in the same file, replace all 2 occurrences of:

```css
font-family: 'Playfair Display', Georgia, serif;
```

with:

```css
font-family: var(--font-serif, 'Fraunces', Georgia, serif);
```

Locations (from exploration): lines 99 and 260.

- [ ] **Step 4: Run the test — should pass**

Run: `cd apps/myk9q && pnpm vitest run src/components/podium/__tests__/podium-css.test.ts`
Expected: PASS — 3/3 green.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9q/src/components/podium/podium.css \
        apps/myk9q/src/components/podium/__tests__/podium-css.test.ts
git commit -m "feat(myk9q): swap Playfair Display for Fraunces on The Podium

Aligns celebration typography with myK9Show v2. Removes the local
Google Fonts @import — Fraunces is now loaded once in index.html."
```

---

## Task 5 — Trim myK9Q `design-tokens.css` to ringside-only overrides

**Goal:** `apps/myk9q/src/styles/design-tokens.css` currently redeclares surfaces, typography, shadows that now live in `@myk9/ui/styles/tokens-v2.css`. Since myK9Q's [index.css:8](apps/myk9q/src/index.css) imports `@myk9/ui/styles` **before** `./styles/design-tokens.css`, any remaining literals in `design-tokens.css` override the shared layer. Remove the ones that should come from shared; keep the ringside-specific ones.

**Files:**

- Modify: `apps/myk9q/src/styles/design-tokens.css`

- [ ] **Step 1: Write the failing test**

Create `apps/myk9q/src/styles/__tests__/design-tokens-v2.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('apps/myk9q/src/styles/design-tokens.css', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
  });

  it('does not redeclare v2 canvas (comes from @myk9/ui/styles)', () => {
    // After v2, --background literal must NOT be set here —
    // it is inherited from tokens-v2.css.
    const rootBlockMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    expect(rootBlockMatch).not.toBeNull();
    const rootBody = rootBlockMatch![1];
    expect(rootBody).not.toMatch(/--background:\s*#F8F7F4/);
    expect(rootBody).not.toMatch(/--card:\s*#FEFDFB/);
  });

  it('does not redeclare the serif display font', () => {
    expect(css).not.toMatch(/--font-display:\s*'Playfair Display'/);
  });

  it('does not redeclare blurred-drop shadow tokens (ring shadows now canonical)', () => {
    const rootBlockMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
    expect(rootBlockMatch).not.toBeNull();
    const rootBody = rootBlockMatch![1];
    expect(rootBody).not.toMatch(/--token-shadow-sm:\s*0 1px 3px/);
  });

  it('keeps ringside-specific status tokens', () => {
    expect(css).toMatch(/--status-checked-in:\s*#14b8a6/);
    expect(css).toMatch(/--status-pulled:/);
    expect(css).toMatch(/--status-in-ring:/);
  });

  it('keeps density classes', () => {
    expect(css).toMatch(/html\.density-compact/);
    expect(css).toMatch(/html\.density-comfortable/);
    expect(css).toMatch(/html\.density-spacious/);
  });

  it('replaces cool-charcoal dark canvas with warm olive-dark', () => {
    // .theme-dark block in myk9q must no longer redeclare --background with cool charcoal.
    // (tokens-v2/dark-v2 provides the warm olive-dark value.)
    const darkBlockMatch = css.match(/\.theme-dark\s*\{([\s\S]*?)\n\}/);
    if (darkBlockMatch) {
      const darkBody = darkBlockMatch[1];
      expect(darkBody).not.toMatch(/--background:\s*#1a1a1e/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9q && pnpm vitest run src/styles/__tests__/design-tokens-v2.test.ts`
Expected: FAIL — all 6 assertions fail because current `design-tokens.css` still has the legacy literals.

- [ ] **Step 3: Trim redundant declarations**

Edit `apps/myk9q/src/styles/design-tokens.css`. Apply exactly these deletions (line numbers are against the current file — verify by reading before editing):

**Inside `:root { … }`:**

- Delete `--background: #F8F7F4;` (line 20) and the trailing comment.
- Delete `--card: #FEFDFB;` (line 22) and the trailing comment.
- Delete `--secondary: #F8F7F4;` (line 36).
- Delete `--surface: #F8F7F4;` (line 40).
- Delete the entire `--muted-foreground: #6b7280;` line (line 25) — comes from shared now.
- Delete the `--border: #e5e7eb;` literal (line 26).
- Delete the `--text-gray: #6b7280;` literal (line 50).
- Delete the `--text-light-gray: #9ca3af;` literal (line 51).
- Delete the `--font-family: …` declaration (line 303) — comes from shared now.
- Delete the `--font-display: 'Playfair Display', Georgia, serif;` declaration (line 304).
- Delete the four `--token-shadow-*` declarations (lines 247-250) — ring shadows now canonical.

**Inside `.theme-dark { … }`:**

- Delete `--background: #1a1a1e;` (line 340).
- Delete `--card: #26292e;` (line 342).
- Delete `--muted: #26292e;` (line 344).
- Delete `--border: #4a5568;` (line 346).
- Delete `--foreground: #ffffff;` (line 341) — shared layer provides `#faf9f5`.
- Delete `--muted-foreground: #ffffff;` (line 345).
- Delete the four dark-mode `--token-shadow-*` declarations (lines 433-436).

**Keep untouched:**

- All `--status-*` declarations (lines 54-152) — ringside status vocabulary.
- All `--checkin-*` declarations.
- All `--token-status-*` legacy aliases.
- Density classes (lines 457-492).
- Utility classes at end of file.
- Everything under the "ONBOARDING" heading.
- Semantic overlays (`--overlay-*`, `--shadow-*`).
- Skeleton gradients.

- [ ] **Step 4: Run the trim test — should pass**

Run: `cd apps/myk9q && pnpm vitest run src/styles/__tests__/design-tokens-v2.test.ts`
Expected: PASS — 6/6 green.

- [ ] **Step 5: Run myK9Q typecheck + unit test suite to confirm no regressions**

Run: `cd apps/myk9q && pnpm typecheck && pnpm test`
Expected: typecheck 0 errors; test suite passes (pre-existing failures are OK — just confirm no NEW failures from our CSS changes).

- [ ] **Step 6: Commit**

```bash
git add apps/myk9q/src/styles/design-tokens.css \
        apps/myk9q/src/styles/__tests__/design-tokens-v2.test.ts
git commit -m "refactor(myk9q): trim design-tokens.css to ringside overrides only

Surfaces, typography, and shadow tokens now come from @myk9/ui/styles
tokens-v2.css. This file retains only myK9Q-specific status vocabulary,
density classes, and overlay utilities. Net removal ~30 lines."
```

---

## Task 6 — Update `DESIGN_REFERENCE.md` (myK9Q v2 reference)

**Files:**

- Modify: `apps/myk9q/docs/DESIGN_REFERENCE.md`

- [ ] **Step 1: Read the current file to locate the sections needing updates**

Run: `cat apps/myk9q/docs/DESIGN_REFERENCE.md | head -120`

Identify:

- Typography section — references Playfair Display.
- Background section — references `#F8F7F4` / `#FEFDFB`.
- Dark mode section — references `#1a1a1e` / `#26292e`.
- Shadow section — references blurred drop shadows.

- [ ] **Step 2: Apply v2 edits**

Replace every occurrence of:

- `Playfair Display` → `Fraunces`
- `#F8F7F4` (canvas) → `#faf7f2`
- `#FEFDFB` (card) → `#ffffff`
- `#1a1a1e` (dark canvas) → `#141413`
- `#26292e` (dark card) → `#252522`

For the shadow section, replace the existing shadow description with:

```markdown
### Elevation — Ring shadows

v2 uses ring shadows (1px inset-equivalent border rendered via `box-shadow`) plus a soft drop:

- `--token-shadow-sm` — `0 0 0 1px rgba(20, 20, 19, 0.08)`
- `--token-shadow-md` — `0 0 0 1px rgba(20, 20, 19, 0.08), 0 2px 8px rgba(20, 20, 19, 0.05)`
- `--token-shadow-lg` — `0 0 0 1px rgba(20, 20, 19, 0.1), 0 4px 24px rgba(20, 20, 19, 0.05)`

Rationale: the 1px ring reads crisply in direct sunlight where blurred shadows wash out.
```

Add a new subsection at the top of the document under the title:

```markdown
> **v2 (2026-04-20):** This document reflects the v2 design system. Canonical tokens live in `@myk9/ui/styles/tokens-v2.css`. See [the v2 spec](../../../docs/superpowers/specs/2026-04-20-myk9q-design-system-v2-design.md) for rationale.
```

- [ ] **Step 3: Commit**

```bash
git add apps/myk9q/docs/DESIGN_REFERENCE.md
git commit -m "docs(myk9q): update DESIGN_REFERENCE to v2 values

Typography, surfaces, dark mode, and shadows now reflect the v2
token set shipped in @myk9/ui/styles."
```

---

## Task 7 — Update `apps/myk9show/DESIGN.md` (resolve sibling Todo)

**Goal:** the sibling Todo item flagged that myK9Show's `DESIGN.md` still references Playfair Display in ~12 places even though the app's live code has moved to Fraunces. Phase 1 PR collaterally resolves that.

**Files:**

- Modify: `apps/myk9show/DESIGN.md`

- [ ] **Step 1: Survey Playfair Display mentions**

Run: `grep -n 'Playfair' apps/myk9show/DESIGN.md`
Expected: roughly 12 lines matching.

- [ ] **Step 2: Replace every occurrence**

Use a project-aware edit (verify each match before replacing — some may appear in prose explaining historical context, leave those alone):

- Substitute `Playfair Display` → `Fraunces` where the doc describes the **current** v2 font stack.
- For any line explicitly labeled "was Playfair Display" or "v1 used Playfair," leave it — those are historical annotations.

- [ ] **Step 3: Update the font family code example**

If `DESIGN.md` has a `--font-display: 'Playfair Display'` code snippet, replace it with:

```css
--font-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
--font-display: var(--font-serif);
```

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/DESIGN.md
git commit -m "docs(myk9show): update DESIGN.md references from Playfair to Fraunces

DESIGN.md was stale — the app's live v2 code has used Fraunces for
months. This is the sibling-Todo fix that the myK9Q v2 Phase 1 plan
calls for."
```

---

## Task 8 — Fill in the Phase 1 stylesheet audit

**Goal:** definitively classify every stylesheet in `apps/myk9q/src/styles/` (and page-level sheets that reference tokens) as `v2-relevant` / `token-agnostic` / `archive-candidate` / `dead`. This becomes the body of the PR description.

**Files:**

- Create: `docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-1-audit.md`

- [ ] **Step 1: For each stylesheet, grep for token references and classify**

Stylesheets to audit (list from exploration):

- `apps/myk9q/src/styles/apple-design-system.css`
- `apps/myk9q/src/styles/containers.css`
- `apps/myk9q/src/styles/critical.css`
- `apps/myk9q/src/styles/critical-inline.css`
- `apps/myk9q/src/styles/empty-state.css`
- `apps/myk9q/src/styles/green-theme.css`
- `apps/myk9q/src/styles/landing-background.css`
- `apps/myk9q/src/styles/message-banner.css`
- `apps/myk9q/src/styles/micro-animations.css`
- `apps/myk9q/src/styles/mobile-optimizations.css`
- `apps/myk9q/src/styles/orange-theme.css`
- `apps/myk9q/src/styles/page-container.css`
- `apps/myk9q/src/styles/page-transitions.css`
- `apps/myk9q/src/styles/purple-theme.css`
- `apps/myk9q/src/styles/shared-components.css`
- `apps/myk9q/src/styles/tailwind-utilities.css`
- `apps/myk9q/src/styles/touch-feedback.css`
- `apps/myk9q/src/styles/utilities.css`
- `apps/myk9q/src/styles/viewport.css`

For each file, run: `grep -cn 'var(--\|#[0-9a-fA-F]\{6\}\|Playfair\|Montserrat' <file>`

- High count of `var(--…)` → `token-agnostic` (inherits v2 automatically).
- Literal hex colors → `v2-relevant` (needs audit/update).
- File not imported anywhere → `archive-candidate`.

Verify each "import status" by running: `grep -rn "import.*<filename>" apps/myk9q/src/`

- [ ] **Step 2: Write the audit document**

Create `docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-1-audit.md` with this structure:

```markdown
# myK9Q v2 Phase 1 — Stylesheet Audit

Produced as part of Phase 1 PR. Each stylesheet in `apps/myk9q/src/styles/` classified against v2 migration scope.

| Stylesheet                   | Imported from   | Category       | v2 Action                                                        |
| ---------------------------- | --------------- | -------------- | ---------------------------------------------------------------- |
| `design-tokens.css`          | `src/index.css` | v2-relevant    | **Trimmed** in Task 5 — literals removed, ringside-specific kept |
| `apple-design-system.css`    | `src/index.css` | token-agnostic | Uses `var(--…)` throughout — inherits v2 with no edits           |
| (fill in remaining 18 files) |                 |                |                                                                  |

## Dead file candidates

(list any file with no import matches — these go into Phase 3)

## Archive candidates

(list any file that will be obsoleted by v2 but not deleted yet — these go into Phase 3)
```

Fill in all rows by running the grep commands from Step 1.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-1-audit.md
git commit -m "docs(myk9q): phase 1 stylesheet audit

Classifies every myK9Q stylesheet as v2-relevant, token-agnostic,
archive-candidate, or dead. Drives Phase 3 cleanup scope."
```

---

## Task 9 — Visual regression baseline

**Goal:** capture visual snapshots of the five canonical screens in light + dark and commit them as baselines, so future phases can detect unintended drift.

**Files:**

- Create: `apps/myk9q/tests/visual/v2-smoke.spec.ts`

- [ ] **Step 1: Write the Playwright spec — reuse existing fixtures**

The existing e2e suite already has a passcode login helper in `apps/myk9q/tests/e2e/fixtures.ts` (exports `navigateToLogin`, `enterPasscode`, `TEST_PASSCODE`). Reuse it rather than inventing new selectors.

Create `apps/myk9q/tests/visual/v2-smoke.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test';
import { navigateToLogin, enterPasscode, TEST_PASSCODE } from '../e2e/fixtures';

// Five canonical screens per spec §10. Uses the same admin passcode the
// existing e2e suite uses (AA260 per fixtures.ts) for consistency.

async function loginAndReach(page: Page, route: string, mode: 'light' | 'dark') {
  await navigateToLogin(page);
  await enterPasscode(page, TEST_PASSCODE);
  // Wait for auto-submit to land on Home.
  await page.waitForURL('**/home', { timeout: 15000 });
  if (mode === 'dark') {
    await page.evaluate(() => document.documentElement.classList.add('theme-dark'));
  }
  if (route !== '/home') {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
  }
}

// Routes derived from apps/myk9q/src/App.tsx. If any of these have changed,
// update here before running — do not invent new routes.
const CANONICAL_SCREENS: { name: string; route: string }[] = [
  { name: 'home', route: '/home' },
  { name: 'class-list', route: '/classes' },
  { name: 'entry-list', route: '/entries' },
  { name: 'settings', route: '/settings' },
  { name: 'podium', route: '/podium' },
];

for (const mode of ['light', 'dark'] as const) {
  for (const screen of CANONICAL_SCREENS) {
    test(`v2 smoke — ${screen.name} (${mode})`, async ({ page }) => {
      await loginAndReach(page, screen.route, mode);
      await expect(page).toHaveScreenshot(`${screen.name}-${mode}.png`, {
        maxDiffPixelRatio: 0.02,
        fullPage: true,
      });
    });
  }
}
```

> **Route verification gate.** Before generating baselines, run `grep -n "path=" apps/myk9q/src/App.tsx` and cross-reference each entry in `CANONICAL_SCREENS`. If a route uses a `:param` (e.g., `/class/:id/entries`), substitute a real ID available in the seeded test data, or skip that screen and note the substitution in the PR description.

- [ ] **Step 2: Generate baseline screenshots**

Run: `cd apps/myk9q && pnpm test:e2e tests/visual/v2-smoke.spec.ts --update-snapshots`
Expected: 10 `.png` baselines committed under `apps/myk9q/tests/visual/v2-smoke.spec.ts-snapshots/`.

- [ ] **Step 3: Re-run without --update to confirm baselines are stable**

Run: `cd apps/myk9q && pnpm test:e2e tests/visual/v2-smoke.spec.ts`
Expected: PASS — 10 tests match baselines exactly.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9q/tests/visual/v2-smoke.spec.ts \
        apps/myk9q/tests/visual/v2-smoke.spec.ts-snapshots/
git commit -m "test(myk9q): add v2 visual smoke baseline

Captures the five canonical screens (home, class list, entry list,
settings, the podium) in light + dark. Future phases will diff
against these baselines to catch unintended visual drift."
```

---

## Task 10 — Manual QA smoke + PR

**Files:** none — this is a verification + shipping task.

- [ ] **Step 1: Start the dev server**

Run (background): `cd apps/myk9q && pnpm dev`
Wait for: `Local: http://localhost:5173`

- [ ] **Step 2: Smoke test each role**

Open `http://localhost:5173` in a browser (or use preview tools). Using license `myK9Q1-a260f472-e0d76a33-4b6c264c` from `apps/myk9q/CLAUDE.md`, log in as each of the four passcodes in turn and walk the respective golden path:

- `aa260` (admin) — Home → show → trial → class → entry detail → back.
- `jf472` (judge) — Home → assigned class → scoresheet.
- `se0d7` (steward) — Home → check-in list.
- `e4b6c` (exhibitor) — Home → my dogs → class.

For each role, verify:

- Canvas tone is warm parchment, not cool gray.
- Cards have crisp 1px ring edges, not blurred drop shadows.
- Status badges remain readable (teal/purple/blue/amber/red).
- Dark mode (toggle in Settings) shows warm olive-dark, not cool charcoal.
- The Podium (if reachable from any demo route) shows Fraunces serif on the placement name.

- [ ] **Step 3: Measure bundle-size impact (spec §7.1 performance budget)**

Checkout the `develop` baseline and record build size:

```bash
git stash && git checkout develop
cd apps/myk9q && pnpm build
du -sh dist/ && ls -lh dist/assets/*.css dist/assets/*.js | awk '{print $5, $9}' > /tmp/myk9q-bundle-before.txt
git checkout - && git stash pop
```

Then re-run on the Phase 1 branch:

```bash
cd apps/myk9q && pnpm build
du -sh dist/ && ls -lh dist/assets/*.css dist/assets/*.js | awk '{print $5, $9}' > /tmp/myk9q-bundle-after.txt
diff /tmp/myk9q-bundle-before.txt /tmp/myk9q-bundle-after.txt
```

**Pass criterion:** total `dist/` growth ≤ 10 KB uncompressed (per spec §7.1 `[ADDED]` budget). Record before/after numbers in the PR description. Fraunces is loaded via Google Fonts at runtime and is not in the build — so the only expected growth is the new token partials (~5KB).

- [ ] **Step 4: Run the full test suite one final time**

Run (parallel where possible):

- `cd packages/ui && pnpm test`
- `cd apps/myk9q && pnpm typecheck`
- `cd apps/myk9q && pnpm lint`
- `cd apps/myk9q && pnpm test`
- `cd apps/myk9q && pnpm test:e2e tests/visual/v2-smoke.spec.ts`

Expected: all green. Pre-existing flakes are OK — confirm no new failures introduced by v2.

- [ ] **Step 5: Open the PR**

Branch off `develop` (per `apps/myk9q/CLAUDE.md` deployment workflow):

```bash
git checkout -b feat/myk9q-v2-phase-1
git push -u origin feat/myk9q-v2-phase-1
gh pr create --base develop --title "feat(myk9q): v2 design system — Phase 1 (shared tokens + visual refresh)" --body "$(cat <<'EOF'
## Summary

Phase 1 of the myK9Q design system v2 — hoists the canonical v2 tokens (Parchment surfaces, Fraunces celebration font, warm-tone neutrals, ring shadows, warm-olive dark mode) into the shared `@myk9/ui/styles` package so both apps consume them from one place. myK9Q's app-level `design-tokens.css` is trimmed to only the ringside-specific overrides (check-in status vocabulary, density classes).

No structural changes, no new features. Status-vocabulary cleanup, accent renaming, outdoor mode, and per-show accent all land in Phase 2.

## Spec

- [`docs/superpowers/specs/2026-04-20-myk9q-design-system-v2-design.md`](../blob/develop/docs/superpowers/specs/2026-04-20-myk9q-design-system-v2-design.md)

## Stylesheet audit

See [`docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-1-audit.md`](../blob/develop/docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-1-audit.md).

## Test plan

- [x] Unit tests for v2 token partials (light + dark) — `packages/ui/src/__tests__/tokens-v2.test.ts`
- [x] Unit test for Fraunces font link — `apps/myk9q/tests/unit/index-html-v2.test.ts`
- [x] Unit test for podium.css Fraunces swap — `apps/myk9q/src/components/podium/__tests__/podium-css.test.ts`
- [x] Unit test for trimmed myK9Q design-tokens — `apps/myk9q/src/styles/__tests__/design-tokens-v2.test.ts`
- [x] Playwright visual baseline for 5 canonical screens (light + dark) — `apps/myk9q/tests/visual/v2-smoke.spec.ts`
- [x] Manual smoke as admin / judge / steward / exhibitor on `localhost:5173`
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` all green

## Rollback

Revert the PR. Fonts, tokens, and visuals snap back to v1. Zero user-data impact. (Per spec §9 Phase 1 rollback.)
EOF
)"
```

- [ ] **Step 6: Update the TO-DOs**

Edit `TO-DOS.md` — mark the v2 Phase 1 item as in-progress (shipped to staging). Don't mark complete until Phase 2 ships and Phase 1 has been live on `app.myk9q.com` for at least one trial weekend.

---

## Appendix — What's NOT in Phase 1 (scope guard)

These items are in the spec but belong to Phase 2 or Phase 3. Do not attempt them here:

- Status vocabulary consolidation (`--checkin-*` deprecation) → Phase 2.
- Accent palette rename (`.accent-green` → `.accent-teal`, `.accent-orange` → `.accent-terracotta`) → Phase 2.
- localStorage migration shim → Phase 2.
- Outdoor mode (`.mode-outdoor`) → Phase 2.
- Per-show accent honor (`useShowAccent` hook) → Phase 2.
- Deletion of legacy stylesheets → Phase 3.
- Removal of deprecation aliases → Phase 3.

If any of these feels tempting during Phase 1 implementation, stop and write a follow-up TODO instead.
