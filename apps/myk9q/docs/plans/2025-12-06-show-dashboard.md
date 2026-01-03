# Implementation Plan: Show Dashboard Enhancement

## Overview

Transform the existing Show Info page into a comprehensive **Show Dashboard** that provides a unified view of show status, tailored to each user's role.

### Key Design Decisions (from Brainstorm)

| Decision | Choice |
|----------|--------|
| **Audience** | Universal (all roles) |
| **Personalization** | Role-based card ordering via passcode |
| **Layout** | 4-stat row + scrollable cards |
| **"My dogs"** | Favorites as proxy (no individual user tracking) |
| **Class display** | Tabbed table (Pending / Completed) |
| **Row tap action** | Navigate to EntryList |
| **Responsive** | 3 breakpoints (phone, tablet, desktop) |

---

## Part 1: Stats Row Component

### 1.1 Create StatsRow Component

**File:** `src/pages/ShowDetails/components/StatsRow.tsx`

```tsx
interface StatBoxProps {
  icon: ReactNode;
  value: number | string;
  label: string;
  onClick?: () => void;
}

interface StatsRowProps {
  unreadAnnouncements: number;
  favoritesPending: number;
  activeClasses: number;
  completionPercent: number;
  onStatClick: (stat: 'announcements' | 'favorites' | 'active' | 'progress') => void;
}
```

**Layout:**
```
┌──────┬──────┬──────┬──────┐
│  📢  │  ⭐  │  ⏳  │  📋  │
│  3   │  2   │  1   │ 47%  │
│unread│ faves│active│ done │
└──────┴──────┴──────┴──────┘
```

**Data sources:**
- `unreadAnnouncements` → `useAnnouncementStore().unreadCount`
- `favoritesPending` → Calculate from favorites + entries data
- `activeClasses` → Count classes with `class_status === 'in-progress'`
- `completionPercent` → `(completedClasses / totalClasses) * 100`

### 1.2 Create Hook for Dashboard Data

**File:** `src/pages/ShowDetails/hooks/useDashboardData.ts`

Aggregates data from multiple sources:

```typescript
interface DashboardData {
  // Stats
  unreadAnnouncements: number;
  favoritesPending: number;
  activeClasses: number;
  completedClasses: number;
  totalClasses: number;
  completionPercent: number;

  // Lists
  classes: ClassEntry[];
  favoriteEntries: FavoriteEntry[];
  recentAnnouncements: Announcement[];
  show: Show | null;

  // State
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardData(licenseKey: string | undefined, trialId?: string): DashboardData
```

**Dependencies:**
- `useAnnouncementStore()` for announcements
- `useClassListData()` pattern for classes (or direct query)
- Favorites from IndexedDB via existing favorites hook
- `replicatedShowsTable` for show info

---

## Part 2: Class Table Component

### 2.1 Create ClassTable Component

**File:** `src/pages/ShowDetails/components/ClassTable.tsx`

```tsx
interface ClassTableProps {
  classes: ClassEntry[];
  onClassClick: (classId: number, trialId: number) => void;
}
```

**Features:**
- Tabbed view: `[Pending (7)] [Completed (5)]`
- Tap row → Navigate to EntryList
- Status badge inline with class name

### 2.2 Responsive Layouts

**Phone (< 640px):** Two-line card rows
```
┌─────────────────────────────┐
│ Nov A ●         12 entries  │
│ Judge Smith · Starts 9:00   │
└─────────────────────────────┘
```

**Tablet (640-1024px):** Compact 4-column table
```
│ Class   │ Judge  │ Entries │ Start   │
│ Nov A ● │ Smith  │   12    │ 9:00 AM │
```

**Desktop (1024px+):** Full table with extra details
```
│ Class     │ Judge      │ Entries │ Scored │ Start    │ Status      │
│ Novice A  │ Jane Smith │   12    │  4/12  │ 9:00 AM  │ In Progress │
```

### 2.3 CSS Breakpoints

**File:** `src/pages/ShowDetails/components/ClassTable.css`

```css
/* Mobile-first: card layout */
.class-table-row {
  display: flex;
  flex-direction: column;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

/* Tablet+: switch to table */
@media (min-width: 640px) {
  .class-table {
    display: table;
    width: 100%;
  }
  .class-table-row {
    display: table-row;
  }
}

/* Desktop: additional columns */
@media (min-width: 1024px) {
  .class-table-scored,
  .class-table-status {
    display: table-cell;
  }
}
```

---

## Part 3: Favorites Card Component

