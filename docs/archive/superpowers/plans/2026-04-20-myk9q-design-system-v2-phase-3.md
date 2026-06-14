# myK9Q Design System v2 — Phase 3 (Cleanup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Phase 2 deprecation aliases (`--checkin-*` status tokens, `.accent-green` / `.accent-orange` CSS classes, legacy `'green' | 'orange'` values in the settings type) so the v2 design system is the single source of truth for myK9Q accent + status colors.

**Architecture:** Three-pass cleanup with a regression-test guardrail in front:

1. **Consumer migration pass** — every `--checkin-*` reference in both apps is rewritten to the canonical `--status-*` token. Starts at the cross-app constant (`packages/core/src/constants/check-in-status.ts`) and sweeps all stylesheets / components in `apps/myk9q/` and the `apps/myk9show/` checkin surfaces.
2. **Alias removal pass** — once no consumer references the deprecation aliases, remove the alias definitions themselves from `design-tokens.css`, `index.css`, `critical.css`, `theme-init.js`, and `settingsStore.ts`.
3. **Type tightening pass** — narrow `AppSettings.accentColor` to canonical values, delete the reverse rollback shim, update tests. Regression tests assert the aliases stay gone.

**Tech stack:** TypeScript strict mode, Zustand 5 (persist middleware), Vitest, Vite PWA, semantic CSS (no Tailwind in myK9Q). All changes are skin-level — no component behavior changes, no database changes, no migrations.

---

## Prerequisites Gate (manual — do not start Task 1 until all checked)

Phase 2 merged at commit `1525a310` on `2026-04-20`. Phase 3 tasks below are **blocked** until:

- [ ] **Grace period ≥ 30 days elapsed since Phase 2 merge** — target earliest merge date for Phase 3: **2026-05-20 or later**. This gives `runAccentMigration()` time to fire on every active user's device. Confirm the current date is ≥ 2026-05-20 before starting.
- [ ] **Consumer audit clean** — run the command in Task 0 and confirm no new `--checkin-*` or `.accent-green` / `.accent-orange` references have been introduced since Phase 2 shipped. If new references exist, migrate them first.
- [ ] **Phase 2 has been on staging for at least one full trial weekend** (spec §9 requirement) with no migration-shim bug reports in feedback channels.
- [ ] **[ADDED] `runAccentMigration()` still called in `main.tsx`** — run:
  ```bash
  rg -n 'runAccentMigration\(\)' apps/myk9q/src/main.tsx
  ```
  Expected: one match for the import, one for the call. If either is missing, stop — Phase 3 removes the reverse shim but relies on the forward shim continuing to run on boot.
- [ ] **[ADDED] Seed-data harness status check** — the spec defers authenticated canonical visual baselines to a separate sprint, "blocked on seed-data harness." Before starting Phase 3, check whether the harness has landed on `main`:
  ```bash
  rg -l 'seed-data|seedData' apps/myk9q/tests apps/myk9q/scripts packages/ 2>/dev/null
  ```
  If a seed-data harness has landed, ask the user whether to pull the visual baselines into this Phase 3 PR or leave them for a separate sprint. Default: leave them separate — Phase 3's scope is already tight. If the harness has not landed, proceed as planned (visual baselines stay deferred).
- [ ] **[ADDED] Test-runner hang policy acknowledgement** — root `CLAUDE.md` warns: "When test runners hang or appear stuck for more than 30 seconds, stop and report the issue rather than retrying in a loop. Known issue: test suite has pre-existing timeout/hanging problems." Apply this to every `pnpm test` step below — if vitest hangs for 30s+, stop, report, and debug; do not retry in a loop.

If any of the above is not satisfied, stop and notify the user. Do not proceed.

---

## File Structure — Files Touched in Phase 3

**Cross-app (`packages/`):**

- `packages/core/src/constants/check-in-status.ts` — rewrite `colorVar` / `textColorVar` strings from `--checkin-*` to `--status-*`.

**myK9Q app (`apps/myk9q/`):**

- `src/styles/design-tokens.css` — delete `--checkin-*` alias block (light + dark); rewrite the two `--token-placement-1` and `--token-status-in-ring` references that still use `var(--checkin-in-ring)` to use `var(--status-in-ring)`.
- `src/styles/__tests__/status-vocab.test.ts` — rewrite as a regression test that **no file** in `apps/myk9q/src` or `packages/core/src` contains `--checkin-*`.
- `src/styles/critical-inline.css` — migrate any remaining `--checkin-*` refs.
- `src/styles/utilities.css` — migrate.
- `src/pages/Stats/Stats.css` — migrate.
- `src/pages/EntryList/EntryList.css` — migrate.
- `src/pages/DogDetails/components/DogStatistics.css` — migrate.
- `src/pages/DogDetails/components/DogStatistics.tsx` — migrate.
- `src/pages/TVRunOrder/components/TVEntryCard.tsx` — migrate.
- `src/pages/scoresheets/shared-scoresheet.css` — migrate.
- `src/pages/scoresheets/AKC/scoresheet-shared.css` — migrate.
- `src/pages/Admin/auditLogStyles.ts` — migrate.
- `src/components/ui/shared-ui.css` — migrate.
- `src/components/dialogs/CheckinStatusDialog.css` — migrate.
- `src/components/dialogs/ClassRequirementsDialog.tsx` — migrate.
- `src/components/debug/subscriptionMonitorStyles.ts` — migrate.
- `src/components/announcements/AnnouncementComponents.css` — migrate.
- `src/components/DogCard.css` — migrate.
- `src/utils/statusIcons.tsx` — migrate.
- `public/critical.css` — replace `.accent-green` / `.accent-orange` blocks with `.accent-teal` / `.accent-terracotta` blocks, and migrate `--checkin-*` references.
- `public/theme-init.js` — drop `green` / `orange` entries from the `accentColors` map and from the `classList.remove` call list; add an inline legacy-normalize map (`green → teal`, `orange → terracotta`) as a belt-and-braces fallback in case a late-arriving user still has a stale localStorage value and the React-side shim has not yet run.
- `src/index.css` — remove `:root.accent-green` and `:root.accent-orange` blocks (lines ~232–251).
- `src/__tests__/accent-classes.test.ts` — rewrite as a regression test that the legacy accent blocks are **absent**.
- `src/stores/settingsStore.ts` — tighten `AppSettings.accentColor` union to `'teal' | 'terracotta' | 'blue' | 'purple'`; narrow `applyAccentColor` signature; drop `green` / `orange` entries from the local `accentColors` record and the `classList.remove` list. **Preserve** the INVARIANT comment at lines ~13–17 about `runAccentMigration()` running before store import — the forward shim still guards persisted-state drift.
- `src/stores/settingsStore.test.ts` — remove tests that depend on the legacy union variants; add a regression test that `defaultSettings.accentColor === 'teal'`.
- **[ADDED] `src/pages/Settings/sections/AppearanceSettings.tsx`** — the `selectedAccent` ternary at lines ~39–44 compares `settings.accentColor === 'green'` / `'orange'`; both comparisons become TypeScript errors once the union narrows. Collapse the ternary to `const selectedAccent: AccentOption = settings.accentColor;` — the runtime normalize paths in `theme-init.js` (Task 8) and `runAccentMigration()` (on boot) guarantee `settings.accentColor` is canonical before this component renders.
- **[ADDED] `src/pages/Settings/sections/AppearanceSettings.test.tsx`** — the `'maps legacy persisted "green" to teal for picker selection ring'` test (line ~43) depends on the legacy-value branch that Task 9 removes. Delete the test — it guards a code path that no longer exists, and the narrow union's `@ts-expect-error` in `settingsStore.test.ts` already enforces the invariant.
- **[ADDED] `src/utils/settingsMigration.test.ts`** — three fixtures (lines ~30, ~143, ~330) construct `accentColor: 'green'`. Replace each with `accentColor: 'teal'` (canonical). The migration code itself does not constrain accent values — it passes whatever is in the JSON through — so switching the fixtures does not weaken the test.
- **[ADDED] `src/services/smartDefaults.test.ts`** — line ~99 fixture `accentColor: 'green'` → `accentColor: 'teal'`. Same rationale.
- `src/utils/accentMigration.ts` — delete `runAccentMigrationReverse()` (see Decision Note in Task 11).
- `src/utils/accentMigration.test.ts` — delete the `runAccentMigrationReverse` describe block.
- `docs/DESIGN_REFERENCE.md` — remove any `@deprecated` callouts referring to the removed aliases; document Phase 3 completion in a short changelog entry.

