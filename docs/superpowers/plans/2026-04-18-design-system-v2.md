# Design System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v2 design tokens (brand palette, ivory surfaces, Fraunces typography, warm shadows, live-status tokens, system semantic tokens, type utilities, rosette asset) into `apps/myk9show/src/index.css` so all pages automatically inherit the full design system.

**Architecture:** All token work is CSS-only — no React component changes. Tokens live in `index.css` (shadcn layer) and inherit into every page via Tailwind's CSS-var bridge in `tailwind.config.ts`. The accent system is already complete; this plan adds the static brand palette and typography layer on top.

**Scope:** **myK9Show only.** The design handoff covers both apps (myK9Show + myK9Q), but myK9Q uses semantic CSS (not Tailwind/shadcn) and has its own `design-tokens.css`. Applying v2 to myK9Q is a separate plan — see `TO-DOS.md` after this lands.

**Tech Stack:** CSS custom properties, Tailwind v3 (class-based dark mode), Google Fonts (already loaded: Fraunces, Montserrat, JetBrains Mono), shadcn/ui (reads `--primary`, `--background`, `--border`, etc.)

**Reference files:**
- Design spec: `docs/design_handoff_myk9/colors_and_type_v2.css`
- Design README: `docs/design_handoff_myk9/README.md`
- Rosette asset: `docs/design_handoff_myk9/assets/rosette.svg`
- Target: `apps/myk9show/src/index.css`
- Shared tokens (imported before `:root`): `apps/myk9show/src/pages/scoring/styles/design-tokens.css` — **verify our `:root` wins the cascade**

---

## What's already done (do not re-implement)

- Google Fonts load in `apps/myk9show/index.html` — Fraunces, Montserrat, JetBrains Mono ✓
- `[data-accent]` system for Clay / Grove / Dusk / Heather ✓
- `--primary`, `--primary-hover`, `--primary-foreground` wired to accent ✓
- `--font-serif: 'Fraunces'` in `design-tokens.css` ✓

---

## File Map

| File | Change |
|---|---|
| `apps/myk9show/src/index.css` | All token + typography changes |
| No other files | CSS vars cascade automatically |

---

## Task 1: Add static brand + surface tokens to `:root`

These are the named palette tokens. They don't change with accent selection — they're the raw brand palette.

**Files:**
- Modify: `apps/myk9show/src/index.css` — inside `@layer base { :root { ... } }`

- [ ] **Step 1: Add brand palette tokens**

In `apps/myk9show/src/index.css`, find the `@layer base { :root {` block (around line 369) and add these tokens **before** the existing `--background` line:

```css
    /* ---- v2 brand palette ---- */
    --terra-50:  #fdf5ef;
    --terra-100: #f9e5d5;
    --terra-200: #f2c8a8;
    --terra-400: #db8561;
    --terra-500: #c96442;
    --terra-600: #b05338;
    --terra-700: #7c4a2e;
    --terra-900: #3d2516;

    --ivory-50:  #faf7f2;
    --ivory-100: #f3efe6;
    --ivory-200: #e4dccc;

    --stone-300: #b9b1a0;
    --stone-500: #8c8376;
    --stone-700: #403a31;
    --ink-900:   #181411;

    --ring-green-50:  #f1f8f1;
    --ring-green-500: #4e7c53;
    --ring-green-700: #385a3b;

    /* ---- Live status (ring-green reserved) ---- */
    --live:     var(--ring-green-500);
    --live-tint: var(--ring-green-50);
    --live-ink:  var(--ring-green-700);

    /* ---- [ADDED] Semantic system palette (never follows accent) ---- */
    --success: #4e7c53;      /* = ring-green */
    --warning: #c88b1a;      /* warm amber */
    --danger:  #b04835;      /* matches terra family */
    --info:    #3d6d8c;      /* muted blue */

    /* ---- Font stacks ---- */
    --font-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
    --font-sans:  'Montserrat', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    --font-mono:  'JetBrains Mono', 'SF Mono', Consolas, monospace;

    /* ---- Fraunces variable-axis presets ---- */
    --fraunces-settings-display: "opsz" 144, "SOFT" 50, "WONK" 0;
    --fraunces-settings-text:    "opsz" 24,  "SOFT" 30, "WONK" 0;
```

- [ ] **Step 2: Update light-mode surface colors**

In the same `:root` block, update these existing values (the current warm-parchment values are close but not the v2 spec):