### 3.1 Create FavoritesCard Component

**File:** `src/pages/ShowDetails/components/FavoritesCard.tsx`

```tsx
interface FavoriteEntry {
  dogId: number;
  dogName: string;
  nextClass: string;
  queuePosition: number | null;  // null if not pending
  isInRing: boolean;
}

interface FavoritesCardProps {
  entries: FavoriteEntry[];
  onEntryClick: (dogId: number) => void;
  onViewAll: () => void;
}
```

**States:**
- Has favorites → Show list with queue positions
- No favorites → "Star your dogs to track them here" + link to Home

**Row display:**
```
│ Rover      │ Nov A  │ ○ 3 ahead     │
│ Bella      │ Exc B  │ ● In ring!    │
```

---

## Part 4: Announcements Preview Card

### 4.1 Create AnnouncementsCard Component

**File:** `src/pages/ShowDetails/components/AnnouncementsCard.tsx`

```tsx
interface AnnouncementsCardProps {
  announcements: Announcement[];
  unreadCount: number;
  onAnnouncementClick: (id: string) => void;
  onViewAll: () => void;
}
```

**Display:**
- Show 2-3 most recent announcements (title only)
- Unread indicator (● dot)
- "View All →" link to Announcements page

---

## Part 5: Compact Show Info Card

### 5.1 Create CompactShowInfoCard Component

**File:** `src/pages/ShowDetails/components/CompactShowInfoCard.tsx`

Condensed version of current ShowDetails cards:

```tsx
interface CompactShowInfoCardProps {
  show: Show;
  onViewAll: () => void;  // Expand or navigate to full view
}
```

**Display:**
```
┌─────────────────────────────────────┐
│ 📍 Show Info                        │
├─────────────────────────────────────┤
│ Secretary: Jane Doe  📧 📞          │
│ Venue: City Dog Park, Austin TX    │
│                      View All →     │
└─────────────────────────────────────┘
```

---

## Part 6: Role-Based Card Ordering

### 6.1 Update ShowDetails.tsx

**File:** `src/pages/ShowDetails/ShowDetails.tsx`

```tsx
import { useAuth } from '@/contexts/AuthContext';

function getCardOrder(role: string): string[] {
  switch (role) {
    case 'exhibitor':
      return ['favorites', 'classes', 'announcements', 'showInfo'];
    case 'judge':
      return ['classes', 'announcements', 'favorites', 'showInfo'];
    case 'admin':
    case 'steward':
      return ['announcements', 'classes', 'favorites', 'showInfo'];
    default:
      return ['classes', 'announcements', 'favorites', 'showInfo'];
  }
}

// In component:
const { role } = useAuth();
const cardOrder = getCardOrder(role);

// Render cards in order
{cardOrder.map(cardType => {
  switch (cardType) {
    case 'favorites': return <FavoritesCard key="favorites" ... />;
    case 'classes': return <ClassTable key="classes" ... />;
    case 'announcements': return <AnnouncementsCard key="announcements" ... />;
    case 'showInfo': return <CompactShowInfoCard key="showInfo" ... />;
  }
})}
```

---

## Part 7: Navigation Integration

### 7.1 Stat Box Navigation

| Stat Tapped | Destination |
|-------------|-------------|
| 📢 Unread | `/announcements` |
| ⭐ Faves | `/home` (with favorites filter) |
| ⏳ Active | First in-progress class EntryList |
| 📋 Done | `/trial/:trialId` (ClassList) |

### 7.2 Card Navigation

| Action | Destination |
|--------|-------------|
| Tap class row | `/trial/:trialId/class/:classId` (EntryList) |
| Tap favorite row | `/dog/:dogId` (Dog Details) |
| Tap announcement | `/announcements` (with highlight) |
| View All (any card) | Respective full page |

---

## File Structure Summary

```
src/pages/ShowDetails/
├── ShowDetails.tsx              # Main component (refactored)
├── ShowDetails.css              # Main styles (updated)
├── ShowDetailsComponents.tsx    # Existing header/loading/error
├── showDetailsUtils.ts          # Existing utilities
├── components/
│   ├── StatsRow.tsx             # NEW: 4-stat row
│   ├── StatsRow.css             # NEW
│   ├── ClassTable.tsx           # NEW: Tabbed class list
│   ├── ClassTable.css           # NEW: Responsive layouts
│   ├── FavoritesCard.tsx        # NEW: Favorited dogs list
│   ├── FavoritesCard.css        # NEW
│   ├── AnnouncementsCard.tsx    # NEW: Recent announcements
│   ├── AnnouncementsCard.css    # NEW
│   ├── CompactShowInfoCard.tsx  # NEW: Condensed contacts
│   └── CompactShowInfoCard.css  # NEW
└── hooks/
    └── useDashboardData.ts      # NEW: Aggregated data hook
```

