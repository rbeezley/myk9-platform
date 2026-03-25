# Surface Contrast Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual hierarchy between sidebar, page background, and cards by darkening the sidebar and adding a floating shadow to the header.

**Architecture:** CSS variable changes in `index.css` propagate to all sidebar consumers. One className addition to `AppHeader.tsx`. One border class swap in `SidebarLayout.tsx`. No component API or layout changes.

**Tech Stack:** CSS custom properties, Tailwind arbitrary value syntax (`[var(--x)]`)

**Spec:** `docs/superpowers/specs/2026-03-24-surface-contrast-hierarchy-design.md`

---

### Task 1: Update CSS variables in index.css

**Files:**

- Modify: `apps/myk9show/src/index.css:393-394` (light sidebar)
- Modify: `apps/myk9show/src/index.css:421-423` (light shadow section)
- Modify: `apps/myk9show/src/index.css:434-435` (dark sidebar)
- Modify: `apps/myk9show/src/index.css:459-461` (dark shadow section)

- [ ] **Step 1: Update light mode `--sidebar` and add new variables**

In `:root`, change line 393:

```css
/* Before */
--sidebar: #f5f2ed; /* Match background for seamless look */

/* After */
--sidebar: #f0ebe4; /* One step darker than background for visual hierarchy */
```

After `--shadow-card-hover` (line 423), add:

```css
/* Header elevation — subtle floating shadow */
--shadow-header: 0 1px 3px rgba(180, 160, 130, 0.1), 0 1px 2px rgba(180, 160, 130, 0.06);
--sidebar-border: #e4ded5;
```

- [ ] **Step 2: Update dark mode `--sidebar` and add new variables**

In `.dark`, change line 434:

```css
/* Before */
--sidebar: #1a1a1e; /* Match background for seamless look */

/* After */
--sidebar: #151518; /* One step darker than background for visual hierarchy */
```

After `--shadow-card-hover` (line 461), add:

```css
/* Header elevation — deeper shadow for dark mode */
--shadow-header: 0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
--sidebar-border: #2a2a2f;
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (CSS-only changes, no type impact)

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/index.css
git commit -m "style: update sidebar and header CSS variables for surface hierarchy"
```

---

### Task 2: Add header shadow to AppHeader

**Files:**

- Modify: `apps/myk9show/src/components/layout/AppHeader.tsx:133`

- [ ] **Step 1: Add shadow style to nav element**

On line 133, add `shadow-[var(--shadow-header)]` to the className string. The nav currently reads:

```tsx
<nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-lg text-foreground border-border h-12 transition-all duration-300 supports-[backdrop-filter]:bg-background/60">
```

Change to:

```tsx
<nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-lg text-foreground border-border h-12 transition-all duration-300 supports-[backdrop-filter]:bg-background/60 shadow-[var(--shadow-header)]">
```

- [ ] **Step 2: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/layout/AppHeader.tsx
git commit -m "style: add floating shadow to app header"
```

---

### Task 3: Update sidebar border in SidebarLayout

**Files:**

- Modify: `apps/myk9show/src/components/layout/SidebarLayout.tsx:165`

- [ ] **Step 1: Replace border class with CSS variable**

On line 165, change:

```tsx
'border-r border-border/30',
```

To:

```tsx
'border-r border-[var(--sidebar-border)]',
```

- [ ] **Step 2: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/layout/SidebarLayout.tsx
git commit -m "style: use dedicated sidebar border color variable"
```

---

### Task 4: Visual verification

- [ ] **Step 1: Run dev server and verify light mode**

Run: `pnpm dev:show`

Check:

- Sidebar is subtly darker than the page background
- Header has a faint warm shadow at its bottom edge
- Cards still appear elevated above the page
- Sidebar border is visible but soft

- [ ] **Step 2: Toggle to dark mode and verify**

Check:

- Sidebar is slightly darker than the page (`#151518` vs `#1a1a1e`)
- Header shadow is visible but not harsh
- Cards still read as elevated

- [ ] **Step 3: Update TO-DOS.md**

Mark the "Add contrast accent surface to sidebar or header" todo item as done with a summary of the changes.
