# Codebase Health Audit Report

Generated: 2026-02-18

## Summary

| Category                          | Count                   | Trend (vs 2026-02-15)                        |
| --------------------------------- | ----------------------- | -------------------------------------------- |
| @ts-nocheck files                 | 0                       | same                                         |
| @ts-ignore comments               | 0                       | DOWN from 1 (removed from syncManager.test)  |
| Explicit `any` types (app source) | 3 in 2 files            | DOWN from ~80 (massive cleanup in sprint)    |
| Explicit `any` types (all)        | 28 across 14 files      | DOWN from 486 (97% reduction)                |
| `as any` casts (app source)       | 0                       | same (maintained at zero)                    |
| Console statements (app source)   | 0                       | same (debug utils are dev-gated)             |
| Files over 800 lines              | 1                       | DOWN from 8 (7 refactored)                   |
| Files over 700 lines              | 26                      | DOWN from ~40 (sprint 4 refactored 15)       |
| Unused dependencies               | 6 removable + 1 missing | changed (old ones removed, new ones found)   |
| Stale TO-DOS items                | 1                       | new (package coverage threshold not checked) |

---

## Findings by Category

### 1. TypeScript Escape Hatches

**@ts-nocheck: 0 files** -- Clean since 2026-02-15 audit.

**@ts-ignore / @ts-expect-error: 0 files** -- The last remaining occurrence (in `syncManager.test.ts`) was removed during the Code Quality Sprint.

Severity: resolved | No action needed

---

### 2. `any` Type Hotspots

**App source (non-test, non-script, non-edge-function): 3 occurrences in 2 files**

| File                                                             | Line(s)  | Usage                                         | Assessment                                                   |
| ---------------------------------------------------------------- | -------- | --------------------------------------------- | ------------------------------------------------------------ |
| `myk9show/src/hooks/optimized/useSimplifiedHooks.ts`             | 115, 163 | `(...args: any[]) => any` generic constraints | Acceptable -- standard pattern for generic callback wrappers |
| `myk9show/src/services/database/queries/search-query-helpers.ts` | 68       | `{ from(t: string): any }` type narrowing     | Workaround for Supabase client type limitation               |

**Edge Functions: 10 occurrences in 4 files**

| File                                                       | Count | Usage                           |
| ---------------------------------------------------------- | ----- | ------------------------------- |
| `myk9q/supabase/functions/send-push-notification/index.ts` | 5     | Error catches, payload types    |
| `myk9q/supabase/functions/validate-passcode/index.ts`      | 2     | `matchedShow: any`, error catch |
| `myk9q/supabase/functions/clear-rate-limits/index.ts`      | 1     | Error catch                     |
| `myk9q/supabase/functions/search-rules-v2/index.ts`        | 1     | `supabase: any` param           |

**Scripts: 7 occurrences in 6 files** -- All in `myk9q/scripts/` (debug/seed tooling). Acceptable.

**`as any` casts: 1 real occurrence** -- `send-push-notification/index.ts:209` (Edge Function)

Severity: resolved | Remaining occurrences are justified or in non-app code

---

### 3. Console Statements

**Application source (non-test, non-script, non-debug-util, non-logger): 0**

All console statements in production app code route through `LoggingService` or `@myk9/core/logger`.

**Debug utilities (intentional, dev-gated):**

| File                                         | Count | Assessment                                              |
| -------------------------------------------- | ----- | ------------------------------------------------------- |
| `myk9q/src/services/entryDebug.ts`           | ~85   | Dev-only debug functions for Supabase real-time testing |
| `myk9q/src/utils/testDatabaseConnections.ts` | ~14   | Database connection test script                         |

**Edge Functions: ~160 occurrences across 11 files** -- Server-side logging, expected.

Severity: resolved | No action needed

---

### 4. Large Files

**Source files by size range** (excluding generated types, tests, scripts, edge functions):

| Range      | Count | Notable files                                                                                                |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| 800+ lines | 1     | `OfflineScoringService.ts` (875)                                                                             |
| 700-799    | 25    | `UserEditPanel.tsx` (752), `BulkActionsBar.tsx` (750), `EditClassDialog.tsx` (749), `templateStore.ts` (747) |
| 600-699    | 80    | Various services and components                                                                              |
| 500-599    | 111   | Various                                                                                                      |

**Top 10 largest source files:**