---

## Implementation Phases

### Phase 1: Foundation (Stats Row + Data Hook)
| Task | Files | Effort |
|------|-------|--------|
| Create `useDashboardData` hook | `hooks/useDashboardData.ts` | 2 hours |
| Create `StatsRow` component | `components/StatsRow.tsx`, `.css` | 1.5 hours |
| Wire up to ShowDetails | `ShowDetails.tsx` | 30 min |
| **Phase 1 Total** | | **4 hours** |

**Deliverable:** Stats row appears at top of Show Info page with live data.

---

### Phase 2: Class Table
| Task | Files | Effort |
|------|-------|--------|
| Create `ClassTable` component | `components/ClassTable.tsx` | 2 hours |
| Mobile two-line layout | `components/ClassTable.css` | 1 hour |
| Tablet table layout | `components/ClassTable.css` | 45 min |
| Desktop extended columns | `components/ClassTable.css` | 30 min |
| Tab switching (Pending/Completed) | `ClassTable.tsx` | 45 min |
| Row tap → EntryList navigation | `ClassTable.tsx` | 30 min |
| **Phase 2 Total** | | **5.5 hours** |

**Deliverable:** Full responsive class table with tabs and navigation.

---

### Phase 3: Supporting Cards
| Task | Files | Effort |
|------|-------|--------|
| Create `FavoritesCard` | `components/FavoritesCard.tsx`, `.css` | 1.5 hours |
| Create `AnnouncementsCard` | `components/AnnouncementsCard.tsx`, `.css` | 1 hour |
| Create `CompactShowInfoCard` | `components/CompactShowInfoCard.tsx`, `.css` | 1 hour |
| Empty states for each | Various | 30 min |
| **Phase 3 Total** | | **4 hours** |

**Deliverable:** All cards functional with navigation.

---

### Phase 4: Role-Based Ordering + Polish
| Task | Files | Effort |
|------|-------|--------|
| Implement `getCardOrder()` | `ShowDetails.tsx` | 30 min |
| Dynamic card rendering | `ShowDetails.tsx` | 30 min |
| Loading states | All components | 30 min |
| Error handling | All components | 30 min |
| Dark mode verification | All CSS files | 30 min |
| Accessibility check (focus, labels) | All components | 30 min |
| **Phase 4 Total** | | **3 hours** |

**Deliverable:** Complete dashboard with role-based UX.

---

## Testing Checklist

### Functional Testing
- [ ] Stats row shows correct counts (unread, favorites, active, completion %)
- [ ] Tapping each stat navigates correctly
- [ ] Class table shows all classes with correct status
- [ ] Tab switching works (Pending ↔ Completed)
- [ ] Tapping class row opens EntryList
- [ ] Favorites card shows favorited dogs with queue position
- [ ] Empty state shows when no favorites
- [ ] Announcements preview shows recent items
- [ ] All "View All" links navigate correctly

### Responsive Testing
- [ ] Phone (375px): Two-line class rows, stats fit
- [ ] Tablet (768px): 4-column table renders
- [ ] Desktop (1200px): Extended columns visible

### Role-Based Testing
- [ ] Exhibitor: Favorites card first
- [ ] Judge: Classes card first
- [ ] Admin: Announcements card first
- [ ] Steward: Announcements card first

### Edge Cases
- [ ] No favorites → prompt message
- [ ] No announcements → empty state
- [ ] No classes → empty state
- [ ] All classes complete → 100% progress
- [ ] Offline mode → data loads from cache

---

## Total Estimated Effort

| Phase | Hours |
|-------|-------|
| Phase 1: Foundation | 4 |
| Phase 2: Class Table | 5.5 |
| Phase 3: Supporting Cards | 4 |
| Phase 4: Polish | 3 |
| Testing | 2 |
| **Total** | **18.5 hours** |

---

## Future Enhancements

1. **Configurable card order** — Let users drag/reorder cards
2. **Collapsible cards** — Minimize cards they don't use
3. **Auto-refresh** — Real-time updates via WebSocket/polling
4. **Widget mode** — Embeddable mini-dashboard for home screen
5. **Trial selector** — Switch between trials without navigating away
