# Standardize Statistics Cards — Design Spec

**Date:** 2026-03-23
**Status:** Draft
**Scope:** Shared `StatCard` and `StatsGrid` components replacing 19 ad-hoc stat card implementations across myK9Show.

---

## Problem

myK9Show has 19 separate stat card implementations across detail pages, dashboards, and management views. They use at least 4 different styling systems:

1. **CSS classes** (`myk9-show-stat-*`, `myk9-class-stat-*`) — gradient icon backgrounds, custom font weights, category-specific color coding
2. **Premium admin `StatsCard`** — Apple system font, trend indicators, gradient hover overlays
3. **Generic `StatCard`** (`components/ui/stat-card.tsx`) — simple icon + value + subtitle
4. **Ad-hoc inline Tailwind** — various pages rolling their own card layouts

The result is visual inconsistency across pages that share the same design language everywhere else (PageShell, PageHeader, DetailHero, PrimaryTabs). Stat cards are the last major unstyled primitive.

### Affected Locations

| Page/Component                           | Current System                        | Cards  |
| ---------------------------------------- | ------------------------------------- | ------ |
| ShowStatistics                           | Component (center-aligned)            | 3      |
| ShowDetails/StatCard                     | Component (icon right, gradient bg)   | varies |
| TrialStatistics                          | Base UI Card (inline Tailwind)        | 4      |
| TrialDetailsMain                         | CSS classes                           | varies |
| ClassStatistics                          | CSS classes (`myk9-class-stat-*`)     | 4      |
| EntriesStatisticsPanel                   | CSS classes (`myk9-show-stat-*`)      | 4-5    |
| EntryStatsCards                          | Base UI Card (inline Tailwind)        | 5      |
| MyEntriesStatsCards                      | CSS classes (`myk9-show-stat-*`)      | 4      |
| SecretaryDashboard/StatisticsCards       | Component (gradient hover, 4xl value) | 4      |
| AdminDashboard/StatsCard                 | Component (Apple font, trends)        | 4      |
| AdminDashboard/PlatformStatisticsSection | Uses premium StatsCard                | 4      |
| UserManagementStats                      | Component (gradient icon bg)          | 4      |
| ClubStatistics                           | Component (clickable, icon bg)        | 2      |
| OfflineCheckin/StatisticsPanel           | Base UI Card (minimal)                | 4      |
| DogDetails/StatsSummaryCards             | Component (gradient-to-br bg)         | 4      |
| WaitlistManagement/ClassStatsCards       | Base UI Card (inline Tailwind)        | 4      |
| RunOrderPage/RunOrderQuickStats          | Inline Tailwind (text-center)         | 5      |
| BulkResultEntry/SummaryCards             | CSS classes (`myk9-show-stat-*`)      | 4      |
| PerformanceDashboard/StatsCards          | Component (scale animation)           | 4      |

## Goals

1. Replace all 19 implementations with a single `StatCard` component and `StatsGrid` container.
2. Achieve visual consistency with the existing design system (PageShell, DetailHero, PrimaryTabs).
3. Premium, professional look — no gradients, clean lines, semantic color tinting.
4. Support all current feature needs: icons, subtitles, progress bars, trends, click actions.

## Non-Goals

- Changing what data each page displays — only how it's rendered.
- Adding new stat cards to pages that don't have them.
- Modifying the data-fetching layer.

---

## Design Decisions

### Single Component with Optional Props

One `StatCard` component handles all use cases via optional props. The feature set is well-bounded and orthogonal — each optional prop toggles an independent visual element without affecting others.

```typescript
type StatColor = 'primary' | 'emerald' | 'amber' | 'red' | 'purple' | 'blue';

interface StatCardProps {
  icon: LucideIcon; // Required — Lucide icon component
  title: string; // Required — uppercase label
  value: string | number; // Required — the primary number/metric
  color?: StatColor; // Default: 'primary'
  subtitle?: string; // Detail text below value
  progress?: number; // 0-100 — thin bar at card bottom
  trend?: string; // e.g. "+12%" — badge top-right
  onClick?: () => void; // Makes card interactive (cursor-pointer + hover)
  className?: string; // Escape hatch for one-off overrides
}
```