```css
    /* Update these lines — change FROM the existing values TO: */
    --background:     #faf7f2;   /* was #f5f4ed — v2 ivory-50 */
    --background-alt: #f3efe6;   /* was #f5f4ed — v2 ivory-100 */
    --card:           #ffffff;   /* was #faf9f5 — v2 pure white card */
    --border:         #e4dccc;   /* was #e8e6dc — v2 ivory-200 */
    --input:          #ffffff;   /* was #f5f4ed — inputs match card */
    --input-border:   #e4dccc;   /* was #e8e6dc */
    --foreground:     #181411;   /* was #141413 — v2 ink-900 */
    --muted-foreground: #8c8376; /* was #87867f — v2 stone-500 */
```

- [ ] **Step 3: Update light-mode shadows to warm-biased**

Still in `:root`, update the shadow tokens:

```css
    --shadow-card:       rgba(61, 37, 22, 0.05) 0px 4px 24px;
    --shadow-card-hover: 0px 0px 0px 1px var(--border), rgba(61, 37, 22, 0.06) 0px 8px 28px;
    --shadow-ring:       0px 0px 0px 1px var(--border);
    --shadow-ring-primary: 0px 0px 0px 1px var(--primary);
    --shadow-header:     0 1px 3px rgba(61, 37, 22, 0.04);
```

- [ ] **Step 4: [ADDED] Verify `design-tokens.css` doesn't override our new tokens**

`index.css` imports `./pages/scoring/styles/design-tokens.css` at line 2, which defines `--background: #f5f4ed`, `--card: #faf9f5`, `--border: #e8e6dc`, `--foreground: #141413` inside its own `:root`. Because our `@layer base { :root {} }` block appears AFTER the import in the same document, it should win the cascade at equal specificity, but we need to confirm in the browser.

```bash
pnpm dev:show
```

Open DevTools → Elements → click `<html>` → Computed tab → search `--background`. Confirm it resolves to `#faf7f2` (not `#f5f4ed`). Repeat for `--card` (expect `#ffffff`), `--border` (expect `#e4dccc`), `--foreground` (expect `#181411`).

If any resolve to the `design-tokens.css` values, escalate specificity: move our new tokens to a `:root, :where(:root)` selector or add `html { ... }` block instead of `:root`.

- [ ] **Step 5: [ADDED] Commit Task 1 in isolation**

```bash
git add apps/myk9show/src/index.css
git commit -m "$(cat <<'EOF'
feat(ui): add v2 brand palette + surface tokens

- Add terra/ivory/stone/ink/ring-green static palette
- Add semantic system tokens (success/warning/danger/info)
- Add live-status and font-stack vars
- Update surface colors to v2 ivory spec
- Warm-bias shadow tokens

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update typography — Playfair Display → Fraunces

The current `h1` and `h2` use Playfair Display. v2 spec uses Fraunces with variable-axis settings.

**Files:**
- Modify: `apps/myk9show/src/index.css` — heading rules in `@layer base` (around lines 473–496)

- [ ] **Step 1: Replace h1/h2 Playfair rules with Fraunces**

Find and replace this block in `index.css`:

```css
  /* OLD — Playfair Display */
  h1 {
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 500;
    line-height: 1.1;
  }

  h2 {
    font-family: 'Playfair Display', Georgia, serif;
    font-weight: 500;
    line-height: 1.2;
  }

  h3,
  h4 {
    font-family:
      'Montserrat',
      -apple-system,
      BlinkMacSystemFont,
      system-ui,
      sans-serif;
    font-weight: 600;
    line-height: 1.3;
  }
```

Replace with:

```css
  /* v2 typography — Fraunces display for h1/h2, Montserrat for h3/h4 */
  h1 {
    font-family: var(--font-serif);
    font-weight: 450;
    font-variation-settings: var(--fraunces-settings-display);
    font-size: clamp(36px, 5vw, 60px);
    line-height: 1.05;
    letter-spacing: -0.018em;
  }

  h2 {
    font-family: var(--font-serif);
    font-weight: 450;
    font-variation-settings: var(--fraunces-settings-display);
    font-size: clamp(28px, 3.5vw, 40px);
    line-height: 1.2;
    letter-spacing: -0.015em;
  }

  h3,
  h4 {
    font-family: var(--font-sans);
    font-weight: 600;
    line-height: 1.3;
  }
