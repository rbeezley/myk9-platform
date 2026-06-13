# Handoff: Semantic Status-Token Foundation

**Status:** Not started — ready to pick up in a fresh conversation.
**Estimated size:** ~half a day for the foundation PR; the 119-file migration is a separate, mechanical follow-up.
**Prereq for:** a clean `/impeccable extract` of status-color utilities (do NOT extract before this lands).
**Owner context:** myK9Show app only (`apps/myk9show`). The impeccable sweep kept hand-pairing `dark:` status colors by hand across the whole app; this work replaces that pattern with real semantic utilities.

---

## Why this exists

During the impeccable per-page sweep (dark-mode/a11y/responsive), every status color was fixed by hand-pairing a light + dark Tailwind class, e.g.:

```tsx
text-green-600 dark:text-green-400      // success
text-amber-600 dark:text-amber-400      // warning
text-red-600   dark:text-red-400        // error
text-blue-600  dark:text-blue-400       // info
```

That pattern is now **systemic** and the migration surface is large:

- **119 `.tsx` files** contain hand-paired `dark:(text|bg|border)-(green|red|amber|orange|yellow|blue|emerald|teal)-N` classes.
- **491 total occurrences.**

The fix is to define a proper semantic status scale once, wire it into Tailwind as `text-success` / `bg-warning/10` / `border-info` / etc., and then migrate the 491 occurrences to it. After that, `/impeccable extract` has a clean target and no page can re-introduce an un-paired status color.

**Do the foundation FIRST.** Extracting onto the current half-built tokens would cement the awkward names and missing pieces (see "extract onto a clean foundation, not a drifting one").

---

## Exact current state (grounded, verified 2026-06-13)

### Tokens that exist

`apps/myk9show/src/index.css`:

| Line | Token | Value | Format | Light/dark adaptive? |
|------|-------|-------|--------|----------------------|
| 227 | `--success-green` | `52 199 89` | `R G B` triplet (alpha-capable) | ❌ single-mode (only in `:root`, never redefined in `.dark`) |
| 228 | `--warning-orange` | `255 149 0` | `R G B` triplet (alpha-capable) | ❌ single-mode |
| 411 | `--destructive` | `#ef4444` | hex (NOT alpha-capable) | ✅ light value |
| 483 | `--destructive` | `#dc2626` | hex (NOT alpha-capable) | ✅ dark value (in `.dark` block, starts L462) |
| 412 / 484 | `--destructive-foreground` | `#ffffff` | hex | ✅ |

Note: index.css has **two `:root` blocks** (L226 and L384) — success/warning live in the first, destructive in the second. Fragmentation even within one file.

### Tailwind wiring

`apps/myk9show/tailwind.config.js`:

```js
// L80–82
destructive: {
  DEFAULT: 'var(--destructive)',
  foreground: 'var(--destructive-foreground)',
},
// L84–85
'success-green': 'rgb(var(--success-green) / <alpha-value>)',
'warning-orange': 'rgb(var(--warning-orange) / <alpha-value>)',
```

So today you *can* write `text-success-green` / `bg-warning-orange` — but the names are color-suffixed and awkward, there's **no `info`**, **no clean `success`/`warning`**, and `destructive` can't take `/alpha` (hex format).

### What's MISSING

1. **`--info`** token entirely (blue is the 4th-most-used status family — 93 occurrences — with no token).
2. **Clean semantic names** (`success`, `warning`, `info`) instead of `success-green` / `warning-orange`.
3. **Light/dark values for success & warning** — currently one value for both modes.
4. **Foreground/contrast pairs** for success/warning/info (only destructive has `-foreground`).
5. **Format consistency** — pick ONE: `R G B` triplet consumed via `rgb(var(--x) / <alpha-value>)` so every status color supports `/10`, `/20` opacity. (Convert `--destructive` from hex to triplet to match.)

### Hand-paired color-family breakdown (maps to 4 semantic roles)

| Family | Occurrences | → Semantic role |
|--------|-------------|-----------------|
| green + emerald + teal | 81 + 25 + 26 = **132** | `success` |
| amber + yellow + orange | 117 + 31 + 30 = **178** | `warning` |
| red | **88** | `destructive` (error) |
| blue | **93** | `info` |

`warning` is the single most-used status role; `info` is the most-used role with no token at all.

---

## The foundation PR (do this first)

### 1. Define the token scale in `index.css`

Use **`R G B` space-separated triplets** for ALL four roles (so `/alpha` works everywhere), each with a light value in `:root` and a dark value in `.dark`, plus a `-foreground`. Suggested values (tune to DESIGN.md teal-accent palette — verify contrast):

```css
:root {
  /* Semantic status — light */
  --success: 22 163 74;        /* green-600 */
  --success-foreground: 255 255 255;
  --warning: 217 119 6;        /* amber-600 */
  --warning-foreground: 255 255 255;
  --info: 37 99 235;           /* blue-600 */
  --info-foreground: 255 255 255;
  --destructive: 239 68 68;    /* red-500 — CONVERT from hex #ef4444 */
  --destructive-foreground: 255 255 255;
}
.dark {
  --success: 74 222 128;       /* green-400 */
  --warning: 251 191 36;       /* amber-400 */
  --info: 96 165 250;          /* blue-400 */
  --destructive: 220 38 38;    /* red-600 — CONVERT from hex #dc2626 */
}
```

