# myK9Q v2 Phase 1 — Stylesheet Audit

Produced as part of the Phase 1 PR. Each stylesheet in `apps/myk9q/src/styles/` is classified against v2 migration scope so Phase 3 cleanup has a definitive worklist.

**Classification key:**

- **v2-relevant** — contains literal hex/color values or fonts that may need to be reconciled against the v2 palette. Phase 1 may have already trimmed it; Phase 2/3 may trim further.
- **token-agnostic** — already references `var(--…)` throughout, so v2 token changes flow through automatically. No action required.
- **archive-candidate** — scheduled to be obsoleted by v2 but still imported somewhere. Phase 3 decides whether to delete or merge.
- **dead** — no import found anywhere in `apps/myk9q/`, `index.html`, or the repo root. Phase 3 deletes.

Counts below come from `grep -c 'var(--'`, `grep -cE '#[0-9a-fA-F]{6}'`, and `grep -cE 'Playfair|Montserrat|Fraunces'` against each file.

## Full inventory

| Stylesheet                 | Lines | `var(--)` refs | Hex literals | Font names | Imported from                                                                                        | Category       | v2 Action                                                                                                                                                                                         |
| -------------------------- | ----- | -------------: | -----------: | ---------: | ---------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-tokens.css`        | 538   |             96 |          153 |          1 | `src/index.css` + several component `.css`/`.tsx` files                                              | v2-relevant    | **Trimmed in Task 5** — canvas, card, border, muted, fonts, shadows removed. Ringside-specific tokens (status colors, check-in colors, hover shadows, density) kept. Further trim TBD in Phase 3. |
| `apple-design-system.css`  | 487   |            118 |            7 |          0 | `src/index.css`, `src/pages/Login/Login-Apple.tsx`                                                   | token-agnostic | High token density. Remaining 7 hex literals are specific glass/gradient/overlay colors not part of the canvas palette — inherits v2 with no edits.                                               |
| `containers.css`           | 173   |             15 |            0 |          0 | `src/App.tsx`                                                                                        | token-agnostic | Uses `var(--…)` exclusively — inherits v2.                                                                                                                                                        |
| `critical.css`             | 123   |             16 |            1 |          0 | `index.html` (`<link rel="stylesheet">` for above-the-fold paint)                                    | v2-relevant    | One remaining hex literal is a pre-paint fallback; leave until Phase 3 audits critical-path paint.                                                                                                |
| `critical-inline.css`      | 100   |             20 |            6 |          0 | **Not imported anywhere** (no references in `src/`, `index.html`, build config, or repo root)        | dead           | Phase 3 — delete.                                                                                                                                                                                 |
| `empty-state.css`          | 264   |             26 |            0 |          0 | `src/index.css`, `src/pages/ClassList/ClassList.css`                                                 | token-agnostic | Inherits v2.                                                                                                                                                                                      |
| `green-theme.css`          | 173   |             26 |           26 |          0 | `src/components/ThemeToggle.tsx`                                                                     | v2-relevant    | Accent-override file; hex literals match the existing green accent palette. **Out of Phase 1 scope** per spec guardrail — accent system edits belong to Phase 2.                                  |
| `landing-background.css`   | 81    |              5 |            6 |          0 | `src/pages/Landing/Landing.css`, `src/pages/Login/Login.css`                                         | v2-relevant    | Contains decorative gradient stops. Verify against parchment canvas in Phase 2 branding pass; no action in Phase 1.                                                                               |
| `message-banner.css`       | 289   |             49 |            9 |          0 | `src/index.css`                                                                                      | v2-relevant    | Hex literals are banner-state semantic colors (success/warn/error tints). Verify against v2 semantic palette in Phase 2.                                                                          |
| `micro-animations.css`     | 297   |             11 |            0 |          0 | `src/index.css`                                                                                      | token-agnostic | No colors — animations only. Inherits v2.                                                                                                                                                         |
| `mobile-optimizations.css` | 431   |             71 |           16 |          0 | **Not imported anywhere** (no references in `src/`, `index.html`, build config, or repo root)        | dead           | Phase 3 — delete.                                                                                                                                                                                 |
| `orange-theme.css`         | 203   |             26 |           28 |          0 | `src/components/ThemeToggle.tsx`                                                                     | v2-relevant    | Same accent-override treatment as `green-theme.css`. Out of Phase 1 scope.                                                                                                                        |
| `page-container.css`       | 118   |             20 |            0 |          0 | `src/index.css` + page-level `.css` files                                                            | token-agnostic | Inherits v2.                                                                                                                                                                                      |
| `page-transitions.css`     | 52    |              0 |            0 |          0 | `src/pages/Landing/Landing.css`, `src/pages/Login/Login.css`                                         | token-agnostic | Pure motion — no colors, no tokens. Inherits v2 trivially.                                                                                                                                        |
| `purple-theme.css`         | 162   |             25 |           23 |          0 | `src/components/ThemeToggle.tsx`                                                                     | v2-relevant    | Same accent-override treatment as `green-theme.css`. Out of Phase 1 scope.                                                                                                                        |
| `shared-components.css`    | 704   |            148 |            0 |          0 | `src/index.css`, `src/components/ui/shared-ui.css`, page-level `.css`                                | token-agnostic | Zero hex literals — fully tokenized. Inherits v2.                                                                                                                                                 |
| `tailwind-utilities.css`   | 779   |            164 |            0 |          0 | `src/index.css`, `src/components/ui/Badge.tsx`                                                       | token-agnostic | Zero hex literals — fully tokenized. Inherits v2.                                                                                                                                                 |
| `touch-feedback.css`       | 204   |             11 |            0 |          0 | `src/index.css`                                                                                      | token-agnostic | Inherits v2.                                                                                                                                                                                      |
| `utilities.css`            | 607   |             70 |           16 |          0 | `src/index.css`, `src/components/ui/Badge.tsx`, `src/components/ui/shared-ui.css`, page-level `.css` | v2-relevant    | Hex literals are scattered utility colors (shadows, overlays, focus rings). Verify against v2 tokens in Phase 2.                                                                                  |
| `viewport.css`             | 419   |             21 |            0 |          0 | `src/index.css`                                                                                      | token-agnostic | Inherits v2.                                                                                                                                                                                      |

## Dead files

These stylesheets have **zero import references** anywhere in `apps/myk9q/src/`, `apps/myk9q/index.html`, or the monorepo root:

- `apps/myk9q/src/styles/critical-inline.css`
- `apps/myk9q/src/styles/mobile-optimizations.css`

**Phase 3 action:** delete outright. No redirect or archival needed.

## Archive candidates

These stylesheets are still imported but become redundant once v2 hoists its canonical tokens into `@myk9/ui/styles`. They should be considered for deletion or consolidation in Phase 3:

- `apps/myk9q/src/styles/critical.css` — one remaining hex literal is an above-the-fold paint fallback. If `@myk9/ui/styles` is inlined into `index.html` in Phase 3, this file can likely be dropped entirely.
- `apps/myk9q/src/styles/design-tokens.css` — Phase 1 trimmed it to ringside-specific overrides. Phase 3 will evaluate whether to keep the remaining ringside tokens in myK9Q or promote them into `@myk9/ui/styles` as a dedicated `tokens-ringside.css` partial. If promoted, this file becomes dead.

## Summary

- **Dead (delete in Phase 3):** 2 files (`critical-inline.css`, `mobile-optimizations.css`)
- **Archive candidates:** 2 files (`critical.css`, `design-tokens.css`)
- **v2-relevant, out of Phase 1 scope:** 6 files (accent themes: `green-theme.css`, `orange-theme.css`, `purple-theme.css`; Phase 2 palette reconciliation: `landing-background.css`, `message-banner.css`, `utilities.css`)
- **Token-agnostic (inherits v2 automatically):** 10 files

Total: 20 stylesheets audited.
