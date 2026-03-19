# Icon Consistency Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Lucide icons to all tab triggers and standalone action buttons that currently lack them, for a polished, professional look.

**Architecture:** Pure cosmetic changes — add icon imports and inline `<IconName className="h-4 w-4" />` elements before text in existing components. No new components, no prop changes, no architectural work.

**Tech Stack:** React, TypeScript, Lucide React icons, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-icon-consistency-policy-design.md`

---

### Task 1: ClubDetails tabs — add icons to 5 tab triggers

**Files:**

- Modify: `apps/myk9show/src/components/clubs/ClubDetails/index.tsx`

- [ ] **Step 1: Add icon imports**

Add to the existing import from `lucide-react` (line 2 currently imports only `Plus`):

```typescript
import { Plus, Calendar, History, Info, Users, Palette } from 'lucide-react';
```

- [ ] **Step 2: Add icon to "Upcoming Shows" tab trigger**

In the TabsTrigger at line 89-94, change the text content:

```tsx
<TabsTrigger
  value="upcoming"
  className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
>
  <Calendar className="h-4 w-4" />
  Upcoming Shows ({upcomingShows.length})
</TabsTrigger>
```

- [ ] **Step 3: Add icon to "Past Shows" tab trigger**

```tsx
<TabsTrigger
  value="past"
  className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
>
  <History className="h-4 w-4" />
  Past Shows ({pastShows.length})
</TabsTrigger>
```

- [ ] **Step 4: Add icon to "About" tab trigger**

```tsx
<TabsTrigger
  value="about"
  className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
>
  <Info className="h-4 w-4" />
  About
</TabsTrigger>
```

- [ ] **Step 5: Add icon to "Members" tab trigger**

```tsx
<TabsTrigger
  value="members"
  className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
>
  <Users className="h-4 w-4" />
  Members ({selectedClub.memberIds?.length || 0})
</TabsTrigger>
```

- [ ] **Step 6: Add icon to "Branding" tab trigger**

```tsx
<TabsTrigger
  value="branding"
  className="bg-transparent border-b-2 border-transparent rounded-none pb-3 px-0 font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent hover:text-foreground transition-colors"
>
  <Palette className="h-4 w-4" />
  Branding
</TabsTrigger>
```

- [ ] **Step 7: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/components/clubs/ClubDetails/index.tsx
git commit -m "feat(clubs): add icons to ClubDetails tab triggers"
```

---

### Task 2: JudgeDashboard — add icons to 3 tab triggers + "View Results" button

**Files:**

- Modify: `apps/myk9show/src/pages/JudgeDashboard.tsx`

- [ ] **Step 1: Add icon imports**

Add `CalendarDays`, `CheckCircle`, and `Eye` to the existing lucide-react import (line 12-22). `Calendar` and `CheckCircle2` are already imported — use `CalendarDays` for "Today" (distinct from `Calendar` used for "Upcoming") and `CheckCircle` for the tab (distinct from `CheckCircle2` used in stat cards):

```typescript
import {
  Trophy,
  Clock,
  Users,
  CheckCircle2,
  Circle,
  AlertCircle,
  Calendar,
  ArrowRight,
  Timer,
  CalendarDays,
  CheckCircle,
  Eye,
} from 'lucide-react';
```

- [ ] **Step 2: Add icon to "Today" tab trigger (line 275-277)**

Change:

```tsx
                  >
                    Today
                  </TabsTrigger>
```

To:

```tsx
                  >
                    <CalendarDays className="h-4 w-4" />
                    Today
                  </TabsTrigger>
```

- [ ] **Step 3: Add icon to "Upcoming" tab trigger (line 281-283)**

Change:

```tsx
                  >
                    Upcoming
                  </TabsTrigger>
```

To:

```tsx
                  >
                    <Calendar className="h-4 w-4" />
                    Upcoming
                  </TabsTrigger>
```

- [ ] **Step 4: Add icon to "Completed" tab trigger (line 287-289)**

Change:

```tsx
                  >
                    Completed
                  </TabsTrigger>
```

To:

```tsx
                  >
                    <CheckCircle className="h-4 w-4" />
                    Completed
                  </TabsTrigger>
```

- [ ] **Step 5: Add icon to "View Results" button (line 393-395)**

Change:

```tsx
                          >
                            View Results
                          </Button>
```

To:

```tsx
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Results
                          </Button>
```

- [ ] **Step 6: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/JudgeDashboard.tsx
git commit -m "feat(judge): add icons to JudgeDashboard tabs and View Results button"
```

---

### Task 3: TrialManagementTabs — add icons to 3 tab triggers + 3 buttons

**Files:**

- Modify: `apps/myk9show/src/pages/SecretaryDashboard/TrialManagementTabs.tsx`

- [ ] **Step 1: Add icon imports**

Add `Play`, `Calendar`, `CheckCircle`, `Eye`, `Download`, `Zap` to the existing lucide-react import (line 10-24). `Calendar` and `CheckCircle2` are already imported — add the new ones:

```typescript
import {
  ClipboardList,
  Users,
  TrendingUp,
  Settings,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Target,
  Timer,
  ChevronRight,
  PlayCircle,
  FolderOpen,
  Play,
  CheckCircle,
  Eye,
  Download,
  Zap,
} from 'lucide-react';
```

- [ ] **Step 2: Add icon to "Active" tab trigger (line 62-63)**

Change:

```tsx
            >
              Active
            </TabsTrigger>
