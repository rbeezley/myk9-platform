# Show Card Redesign — Date Circle + Progress Bar

**Date:** 2026-03-18
**Status:** Draft

## Problem

The current show cards on BrowseShowsPage are vertical, image-heavy cards that don't match the emerging design language of the trial cards (date circle, progress bar as divider, counts). The landing page ShowCard uses cover images that clubs won't provide. Both cards need to be redesigned for visual consistency and information density.

## Design Decisions

1. **Two card variants** sharing a common visual language:
   - **Horizontal card** — used on BrowseShowsPage, secretary dashboard, exhibitor dashboard
   - **Vertical card** — used on landing page carousel and UpcomingShows component
2. **No cover images** — clubs won't provide them; drop `coverImageUrl` and `imageUrl` from card rendering
3. **Date circle** shows start date (month abbreviation + day number) with a "X days" badge below for multi-day shows
4. **Status-colored date circle border** — green for accepting/completed, orange for closing soon, blue for in progress, muted for upcoming/closed
5. **Progress bar** — shows trial completion (scored trials / total trials), acts as visual divider between details and counts
6. **Mobile responsive** — horizontal card stacks to vertical layout at small breakpoints (`< md`)

## Visual Mockups

See `.superpowers/brainstorm/72834-1773883401/show-card-option-b.html` for approved mockups.

## Status Mapping

The `DateCircle` accepts a `status` prop that controls border color. This status is derived from two sources:

1. **Entry status** (from `getEntryStatus()` in `entryStatusUtils.ts`): `not_yet_open | accepting | closing_soon | closed | submitted`
2. **Show temporal state**: whether the show is in the future, currently happening, or finished

**Mapping function** (`getShowCardStatus`):

```tsx
type ShowCardStatus =
  | 'upcoming'
  | 'accepting'
  | 'closing_soon'
  | 'in_progress'
  | 'completed'
  | 'closed';

function getShowCardStatus(show: Show, entryStatus: EntryStatus): ShowCardStatus {
  const now = new Date();
  const startDate = new Date(show.startDate);
  const endDate = new Date(show.endDate);

  // Show is finished
  if (now > endDate) return 'completed';

  // Show is currently happening (between start and end dates)
  if (now >= startDate && now <= endDate) return 'in_progress';

  // Show is in the future — use entry status to determine color
  if (entryStatus === 'accepting') return 'accepting';
  if (entryStatus === 'closing_soon') return 'closing_soon';
  if (entryStatus === 'closed') return 'closed';

  // Not yet open or submitted — treat as upcoming
  return 'upcoming';
}
```

This function lives in a new `utils/showCardUtils.ts` file alongside the status color map.

## Components

### 1. `DateCircle` (shared primitive)

Reusable component rendering the date box + days badge. May already exist from trial card work — reuse if so, extend with `endDate` support if needed.

```tsx
interface DateCircleProps {
  startDate: string; // ISO date
  endDate?: string; // ISO date — if different from startDate, computes "X days"
  status: ShowCardStatus;
  size?: 'sm' | 'md'; // sm=56px for horizontal card, md=60px for vertical card
}
```

**Status → border color mapping:**

| Status         | Border color | Month text color   |
| -------------- | ------------ | ------------------ |
| `upcoming`     | `border/15%` | `muted-foreground` |
| `accepting`    | `green-500`  | `green-500`        |
| `closing_soon` | `orange-500` | `orange-500`       |
| `in_progress`  | `blue-500`   | `blue-500`         |
| `completed`    | `green-500`  | `green-500`        |
| `closed`       | `border/15%` | `muted-foreground` |

**Days badge:**

- Single-day shows (`startDate === endDate` or no `endDate`): badge hidden
- Multi-day shows: "2 days", "3 days" etc. (computed from `startDate`/`endDate` difference)
- Badge background matches status color at 15% opacity

