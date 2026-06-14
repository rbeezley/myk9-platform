# Dog Detail Soft Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard `PremiumGate` wall on 5 Dog Detail tabs with a blur overlay that renders real user data behind it, so free-tier exhibitors can see what they'd unlock.

**Architecture:** New `BlurGate` wrapper component always renders its children (data fetches normally), applying `filter: blur(4px)` and an absolute overlay when `locked={true}`. `DogDetailsTabs` swaps `PremiumGate` for `BlurGate` on all 5 premium tabs. `PremiumGate` is unchanged — still used elsewhere.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Router `useNavigate`, Vitest + Testing Library

---

## File Map

| Action | File                                                                       |
| ------ | -------------------------------------------------------------------------- |
| Create | `apps/myk9show/src/components/common/BlurGate.tsx`                         |
| Create | `apps/myk9show/src/components/common/BlurGate.test.tsx`                    |
| Modify | `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx`      |
| Create | `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx` |

---

## Task 1: BlurGate component

**Files:**

- Create: `apps/myk9show/src/components/common/BlurGate.tsx`
- Create: `apps/myk9show/src/components/common/BlurGate.test.tsx`

### Step 1.1 — Write failing tests

Create `apps/myk9show/src/components/common/BlurGate.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BlurGate } from './BlurGate';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('BlurGate', () => {
  it('renders children directly when not locked', () => {
    render(
      <BlurGate locked={false} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    expect(screen.getByText('premium content')).toBeInTheDocument();
    expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
  });

  it('renders children when locked (data still fetches)', () => {
    render(
      <BlurGate locked={true} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    expect(screen.getByText('premium content')).toBeInTheDocument();
  });

  it('shows overlay with title and description when locked', () => {
    render(
      <BlurGate locked={true} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    expect(screen.getByText('Premium Feature')).toBeInTheDocument();
    expect(screen.getByText('Title Progress')).toBeInTheDocument();
    expect(screen.getByText('Track your titles')).toBeInTheDocument();
  });

  it('does not show overlay when not locked', () => {
    render(
      <BlurGate locked={false} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
  });

  it('applies min-h to container when locked so overlay is usable on empty content', () => {
    const { container } = render(
      <BlurGate locked={true} title="Title Progress" description="Track your titles">
        <div style={{ height: 0 }} />
      </BlurGate>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/min-h-\[240px\]/);
  });

  it('navigates to /pricing-page when upgrade button is clicked', async () => {
    const { user } = render(
      <BlurGate locked={true} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    await user.click(screen.getByRole('button', { name: /upgrade to premium/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing-page');
  });
});
```

### Step 1.2 — Run tests to verify they fail

```bash
cd apps/myk9show && npx vitest run src/components/common/BlurGate.test.tsx
```

Expected: FAIL — `BlurGate` not found.

### Step 1.3 — Implement `BlurGate`

Create `apps/myk9show/src/components/common/BlurGate.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PremiumButton } from './PremiumButton';

export interface BlurGateProps {
  locked: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function BlurGate({ locked, title, description, children, className }: BlurGateProps) {
  const navigate = useNavigate();

  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative overflow-hidden min-h-[240px]', className)}>
      <div className="blur-[4px] pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/65 text-center px-6">
        <div className="bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full p-5 shadow-lg">
          <Crown className="h-10 w-10 text-white" />
        </div>
        <div className="space-y-2 max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Premium Feature
          </p>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <PremiumButton
          variant="primary"
          icon={Crown}
          onClick={() => navigate('/pricing-page')}
          className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 mt-2"
        >
          Upgrade to Premium
        </PremiumButton>
      </div>
    </div>
  );
}

export default BlurGate;
```

### Step 1.4 — Run tests to verify they pass

```bash
cd apps/myk9show && npx vitest run src/components/common/BlurGate.test.tsx
```

Expected: 6 tests PASS.

### Step 1.5 — Commit

```bash
git add apps/myk9show/src/components/common/BlurGate.tsx \
        apps/myk9show/src/components/common/BlurGate.test.tsx
git commit -m "feat(dogs): add BlurGate component for soft premium gating"
```

---

## Task 2: Wire BlurGate into DogDetailsTabs

**Files:**

- Modify: `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx`
- Create: `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx`

### Step 2.1 — Write failing tests