**myK9Show app (`apps/myk9show/`):**

- `src/pages/scoring/styles/design-tokens.css` — migrate `--checkin-*` refs.
- `src/components/checkin/CheckInClassRow.tsx` — migrate.
- `src/components/checkin/CheckInProgressBar.tsx` — migrate.
- `src/components/checkin/CheckInExhibitorCard.tsx` — migrate.
- `src/components/checkin/__tests__/CheckInClassRow.test.tsx` — migrate assertion strings.
- `src/components/common/CheckInStatusBadge.test.tsx` — migrate assertion strings.

**Not touched (explicit non-goals — flagged separately):**

- `apps/myk9q/src/pages/Login/Login.css` defines a **local CSS variable** named `--accent-green` (line 18). This is a name collision with the body-class `.accent-green` being removed — it is a separate symbol (a custom var used inside Login.css for gradient accents) and is out of scope for Phase 3. Leave it as-is. If the name confuses future readers, file a separate follow-up to rename it (e.g., `--login-accent-green` → `--login-accent`).
- `--token-status-*` legacy aliases (spec §9.3 Phase 3 scope #2) — the user's Phase 3 brief does **not** list these; leave them alone this sprint and address in a follow-up if desired.
- Stylesheet deletion from the Phase 1 audit (spec §9.3 Phase 3 scope #4) — user's brief does not list this; out of scope.
- Playfair Display font import removal (spec §9.3 Phase 3 scope #5) — user's brief does not list this; out of scope.

---

## Task 0 — Consumer Audit (no code changes)

**Files:** none.

- [ ] **Step 1: Baseline the `--checkin-*` reference count**

Run:

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
rg -c '\-\-checkin-' apps/ packages/ | sort
```

Expected: a list of ~28 files (the `docs/` matches are expected and not blockers). Note the total count.

- [ ] **Step 2: Baseline the legacy-accent-class reference count**

Run:

```bash
rg -n '\.accent-(green|orange)|accent-(green|orange)\b' apps/myk9q/src apps/myk9q/public
```

Expected: references in `index.css`, `critical.css`, `theme-init.js`, `settingsStore.ts`, plus the two `__tests__/accent-classes.test.ts` / `settingsStore.test.ts` files. No other usages. If the grep surfaces an unfamiliar file, stop and investigate — somebody added a legacy reference after Phase 2 shipped.

- [ ] **Step 3: Baseline legacy-accent-value (settings) references across all of myK9Q**

Run:

```bash
rg -n "accentColor.*['\"](green|orange)['\"]|['\"](green|orange)['\"].*accentColor" apps/myk9q/src
rg -nw "'green'|'orange'" apps/myk9q/src
```

Expected (confirmed from Phase 2 state):

- `src/stores/settingsStore.ts` — type union + `applyAccentColor` signature + `accentColors` map + `classList.remove`
- `src/stores/settingsStore.test.ts` — test fixtures
- `src/utils/accentMigration.ts` — `ACCENT_RENAMES` map
- `src/utils/accentMigration.test.ts` — test fixtures
- `src/pages/Settings/sections/AppearanceSettings.tsx` — legacy-value ternary (lines ~39–44)
- `src/pages/Settings/sections/AppearanceSettings.test.tsx` — legacy-value test
- `src/utils/settingsMigration.test.ts` — three fixtures
- `src/services/smartDefaults.test.ts` — one fixture

If the grep surfaces anything outside this set, stop and investigate — it's a consumer added after Phase 2 that needs to be migrated first.

- [ ] **[ADDED] Step 4: Enumerate consumers of the `AppSettings['accentColor']` type**

```bash
rg -n "AppSettings\b|settings\.accentColor|accentColor:" apps/myk9q/src
```

Any file that reads `settings.accentColor` is a consumer of the narrowed type. Cross-reference against the "Files Touched" section above — if this grep surfaces a file not in that list and the file does any narrowing, switching, or equality comparison on `accentColor`, add it to the migration set.

- [ ] **Step 5: Save the baseline counts in the PR description draft**

You'll reference these counts in the final PR to prove the cleanup was complete. Keep them in a scratch note for now.

No commit — this is pure reconnaissance.

---

## Task 1 — Guardrail Regression Test: No `--checkin-*` in myK9Q / core

**Files:**

- Modify: `apps/myk9q/src/styles/__tests__/status-vocab.test.ts`

- [ ] **Step 1: Rewrite the test to assert the aliases are GONE**

Replace the entire file contents with:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../../../');

function grepCount(pattern: string, paths: string[]): number {
  try {
    const out = execSync(
      `rg --count-matches --no-messages --glob '!**/node_modules/**' -e ${JSON.stringify(pattern)} ${paths.map(p => JSON.stringify(p)).join(' ')}`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .reduce((sum, line) => sum + Number(line.split(':').pop() ?? 0), 0);
  } catch (err: unknown) {
    // rg exits non-zero when there are zero matches; that's a pass.
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return 0;
    throw err;
  }
}

describe('design-tokens.css — Phase 3 regression (--checkin-* removed)', () => {
  it('no --checkin-* references remain in apps/myk9q/src', () => {
    const count = grepCount('--checkin-', ['apps/myk9q/src']);
    expect(count).toBe(0);
  });

  it('no --checkin-* references remain in apps/myk9q/public', () => {
    const count = grepCount('--checkin-', ['apps/myk9q/public']);
    expect(count).toBe(0);
  });

  it('no --checkin-* references remain in packages/core/src', () => {
    const count = grepCount('--checkin-', ['packages/core/src']);
    expect(count).toBe(0);
  });

  it('design-tokens.css does not define any --checkin-* aliases', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
    expect(css).not.toMatch(/--checkin-[a-z-]+\s*:/);
  });

  it('canonical --status-* namespace still exists (smoke)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
    expect(css).toMatch(/--status-checked-in:/);
    expect(css).toMatch(/--status-pulled:/);
    expect(css).toMatch(/--status-in-ring:/);
    expect(css).toMatch(/--status-completed:/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it FAILS**

Run: `cd apps/myk9q && npx vitest run src/styles/__tests__/status-vocab.test.ts`

Expected: red. `--checkin-` is still referenced ~140+ times across the app; the first three assertions fail. Paste the failing output into the PR description draft — this is the "before" snapshot you'll compare against at the end.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/myk9q/src/styles/__tests__/status-vocab.test.ts
git commit -m "test(myk9q): Phase 3 regression test for --checkin-* removal (failing)

Placeholder RED test. Phase 3 cleanup tasks 2-6 will migrate
consumers and remove the alias block, flipping this to green.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2 — Migrate `packages/core/src/constants/check-in-status.ts`

**Files:**

- Modify: `packages/core/src/constants/check-in-status.ts`

- [ ] **Step 1: Rewrite the `colorVar` / `textColorVar` strings**

In `packages/core/src/constants/check-in-status.ts`, update the `CHECKIN_STATUS` record so every `colorVar` / `textColorVar` value points at a canonical `--status-*` token. Use replace-all on these specific pairs (do each with `Edit` replace_all to avoid typos):

| Old                           | New                          |
| ----------------------------- | ---------------------------- |
| `'--checkin-none'`            | `'--status-no-status'`       |
| `'--checkin-none-text'`       | `'--status-no-status-text'`  |
| `'--checkin-checked-in'`      | `'--status-checked-in'`      |
| `'--checkin-checked-in-text'` | `'--status-checked-in-text'` |
| `'--checkin-conflict'`        | `'--status-conflict'`        |
| `'--checkin-conflict-text'`   | `'--status-conflict-text'`   |
| `'--checkin-pulled'`          | `'--status-pulled'`          |
| `'--checkin-pulled-text'`     | `'--status-pulled-text'`     |
| `'--checkin-at-gate'`         | `'--status-at-gate'`         |
| `'--checkin-at-gate-text'`    | `'--status-at-gate-text'`    |
| `'--checkin-in-ring'`         | `'--status-in-ring'`         |
| `'--checkin-in-ring-text'`    | `'--status-in-ring-text'`    |

**Important — preserve existing visual behavior for `COME_TO_GATE`.** Today `COME_TO_GATE` uses `'--checkin-at-gate'` (purple), NOT `'--checkin-come-to-gate'`. That is intentional and ships today. Phase 3 preserves this — the replacement is `'--status-at-gate'`, not `'--status-come-to-gate'`. If the team later wants come-to-gate to render in its own color, that's a separate ticket.

- [ ] **Step 2: Verify no `--checkin-` strings remain in the file**

Run: `rg '\-\-checkin-' packages/core/src/constants/check-in-status.ts`
Expected: no output.

- [ ] **Step 3: Run `packages/core` tests (if any)**

Run: `cd packages/core && pnpm test` (or from root: `pnpm -F @myk9/core test` if that filter exists).
Expected: green. If the package has no tests, move on.

- [ ] **Step 4: Run typecheck across the monorepo**

Run: `pnpm typecheck`
Expected: green. The change is string-content only — no types move.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/constants/check-in-status.ts
git commit -m "refactor(core): migrate check-in-status colorVars to --status-* tokens

Phase 3 of myK9Q design system v2 cleanup. Legacy --checkin-*
CSS custom properties become unreferenced after this commit in
the core package; design-tokens.css alias definitions will be
removed in a later Phase 3 commit once all consumers migrate.

Preserves existing visual behavior — COME_TO_GATE continues to
use --status-at-gate (purple), matching the Phase 2 behavior.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3 — Migrate myK9Q stylesheets (mechanical sweep)

**Files:**

- Modify: all myK9Q stylesheets listed below in one commit.

- [ ] **Step 1: List the consumers**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
rg -l '\-\-checkin-' apps/myk9q/src apps/myk9q/public | sort
```

Expected output (exact set):

```
apps/myk9q/public/critical.css
apps/myk9q/src/components/DogCard.css
apps/myk9q/src/components/announcements/AnnouncementComponents.css
apps/myk9q/src/components/debug/subscriptionMonitorStyles.ts
apps/myk9q/src/components/dialogs/CheckinStatusDialog.css
apps/myk9q/src/components/dialogs/ClassRequirementsDialog.tsx
apps/myk9q/src/components/ui/shared-ui.css
apps/myk9q/src/pages/Admin/auditLogStyles.ts
apps/myk9q/src/pages/DogDetails/components/DogStatistics.css
apps/myk9q/src/pages/DogDetails/components/DogStatistics.tsx
apps/myk9q/src/pages/EntryList/EntryList.css
apps/myk9q/src/pages/Stats/Stats.css
apps/myk9q/src/pages/TVRunOrder/components/TVEntryCard.tsx
apps/myk9q/src/pages/scoresheets/AKC/scoresheet-shared.css
apps/myk9q/src/pages/scoresheets/shared-scoresheet.css
apps/myk9q/src/styles/critical-inline.css
apps/myk9q/src/styles/design-tokens.css  # handled separately in Task 5
apps/myk9q/src/styles/utilities.css
apps/myk9q/src/utils/statusIcons.tsx
```

(Plus the one test file from Task 1 — already on green path.)

- [ ] **Step 2: For each file except `design-tokens.css`, do a replace-all token-by-token**

For each file from Step 1 **other than `src/styles/design-tokens.css`**, open with `Read` then apply `Edit` with `replace_all: true` for each of these mappings (exhaustive — same list as Task 2 plus the `-bg` / `-text` variants that appear in CSS):

| Old                         | New                        |
| --------------------------- | -------------------------- |
| `--checkin-none`            | `--status-no-status`       |
| `--checkin-none-text`       | `--status-no-status-text`  |
| `--checkin-none-bg`         | `--status-no-status-bg`    |
| `--checkin-checked-in`      | `--status-checked-in`      |
| `--checkin-checked-in-text` | `--status-checked-in-text` |
| `--checkin-checked-in-bg`   | `--status-checked-in-bg`   |
| `--checkin-conflict`        | `--status-conflict`        |
| `--checkin-conflict-text`   | `--status-conflict-text`   |
| `--checkin-conflict-bg`     | `--status-conflict-bg`     |
| `--checkin-pulled`          | `--status-pulled`          |
| `--checkin-pulled-text`     | `--status-pulled-text`     |
| `--checkin-pulled-bg`       | `--status-pulled-bg`       |
| `--checkin-at-gate`         | `--status-at-gate`         |
| `--checkin-at-gate-text`    | `--status-at-gate-text`    |
| `--checkin-at-gate-bg`      | `--status-at-gate-bg`      |
| `--checkin-in-ring`         | `--status-in-ring`         |
| `--checkin-in-ring-text`    | `--status-in-ring-text`    |
| `--checkin-in-ring-bg`      | `--status-in-ring-bg`      |

**Ordering matters inside a single Edit call.** Replace longer keys first (e.g., `--checkin-checked-in-text` before `--checkin-checked-in`) so a shorter prefix doesn't partially match a longer key. Since `replace_all` replaces all non-overlapping matches of the exact string, doing each call separately in the order above (short → long) is fine — just do one `Edit` call per mapping, not a single multi-substring pass.

**Safer:** apply in **longest-first** order:

1. `--checkin-checked-in-text` → `--status-checked-in-text`
2. `--checkin-checked-in-bg` → `--status-checked-in-bg`
3. `--checkin-checked-in` → `--status-checked-in`
4. `--checkin-in-ring-text` → `--status-in-ring-text`
5. `--checkin-in-ring-bg` → `--status-in-ring-bg`
6. `--checkin-in-ring` → `--status-in-ring`
7. `--checkin-at-gate-text` → `--status-at-gate-text`
8. `--checkin-at-gate-bg` → `--status-at-gate-bg`
9. `--checkin-at-gate` → `--status-at-gate`
10. `--checkin-conflict-text` → `--status-conflict-text`
11. `--checkin-conflict-bg` → `--status-conflict-bg`
12. `--checkin-conflict` → `--status-conflict`
13. `--checkin-pulled-text` → `--status-pulled-text`
14. `--checkin-pulled-bg` → `--status-pulled-bg`
15. `--checkin-pulled` → `--status-pulled`
16. `--checkin-none-text` → `--status-no-status-text`
17. `--checkin-none-bg` → `--status-no-status-bg`
18. `--checkin-none` → `--status-no-status`

- [ ] **Step 3: Verify each file touched has no `--checkin-` remaining**

After each file, run: `rg '\-\-checkin-' <path-to-file>`
Expected: no output.

- [ ] **Step 4: After all files are done, verify the whole myK9Q tree is clean**

```bash
rg '\-\-checkin-' apps/myk9q/src apps/myk9q/public
```

Expected: only `apps/myk9q/src/styles/design-tokens.css` remains (that's the alias block itself — Task 5 removes it).

- [ ] **Step 5: Run myK9Q tests**

```bash
cd apps/myk9q && pnpm test
```

Expected: all existing tests pass. `status-vocab.test.ts` from Task 1 **still fails** (design-tokens.css still defines the aliases) — that's correct; it flips green after Task 5.

- [ ] **Step 6: Run typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: green.

- [ ] **Step 7: Visual smoke test — run dev server and check the five canonical screens**

```bash
pnpm dev:q
```

Then on `localhost:5173`, log in as judge (`jf472`) and walk:

1. Show detail → confirm status badges on class tiles render correctly (checked-in = teal, pulled = red, etc.).
2. Class list → same check.
3. Entry list → confirm entry-row checkin badges render (teal / purple / blue / amber / red).
4. A scoresheet (any class) → confirm scoresheet status colors render (if the scoresheet uses status tokens at all).
5. The Podium → no status colors, but confirm no regression.

No pixel-diff required here — this is a smoke check that the token rename didn't accidentally break a hex. If anything looks off (badge renders transparent or black), a mapping was missed. Debug before committing.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9q/src apps/myk9q/public
git commit -m "refactor(myk9q): migrate --checkin-* consumers to --status-* tokens

Phase 3 of myK9Q design system v2 cleanup. All stylesheet and
component references to the deprecated --checkin-* aliases now
point at the canonical --status-* namespace. Zero visual change —
the aliases were already wired via var(--status-*) since Phase 2.

Remaining --checkin-* references in apps/myk9q/src/styles/
design-tokens.css (the alias block itself) are removed in the
next commit.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4 — Migrate myK9Show checkin consumers

**Files:**

- Modify: `apps/myk9show/src/pages/scoring/styles/design-tokens.css`
- Modify: `apps/myk9show/src/components/checkin/CheckInClassRow.tsx`
- Modify: `apps/myk9show/src/components/checkin/CheckInProgressBar.tsx`
- Modify: `apps/myk9show/src/components/checkin/CheckInExhibitorCard.tsx`
- Modify: `apps/myk9show/src/components/checkin/__tests__/CheckInClassRow.test.tsx`
- Modify: `apps/myk9show/src/components/common/CheckInStatusBadge.test.tsx`

- [ ] **Step 1: Confirm the canonical `--status-*` tokens exist in myK9Show's scoring design-tokens.css**

```bash
rg '^\s*--status-(checked-in|at-gate|come-to-gate|in-ring|conflict|pulled|no-status|completed):' apps/myk9show/src/pages/scoring/styles/design-tokens.css
```

Expected: matches for each canonical status. If any are missing, stop — you need to add them before removing `--checkin-*`. (Verify by reading the file; if missing, add them using the same hex values from `apps/myk9q/src/styles/design-tokens.css`.)

- [ ] **Step 2: Apply the same longest-first token migration as Task 3 Step 2**

Iterate through all six files and apply the same 18-step replacement list.

- [ ] **Step 3: Verify myK9Show is clean**

```bash
rg '\-\-checkin-' apps/myk9show/src
```

Expected: no output.

- [ ] **Step 4: Run myK9Show tests**

```bash
cd apps/myk9show && pnpm test -- src/components/checkin src/components/common/CheckInStatusBadge.test.tsx
```

Expected: green.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: green.

- [ ] **Step 6: Visual smoke — myK9Show dev server**

```bash
pnpm dev:show
```

Log in, navigate to a show's Check-In page, verify status colors on `CheckInClassRow` / `CheckInProgressBar` / `CheckInExhibitorCard` render correctly.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src
git commit -m "refactor(myk9show): migrate check-in components to --status-* tokens

Phase 3 of myK9Q design system v2 cleanup. myK9Show's check-in
surfaces now reference canonical --status-* tokens from scoring's
design-tokens.css instead of the deprecated --checkin-* aliases.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5 — Remove `--checkin-*` alias block from `design-tokens.css`

**Files:**

- Modify: `apps/myk9q/src/styles/design-tokens.css`

- [ ] **Step 1: Delete the light-mode `--checkin-*` alias block**

In `apps/myk9q/src/styles/design-tokens.css`, delete the entire `/* Check-in Status Colors — @deprecated ... */` comment and all `--checkin-*` declarations that follow (current line range ~111–133, and the separate `--checkin-in-ring` declaration at line ~195–197).

**Verify by reading before editing** — line numbers drift. Use the `Edit` tool with `old_string` containing the full deprecation comment block through the last `--checkin-in-ring-text` definition, and `new_string` as empty or a single comment like `/* --checkin-* aliases removed in v2 Phase 3 — use --status-* directly. */`.

- [ ] **Step 2: Migrate the two internal references to `--checkin-in-ring`**

Search for remaining `--checkin-in-ring` usages inside `design-tokens.css` itself. Current lines:

- `--token-placement-1: var(--checkin-in-ring);` → `--token-placement-1: var(--status-in-ring);`
- Light-mode `--token-status-in-ring: var(--checkin-in-ring);` → `--token-status-in-ring: var(--status-in-ring);`
- Light-mode `--token-status-in-ring-bg: var(--checkin-in-ring);` → `--token-status-in-ring-bg: var(--status-in-ring);`
- Dark-mode `--token-status-in-ring: var(--checkin-in-ring);` → `--token-status-in-ring: var(--status-in-ring);`
- Dark-mode `--token-status-in-ring-bg: var(--checkin-in-ring);` → `--token-status-in-ring-bg: var(--status-in-ring);`

Use `Edit` with `replace_all: true` and `old_string: var(--checkin-in-ring)` → `new_string: var(--status-in-ring)`.

- [ ] **Step 3: Verify no `--checkin-` remains anywhere in the file**

```bash
rg '\-\-checkin-' apps/myk9q/src/styles/design-tokens.css
```

Expected: no output.

- [ ] **Step 4: Run the regression test from Task 1**

```bash
cd apps/myk9q && npx vitest run src/styles/__tests__/status-vocab.test.ts
```

Expected: **all 5 tests green**. If red, re-inspect the file that the grep is still finding.

- [ ] **Step 5: Run the full myK9Q test suite**

```bash
cd apps/myk9q && pnpm test
```

Expected: green.

- [ ] **Step 6: Visual smoke test (abbreviated)**

Run `pnpm dev:q`, log in as judge, check that one status badge on the show detail page still renders with color — a missing `--checkin-*` reference would produce an unstyled badge. If all looks OK, proceed.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9q/src/styles/design-tokens.css
git commit -m "refactor(myk9q): remove --checkin-* deprecation aliases

Phase 3 of myK9Q design system v2 cleanup. The --checkin-* alias
block is removed from design-tokens.css now that every consumer
(packages/core, myK9Q, myK9Show checkin components) references
the canonical --status-* namespace directly.

The regression test at src/styles/__tests__/status-vocab.test.ts
(added in the previous commit as RED) now passes, guarding
against any future re-introduction of the aliases.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6 — Remove `.accent-green` / `.accent-orange` from `index.css`

**Files:**

- Modify: `apps/myk9q/src/index.css`
- Modify: `apps/myk9q/src/__tests__/accent-classes.test.ts`

- [ ] **Step 1: Rewrite `accent-classes.test.ts` as a regression test (failing)**

Replace the full contents of `apps/myk9q/src/__tests__/accent-classes.test.ts` with:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('index.css — Phase 3 regression (legacy accent blocks removed)', () => {
  let css: string;

  beforeAll(() => {
    css = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  });

  it('canonical .accent-teal still defined with teal primary', () => {
    expect(css).toMatch(/:root\.accent-teal\s*\{[^}]*--primary:\s*#14b8a6/);
  });

  it('canonical .accent-terracotta still defined with terracotta primary', () => {
    expect(css).toMatch(/:root\.accent-terracotta\s*\{[^}]*--primary:\s*#c96442/);
  });

  it('canonical .accent-blue still defined', () => {
    expect(css).toMatch(/:root\.accent-blue\s*\{[^}]*--primary:\s*#3b82f6/);
  });

  it('canonical .accent-purple still defined', () => {
    expect(css).toMatch(/:root\.accent-purple\s*\{[^}]*--primary:\s*#8b5cf6/);
  });

  it('legacy .accent-green block removed', () => {
    expect(css).not.toMatch(/:root\.accent-green\s*\{/);
  });

  it('legacy .accent-orange block removed', () => {
    expect(css).not.toMatch(/:root\.accent-orange\s*\{/);
  });

  it('deprecation comment removed', () => {
    expect(css).not.toMatch(/legacy accent class aliases/i);
  });
});
```

- [ ] **Step 2: Run the test to confirm it FAILS (legacy blocks still present)**

```bash
cd apps/myk9q && npx vitest run src/__tests__/accent-classes.test.ts
```

Expected: the last three assertions fail.

- [ ] **Step 3: Remove the `.accent-green` and `.accent-orange` blocks from `index.css`**

Open `apps/myk9q/src/index.css` and delete the deprecation comment plus the two `:root.accent-green { ... }` and `:root.accent-orange { ... }` blocks (current lines ~232–251). Use `Edit` with the exact block as `old_string` and empty `new_string` (or a single blank line).

- [ ] **Step 4: Verify the test now passes**

```bash
cd apps/myk9q && npx vitest run src/__tests__/accent-classes.test.ts
```

Expected: 7/7 green.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9q/src/index.css apps/myk9q/src/__tests__/accent-classes.test.ts
git commit -m "refactor(myk9q): remove .accent-green/.accent-orange class aliases

Phase 3 of myK9Q design system v2 cleanup. The legacy accent
class blocks are removed from index.css. Users whose localStorage
was rewritten by runAccentMigration() during the Phase 2 grace
period now render on the canonical .accent-teal / .accent-terracotta
classes; theme-init.js also normalizes any still-stale localStorage
values (see next commit).

Regression test at src/__tests__/accent-classes.test.ts enforces
that the legacy blocks stay gone.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7 — Migrate `public/critical.css` accent blocks

**Files:**

- Modify: `apps/myk9q/public/critical.css`

`critical.css` is loaded as a blocking `<link>` in `index.html` before any React bundle, so it needs the same canonical + updated-hex treatment.

- [ ] **Step 1: Read the current accent block (lines ~124–162)**

Open the file and confirm the current state: `.accent-green` with `#14b8a6`, `.accent-orange` with `#f97316` (legacy orange hex, NOT the Phase 2 terracotta).

- [ ] **Step 2: Replace `.accent-green` / `.accent-orange` blocks with `.accent-teal` / `.accent-terracotta`**

Use `Edit` to replace the entire 35-line block. New block:

```css
/* ============================================
   ACCENT COLOR THEMES
   (Applied by theme-init.js synchronously)
   ============================================ */
:root.accent-teal,
html.accent-teal {
  --primary: #14b8a6;
  --primary-hover: #0d9488;
  --accent-primary: #14b8a6;
  --accent-color: #14b8a6;
  --accent-glow: rgba(20, 184, 166, 0.3);
}

:root.accent-blue,
html.accent-blue {
  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --accent-primary: #3b82f6;
  --accent-color: #3b82f6;
  --accent-glow: rgba(59, 130, 246, 0.3);
}

:root.accent-terracotta,
html.accent-terracotta {
  --primary: #c96442;
  --primary-hover: #a0502f;
  --accent-primary: #c96442;
  --accent-color: #c96442;
  --accent-glow: rgba(201, 100, 66, 0.3);
}

:root.accent-purple,
html.accent-purple {
  --primary: #8b5cf6;
  --primary-hover: #7c3aed;
  --accent-primary: #8b5cf6;
  --accent-color: #8b5cf6;
  --accent-glow: rgba(139, 92, 246, 0.3);
}
```

- [ ] **Step 3: Bump the `?v=` cache buster in `index.html`**

In `apps/myk9q/index.html`, find `<link rel="stylesheet" href="/critical.css?v=13" />` and bump to `?v=14`. This forces browsers to drop cached copies of `critical.css` on first reload after deploy.

- [ ] **Step 4: Verify no `.accent-green` / `.accent-orange` remain in the file**

```bash
rg '\.accent-(green|orange)|accent-(green|orange)\b' apps/myk9q/public/critical.css
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9q/public/critical.css apps/myk9q/index.html
git commit -m "refactor(myk9q): migrate critical.css accent blocks to v2 canonicals

Phase 3 of myK9Q design system v2 cleanup. The inline critical
stylesheet now defines .accent-teal and .accent-terracotta with
the correct v2 hexes (#14b8a6 / #c96442); the legacy .accent-green
/ .accent-orange blocks are removed. Cache buster bumped to v=14.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8 — Update `theme-init.js` (drop legacy accents, keep inline normalize shim)

**Files:**

- Modify: `apps/myk9q/public/theme-init.js`

**Design decision (belt-and-braces):** the user's brief says "drop green/orange entries from accentColors map." We do that, **but** we also add a tiny inline normalize shim at the top of `applyAccentColorClass()` that rewrites `green → teal` and `orange → terracotta` before applying the class. Rationale: `theme-init.js` runs as a blocking synchronous script **before** React (and before `runAccentMigration()` in `main.tsx`). A user whose localStorage still holds `'green'` — maybe they restored settings from a cloud backup on a new device minutes before this PR ships — would otherwise get `.accent-green` on `<html>` with no matching CSS block, falling back to whatever the `:root` defaults are (off-brand). A 4-line inline map eliminates that edge case without re-introducing a named deprecation path. This shim can be removed in a later sprint if desired; keep it indefinitely if the author prefers.

- [ ] **Step 1: Add an inline legacy-normalize map**

At the top of `applyAccentColorClass()` (currently line ~94), insert:

```javascript
// Legacy accent values (v1) — normalize to canonical before applying.
// Safety net for users whose localStorage predates runAccentMigration().
var LEGACY_ACCENT_RENAMES = { green: 'teal', orange: 'terracotta' };
if (LEGACY_ACCENT_RENAMES[color]) {
  color = LEGACY_ACCENT_RENAMES[color];
}
```

- [ ] **Step 2: Drop `green` / `orange` from the `classList.remove(...)` call**

Currently (~line 98):

```javascript
html.classList.remove(
  'accent-teal',
  'accent-terracotta',
  'accent-blue',
  'accent-purple',
  'accent-green',
  'accent-orange'
);
```

becomes:

```javascript
html.classList.remove('accent-teal', 'accent-terracotta', 'accent-blue', 'accent-purple');
```

- [ ] **Step 3: Drop `green` / `orange` from the `accentColors` map**

Currently (~line 113):

```javascript
var accentColors = {
  teal: '#14b8a6',
  terracotta: '#c96442',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  green: '#14b8a6',
  orange: '#c96442',
};
```

becomes:

```javascript
var accentColors = {
  teal: '#14b8a6',
  terracotta: '#c96442',
  blue: '#3b82f6',
  purple: '#8b5cf6',
};
```

- [ ] **Step 4: Bump the VERSION comment**

At the top of the file, update `VERSION: 2.2 - v2 teal/terracotta accents + outdoor mode` to `VERSION: 2.3 - v2 Phase 3 cleanup (legacy accent classes removed)`.

- [ ] **[ADDED] Step 4a: Bump the cache-buster query string on the `<script>` tag**

`apps/myk9q/index.html` line ~87 currently has `<script src="/theme-init.js?v=7"></script>`. Update to `?v=8`. PWAs that cached the previous copy will otherwise serve dead `green` / `orange` entries from their cache — even though the inline normalize shim (Steps 1–3) protects correctness at the class level, the `accentColors` meta-theme-color map in the cached copy would still map legacy values to the same canonical hex, which is fine — but the `classList.remove` list, which no longer strips `accent-green` / `accent-orange`, is the real problem: a cached `<html>` from a prior session could retain a stale `accent-green` class that never gets removed on the next navigation. Bumping the buster forces a fresh fetch on deploy.

- [ ] **Step 5: Verify the file still parses**

```bash
node --check apps/myk9q/public/theme-init.js
```

Expected: no output (success).

- [ ] **Step 6: Smoke test the flow**

Run `pnpm dev:q`, open DevTools → Application → Local Storage → set `myK9Q_settings` to `{"state":{"settings":{"accentColor":"green","theme":"light"}},"version":0}` and reload. Confirm `<html>` ends up with class `accent-teal` (not `accent-green`) and the page renders in teal. Repeat for `"orange"` → `accent-terracotta`. Clear the manual setting when done.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9q/public/theme-init.js apps/myk9q/index.html
git commit -m "refactor(myk9q): drop legacy accent values from theme-init.js

Phase 3 of myK9Q design system v2 cleanup. The blocking theme
script no longer lists 'green' / 'orange' in its class-remove or
accentColors map. A small inline legacy-normalize shim rewrites
any still-stale localStorage value before applying the class, so
a user whose settings predate runAccentMigration() still renders
on the canonical .accent-teal / .accent-terracotta.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9 — Tighten `AppSettings.accentColor` type + invariant test

**Files:**

- Modify: `apps/myk9q/src/stores/settingsStore.ts`
- Modify: `apps/myk9q/src/stores/settingsStore.test.ts`
- **[ADDED]** Modify: `apps/myk9q/src/pages/Settings/sections/AppearanceSettings.tsx`
- **[ADDED]** Modify: `apps/myk9q/src/pages/Settings/sections/AppearanceSettings.test.tsx`
- **[ADDED]** Modify: `apps/myk9q/src/utils/settingsMigration.test.ts`
- **[ADDED]** Modify: `apps/myk9q/src/services/smartDefaults.test.ts`

**[ADDED] Why these four extra files:** Task 0 Step 3 surfaced that four files outside `settingsStore.ts` / `accentMigration.ts` reference the legacy `'green'` / `'orange'` string values. Narrowing `AppSettings.accentColor` without touching them will break typecheck. These edits must happen in the same commit as the type narrowing, not a follow-up.

- [ ] **Step 1: Write the invariant test FIRST (test-first per CLAUDE.md)**

In `apps/myk9q/src/stores/settingsStore.test.ts`, inside the existing `describe('settingsStore', ...)` block, add a new nested describe at the top:

```typescript
describe('accentColor invariants (Phase 3)', () => {
  it('defaultSettings.accentColor is a canonical v2 value', () => {
    const { settings } = useSettingsStore.getState();
    expect(['teal', 'terracotta', 'blue', 'purple']).toContain(settings.accentColor);
  });

  it('updateSettings rejects legacy accent values at the type level', () => {
    // Compile-time invariant — this file will fail `tsc --noEmit` if
    // AppSettings.accentColor still includes 'green' | 'orange'.
    // @ts-expect-error — 'green' is not an AppSettings.accentColor variant
    useSettingsStore.getState().updateSettings({ accentColor: 'green' });
    // @ts-expect-error — 'orange' is not an AppSettings.accentColor variant
    useSettingsStore.getState().updateSettings({ accentColor: 'orange' });
  });
});
```

- [ ] **Step 2: Confirm the test FAILS at typecheck**

Run: `cd apps/myk9q && pnpm typecheck`

Expected: the `@ts-expect-error` directives **themselves** fail — because today `'green' | 'orange'` are still in the union, passing them is legal, so `@ts-expect-error` triggers "unused error suppression." That's the failing state we want. Runtime: the first test passes today.

- [ ] **Step 3: Tighten the `AppSettings.accentColor` union**

In `apps/myk9q/src/stores/settingsStore.ts`, replace:

```typescript
accentColor: 'teal' | 'terracotta' | 'blue' | 'purple' | 'green' | 'orange';
```

with:

```typescript
accentColor: 'teal' | 'terracotta' | 'blue' | 'purple';
```

Also tighten the `applyAccentColor` parameter type:

```typescript
function applyAccentColor(color: 'teal' | 'terracotta' | 'blue' | 'purple' | 'green' | 'orange') {
```

→

```typescript
function applyAccentColor(color: 'teal' | 'terracotta' | 'blue' | 'purple') {
```

- [ ] **Step 4: Drop legacy values from the `applyAccentColor` internals**

In the same function, shorten the `classList.remove(...)` call from:

```typescript
root.classList.remove(
  'accent-green',
  'accent-blue',
  'accent-orange',
  'accent-purple',
  'accent-teal',
  'accent-terracotta'
);
```

to:

```typescript
root.classList.remove('accent-teal', 'accent-terracotta', 'accent-blue', 'accent-purple');
```

And shorten the `accentColors` record from:

```typescript
const accentColors: Record<string, string> = {
  teal: '#14b8a6',
  terracotta: '#c96442',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  green: '#14b8a6',
  orange: '#c96442',
};
```

to:

```typescript
const accentColors: Record<string, string> = {
  teal: '#14b8a6',
  terracotta: '#c96442',
  blue: '#3b82f6',
  purple: '#8b5cf6',
};
```

- [ ] **Step 5: Update the comment above `accentColor`**

Replace:

```typescript
// Includes legacy values ('green', 'orange') for persisted-state
// tolerance. The accent migration shim rewrites them to canonical
// 'teal'/'terracotta' on first app load; new writes from the UI use
// canonical values only.
```

with:

```typescript
// Phase 3: legacy 'green' / 'orange' values removed from the union.
// runAccentMigration() in main.tsx still rewrites any stale persisted
// value on boot; theme-init.js also normalizes legacy values before
// applying the class, so in-flight persisted legacy values render
// correctly even before the migration shim fires.
```

- [ ] **Step 6: Remove any legacy-accent tests from `settingsStore.test.ts`**

Search `apps/myk9q/src/stores/settingsStore.test.ts` for any test that constructs `accentColor: 'green'` or `'orange'`. If any exist, delete them — they're no longer type-valid. If the test file type-casts a legacy value via `as unknown as AppSettings['accentColor']`, delete the cast + the test.

- [ ] **[ADDED] Step 6a: Collapse the legacy-value ternary in `AppearanceSettings.tsx`**

In `apps/myk9q/src/pages/Settings/sections/AppearanceSettings.tsx`, replace this block (lines ~36–44):

```typescript
// Legacy persisted values ('green', 'orange') render as teal/terracotta
// respectively — map to the canonical option for the picker's selection
// ring so the UI reflects what the user actually sees on screen.
const selectedAccent: AccentOption =
  settings.accentColor === 'green'
    ? 'teal'
    : settings.accentColor === 'orange'
      ? 'terracotta'
      : (settings.accentColor as AccentOption);
```

with:

```typescript
// Phase 3: AppSettings.accentColor is narrowed to canonical values only.
// Legacy 'green' / 'orange' persisted values are rewritten to canonical
// by runAccentMigration() on app boot and by theme-init.js's inline
// normalize shim, so settings.accentColor is always an AccentOption here.
const selectedAccent: AccentOption = settings.accentColor;
```

- [ ] **[ADDED] Step 6b: Remove the legacy-mapping test from `AppearanceSettings.test.tsx`**

In `apps/myk9q/src/pages/Settings/sections/AppearanceSettings.test.tsx`, delete the entire `it('maps legacy persisted "green" to teal for picker selection ring', ...)` block (lines ~43–50). That code path no longer exists.

- [ ] **[ADDED] Step 6c: Rewrite legacy fixtures in `settingsMigration.test.ts`**

In `apps/myk9q/src/utils/settingsMigration.test.ts`, replace every `accentColor: 'green'` with `accentColor: 'teal'` (three occurrences at lines ~30, ~143, ~330 per the Task 0 audit — use `Edit replace_all` on the exact string `accentColor: 'green'` → `accentColor: 'teal'`). Verify no other legacy values remain:

```bash
rg -n "accentColor.*['\"](green|orange)['\"]" apps/myk9q/src/utils/settingsMigration.test.ts
```

Expected: no output.

- [ ] **[ADDED] Step 6d: Rewrite legacy fixture in `smartDefaults.test.ts`**

In `apps/myk9q/src/services/smartDefaults.test.ts`, replace `accentColor: 'green'` (line ~99) with `accentColor: 'teal'`. Same verify grep.

- [ ] **Step 7: Run the invariant test + typecheck**

```bash
cd apps/myk9q && pnpm test && pnpm typecheck
```

Expected: all tests pass; the two `@ts-expect-error` directives now correctly flag legal errors (since `'green'` / `'orange'` are no longer valid).

- [ ] **Step 8: Lint**

```bash
pnpm lint
```

Expected: green.

- [ ] **Step 9: Commit**

```bash
git add \
  apps/myk9q/src/stores/settingsStore.ts \
  apps/myk9q/src/stores/settingsStore.test.ts \
  apps/myk9q/src/pages/Settings/sections/AppearanceSettings.tsx \
  apps/myk9q/src/pages/Settings/sections/AppearanceSettings.test.tsx \
  apps/myk9q/src/utils/settingsMigration.test.ts \
  apps/myk9q/src/services/smartDefaults.test.ts
git commit -m "refactor(myk9q): tighten AppSettings.accentColor to canonical v2 values

Phase 3 of myK9Q design system v2 cleanup. AppSettings.accentColor
narrows from

  'teal' | 'terracotta' | 'blue' | 'purple' | 'green' | 'orange'

to

  'teal' | 'terracotta' | 'blue' | 'purple'

New invariant test at src/stores/settingsStore.test.ts enforces
the narrow union at the type level via @ts-expect-error. Dead
'green' / 'orange' entries are dropped from applyAccentColor's
internal class-remove list and meta theme-color map.

Type-ripple fixes in the same commit:
- AppearanceSettings.tsx: collapse legacy-value ternary to a
  direct assignment (runtime normalizers guarantee canonical).
- AppearanceSettings.test.tsx: delete the legacy-mapping test
  (it guarded a code path that no longer exists).
- settingsMigration.test.ts / smartDefaults.test.ts: replace
  'green' fixtures with 'teal'.

runAccentMigration() in main.tsx still runs on boot to rewrite
any stale persisted legacy value before the store hydrates.
Combined with theme-init.js's inline normalize shim, no user
sees an unstyled accent class.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10 — Delete `runAccentMigrationReverse()` + its tests

**Files:**

- Modify: `apps/myk9q/src/utils/accentMigration.ts`
- Modify: `apps/myk9q/src/utils/accentMigration.test.ts`

**Decision: remove the reverse shim.**

Rationale (answer to the user's "Decide:" question): `runAccentMigrationReverse()` exists to roll back Phase 2 by rewriting canonical values back to legacy. That path relies on the legacy `.accent-green` / `.accent-orange` CSS blocks being defined. After Phase 3 removes those blocks, a reverse migration would leave users with a `.accent-green` class that matches no stylesheet, producing an unstyled (off-brand) render. The reverse path is no longer useful after Phase 3.

If a future rollback from v2 → v1 is ever needed, it's a larger operation (re-introducing the v1 accent blocks and theme-init map) and the reverse shim would need to be rewritten anyway. Keeping dead code "just in case" violates YAGNI.

- [ ] **Step 1: Delete `runAccentMigrationReverse` from `accentMigration.ts`**

Remove the `export function runAccentMigrationReverse()` definition and its JSDoc comment. The resulting file keeps only `runAccentMigration()`, `migrateWith`, `ACCENT_RENAMES`, `STORAGE_KEY`, and the `PersistedSettings` interface.

- [ ] **Step 2: Delete the `describe('runAccentMigrationReverse', ...)` block from the test file**

In `apps/myk9q/src/utils/accentMigration.test.ts`, remove the entire second `describe('runAccentMigrationReverse', ...)` block (current lines ~138–179) **and** remove `runAccentMigrationReverse` from the top-level import at line 2.

- [ ] **Step 3: Run the accent migration tests**

```bash
cd apps/myk9q && npx vitest run src/utils/accentMigration.test.ts
```

Expected: the forward-migration tests (10 cases) all pass.

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: green. If anything outside this file imported `runAccentMigrationReverse` (it shouldn't — spec-tracked as "kept for rollback, not invoked in normal operation"), the typecheck will fail with a clear error. Resolve by removing the import.

```bash
rg 'runAccentMigrationReverse' apps/ packages/
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9q/src/utils/accentMigration.ts apps/myk9q/src/utils/accentMigration.test.ts
git commit -m "refactor(myk9q): remove runAccentMigrationReverse rollback shim

Phase 3 of myK9Q design system v2 cleanup. The reverse migration
shim was kept for Phase 2 rollback safety; after Phase 3 removes
the .accent-green / .accent-orange CSS blocks, the reverse path
would leave users with unstyled accent classes, so the shim no
longer has a safe rollback target. Deleted per YAGNI.

Forward runAccentMigration() stays in place — it's still invoked
on every app boot from main.tsx as a safety net for users with
stale persisted state.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11 — Update `DESIGN_REFERENCE.md`

**Files:**

- Modify: `apps/myk9q/docs/DESIGN_REFERENCE.md`

- [ ] **Step 1: Find deprecation callouts**

```bash
rg -n 'deprecated|--checkin-|accent-green|accent-orange|Phase 3' apps/myk9q/docs/DESIGN_REFERENCE.md
```

For each hit:

- `@deprecated` notes on `--checkin-*` → remove entirely.
- References to `.accent-green` / `.accent-orange` as "legacy/deprecated aliases" → remove the sentence; leave only the canonical class list (`.accent-teal` / `.accent-terracotta` / `.accent-blue` / `.accent-purple`).
- "Will be removed in Phase 3" forward-references → remove, since Phase 3 has now shipped.

- [ ] **Step 2: Add a brief Phase 3 changelog entry**

At the top of the document's history section (or at the end if there's no changelog, in a new `## Changelog` section), add:

```markdown
- **2026-05-20 — v2 Phase 3 (cleanup):** Removed `--checkin-*` deprecation aliases from `design-tokens.css`; migrated all consumers to canonical `--status-*` tokens. Removed `.accent-green` / `.accent-orange` CSS class aliases. Narrowed `AppSettings.accentColor` to `'teal' | 'terracotta' | 'blue' | 'purple'`. Deleted `runAccentMigrationReverse()` (see plan `docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-3.md`).
```

(Use the actual merge date when the PR lands.)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9q/docs/DESIGN_REFERENCE.md
git commit -m "docs(myk9q): remove Phase 3 deprecation callouts from DESIGN_REFERENCE

Phase 3 of myK9Q design system v2 cleanup. Removes forward-looking
'will be removed in Phase 3' notes and the @deprecated warnings
on --checkin-* and .accent-green / .accent-orange; adds a short
changelog entry marking Phase 3 complete.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12 — Full regression sweep

**Files:** none (pure verification).

- [ ] **Step 1: Run the full myK9Q test suite**

```bash
cd apps/myk9q && pnpm test
```

Expected: green.

- [ ] **Step 2: Run the full myK9Show test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: green. Scope check: this PR touches six myK9Show files (checkin components + one tokens file). If any unrelated test regresses, stop and investigate — the Phase 3 scope should not affect non-checkin areas.

- [ ] **Step 3: Monorepo-wide typecheck + lint**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
pnpm typecheck && pnpm lint
```

Expected: green.

- [ ] **Step 4: Build both apps**

```bash
pnpm build
```

Expected: green. Capture the resulting bundle size:

```bash
du -sh apps/myk9q/dist apps/myk9show/dist
```

Record as "after Phase 3" — expected delta vs. `main` is negligible (a few hundred bytes smaller from removed CSS blocks and dead code).

- [ ] **Step 5: Manual smoke — all four roles, both apps**

**myK9Q (`pnpm dev:q` → `localhost:5173`):**

1. Log in as admin (`aa260`). Navigate: show detail → class list → entry list → one scoresheet → The Podium. Confirm no unstyled status badges, no unstyled accent chrome.
2. Log in as judge (`jf472`). Same path.
3. Log in as steward (`se0d7`). Same path.
4. Log in as exhibitor (`e4b6c`). Navigate: show detail → favorites → a class they're entered in. Confirm status colors render.
5. Settings → Appearance: cycle accent through all four options (teal → terracotta → blue → purple), cycle theme through all three (light → dark → auto), cycle displayMode (default → outdoor). Confirm each persists across reload. Confirm removing `green` / `orange` from the picker (if they ever showed) didn't strand the UI.
6. Toggle airplane mode during step 5 — confirm offline still works and no replication errors appear.

**myK9Show (`pnpm dev:show` → `localhost:5173`):**

1. Log in as admin. Navigate to a show's Check-In page. Confirm `CheckInClassRow`, `CheckInExhibitorCard`, `CheckInProgressBar` render status colors correctly.
2. Log in as a judge-role user on a class's scoring page; confirm scoring surface unaffected.

- [ ] **Step 6: Legacy-localStorage smoke test**

This is the single most important manual check because it's the scenario Phase 3 is most vulnerable to.

1. In DevTools → Application → Local Storage for `localhost:5173`, manually set:
   ```
   myK9Q_settings = {"state":{"settings":{"accentColor":"green","theme":"light","displayMode":"default"}},"version":0}
   ```
2. Reload the page.
3. Inspect `<html>` classes: expect `theme-light accent-teal` (NOT `accent-green`). Both `theme-init.js`'s inline normalize and `runAccentMigration()`'s rewrite should converge on teal.
4. Check localStorage again — expect `accentColor` has been rewritten to `'teal'` by `runAccentMigration()`.
5. Repeat for `"orange"` → expect `accent-terracotta` + rewritten to `'terracotta'`.

If either legacy value leaves the page rendering with an unstyled class, **stop** — the inline normalize map in `theme-init.js` or `runAccentMigration()` isn't firing correctly. Debug before shipping.

- [ ] **Step 7: No commit — this task is pure verification**

---

## Task 13 — Open the Phase 3 PR

**Files:** none — shipping task.

- [ ] **Step 1: Branch from `develop` and push**

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform"
git checkout develop
git pull origin develop
git checkout -b chore/myk9q-v2-phase-3
git rebase develop  # ensure linear history on the feature branch
git push -u origin chore/myk9q-v2-phase-3
```

- [ ] **Step 2: Create the PR with a scope-complete body**

```bash
gh pr create --base develop --title "chore(myk9q): v2 design system — Phase 3 (remove deprecation aliases)" --body "$(cat <<'EOF'
## Summary

Phase 3 of the myK9Q design system v2 — the cleanup pass that removes the deprecation aliases Phase 2 intentionally left in place.

Phase 2 shipped at commit 1525a310 on 2026-04-20; this PR lands ≥30 days later so every active user's \`runAccentMigration()\` has rewritten any stale localStorage values.

### What changed

1. **\`--checkin-*\` alias block removed** from \`apps/myk9q/src/styles/design-tokens.css\`. All consumers (packages/core, myK9Q stylesheets + TSX, myK9Show checkin components) now reference canonical \`--status-*\` tokens directly. Regression test at \`apps/myk9q/src/styles/__tests__/status-vocab.test.ts\` greps the tree and fails if any \`--checkin-*\` reference is re-introduced.
2. **\`.accent-green\` / \`.accent-orange\` CSS blocks removed** from \`apps/myk9q/src/index.css\` and \`apps/myk9q/public/critical.css\`. Critical.css's 35-line accent section is rewritten to canonical \`.accent-teal\` / \`.accent-terracotta\` with the v2 hexes (previously still carried the v1 \`#f97316\` orange).
3. **\`theme-init.js\` cleaned up** — legacy entries dropped from the class-remove list and meta theme-color map. A 4-line inline \`LEGACY_ACCENT_RENAMES\` shim normalizes any still-stale localStorage value to canonical before the class is applied — belt-and-braces defense for users whose persisted state somehow predates \`runAccentMigration()\`.
4. **\`AppSettings.accentColor\` tightened** from \`'teal' | 'terracotta' | 'blue' | 'purple' | 'green' | 'orange'\` to \`'teal' | 'terracotta' | 'blue' | 'purple'\`. Invariant test uses \`@ts-expect-error\` to enforce the narrow union at typecheck time.
5. **\`runAccentMigrationReverse()\` deleted.** The reverse shim was kept as a Phase 2 rollback safety net; after Phase 3 removes the \`.accent-green\` / \`.accent-orange\` CSS blocks, reversing would leave users with unstyled accent classes. Forward \`runAccentMigration()\` stays in place as a safety net.

### Scope-guarded (not in this PR)

- \`--token-status-*\` deprecation aliases — out of scope per user brief; separate follow-up.
- Dead-stylesheet deletion from the Phase 1 audit — out of scope per user brief.
- Playfair Display font import removal — out of scope per user brief.
- Login.css's local \`--accent-green\` CSS variable — name collision only, not the same symbol; out of scope.

### Rollback

Revert the PR. Deprecation aliases come back, type widens, reverse shim returns. Safe — Phase 3 introduces no user-data changes.

## Spec

- [\`docs/superpowers/specs/2026-04-20-myk9q-design-system-v2-design.md\`](../blob/develop/docs/superpowers/specs/2026-04-20-myk9q-design-system-v2-design.md)

## Plan

- [\`docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-3.md\`](../blob/develop/docs/superpowers/plans/2026-04-20-myk9q-design-system-v2-phase-3.md)

## Consumer-migration baseline (from Task 0)

- \`--checkin-*\` references before: ~140+ across 28 files (both apps + packages/core)
- \`--checkin-*\` references after: 0 (enforced by regression test)
- \`.accent-green\` / \`.accent-orange\` references before: 4 files
- \`.accent-green\` / \`.accent-orange\` references after: 0 (enforced by regression test)

## Bundle size

- Before (develop): \`<paste du -sh apps/myk9q/dist>\`
- After (this PR): \`<paste>\`
- Delta: \`<paste>\` (expected: slightly smaller — removed dead CSS + dead TS code)

## Test plan

- [x] Regression test — no \`--checkin-*\` in \`apps/myk9q/src\`, \`apps/myk9q/public\`, or \`packages/core/src\` — \`apps/myk9q/src/styles/__tests__/status-vocab.test.ts\`
- [x] Regression test — no \`.accent-green\` / \`.accent-orange\` blocks in \`index.css\` — \`apps/myk9q/src/__tests__/accent-classes.test.ts\`
- [x] Invariant test — \`AppSettings.accentColor\` rejects legacy values (\`@ts-expect-error\`) — \`apps/myk9q/src/stores/settingsStore.test.ts\`
- [x] \`runAccentMigration()\` forward tests still green — \`apps/myk9q/src/utils/accentMigration.test.ts\` (\`runAccentMigrationReverse\` suite deleted)
- [x] \`pnpm typecheck\` + \`pnpm lint\` + \`pnpm test\` all green (both apps)
- [x] \`pnpm build\` green for both apps
- [x] Manual smoke across all four roles in myK9Q (\`localhost:5173\`)
- [x] Manual smoke on myK9Show checkin surfaces
- [x] Legacy-localStorage smoke — manually set \`accentColor: "green"\` and \`"orange"\` in localStorage; reload and confirm \`<html>\` receives \`accent-teal\` / \`accent-terracotta\` (both theme-init.js and runAccentMigration converge on canonical)
- [x] Offline airplane-mode sanity check during smoke
EOF
)"
```

- [ ] **Step 3: Paste the PR URL in the response**

Return the URL to the user. Don't merge — wait for review + approval.

---

## Appendix — What's NOT in Phase 3 (scope guard)

These items live in the spec but were explicitly excluded from the user's Phase 3 brief. Do not expand scope during execution; if any feels tempting, write a follow-up TODO instead:

- `--token-status-*` deprecation aliases (spec §9.3 #2).
- Dead-stylesheet deletion from Phase 1 audit (spec §9.3 #4).
- Playfair Display font import removal (spec §9.3 #5).
- Authenticated canonical visual baselines (6 screens × 4 modes) — blocked on seed-data harness; separate sprint.
- Landing-page a11y violations (`.footer-copyright` 1.69:1, `.event-card`) — separate sprint.
- Glove mode — post-fall (spec §11).
- Density policy review — post-fall (spec §11).
- Renaming Login.css's local `--accent-green` CSS variable — separate follow-up (not a v2 symbol).

---

## Self-Review Notes

**Spec coverage:** Phase 3's scope in spec §9 lists six cleanup items; the user's brief narrowed this to five (points 1, 3, and half of 6 — see Task 11). Items 2 (`--token-status-*`), 4 (dead stylesheets), 5 (Playfair) are parked in the appendix and require a separate sprint. All five in-scope items are covered by Tasks 2–11.

**Placeholder scan:** no `TBD` / `implement later` / generic "add appropriate error handling." Every step has concrete file paths, concrete CSS token names, concrete commit messages.

**Type consistency:** all token names used in migration tables (Tasks 2, 3, 4, 5) match the real token names in `apps/myk9q/src/styles/design-tokens.css`. All TypeScript identifiers (`AppSettings`, `applyAccentColor`, `runAccentMigration`, `runAccentMigrationReverse`) match the real symbols.

**TDD gate:** Tasks 1, 6, 9 write failing tests first; Tasks 2–5, 8, 10 are refactors of already-tested code (the Phase 2 test suite guards them); Task 12 is full regression sweep before shipping.

**Risk concentration:** the single highest-risk change is Task 8's `theme-init.js` edit — it's a blocking script loaded before React. The legacy-normalize shim in that task is the belt-and-braces mitigation; the legacy-localStorage smoke test in Task 12 step 6 is the verification. The `?v=7 → ?v=8` cache-buster bump in Task 8 Step 4a ensures PWAs drop the stale cached copy on deploy.

**[ADDED] Post-verification patches (verify-plan pass on 2026-04-20):**

- Prerequisites Gate gained two new items: explicit `runAccentMigration()`-in-main.tsx grep and seed-data harness status check, plus a test-runner hang-policy acknowledgement.
- Task 0 Step 3 broadened its grep beyond `src/stores` + `src/utils` after discovery that four additional files (`AppearanceSettings.tsx`, `AppearanceSettings.test.tsx`, `settingsMigration.test.ts`, `smartDefaults.test.ts`) reference legacy accent string values. A new Step 4 enumerates `AppSettings['accentColor']` consumers.
- Task 8 gained Step 4a: bump `theme-init.js?v=7` → `?v=8` cache buster in `index.html` so PWAs drop the cached copy. Commit step now stages `index.html` too.
- Task 9 gained Steps 6a–6d: collapse the `AppearanceSettings.tsx` legacy ternary, delete the now-dead legacy-mapping test, rewrite three `settingsMigration.test.ts` fixtures and one `smartDefaults.test.ts` fixture from `'green'` to `'teal'`. Without these edits, Task 9's type narrowing would red-line `pnpm typecheck` on four files the plan previously did not touch.
