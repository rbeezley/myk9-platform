# Soften Light Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shift the myK9Show light mode from invisible-warm (#f8f7f4) to noticeably warm cream (#f5f2ed), and replace ~63 hardcoded `bg-white` and ~99 `#fff` values with semantic theme references.

**Architecture:** Update CSS custom properties in `index.css` `:root` and `design-tokens.css`, then sweep component files replacing `bg-white` → `bg-card` and CSS `#fff` → `var(--card)`. No functional changes — purely visual theming.

**Tech Stack:** CSS custom properties, Tailwind CSS utility classes

**Spec:** `docs/superpowers/specs/2026-03-23-soften-light-mode-design.md`

---

## Task 1: Update CSS Variables in `index.css`

**Files:**

- Modify: `apps/myk9show/src/index.css:385-421` (light mode `:root` block)

- [ ] **Step 1: Update all 11 light mode CSS variables**

In the `:root` block (line 385), change these values:

```css
--background: #f5f2ed; /* Warm cream (was #f8f7f4) */
--background-alt: #f5f2ed;
--card: #faf8f4; /* Elevated cream (was #fefdfb) */
--sidebar: #f5f2ed;
--card-secondary: #f5f2ed;
--secondary: #f5f2ed;
--muted: #f0ede7; /* (was #f6f6f6) */
--input: #efece6; /* (was #f3f4f6) */
--border: #e0dbd3; /* (was #e5e7eb) */
--dialog-input-bg: #efece6; /* (was #f2f2f2) */
--popover: #faf8f4; /* (was #ffffff) */
```

Do NOT change: `--foreground`, `--primary`, `--primary-foreground`, `--destructive*`, `--accent*`, `--muted-foreground`, `--secondary-foreground`, `--popover-foreground`, `--chart-*`, `--radius`, `--show-secondary-bg`.

Do NOT change any `.dark` block values.

- [ ] **Step 2: Run typecheck and lint**

```bash
cd apps/myk9show && pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/index.css
git commit -m "style(myk9show): warm light mode CSS variables to subtle cream palette"
```

---

## Task 2: Update Scoring `design-tokens.css`

**Files:**

- Modify: `apps/myk9show/src/pages/scoring/styles/design-tokens.css`

- [ ] **Step 1: Update 7 scoring surface variables in the light mode `:root` block**

```css
--surface: #f5f2ed; /* (was #F8F7F4) */
--surface-subtle: #f0ede7; /* (was #f3f4f6) */
--surface-muted: #f0ede7; /* (was #f5f5f5) */
--surface-elevated: #faf8f4; /* (was #ffffff) */
--background-subtle: #f5f2ed; /* (was #f8fafc) */
--background-soft: #f5f2ed; /* (was #f8f9fa) */
--input-bg: #efece6; /* (was #ffffff) */
```

Do NOT change `.dark` values or any color/text variables.

- [ ] **Step 2: Run typecheck and lint**

```bash
cd apps/myk9show && pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/scoring/styles/design-tokens.css
git commit -m "style(myk9show): warm scoring design-tokens light mode to match main palette"
```

---

## Task 3: Sweep `bg-white` in Component Files (Batch 1 — Layout & Common)

**Files to modify** (replace `bg-white` → `bg-card` unless noted):

- `apps/myk9show/src/components/layout/ResponsiveLayout.tsx` (4 occurrences)
- `apps/myk9show/src/components/common/UnifiedSidebar.tsx` (3 — use `bg-background` for sidebar containers)
- `apps/myk9show/src/components/common/ErrorBoundary.tsx` (1)
- `apps/myk9show/src/components/base/EntitySidebar.tsx` (1)
- `apps/myk9show/src/components/base/BulkActionsBar.tsx` (1)
- `apps/myk9show/src/components/ui/dialog/enhanced-dialog.tsx` (1 — use `bg-popover`)
- `apps/myk9show/src/components/ui/FirstTimeDelight.tsx` (1)
- `apps/myk9show/src/components/ClassCompletionCelebration.tsx` (1)
- `apps/myk9show/src/pages/SecretaryDashboard.tsx` (1)

**Decision rules:**

- Sidebar/layout containers → `bg-background`
- Dialog/popover containers → `bg-popover`
- Everything else → `bg-card`
- Keep `dark:bg-*` classes paired with the new light class

- [ ] **Step 1: Replace all `bg-white` occurrences in these files**