**Why not composable primitives?** Most consumers need 3-4 props. Composition would add boilerplate to the majority case (simple cards) to serve the minority case (rich cards). The features don't interact — adding `progress` doesn't change how `trend` renders.

**Why not two tiers (simple/rich)?** The boundary between "simple" and "rich" is arbitrary. One component with optional props keeps the API surface small.

### Side-by-Side Layout

Each card uses a horizontal layout: icon on the left, content on the right. This uses the card width efficiently and keeps cards compact.

```
┌─────────────────────────────────┐
│ ┌──────┐  TITLE        [+12%]  │
│ │ icon │  142                   │
│ └──────┘  Active: 128           │
│ ████████░░░░░░░░░░░░░░░░░░░░░  │
└─────────────────────────────────┘
```

- Icon container: 40x40px, `rounded-[10px]`, flex-shrink-0
- Content area: flex-1, min-width-0 (prevents overflow)
- Trend badge: positioned top-right of the card (outside the side-by-side flow)
- Progress bar: spans full card width below the icon+content row

### No Gradients — Soft Tint Icon Backgrounds

Icon backgrounds use a single flat color at 12% opacity (dark) / 8% opacity (light). No gradients anywhere — icon backgrounds, progress bars, or hover states.

This replaces the current `linear-gradient(135deg, ...)` pattern used across `myk9-show-stat-icon.*` classes.

### Semantic Color Palette

Six colors, each with a semantic meaning. The color prop controls the icon background tint, icon stroke color, and progress bar fill.

| Color     | Tailwind Base | Semantic Use                             | Icon BG (dark)           | Icon BG (light)          |
| --------- | ------------- | ---------------------------------------- | ------------------------ | ------------------------ |
| `primary` | indigo-500    | Default, general counts, totals          | `rgba(99,102,241, 0.12)` | `rgba(99,102,241, 0.08)` |
| `emerald` | emerald-500   | Success, qualified, approved, checked-in | `rgba(16,185,129, 0.12)` | `rgba(16,185,129, 0.08)` |
| `amber`   | amber-500     | Pending, waiting, in-progress            | `rgba(245,158,11, 0.12)` | `rgba(245,158,11, 0.08)` |
| `red`     | red-500       | Errors, conflicts, invalid, scratched    | `rgba(239,68,68, 0.12)`  | `rgba(239,68,68, 0.08)`  |
| `purple`  | violet-500    | Analytics, performance, averages         | `rgba(139,92,246, 0.12)` | `rgba(139,92,246, 0.08)` |
| `blue`    | blue-500      | Info, time, schedule, duration           | `rgba(59,130,246, 0.12)` | `rgba(59,130,246, 0.08)` |

Trend badges always use emerald (positive) or red (negative), regardless of the card's `color` prop.

### Progress Bar

A 3px bar at the bottom of the card, visible only when `progress` prop is provided (0-100). The fill color matches the card's `color` prop. Track background uses `muted` (theme-aware).

### Hover and Click Behavior

All cards get a subtle hover lift (`-translate-y-0.5`, `shadow-sm` → `shadow-md`). Clickable cards (`onClick` provided) additionally get `cursor-pointer`. No other visual differentiation for clickable cards — the hover lift signals interactivity.

Transition: `transition-all duration-200 ease-out`.

### Typography

| Element  | Size                       | Weight | Color                                                |
| -------- | -------------------------- | ------ | ---------------------------------------------------- |
| Title    | 11px (`text-xs`)           | 500    | `text-muted-foreground`, uppercase, `tracking-wider` |
| Value    | 28px (`text-2xl` + custom) | 700    | `text-foreground`                                    |
| Subtitle | 12px (`text-xs`)           | 400    | `text-muted-foreground`                              |
| Trend    | 12px (`text-xs`)           | 500    | emerald-500 or red-500                               |