| File                                                            | Lines | Already tracked?                   |
| --------------------------------------------------------------- | ----- | ---------------------------------- |
| `myk9show/src/services/scoring/OfflineScoringService.ts`        | 875   | Yes (TO-DOS: skip, cohesive class) |
| `myk9show/src/components/panels/edit/UserEditPanel.tsx`         | 752   | Yes (700-750 backlog)              |
| `myk9show/src/components/admin/users/BulkActionsBar.tsx`        | 750   | Yes (700-750 backlog)              |
| `myk9show/src/components/classes/EditClassDialog.tsx`           | 749   | Yes (700-750 backlog)              |
| `myk9show/src/store/templateStore.ts`                           | 747   | Yes (700-750 backlog)              |
| `myk9show/src/services/deployment/FeatureFlagService.ts`        | 746   | Yes (700-750 backlog)              |
| `myk9show/src/components/templates/admin/FieldConfigurator.tsx` | 744   | Yes (700-750 backlog)              |
| `myk9show/src/components/sync/SyncSettingsPanel.tsx`            | 738   | Yes (700-750 backlog)              |
| `myk9show/src/components/stewards/GateStewardInterface.tsx`     | 737   | Yes (700-750 backlog)              |
| `myk9show/src/services/notifications/EmailService.ts`           | 736   | Yes (700-750 backlog)              |

**Improvement:** Files over 800 lines dropped from 8 to 1 (Code Quality Sprint Session 4 refactored 7 of them).

**CLAUDE.md guideline:** "Keep files under 500 lines." 217 source files exceed this threshold. The 26 files over 700 lines are the priority targets; address when naturally touched.

Severity: moderate | Effort: sprint-task per file (address when modified)

---

### 5. Unused Dependencies

**apps/myk9show -- 4 removable devDependencies + 1 missing runtime dep:**

| Dependency              | Type          | Issue                                                                                   |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------- |
| `web-vitals`            | devDep        | Zero imports; only mentioned in a comment                                               |
| `@rollup/plugin-terser` | devDep        | Explicitly commented out in `vite.config.ts`                                            |
| `husky`                 | devDep        | No `.husky/` directory exists; pre-commit via Claude Code hooks                         |
| `lint-staged`           | devDep        | No config file; vestigial alongside husky                                               |
| `pako` (MISSING)        | should be dep | Imported in `CompressionService.ts` but only available transitively via `jspdf`/`jszip` |

**apps/myk9q -- 2 removable devDependencies:**

| Dependency       | Type   | Issue                                                              |
| ---------------- | ------ | ------------------------------------------------------------------ |
| `workbox-window` | devDep | Not directly imported; pulled in transitively by `vite-plugin-pwa` |
| `workbox-core`   | devDep | Not directly imported; pulled in transitively by `vite-plugin-pwa` |

**Previous audit found 7 unused** (5 in myk9show: `dexie-react-hooks`, `react-dnd`, `react-dnd-html5-backend`, `swiper`, `uuid`; 2 in myk9q: `pdfjs-dist`, `puppeteer`). All were removed. New unused deps found this audit are lower severity.

**All shared packages: clean** -- No unused dependencies.

Severity: low (removals) / moderate (missing `pako`) | Effort: quick-win

---

### 6. Stale TO-DOS Items

**1 stale item found:**

| Line | Item                                          | Issue                                                              |
| ---- | --------------------------------------------- | ------------------------------------------------------------------ |
| 36   | `[ ] Package coverage thresholds -- deferred` | Completed 2026-02-18 (commit `921156b`) but still marked unchecked |

All other items verified:

- File references still exist (OfflineScoringService.ts confirmed at 875 lines)
- Completed items (`[x]`) are accurately marked
- Outstanding items (E2E blocking, 700-750 files) are still relevant

Severity: low | Effort: quick-win (update checkbox)

---

## Recommended Actions

### Quick Wins (5 minutes)

1. **Fix stale TO-DOS.md item:** Check off "Package coverage thresholds" (line 36)
2. **Add `pako` to myk9show dependencies:** Prevents breakage if `jspdf`/`jszip` drop the transitive dep
3. **Remove unused devDeps from myk9show:** `web-vitals`, `@rollup/plugin-terser`, `husky`, `lint-staged`
4. **Remove unused devDeps from myk9q:** `workbox-window`, `workbox-core`

### No Action Needed

- @ts-nocheck / @ts-ignore: zero, fully resolved
- `as any` casts in app source: zero, maintained since sprint
- Console statements: zero in production code (debug utils are dev-gated)
- Shared package dependencies: all clean
- TO-DOS accuracy: 1 minor checkbox fix

### Ongoing (address when files are naturally modified)

- 26 files over 700 lines -- refactor when touched
- 3 `any` types in app source -- acceptable patterns, no action required
- Edge Function `any` types (10 occurrences) -- improve when functions are updated