For each file, find `bg-white` and replace with the appropriate semantic class. Preserve any `dark:` variant that follows it.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git commit -m "style(myk9show): replace bg-white with semantic theme classes in layout/common"
```

---

## Task 4: Sweep `bg-white` in Component Files (Batch 2 — Feature Components)

**Files to modify** (replace `bg-white` → `bg-card` unless noted):

- `apps/myk9show/src/components/exhibitor/MultiDogSchedule.tsx` (5)
- `apps/myk9show/src/components/exhibitor/LiveResults.tsx` (4)
- `apps/myk9show/src/components/exhibitor/RingMonitor.tsx` (3)
- `apps/myk9show/src/components/exhibitor/ClassCheckIn.tsx` (1)
- `apps/myk9show/src/components/scoring/MultiAreaScoresheet.tsx` (2)
- `apps/myk9show/src/components/scoring/OfflineJudgeInterfaceViews.tsx` (1)
- `apps/myk9show/src/components/entries/EntryReceipt.tsx` (1)
- `apps/myk9show/src/components/entries/PaymentPendingIndicator.tsx` (2)
- `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/CreditCardVisual.tsx` (2)
- `apps/myk9show/src/components/shows/ShowCalendar/ShowCalendar.tsx` (1)
- `apps/myk9show/src/components/trials/TrialList/TrialList.tsx` (1)
- `apps/myk9show/src/components/clubs/ClubInfoCard.tsx` (1)
- `apps/myk9show/src/components/landing/FAQ.tsx` (2)
- `apps/myk9show/src/components/landing/Features.tsx` (1)

- [ ] **Step 1: Replace all `bg-white` in these files**

Same decision rules as Task 3. Preserve `dark:` variants.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git commit -m "style(myk9show): replace bg-white with semantic theme classes in feature components"
```

---

## Task 5: Sweep `bg-white` in Component Files (Batch 3 — Users, Dogs, Admin)

**Files to modify** (replace `bg-white` → `bg-card`):

- `apps/myk9show/src/components/users/UserDetails/HeroProfileCard.tsx` (1)
- `apps/myk9show/src/components/users/PersonDetailsDialog.tsx` (1)
- `apps/myk9show/src/components/users/PersonListRow.tsx` (1)
- `apps/myk9show/src/components/users/PersonCard.tsx` (2)
- `apps/myk9show/src/components/dogs/DogDetailsMain/HeroProfileCard.tsx` (1)
- `apps/myk9show/src/components/dogs/DogDetails/DogTabNavigation.tsx` (1)
- `apps/myk9show/src/components/dogs/DogDetails/Competitions/ConfirmDeleteDialog.tsx` (1)
- `apps/myk9show/src/components/dogs/LazyDogCard.tsx` (1)
- `apps/myk9show/src/components/dogs/common/DogListRow.tsx` (1)
- `apps/myk9show/src/components/panels/edit/AddDogPanel/BasicInfoTab.tsx` (1)
- `apps/myk9show/src/components/admin/PerformanceModeToggle.tsx` (2)
- `apps/myk9show/src/components/admin/DataLifecycleManagement/OverviewTab.tsx` (2)
- `apps/myk9show/src/components/admin/DataLifecycleManagement/ArchivingTab.tsx` (2)
- `apps/myk9show/src/components/admin/DataLifecycleManagement/ExportImportTab.tsx` (1)
- `apps/myk9show/src/components/admin/DataLifecycleManagement/CleanupTab.tsx` (1)

**Skip** (print components — need `bg-white` for paper):

- `apps/myk9show/src/components/reports/PrintableReport.tsx`
- `apps/myk9show/src/components/reports/PrintManager.tsx`

- [ ] **Step 1: Replace all `bg-white` in these files (skip print components)**

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git commit -m "style(myk9show): replace bg-white with semantic theme classes in users/dogs/admin"
```

---

## Task 6: Sweep Hardcoded `#fff`/`#ffffff` in CSS Files

**Files to modify** (apply decision rules from spec):

- `apps/myk9show/src/styles/myk9-show-details.css`
- `apps/myk9show/src/styles/myk9-class-selection.css`
- `apps/myk9show/src/styles/myk9-class-details.css`
- `apps/myk9show/src/styles/myk9-club-details.css`
- `apps/myk9show/src/styles/myk9-dog-details.css`
- `apps/myk9show/src/styles/myk9-table.css`
- `apps/myk9show/src/styles/myk9-registration-workflow.css`
- `apps/myk9show/src/styles/myk9-show-details-optimized.css`
- `apps/myk9show/src/styles/myk9-template-management.css`
- `apps/myk9show/src/styles/myk9-user-details.css`
- `apps/myk9show/src/styles/template-management.css` (has `@apply bg-white`)

**Skip/leave as-is:**