**[EXPANDED] Back-compat — KEEP the old names as aliases, do NOT remove them in this PR.** `--success-green` / `--warning-orange` are still referenced by their Tailwind color names (`text-success-green`, `bg-warning-orange`). If you delete them in the foundation PR, every consumer's class **silently stops generating** — Tailwind emits nothing, there is no build error, the element just renders with no/wrong color. So:

1. In `tailwind.config.js`, keep `'success-green'` / `'warning-orange'` entries but **repoint them at the new vars** so old and new names render identically:
   ```js
   'success-green': 'rgb(var(--success) / <alpha-value>)',   // deprecated alias — remove after migration
   'warning-orange': 'rgb(var(--warning) / <alpha-value>)',  // deprecated alias — remove after migration
   ```
2. Inventory the consumers up front so the migration PR knows its true surface:
   ```bash
   grep -rn "success-green\|warning-orange" apps/myk9show/src
   ```
3. The aliases are deleted in the **migration** PR (the second one), only after the last consumer is converted — never in the foundation PR.

**[ADDED] Where the new vars live.** `index.css` has **two `:root` blocks** (L226 and L384). Put all four status tokens + foregrounds in the **first** `:root` (L226, where `--success-green`/`--warning-orange` already sit) so the status palette stays in one place, and the dark values in the existing `.dark` block (starts L462). Don't scatter them across both `:root` blocks. (Consolidating the two `:root` blocks themselves is out of scope — see "Out of scope".)

### 2. Wire Tailwind (`tailwind.config.js`)

```js
success:     { DEFAULT: 'rgb(var(--success) / <alpha-value>)',     foreground: 'rgb(var(--success-foreground) / <alpha-value>)' },
warning:     { DEFAULT: 'rgb(var(--warning) / <alpha-value>)',     foreground: 'rgb(var(--warning-foreground) / <alpha-value>)' },
info:        { DEFAULT: 'rgb(var(--info) / <alpha-value>)',        foreground: 'rgb(var(--info-foreground) / <alpha-value>)' },
destructive: { DEFAULT: 'rgb(var(--destructive) / <alpha-value>)', foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)' },
```

(Convert `destructive` from `var(--destructive)` to the `rgb(var(--destructive) / <alpha-value>)` form so `bg-destructive/10` works. Verify no existing `text-destructive`/`bg-destructive` usage breaks — they resolve identically at full opacity.)

### 3. Document in `apps/myk9show/DESIGN.md`

Add a "Semantic status colors" section: the four roles, their light/dark values, when to use each, and the rule **"never hand-pair `dark:text-{color}-N` for status — use `text-success`/`text-warning`/`text-info`/`text-destructive`."**

### 4. Tests