**Accessibility:** Include `aria-label` on the date box: `"May 9, 2 day show"` or `"May 9"` for single-day. The border color is supplementary — the status badge text in the card conveys status to screen readers.

**Icons:** All icons use Lucide components (`MapPin`, `Clock`) — not emoji. The diagram notation `📍` and `🕐` in this spec is shorthand only.

### 2. `ShowProgressBar` (shared primitive)

Thin progress track showing trial completion. Mirrors the trial card progress bar pattern.

```tsx
interface ShowProgressBarProps {
  scoredTrials: number;
  totalTrials: number;
  totalEntries: number;
}
```

**Rendering:**

- Left side: `{totalTrials} trials · {totalEntries} entries`
- Right side (when > 0 scored): `{scored}/{total} scored` — green when all scored, orange when partial
- 3px progress track below: fill percentage = `scoredTrials / totalTrials`
- 0% progress: empty track acts as subtle visual divider (same as trial cards)
- `aria-label`: `"3 of 5 trials scored"` (or omit if 0 scored)

### 3. `ShowCardHorizontal` — replaces `ShowCardGrid` card markup

**Location:** `apps/myk9show/src/components/shows/browse/ShowCardHorizontal.tsx`

**Layout (desktop, ≥ md):**

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────┐                                                   │
│  │ MAY  │  Show Title                    [Status Badge]     │
│  │  9   │  MapPin Location · Clock Time                     │
│  └──────┘  [AKC] [●Conformation] [●Obedience]              │
│  2 days    ─────────────────────────── [View Details]       │
│            3 trials  42 entries      2/3 scored             │
└─────────────────────────────────────────────────────────────┘
```

Three-column flex: `[DateCircle] [card-middle: title+meta+tags] [card-right: counts+progress+action]`

**Layout (mobile, < md):**
Stacks to vertical — same content, single column. The three-column flex becomes a stacked layout:

```
┌───────────────────────────┐
│ ┌──────┐                  │
│ │ MAY  │  Show Title      │
│ │  9   │  [Status Badge]  │
│ └──────┘  Club Name       │
│ 2 days                    │
│                           │
│ MapPin Location · Clock   │
│ [AKC] [●Conf] [●Obed]    │
│ ───────────────────────── │
│ 3 trials · 42 entries     │
│            [View Details] │
└───────────────────────────┘
```

At `< md`, `card-right` moves below `card-middle` (via `flex-col` on container). Date circle + title remain side-by-side as a header row.

**Data source:** `EnhancedShow` (same as current `ShowCardGrid`)

**Props:**

```tsx
interface ShowCardHorizontalProps {
  show: EnhancedShow;
  entries: SyncableShowEntry[];
  selectedTab: string;
  user: UserWithRoles | null;
  isSelected?: boolean; // Pre-computed boolean (container calls isSelected(show))
  onToggleSelect?: () => void; // Container wraps to pass show reference
}
```

**Navigation:** Uses `useNavigate()` internally (same pattern as current `ShowCardGrid`). Entire card is clickable via `onClick={() => navigate(`/shows/${show.id}`)}`. Action buttons use `e.stopPropagation()` to prevent double-navigation.

**Entry status badge:** Reuses existing `EntryStatusBadge` component from `@/components/shows/EntryStatusBadge` — no new badge component needed.

**Preserved features from current card:**

- Checkbox for bulk selection (when `onToggleSelect` provided)
- Entry count badge (user's entries, shown inline)
- Closing soon urgency badge ("Xd left")
- Entry status via `EntryStatusBadge` component
- Role-based action buttons (Enter, View Details, Manage — via `getShowActions`)
- Click-to-navigate to show detail page
- `ring-2` highlight for closing soon and selected states

**Removed:**

- Cover image hero section
- Accent color gradient overlay
- Entry close date text (status badge already conveys this)

### 4. `ShowCardVertical` — replaces landing page `ShowCard` + `UpcomingShowsSection` card

**Location:** `apps/myk9show/src/components/shows/ShowCardVertical.tsx`

**Layout:**

```
┌───────────────────────────┐
│ ┌──────┐ [Accepting...]   │
│ │ MAY  │  Show Title      │
│ │  9   │  Club Name       │
│ └──────┘                  │
│ 2 days                    │
│                           │
│ MapPin Location            │
│ Clock 8:00 AM – 5:00 PM  │
│                           │
│ [AKC] [●Conf] [●Obed]    │
│ ───────────────────────── │
│ 3 trials · 42 entries     │
└───────────────────────────┘
```

**Props:**

```tsx
interface ShowCardVerticalProps {
  show: Show;
  totalEntries?: number; // Pre-computed — passed by parent
  scoredTrials?: number; // Pre-computed — passed by parent
  onViewDetails?: () => void;
}
```

The `Show` type already has `trials[]` for `totalTrials` count. `totalEntries` and `scoredTrials` are optional props because the landing page may not have this data available (renders 0/hidden when absent). The `ShowCardVertical` computes `showCardStatus` internally via `getShowCardStatus`.

Fixed width ~280px for carousel use. Date circle + title/club name side by side at top, metadata stacked below, tags, then progress section as footer.

### 5. Updated `ShowCardGrid` (container)

**Location:** `apps/myk9show/src/components/shows/browse/ShowCardGrid.tsx`

Becomes a thin wrapper that maps `shows` to `ShowCardHorizontal` components. Keeps same external interface (`ShowCardGridProps`) for BrowseShowsPage compatibility.

Key changes:

- Replace inline card markup with `<ShowCardHorizontal>` per show
- Convert `isSelected` function prop: `isSelected={isSelected?.(show) ?? false}` passed as boolean to child
- Convert `onToggleSelect` function prop: `onToggleSelect={() => onToggleSelect?.(show)}` passed as callback
- Replace `StaggeredGrid` with a plain `div` using `flex flex-col gap-3` for single-column layout (staggered animation is for grid layouts and doesn't suit horizontal card lists)
- Remove all inline card rendering logic (Lucide icon imports, entry status computation, etc.)

### 6. Updated `UpcomingShows` + `UpcomingShowsSection`

**`UpcomingShows.tsx`:**

- Remove the local `Show` interface (lines 7-17) that shadows the domain type
- Accept the domain `Show` type from `@/types/show-types` instead
- Replace `<ShowCard>` usage with `<ShowCardVertical>`
- Remove `imageUrl` from interface — no longer needed
- The carousel mechanics (scroll, arrows, dots) remain unchanged

**`UpcomingShowsSection.tsx`:**

- Replace inline card markup with `<ShowCardVertical>`
- Accept domain `Show` type (or a subset of it) instead of `LandingShow`

**`LandingShow` type (`types/index.ts`):**

- Eliminate `LandingShow` entirely — it's a leaky abstraction with `title`/`date`/`imageUrl` fields that don't match the domain type. Consumers should use `Show` (or `Pick<Show, ...>` if they need a subset). Update the data source that maps shows into `LandingShow` to pass `Show` objects directly.

### 7. Loading Skeletons

Both card variants need skeleton states:

**Horizontal skeleton:**

```
┌─────────────────────────────────────────────────┐
│  [56×56 rounded]  [████████ long]  [░░░ short]  │
│                   [████ medium]                  │
│                   [██ ██ ██ tags]                │
│                   [━━━━━━━━━━━━]  [░░ btn]      │
└─────────────────────────────────────────────────┘
```

**Vertical skeleton:**

```
┌───────────────────────┐
│ [60×60]  [████████]   │
│          [████]       │
│ [████████████]        │
│ [████████]            │
│ [██ ██ ██]            │
│ [━━━━━━━━━━━━━━━━━━] │
│ [████]                │
└───────────────────────┘
```

Use `animate-pulse` with `bg-muted rounded` blocks matching the card dimensions. Skeleton components live alongside their card component files.

## Scoring Data Computation

**Where `scoredTrials` and `totalEntries` come from:**

For `ShowCardHorizontal` (BrowseShowsPage context):

- `totalTrials`: `show.trials.length` (already on `Show` type)
- `totalEntries`: `countUserEntries(show.id, entries)` — already computed in current `ShowCardGrid` for user-specific count. For total show entries, use `show.stats` if available, otherwise derive from entry store
- `scoredTrials`: count of `show.trials.filter(t => t.status?.toLowerCase() === 'completed').length` — the `ShowTrial` type has a `status: string` field. The DB stores lowercase (`'completed'`) but some code uses PascalCase; use case-insensitive comparison to be safe

For `ShowCardVertical` (landing/carousel context):

- These values are optional props. The parent passes them if available; if not, the progress section shows "X trials" without scored count and an empty progress track

**Utility function** in `utils/showCardUtils.ts`:

```tsx
function computeShowProgress(show: Show): { totalTrials: number; scoredTrials: number } {
  const totalTrials = show.trials?.length ?? 0;
  const scoredTrials =
    show.trials?.filter(t => t.status?.toLowerCase() === 'completed').length ?? 0;
  return { totalTrials, scoredTrials };
}
```

## Files Changed

| File                                             | Action  | Notes                                                      |
| ------------------------------------------------ | ------- | ---------------------------------------------------------- |
| `utils/showCardUtils.ts`                         | Create  | `getShowCardStatus()`, `computeShowProgress()`             |
| `components/shows/DateCircle.tsx`                | Create  | Shared date circle (reuse from trial card work if exists)  |
| `components/shows/ShowProgressBar.tsx`           | Create  | Shared progress bar (reuse from trial card work if exists) |
| `components/shows/browse/ShowCardHorizontal.tsx` | Create  | New horizontal card + skeleton                             |
| `components/shows/ShowCardVertical.tsx`          | Create  | New vertical card + skeleton                               |
| `components/shows/browse/ShowCardGrid.tsx`       | Rewrite | Thin wrapper, delegates to ShowCardHorizontal              |
| `components/shows/ShowCard.tsx`                  | Delete  | Replaced by ShowCardVertical                               |
| `components/shows/show-card-placeholders.ts`     | Delete  | No longer needed without image placeholders                |
| `components/shows/UpcomingShows.tsx`             | Update  | Remove local Show type, use ShowCardVertical               |
| `components/landing/UpcomingShowsSection.tsx`    | Update  | Use ShowCardVertical, accept domain Show type              |
| `types/index.ts`                                 | Update  | Remove `LandingShow` type                                  |

## Testing

- Unit tests for `getShowCardStatus` (all 6 status paths: upcoming, accepting, closing_soon, in_progress, completed, closed)
- Unit tests for `computeShowProgress` (0 trials, all completed, partial, missing trials array)
- Unit tests for `DateCircle` (correct month/day, days badge visibility, status colors, single-day hides badge, aria-label)
- Unit tests for `ShowProgressBar` (0%, partial, 100% states, correct text, aria-label)
- Unit tests for `ShowCardHorizontal` (renders all fields, handles missing optional data, click navigates, selection checkbox, mobile stacking via responsive classes)
- Unit tests for `ShowCardVertical` (renders all fields, handles missing optional totalEntries/scoredTrials, fixed width)
- Verify `ShowCardGrid` passes `isSelected` function → boolean correctly
- Verify `LandingShow` removal doesn't break any consumers (search for all imports)

## Coordination with Trial Card Work

The `DateCircle` and progress bar primitives may already exist from the trial card redesign (items 22+23 in TO-DOS). If so, reuse them directly. If not, build them here and the trial card work can adopt them. The design language (border colors, sizing, badge style) must match between trial cards and show cards.