Create `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import DogDetailsTabs from './DogDetailsTabs';
import type { Dog } from '@/types/dog-types';

// Mock all lazy-loaded tab sections — they make real API calls
vi.mock('@/components/dogs/DogDetails/TrainingJournal/TrainingSection', () => ({
  default: () => <div>training section</div>,
}));
vi.mock('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection', () => ({
  default: () => <div>health records section</div>,
}));
vi.mock('@/components/dogs/DogDetails/Competitions/CompetitionsTabs', () => ({
  default: () => <div>competitions section</div>,
}));
vi.mock('@/components/dogs/DogDetails/TitleTracking/TitleProgressSection', () => ({
  default: () => <div>title progress section</div>,
}));
vi.mock('@/components/dogs/DogDetails/Pedigree/PedigreeSection', () => ({
  default: () => <div>pedigree section</div>,
}));
vi.mock('@/components/common/ActivityTimeline', () => ({
  default: () => <div>activity timeline</div>,
}));
vi.mock('@/components/dogs/DogDetails/Statistics/PerformanceStatisticsSection', () => ({
  default: () => <div>statistics section</div>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useSubscriptionGate', () => ({
  useSubscriptionGate: vi.fn(),
}));

import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';

const mockDog: Dog = {
  id: 'dog-1',
  name: 'Buddy',
  call_name: 'Buddy',
  breed: 'Border Collie',
  date_of_birth: '2020-01-01',
  sex: 'Male',
  owner_id: 'user-1',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
} as Dog;

describe('DogDetailsTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('free user (isPremium=false)', () => {
    beforeEach(() => {
      vi.mocked(useSubscriptionGate).mockReturnValue({
        isPremium: false,
        tier: 'free',
        isExpired: false,
        isInTrial: false,
        isLoading: false,
      });
    });

    it.each([
      ['Title Progress', "Monitor your dog's progress toward titles and certifications."],
      [
        'Statistics',
        "Visualize your dog's performance trends, qualification rates, and achievements.",
      ],
      ['Health Records', "Keep comprehensive health records for your dog's wellbeing."],
      ['Training Journal', "Document training sessions and track your dog's progress."],
      ['Pedigree', "Explore your dog's lineage and ancestry with detailed pedigree tracking."],
    ])('shows BlurGate overlay on %s tab', async (title, description) => {
      const { user } = render(<DogDetailsTabs dog={mockDog} />);

      // Click the tab to activate it
      await user.click(screen.getByRole('tab', { name: new RegExp(title, 'i') }));

      // "Premium Feature" label and description are unique to the overlay.
      // Don't assert on `title` directly — it also appears in the tab button.
      expect(screen.getByText('Premium Feature')).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
    });

    it('does not show BlurGate on free tabs', async () => {
      render(<DogDetailsTabs dog={mockDog} />);
      // Registrations tab is default — no overlay
      expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
    });
  });

  describe('premium user (isPremium=true)', () => {
    beforeEach(() => {
      vi.mocked(useSubscriptionGate).mockReturnValue({
        isPremium: true,
        tier: 'premium',
        isExpired: false,
        isInTrial: false,
        isLoading: false,
      });
    });

    it('does not show BlurGate overlay on Title Progress tab', async () => {
      const { user } = render(<DogDetailsTabs dog={mockDog} />);
      await user.click(screen.getByRole('tab', { name: /title progress/i }));
      expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
      expect(screen.getByText('title progress section')).toBeInTheDocument();
    });
  });
});
```

### Step 2.2 — Run tests to verify they fail

```bash
cd apps/myk9show && npx vitest run src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx
```

Expected: FAIL — tabs still use `PremiumGate`, not `BlurGate`.

### Step 2.3 — Update `DogDetailsTabs` to use `BlurGate`

Replace the full file at `apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx`:

```tsx
import React, { lazy, Suspense } from 'react';
import {
  Activity,
  BarChart3,
  Crown,
  FileText,
  Trophy,
  Stethoscope,
  BookOpen,
  GitBranch,
} from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import { BlurGate } from '@/components/common/BlurGate';
import { TabContentSkeleton } from './Skeletons';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import type { DogDetailsTabsProps } from './types';

// Lazy load heavy components
const TrainingSection = lazy(
  () => import('@/components/dogs/DogDetails/TrainingJournal/TrainingSection')
);
const HealthRecordsSection = lazy(
  () => import('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection')
);
const CompetitionsTabs = lazy(
  () => import('@/components/dogs/DogDetails/Competitions/CompetitionsTabs')
);
const TitleProgressSection = lazy(
  () => import('@/components/dogs/DogDetails/TitleTracking/TitleProgressSection')
);
const PedigreeSection = lazy(() => import('@/components/dogs/DogDetails/Pedigree/PedigreeSection'));
const ActivityTimeline = lazy(() => import('@/components/common/ActivityTimeline'));
const PerformanceStatisticsSection = lazy(
  () => import('@/components/dogs/DogDetails/Statistics/PerformanceStatisticsSection')
);

const TAB_IDS = [
  'registrations',
  'competitions',
  'title-progress',
  'statistics',
  'health-records',
  'training-journal',
  'pedigree',
  'activity',
] as const;

const DOG_TAB_DEFS: PrimaryTabDef[] = [
  { id: 'registrations', label: 'Registrations', icon: FileText },
  { id: 'competitions', label: 'Competitions', icon: Trophy },
  { id: 'title-progress', label: 'Title Progress', icon: Crown },
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
  { id: 'health-records', label: 'Health Records', icon: Stethoscope },
  { id: 'training-journal', label: 'Training Journal', icon: BookOpen },
  { id: 'pedigree', label: 'Pedigree', icon: GitBranch },
  { id: 'activity', label: 'Activity', icon: Activity },
];

const DogDetailsTabs: React.FC<DogDetailsTabsProps> = ({ dog, autoOpenAddRegistration }) => {
  const { isPremium } = useSubscriptionGate();
  const [activeTab, setActiveTab] = useUrlTab(TAB_IDS, 'registrations');

  return (
    <div className="space-y-6">
      <PrimaryTabs tabs={DOG_TAB_DEFS} value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="registrations" className="pt-6">
          <RegistrationsSection dog={dog} autoOpenAddDialog={autoOpenAddRegistration} />
        </TabsContent>

        <TabsContent value="competitions" className="pt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <CompetitionsTabs dogId={dog.id} isPremium={isPremium} />
          </Suspense>
        </TabsContent>

        <TabsContent value="title-progress" className="pt-6">
          <BlurGate
            locked={!isPremium}
            title="Title Progress"
            description="Monitor your dog's progress toward titles and certifications."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <TitleProgressSection dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>

        <TabsContent value="statistics" className="pt-6">
          <BlurGate
            locked={!isPremium}
            title="Statistics"
            description="Visualize your dog's performance trends, qualification rates, and achievements."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <PerformanceStatisticsSection dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>

        <TabsContent value="health-records" className="pt-6">
          <BlurGate
            locked={!isPremium}
            title="Health Records"
            description="Keep comprehensive health records for your dog's wellbeing."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <HealthRecordsSection user={{ isPremium }} dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>

        <TabsContent value="training-journal" className="pt-6">
          <BlurGate
            locked={!isPremium}
            title="Training Journal"
            description="Document training sessions and track your dog's progress."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <TrainingSection dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>

        <TabsContent value="pedigree" className="pt-6">
          <BlurGate
            locked={!isPremium}
            title="Pedigree"
            description="Explore your dog's lineage and ancestry with detailed pedigree tracking."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <PedigreeSection dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>

        <TabsContent value="activity" className="pt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <ActivityTimeline recordType="dog" recordId={dog.id} />
          </Suspense>
        </TabsContent>
      </PrimaryTabs>
    </div>
  );
};

export default DogDetailsTabs;
```

### Step 2.4 — Run tests to verify they pass

```bash
cd apps/myk9show && npx vitest run src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx
```

Expected: all tests PASS.

### Step 2.5 — Run the full BlurGate suite to confirm no regressions

```bash
cd apps/myk9show && npx vitest run src/components/common/BlurGate.test.tsx
```

Expected: 5 tests PASS.

### Step 2.6 — Typecheck

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: no errors.

### Step 2.7 — Commit

```bash
git add apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.tsx \
        apps/myk9show/src/components/dogs/DogDetailsMain/DogDetailsTabs.test.tsx
git commit -m "feat(dogs): replace hard PremiumGate with BlurGate on 5 Dog Detail tabs"
```

---

## Task 3: Mark todo complete and update TO-DOS.md

### Step 3.1 — Update TO-DOS.md

In `TO-DOS.md`, change:

```markdown
- [ ] **Revisit premium gating on Dog Detail** — 62% of tabs (5 of 8) are premium-gated. Free-tier exhibitors see a page that feels like a paywall. **Solution:** Consider read-only previews for locked tabs or reduce gated tabs to 2-3.
```

To:

```markdown
- [x] **Revisit premium gating on Dog Detail** — Done. Replaced hard PremiumGate wall with BlurGate on all 5 premium tabs (Title Progress, Statistics, Health Records, Training Journal, Pedigree). Free users see their real data blurred behind an upgrade overlay. 6 BlurGate unit tests + 7 DogDetailsTabs tests.
```

### Step 3.2 — Commit

```bash
git add TO-DOS.md
git commit -m "chore: mark Dog Detail soft gate done in TO-DOS"
```