- **Source-text guard** (repo `fs.readFileSync` convention — see existing `registrationSecretaryMobile.test.ts`): pin that `tailwind.config.js` contains the four semantic keys AND the two deprecated aliases (so they aren't removed prematurely), and that `index.css` defines each `--success/--warning/--info/--destructive` var in both `:root` and `.dark`.
- **Smoke render** a small component using `bg-success/10 text-success` to confirm the utility generates (Tailwind silently drops unknown classes).

**[EXPANDED] Contrast verification (don't skip — these are color choices).** The suggested shades are starting points; confirm each meets **WCAG AA (≥4.5:1 for body text, ≥3:1 for large/UI)** before locking them:

- For **solid fills**: `*-foreground` on `bg-*` (e.g. white on `--success` green-600). Check the light value on light surface and the dark value on dark surface.
- For **tinted backgrounds** (the common status-chip pattern `text-success` on `bg-success/10`): the *DEFAULT* color sits on a 10%-tint of itself over the page background — verify the text shade is legible there, not just on white. This is the case most likely to fail and is the one the hand-paired classes were implicitly tuning per-element.
- Method: any contrast checker (e.g. the browser devtools color picker shows the ratio, or WebAIM contrast checker). Record the four ratios in the PR description so the reviewer can spot a sub-AA pair.

### Acceptance criteria (foundation PR)

- [ ] `text-success` / `bg-success/10` / `text-success-foreground` (and warning/info/destructive) all generate and render correctly in BOTH light and dark.
- [ ] `--destructive` is now a triplet; existing `text-destructive`/`bg-destructive` still render identically.
- [ ] **Deprecated aliases `success-green`/`warning-orange` still resolve** (repointed at the new vars) — no consumer breaks. Removed only in the migration PR.
- [ ] Four contrast ratios recorded in the PR description, all ≥ AA for their use.
- [ ] DESIGN.md documents the scale + the no-hand-pairing rule.
- [ ] `pnpm typecheck` + `pnpm lint` clean; guard tests green.
- [ ] No visual regression on a spot-check of 2–3 already-swept pages (registration wizard, secretary payment).

### [ADDED] Rollback / recovery

The foundation PR is **purely additive** (new vars + new Tailwind keys + repointed aliases), so revert is clean:

- **Revert path:** `git revert <sha>` of the foundation commit removes the new tokens and restores the original alias definitions. Because no consumer was changed in this PR (migration is separate), nothing references the new `text-success` etc. yet — revert can't strand a consumer.
- **Half-applied safety:** the only mutation that touches an *existing* value is the `--destructive` hex→triplet conversion. If that one change is wrong, it's isolated to two lines (L411/L483) — revert those independently; the new tokens don't depend on it.
- **Why aliases make this safe:** keeping `success-green`/`warning-orange` live means the foundation PR has zero behavioral coupling to the rest of the app, which is exactly what makes both the merge and any revert low-risk.

---

## The migration follow-up (separate PR / `/impeccable extract`)

Once the foundation lands, migrate the 491 occurrences. This is mechanical and scriptable but needs review — the light/dark base shades don't map 1:1, so verify the semantic intent (is amber "warning" or just a brand accent?).

Common rewrites:

| Hand-paired | → Semantic |
|-------------|-----------|
| `text-green-600 dark:text-green-400` | `text-success` |
| `text-amber-600 dark:text-amber-400` | `text-warning` |
| `text-blue-600 dark:text-blue-400` | `text-info` |
| `text-red-600 dark:text-red-400` | `text-destructive` |
| `bg-green-50 dark:bg-green-950/30` | `bg-success/10` |
| `bg-amber-50 dark:bg-amber-950/30` | `bg-warning/10` |
| `border-blue-200 dark:border-blue-800` | `border-info/30` |

**Find the work:**
```bash
cd apps/myk9show
grep -rlE 'dark:(text|bg|border)-(green|red|amber|orange|yellow|blue|emerald|teal)-[0-9]' src --include="*.tsx"
```

**Watch out for genuinely-brand uses** — teal is the DESIGN.md accent (#14b8a6), not always "success." Some emerald/teal is decorative, not status. Don't blindly map teal→success; read each.

**[EXPANDED] This migration CHANGES how some elements look — it is not a pure rename.** The foundation collapses **multiple source families into one token**: green+emerald+teal → `success`, and amber+yellow+orange → `warning`. So an element currently using `text-orange-600` or `text-yellow-600` will *shift* to the single `--warning` amber when migrated. That's intended consolidation, but it's a **visible change** the reviewer must expect and eyeball — not a no-op. Migrate **one color family at a time** (e.g. all `red`→`destructive` in one commit, all `amber`→`warning` in the next) so each diff is reviewable and a bad mapping is easy to bisect. Per-family source-text guard tests pin the result. Re-run the full suite after each family (prettier may reflow the classNames the guards grep for — see prior impeccable PRs).

**[EXPANDED] Guardrail — recommended, land it WITH the migration (not optional).** Without a gate the pattern regrows the moment the next page is built. Add an ESLint rule (or a CI grep gate) that flags any NEW `dark:(text|bg|border)-(green|red|amber|orange|yellow|blue|emerald|teal)-N` and points the author at the semantic utility. Land it in the **final** migration commit (after the count is driven to ~0) so it doesn't fail CI on the not-yet-migrated files. Allowlist any genuine brand-teal/decorative uses you deliberately kept. This is the only thing that makes the 491→0 work *stay* at 0.

---

## Out of scope (do NOT do here)

- **The "4 competing theme systems" consolidation** (per memory `project_theme_class_trio`). The page-specific `apps/myk9show/src/styles/myk9-*.css` files — some using `@media (prefers-color-scheme: dark)` which doesn't even match the app's class-based `.dark` — are a SEPARATE, larger cleanup. Token extraction does NOT require fixing them; the shadcn core in `index.css` is sound and independent. Note it, don't scope-creep into it.
- **The `WizardLayout` component extraction.** That's the *component* side and is independently ready (mature shadcn lib + real DESIGN.md). Can proceed in parallel; doesn't depend on this token work.

---

## Quick-start for the new conversation

1. Read this file + `apps/myk9show/DESIGN.md` + `apps/myk9show/src/index.css` L226–490 + `tailwind.config.js` L70–90.
2. Confirm the grounded facts above still hold (`grep` commands are included throughout).
3. Build the foundation PR (steps 1–4), keep the 491-file migration OUT of it.
4. Land foundation → THEN run the migration / `/impeccable extract` as a second PR.

**Working rules (from CLAUDE.md / memory):**
- Work in a worktree, not the primary checkout.
- `main` is PR-protected — branch + PR everything (docs-only gets a local commit but push is rejected on main).
- Use `pnpm typecheck` (not raw `tsc`); rebuild any edited package before app tests.
- Pre-launch, no real users — no *external* backward-compat needed. (The `success-green`/`warning-orange` aliases are NOT external compat; they're intra-repo correctness so the foundation PR doesn't break the app's own still-unmigrated consumers. Keep them until the migration PR removes the last one.)