```

- [ ] **Step 2: Add type utility classes**

After the `h3, h4` block, add these utility classes:

```css
  .eyebrow {
    font-family: var(--font-sans);
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--terra-700);
  }

  .numeric,
  code,
  kbd {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .display-serif {
    font-family: var(--font-serif);
    font-weight: 450;
    font-variation-settings: var(--fraunces-settings-display);
  }

  /* Rosette utility — recolors via currentColor */
  .rosette {
    display: inline-block;
    width: 1em;
    height: 1.33em;
    color: var(--primary);
  }
```

- [ ] **Step 3: Visual check — open dev server and spot-check headings**

```bash
pnpm dev:show
```

Navigate to `/shows` and `/` — confirm h1/h2 headings render in Fraunces (softer, more optical than Playfair). Open DevTools → Elements → inspect an `<h1>`, verify `font-family` resolves to Fraunces.

- [ ] **Step 4: [ADDED] Commit Task 2 in isolation**

```bash
git add apps/myk9show/src/index.css
git commit -m "$(cat <<'EOF'
feat(ui): switch h1/h2 to Fraunces + add type utilities

- Replace Playfair Display with Fraunces (var-axis opsz/SOFT)
- Add .eyebrow, .numeric, .display-serif utility classes
- Add .rosette base class (asset wired in Task 3b)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2b: [ADDED] Port rosette SVG asset

The `.rosette` utility class needs the SVG to be usable. Without this, the class renders an empty box.

**Files:**
- Create: `apps/myk9show/public/rosette.svg` (from `docs/design_handoff_myk9/assets/rosette.svg`)
- Modify: `apps/myk9show/src/index.css` — extend `.rosette` class with mask-image

- [ ] **Step 1: Copy rosette.svg into app public dir**

```bash
cp docs/design_handoff_myk9/assets/rosette.svg apps/myk9show/public/rosette.svg
```

- [ ] **Step 2: Extend `.rosette` class to use the asset via CSS mask**

In `index.css`, replace the `.rosette` class definition (added in Task 2 Step 2) with:

```css
  /* Rosette utility — inline SVG via mask so it recolors via currentColor */
  .rosette {
    display: inline-block;
    width: 1em;
    height: 1.33em;
    background-color: currentColor;
    -webkit-mask: url('/rosette.svg') center / contain no-repeat;
    mask: url('/rosette.svg') center / contain no-repeat;
    color: var(--primary);
  }
```

- [ ] **Step 3: Visual smoke test — render rosette somewhere**

Add a temporary test in `apps/myk9show/src/pages/preferences/PreferencesPage.tsx` (or any visible page), inside a heading block:

```tsx
<span className="rosette" style={{ width: 24, height: 32 }} aria-hidden />
```

Confirm a terracotta rosette appears. **Revert the temporary insertion before committing.**

- [ ] **Step 4: Commit asset + mask rule**

```bash
git add apps/myk9show/public/rosette.svg apps/myk9show/src/index.css
git commit -m "$(cat <<'EOF'
feat(ui): port rosette SVG asset and wire .rosette mask

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Update dark mode surfaces

**Files:**
- Modify: `apps/myk9show/src/index.css` — inside `.dark { ... }` block (around lines 418–461)

- [ ] **Step 1: Update dark-mode surface values**

In the `.dark` block, update:

```css
    --background:     #181411;   /* was #141413 — v2 warm black */
    --foreground:     #faf7f2;   /* was #faf9f5 — v2 ivory-50 */
    --background-alt: #1e1c19;   /* was #1e1e1b — warmer dark alt */
    --card:           #1e1c19;   /* was #1e1e1b */
    --card-foreground: #faf7f2;  /* was #faf9f5 */
    --border:         #2e2b27;   /* was #2e2e2b — warm dark border */
    --input:          #1e1c19;   /* was #1e1e1b */
    --input-border:   #2e2b27;   /* was #2e2e2b */
```

- [ ] **Step 2: Update dark-mode shadows**

```css
    --shadow-card:       rgba(0, 0, 0, 0.3) 0px 4px 24px;
    --shadow-card-hover: 0px 0px 0px 1px var(--border), rgba(0, 0, 0, 0.35) 0px 8px 28px;
    --shadow-header:     0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3);
```

- [ ] **Step 3: Toggle dark mode in the browser and verify**

In the app at `/preferences`, switch to Dark mode. Confirm backgrounds look warm-dark (not cool grey). Check sidebar, cards, and dialogs.

- [ ] **Step 4: [ADDED] Commit Task 3**

```bash
git add apps/myk9show/src/index.css
git commit -m "$(cat <<'EOF'
feat(ui): update dark-mode surfaces + shadows to v2 warm-black spec

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Audit for hardcoded references

Ensure no component still hardcodes Playfair Display after we removed it from base styles.

**Files:**
- Search: `apps/myk9show/src/`

- [ ] **Step 1: Find hardcoded font references**