### Card Chrome

- Background: `bg-card`
- Border: `border border-border/50`
- Radius: `rounded-xl` (12px)
- Padding: `p-5` (20px)
- No backdrop-blur, no custom font families

---

## StatsGrid Container

A responsive grid wrapper that handles column layout. Accepts a `columns` prop for explicit control, or auto-calculates based on child count.

```typescript
interface StatsGridProps {
  columns?: 2 | 3 | 4 | 5; // Explicit column count at lg+
  children: React.ReactNode;
  className?: string;
}
```

**Responsive breakpoints:**

- Mobile: 1 column
- `sm` (640px): 2 columns
- `lg` (1024px): `columns` prop value (default: auto-fit based on child count, max 4)

**Gap:** `gap-4` (16px)

---

## StatCardSkeleton

A loading placeholder matching the card dimensions. Shows:

- 40x40 rounded rectangle (icon placeholder)
- 60% width bar (title placeholder)
- 40% width taller bar (value placeholder)

Uses Tailwind `animate-pulse` on `bg-muted` rectangles. The `StatsGrid` component can render N skeletons via a `loading` prop or consumers render `<StatCardSkeleton />` manually.

---

## Component Location

Both components live in the shared UI layer, following the existing folder-per-component convention:

```
packages/ui/src/components/StatCard/StatCard.tsx      — StatCard, StatCardSkeleton
packages/ui/src/components/StatCard/index.ts          — re-exports
packages/ui/src/components/StatsGrid/StatsGrid.tsx    — StatsGrid
packages/ui/src/components/StatsGrid/index.ts         — re-exports
```

Export from `packages/ui/src/components/index.ts`.

### Dependency: `lucide-react`

The `icon` prop is typed as `LucideIcon` from `lucide-react`. This package is not currently a dependency of `@myk9/ui`. Add it as a **peer dependency** — all consumers (myK9Show, myK9Q) already have it installed.

---

## CSS Cleanup

After all 19 consumers are migrated, delete:

- `apps/myk9show/src/styles/myk9-show-details.css` — stat-related classes (lines ~113-273)
- `apps/myk9show/src/styles/myk9-class-details.css` — stat-related classes (lines ~224-341)
- `apps/myk9show/src/components/ui/stat-card.tsx` — old generic StatCard
- `apps/myk9show/src/pages/admin/AdminDashboard/StatsCard.tsx` — old premium StatsCard
- `apps/myk9show/src/components/shows/ShowDetails/ShowStatistics/StatCard.tsx` — old show StatCard

Only delete CSS rules that are exclusively used by stat cards. Audit each rule before removal.

---

## Migration Strategy

Each page migration is independent — replace the old stat card markup with `<StatsGrid>` + `<StatCard>` using the same data. No data layer changes. Map the old category-specific colors to the new semantic palette:

| Old Category                    | New Color |
| ------------------------------- | --------- |
| trials, time                    | `blue`    |
| entries, total                  | `primary` |
| qualified, success, checked-in  | `emerald` |
| judges, score, pending          | `amber`   |
| errors, conflicts, invalid      | `red`     |
| analytics, performance, classes | `purple`  |

---

## Testing

Each migrated page should have its stat cards verified:

- Correct values render
- Colors match semantic intent
- Progress bars show when data warrants it
- Clickable cards navigate correctly
- Skeleton states display during loading
- Responsive layout works at mobile/tablet/desktop breakpoints

The `StatCard` and `StatsGrid` components themselves get unit tests for:

- All 6 color variants render correct classes
- Progress bar renders only when prop provided
- Trend badge renders with correct positive/negative styling
- onClick adds cursor-pointer and fires handler
- Skeleton matches card dimensions
- StatsGrid responsive column classes