```

To:

```tsx
            >
              <Play className="h-4 w-4" />
              Active
            </TabsTrigger>
```

- [ ] **Step 3: Add icon to "Upcoming" tab trigger (line 68-69)**

Change:

```tsx
            >
              Upcoming
            </TabsTrigger>
```

To:

```tsx
            >
              <Calendar className="h-4 w-4" />
              Upcoming
            </TabsTrigger>
```

- [ ] **Step 4: Add icon to "Completed" tab trigger (line 74-75)**

Change:

```tsx
            >
              Completed
            </TabsTrigger>
```

To:

```tsx
            >
              <CheckCircle className="h-4 w-4" />
              Completed
            </TabsTrigger>
```

- [ ] **Step 5: Add icon to "Quick Actions" button (line 198-199)**

Change:

```tsx
                      >
                        Quick Actions
                      </Button>
```

To:

```tsx
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Quick Actions
                      </Button>
```

- [ ] **Step 6: Add icon to "View Results" button (line 331-332)**

Change:

```tsx
                    >
                      View Results
                    </Button>
```

To:

```tsx
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Results
                    </Button>
```

- [ ] **Step 7: Add icon to "Export Report" button (line 337-338)**

Change:

```tsx
                    >
                      Export Report
                    </Button>
```

To:

```tsx
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Report
                    </Button>
```

- [ ] **Step 8: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/pages/SecretaryDashboard/TrialManagementTabs.tsx
git commit -m "feat(secretary): add icons to TrialManagementTabs tabs and buttons"
```

---

### Task 4: CompetitionsTabs — add icons to 3 tab triggers

**Files:**

- Modify: `apps/myk9show/src/components/dogs/DogDetails/Competitions/CompetitionsTabs.tsx`

- [ ] **Step 1: Update icon imports**

Line 3 currently imports `Plus`. Add the tab icons:

```typescript
import { Plus, Calendar, History, Award } from 'lucide-react';
```

- [ ] **Step 2: Add icons to tab config array**

Change the `tabs` array (line 13-17) to include icons:

```typescript
import type { LucideIcon } from 'lucide-react';

const tabs: { label: string; key: string; icon: LucideIcon }[] = [
  { label: 'Upcoming Shows', key: 'upcoming', icon: Calendar },
  { label: 'Past Results', key: 'past', icon: History },
  { label: 'Achievements', key: 'achievements', icon: Award },
];
```

- [ ] **Step 3: Render icons in TabsTrigger**

Change the TabsTrigger render (line 54-57):

```tsx
{
  tabs.map(tab => (
    <TabsTrigger key={tab.key} value={tab.key} className="myk9-sub-tab">
      <tab.icon className="h-4 w-4" />
      {tab.label}
    </TabsTrigger>
  ));
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/dogs/DogDetails/Competitions/CompetitionsTabs.tsx
git commit -m "feat(dogs): add icons to CompetitionsTabs tab triggers"
```

---

### Task 5: SyncMonitoringDashboard — add icons to 4 tab triggers

**Files:**

- Modify: `apps/myk9show/src/components/sync/SyncMonitoringDashboard/index.tsx`

- [ ] **Step 1: Add icon imports**

Add to the existing lucide-react import (line 2-7). `Wifi` and `GitBranch` are already imported. Add:

```typescript
import {
  RefreshCw,
  Clock,
  Wifi,
  GitBranch,
  LayoutDashboard,
  Gauge,
  AlertTriangle,
} from 'lucide-react';
```

- [ ] **Step 2: Add icons to tab triggers (lines 171-174)**

Change:

```tsx
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
```

To:

```tsx
          <TabsTrigger value="overview"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="performance"><Gauge className="h-4 w-4" />Performance</TabsTrigger>
          <TabsTrigger value="conflicts"><AlertTriangle className="h-4 w-4" />Conflicts</TabsTrigger>
          <TabsTrigger value="network"><Wifi className="h-4 w-4" />Network</TabsTrigger>
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/sync/SyncMonitoringDashboard/index.tsx
git commit -m "feat(sync): add icons to SyncMonitoringDashboard tab triggers"
```

---

### Task 6: DogDetailsTabs — add icon to "Competitions" tab

**Files:**

- Modify: `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx`

- [ ] **Step 1: Add Trophy to imports**

Line 2 currently imports `Activity, Crown, FileText`. Add `Trophy`:

```typescript
import { Activity, Crown, FileText, Trophy } from 'lucide-react';
```

- [ ] **Step 2: Add icon to "Competitions" tab trigger (line 52)**

Change:

```tsx
<TabsTrigger value="competitions">Competitions</TabsTrigger>
```

To:

```tsx
<TabsTrigger value="competitions">
  <Trophy className="h-4 w-4" />
  Competitions
</TabsTrigger>
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx
git commit -m "feat(dogs): add Trophy icon to Competitions tab trigger"
```

---

### Task 7: CartPage — add icon to "Browse Shows" empty state button

**Files:**

- Modify: `apps/myk9show/src/pages/CartPage.tsx`

- [ ] **Step 1: Add Eye to imports**

Line 10 currently imports `ShoppingCart, ArrowLeft, Trash2, AlertCircle`. Add `Eye`:

```typescript
import { ShoppingCart, ArrowLeft, Trash2, AlertCircle, Eye } from 'lucide-react';
```

- [ ] **Step 2: Add icon to "Browse Shows" button (line 111-112)**

Change:

```tsx
<Button onClick={() => navigate('/shows')} size="lg">
  Browse Shows
</Button>
```

To:

```tsx
<Button onClick={() => navigate('/shows')} size="lg">
  <Eye className="h-4 w-4 mr-2" />
  Browse Shows
</Button>
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/CartPage.tsx
git commit -m "feat(cart): add Eye icon to Browse Shows empty state button"
```

---

### Task 8: CheckoutCancelPage — add icons to 2 buttons

**Files:**

- Modify: `apps/myk9show/src/pages/CheckoutCancelPage.tsx`

- [ ] **Step 1: Add icons to imports**

Line 9 currently imports `XCircle, ShoppingCart, ArrowLeft`. Add `ArrowRight` and `Eye`:

```typescript
import { XCircle, ShoppingCart, ArrowLeft, ArrowRight, Eye } from 'lucide-react';
```

- [ ] **Step 2: Add icon to "Continue Shopping" button (line 67-73)**

Change:

```tsx
<Button variant="outline" className="w-full" onClick={() => navigate(`/shows/${cart.show_id}`)}>
  Continue Shopping
</Button>
```

To:

```tsx
<Button variant="outline" className="w-full" onClick={() => navigate(`/shows/${cart.show_id}`)}>
  <ArrowRight className="h-4 w-4 mr-2" />
  Continue Shopping
</Button>
```

- [ ] **Step 3: Add icon to "Browse Shows" button (line 77-79)**

Change:

```tsx
<Button className="w-full" onClick={() => navigate('/shows')}>
  Browse Shows
</Button>
```

To:

```tsx
<Button className="w-full" onClick={() => navigate('/shows')}>
  <Eye className="h-4 w-4 mr-2" />
  Browse Shows
</Button>
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/CheckoutCancelPage.tsx
git commit -m "feat(checkout): add icons to Continue Shopping and Browse Shows buttons"
```

---

### Task 9: TrialHeader — add aria-label to icon-only button

**Files:**

- Modify: `apps/myk9show/src/components/trials/TrialDetail/TrialHeader.tsx`

- [ ] **Step 1: Add aria-label to MoreVertical button (line 47)**

Change:

```tsx
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
```

To:

```tsx
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Trial options">
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/trials/TrialDetail/TrialHeader.tsx
git commit -m "fix(a11y): add aria-label to TrialHeader icon-only button"
```

---

### Task 10: Delete dead code ClubTabs.tsx

**Files:**

- Delete: `apps/myk9show/src/components/clubs/ClubTabs.tsx`

- [ ] **Step 1: Verify no imports reference ClubTabs**

Run: `grep -r "ClubTabs" apps/myk9show/src/ --include="*.tsx" --include="*.ts"`
Expected: Only the file itself appears (no other files import it).

- [ ] **Step 2: Delete the file**

```bash
rm apps/myk9show/src/components/clubs/ClubTabs.tsx
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A apps/myk9show/src/components/clubs/ClubTabs.tsx
git commit -m "chore: delete dead ClubTabs.tsx (replaced by ClubDetails/index.tsx)"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS with zero errors

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS with zero errors

- [ ] **Step 3: Visual spot-check** `[ADDED]`

Run `pnpm dev:show` and verify each changed component in the browser:

- ClubDetails tabs (navigate to a club detail page)
- JudgeDashboard tabs + View Results button (navigate to judge dashboard)
- TrialManagementTabs tabs + Quick Actions/View Results/Export Report buttons (navigate to secretary dashboard)
- CompetitionsTabs tabs (navigate to a dog detail page → Competitions tab)
- SyncMonitoringDashboard tabs (navigate to admin sync dashboard)
- DogDetailsTabs Competitions tab (navigate to a dog detail page)
- CartPage empty state Browse Shows button (navigate to /cart with empty cart)
- CheckoutCancelPage Continue Shopping + Browse Shows buttons (navigate to /checkout/cancel)
- TrialHeader three-dot menu button (navigate to a trial detail page, inspect for aria-label)

Confirm: icons render, spacing looks correct, no layout breakage.

- [ ] **Step 4: Update TO-DOS.md**

Mark the icon policy sub-item under "Trial Card Enhancements" as done (`[x]`). The two code items (counts + progress bar) were already completed in earlier commits; with this icon policy work, the entire "Trial Card Enhancements" section is complete.