```bash
grep -rn "Playfair" apps/myk9show/src/ --include="*.css" --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2: Replace any remaining Playfair references**

For each file found, replace `'Playfair Display', Georgia, serif` with `var(--font-serif)`.

If found in a `.tsx` file as a `style` prop, replace the inline string with a CSS class using `font-[family-name:var(--font-serif)]` Tailwind arbitrary value, or extract to a CSS class.

- [ ] **Step 3: [ADDED] Remove Playfair Display from Google Fonts loader**

Once step 2 confirms no code references Playfair, trim the `<link>` in `apps/myk9show/index.html`:

```bash
grep -n "Playfair" apps/myk9show/index.html
```

If the link tag at line 13 includes `Playfair+Display` in the `family=` query, edit it out. Current tag (line 13):

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=JetBrains+Mono:wght@400;500;600&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

(If no `Playfair+Display` segment exists, the loader is already clean — skip.)

- [ ] **Step 4: [ADDED] Audit for hardcoded accent/brand hex values**

v2 governance says accent-colored chrome must use `var(--primary)` not literal hex values. Find hardcoded terracotta values that should use tokens:

```bash
grep -rn "#c96442\|#b05338\|#7c4a2e" apps/myk9show/src --include="*.tsx" --include="*.ts" --include="*.css" \
  | grep -v "design-tokens.css\|index.css"
```

Review each hit. If it's a component styling that should follow the user's accent, replace the literal with `var(--primary)` / `var(--primary-hover)` / `var(--primary-tint-ink)`. If it's brand-identity (logo mark, email header), leave the terra literal — brand stays terracotta regardless of accent.

Log any ambiguous cases to `TO-DOS.md` under "Design system v2 follow-ups" rather than guessing.

- [ ] **Step 5: Commit Task 4**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(ui): remove Playfair refs and hardcoded brand hex values

- Drop Playfair Display from font loader (replaced by Fraunces)
- Replace hardcoded terracotta hex with var(--primary) where appropriate
- Preserve brand-identity literals (logo, email header)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Visual verification pass (Golden Path pages)

Walk the key secretary and exhibitor pages and confirm no visual regressions.

- [ ] **Step 1: Start dev server if not running**

```bash
pnpm dev:show
```

- [ ] **Step 2: Check these pages**

| Route | What to verify |
|---|---|
| `/` | Hero h1 in Fraunces, warm ivory background |
| `/shows` | Show cards on ivory surface, card border uses `--border` |
| `/shows/:id` | Tab area, detail cards |
| `/preferences` | **Accent picker regression test (required):** click each of Clay / Grove / Dusk / Heather and confirm the sidebar-active icon, primary button, and focus rings update to that color within 200ms. Then toggle Light/Dark/System; confirm warm-dark surfaces in dark mode. |
| Any dialog (e.g. Clone Show on `/pipeline`) | Pure-white card on ivory overlay; border uses `--border` token |
| `/pipeline` | Stat cards, activity feed, quick-action cards |
| `/shows/:id/entries` | DataTable, filter chips |
| `/judges` or `/people` | List views, pagination |

- [ ] **Step 3: Check browser console**

```bash
# In browser DevTools console — no CSS errors should appear
```

Expected: No "Unknown property" or parse errors in console.

- [ ] **Step 4: Typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: Only pre-existing AuditService errors (not caused by this change).

- [ ] **Step 5: Final commit (if any visual fixes needed)**

```bash
git add apps/myk9show/src/index.css
git commit -m "$(cat <<'EOF'
fix(ui): visual fixes after v2 design token rollout

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## What this plan does NOT include

Per the design README's "product review required" list — do not implement during this pass:
- Green "IN RING · elapsed time" banner
- "UP NEXT — armband · ring · N away" strip on Home dashboard
- Progress bars on class cards (if not present)
- Rosette watermark on score entry background

These require separate product approval and are logged in `TO-DOS.md`.

**Out of scope (separate plans):**
- **myK9Q design system v2** — myK9Q uses semantic CSS (no Tailwind/shadcn), has its own `design-tokens.css`, and the handoff includes dedicated `ui_kits/myk9q/` prototypes. Needs its own plan.
- **Spacing/radius/text-scale CSS vars** — v2 spec defines `--space-1..24`, `--radius-sm..xl`, `--text-xs..6xl` as CSS variables. Tailwind already provides equivalent utilities (`p-1`, `rounded-lg`, `text-xl`), so duplicating these as CSS vars only matters if non-Tailwind code references them. Audit and add if needed in a follow-up.
- **AKC placement colors** — Blue 1st / red 2nd / yellow 3rd / white 4th. These are convention, not theme tokens; don't genericize.