- `apps/myk9show/src/index.css` — foreground vars and `.dark` block use `#ffffff` correctly
- `apps/myk9show/src/styles/theme-preferences.css` — `.high-contrast` class uses `#ffffff` intentionally
- `apps/myk9show/src/pages/scoring/styles/design-tokens.css` — already updated in Task 2

**Decision rules:**

1. `background: #fff` or `background-color: #fff` → `background: var(--card)` or `var(--background)`
2. `color: #fff` on dark/colored background → **keep** (contrast)
3. `border-color: #fff` on dark background → **keep**
4. `box-shadow` using `#fff` → **keep**
5. `linear-gradient(#fff 0 0)` in `mask` → **keep** (opacity mask)
6. `@apply bg-white` → `@apply bg-card`

- [ ] **Step 1: For each CSS file, find `#ffffff`/`#fff` and apply decision rules**

Read each file, evaluate each occurrence, replace backgrounds with `var(--card)` or `var(--background)`, leave text/border/mask/shadow uses alone.

- [ ] **Step 2: Replace `@apply bg-white` with `@apply bg-card` in `template-management.css`**

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git commit -m "style(myk9show): replace hardcoded #fff with CSS variable references in stylesheets"
```

---

## Task 7: Sweep Remaining `#fff` in `index.css` and `theme-preferences.css`

**Files:**

- Modify: `apps/myk9show/src/index.css`
- Modify: `apps/myk9show/src/styles/theme-preferences.css`

These files have many `#ffffff` values that are intentionally correct (foreground vars, `.dark` block, `.high-contrast`). Only replace the ones that are surface backgrounds in light mode.

- [ ] **Step 1: Audit `index.css` for light-mode surface backgrounds using `#ffffff`**

The `:root` block's `--popover` was already fixed in Task 1. Check for any remaining `#ffffff` in light-mode-only contexts (not `.dark`, not `--*-foreground`).

- [ ] **Step 2: Audit `theme-preferences.css`**

Replace `#ffffff` only where it's a surface background in a non-high-contrast, non-dark context. Leave `.high-contrast` and `.dark` values alone.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git commit -m "style(myk9show): audit and warm remaining #fff in index.css and theme-preferences.css"
```

---

## Task 8: Verify and Run Tests

- [ ] **Step 1: Run full typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors (CSS-only changes shouldn't affect types, but verify)

- [ ] **Step 2: Run full lint**

```bash
pnpm lint
```

Expected: 0 errors (warnings OK)

- [ ] **Step 3: Run myK9Show test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: All tests pass (no functional changes — purely visual)

- [ ] **Step 4: Verify no `bg-white` remains (except print components)**

```bash
grep -r "bg-white" apps/myk9show/src --include="*.tsx" --include="*.ts" -l
```

Expected: Only `PrintableReport.tsx` and `PrintManager.tsx`

- [ ] **Step 5: Verify remaining `#fff` in CSS files are all intentional**

```bash
grep -rn "#fff" apps/myk9show/src --include="*.css" | grep -v "\.dark" | grep -v "foreground" | grep -v "high-contrast" | grep -v "linear-gradient(#fff 0 0)"
```

Expected: Only mask patterns, foreground variables, dark mode values, and high-contrast overrides. Any surface background `#fff` remaining is a miss.

- [ ] **Step 6: Visual spot-check in dev server**

Start `pnpm dev:show` and check these pages in light mode:

- Landing page
- Browse Shows
- Show Details → Overview tab
- Trial Details
- Class Details
- Secretary Dashboard
- Scoring UI

Then switch to dark mode and confirm it looks unchanged. Check that `bg-accent` surfaces still look intentional against the warm backgrounds.

- [ ] **Step 7: Verify accent color override classes don't conflict** `[ADDED]`

```bash
grep -rn "\-\-card\|\-\-background\|\-\-popover" apps/myk9show/src --include="*.css" | grep "accent-"
```

Expected: No accent color classes override `--card`, `--background`, or `--popover`. If any do, they need to be warmed too.

- [ ] **Step 8: Commit verification results (if any fixes needed)**

---

## Task 9: Update TO-DOS.md

- [ ] **Step 1: Mark the "Soften Light Mode Backgrounds" todo as complete in `TO-DOS.md`**

Replace the todo item with a `[x]` completion entry summarizing what was done.

---

## Rollback `[ADDED]`

Each task commits separately. If the warm palette looks wrong after deployment:

- Revert individual commits to isolate which batch caused the issue
- Or revert all commits back to the pre-warmth state with `git revert`
- Vercel auto-deploys from `main`, so a revert commit deploys immediately
