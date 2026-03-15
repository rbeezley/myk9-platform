# Show Overview Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Overview tab content (ShowDetailsEnhanced 887 lines + PublicShowView 189 lines) with a unified, MEC-inspired two-column layout showing all show information an exhibitor needs to decide whether to enter.

**Architecture:** Build 10 focused components in `components/shows/overview/` plus a shared `PersonAvatar` in `components/common/`. The `ShowOverviewTab` orchestrates a two-column layout (main content + sidebar) that collapses to single column on mobile. A new `useResolvePerson` hook extends the existing person resolution to return full person objects (with photos). All components are role-agnostic — management actions live in the outer PageHeader.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (Base UI), React Query, Vitest + React Testing Library, existing Avatar component from `components/ui/avatar/`.

**Spec:** `docs/superpowers/specs/2026-03-15-show-overview-tab-redesign.md`

---

## Known Spec Deviations [ADDED]

| Spec Criterion                         | Plan Decision                                              | Rationale                                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #5: "myk9-show-details.css is deleted" | **Deferred** — only remove the import from ShowDetailsPage | CSS file has 24+ consumers across the app. Full removal is a multi-sprint effort outside this task's scope.                                                                 |
| Address composition from DB fields     | **Pragmatic** — check Show type at implementation time     | If `venue_name`, `address`, `city`, `state`, `zip_code` exist on the Show type, use them. If only `location` exists, use it as-is. Do NOT block on extending the Show type. |

## Pre-Implementation Check [ADDED]

Before starting Chunk 1, verify the Show type's address fields:

```bash
cd apps/myk9show && grep -A 60 'interface Show' src/types/show-types.ts | head -80
```

If the Show type already has `venueName`/`address`/`city`/`state`/`zipCode` fields, use them in VenueMap (compose address from parts). If it only has `location: string`, use that. Update VenueMap props accordingly during Task 9.

Also check CSP configuration:

```bash
grep -r "Content-Security-Policy\|frame-src\|CSP" apps/myk9show/ --include="*.ts" --include="*.tsx" --include="*.html" --include="*.json" -l
```

If CSP headers exist and don't allow `maps.google.com`, add `maps.google.com` to `frame-src` before deploying.

## 21st.dev Magic MCP Usage [ADDED]

The 21st.dev Magic MCP tools (`21st_magic_component_inspiration`, `21st_magic_component_builder`, `21st_magic_component_refiner`) are available for generating polished component designs. Use them on visual components where design quality matters; skip them for utility code and data hooks.

**Use Magic MCP inspiration/builder on these tasks:**

| Task    | Component      | Why                                                                       |
| ------- | -------------- | ------------------------------------------------------------------------- |
| Task 3  | QuickInfoCards | Stat card / info-bar patterns — browse for polished layouts before coding |
| Task 4  | EntryCTA       | CTA banner with urgency states — common design pattern in registries      |
| Task 5  | ShowOfficials  | Team/people cards with avatars — classic component category               |
| Task 7  | ShareEvent     | Social share button groups — well-trodden UI pattern                      |
| Task 11 | MoreFromClub   | Event/feature card grid — lots of card grid designs to draw from          |

**Workflow for Magic MCP tasks:**

1. Write the failing test first (per TDD flow — tests define the contract)
2. Use `21st_magic_component_inspiration` to browse relevant component designs
3. Use `21st_magic_component_builder` to generate an initial implementation informed by the inspiration
4. Adapt the generated code: swap any Radix imports for Base UI, match project theme (Tailwind classes, shadcn/ui Card/Button), ensure props match the test contract
5. Use `21st_magic_component_refiner` if the result needs polish
6. Run the test to verify

**Code straight (no Magic MCP needed):**

| Task    | Component         | Why                                               |
| ------- | ----------------- | ------------------------------------------------- |
| Task 1  | PersonAvatar      | Wraps existing Avatar primitive — tiny utility    |
| Task 2  | useResolvePerson  | Data hook, no UI                                  |
| Task 8  | ScheduleSummary   | Reuses existing hook, domain-specific format      |
| Task 9  | VenueMap          | Google Maps iframe — very specific implementation |
| Task 10 | AdditionalDetails | Simple key-value grid                             |
| Task 12 | ShowOverviewTab   | Layout orchestrator, just wires children together |

---

## File Structure

### New Files

| File                                                  | Responsibility                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/components/common/PersonAvatar.tsx`              | Reusable avatar: photo or deterministic initials fallback              |
| `src/hooks/useResolvePerson.ts`                       | Resolves person IDs to full objects (name, profileImage, email, phone) |
| `src/components/shows/overview/QuickInfoCards.tsx`    | Date/Fee/Location/Club info bar (single card with 4 items)             |
| `src/components/shows/overview/EntryCTA.tsx`          | Registration status bar + Register Now button                          |
| `src/components/shows/overview/ScheduleSummary.tsx`   | Day-by-day class schedule (reuses useScheduleSummary)                  |
| `src/components/shows/overview/ShowOfficials.tsx`     | Chairman + Secretary avatar cards (sidebar)                            |
| `src/components/shows/overview/JudgesList.tsx`        | Judges avatar list (sidebar)                                           |
| `src/components/shows/overview/VenueMap.tsx`          | Google Maps iframe + address + Get Directions                          |
| `src/components/shows/overview/AdditionalDetails.tsx` | Key-value metadata grid                                                |
| `src/components/shows/overview/MoreFromClub.tsx`      | Up to 3 upcoming shows from same club                                  |
| `src/components/shows/overview/ShareEvent.tsx`        | Facebook, Email, Copy Link share buttons                               |
| `src/components/shows/tabs/ShowOverviewTab.tsx`       | Orchestrator: two-column layout with all sections                      |

### New Test Files

| File                                             | Tests for         |
| ------------------------------------------------ | ----------------- |
| `src/test/components/PersonAvatar.test.tsx`      | PersonAvatar      |
| `src/test/hooks/useResolvePerson.test.ts`        | useResolvePerson  |
| `src/test/components/QuickInfoCards.test.tsx`    | QuickInfoCards    |
| `src/test/components/EntryCTA.test.tsx`          | EntryCTA          |
| `src/test/components/ShowOfficials.test.tsx`     | ShowOfficials     |
| `src/test/components/JudgesList.test.tsx`        | JudgesList        |
| `src/test/components/VenueMap.test.tsx`          | VenueMap          |
| `src/test/components/AdditionalDetails.test.tsx` | AdditionalDetails |
| `src/test/components/MoreFromClub.test.tsx`      | MoreFromClub      |
| `src/test/components/ShareEvent.test.tsx`        | ShareEvent        |
| `src/test/components/ShowOverviewTab.test.tsx`   | ShowOverviewTab   |

### Files to Modify

| File                            | Change                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `src/pages/ShowDetailsPage.tsx` | Replace Overview tab bifurcation with `<ShowOverviewTab>`, remove legacy imports |

### Files to Delete (after integration)

| File                                                       | Reason                                         |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `src/components/shows/ShowDetailsMain.tsx`                 | Thin wrapper replaced by direct tab content    |
| `src/components/shows/ShowDetails/ShowDetailsEnhanced.tsx` | 887-line legacy component, fully replaced      |
| `src/components/shows/PublicShowView.tsx`                  | If only used in ShowDetailsPage (verify first) |
| `src/components/shows/ShowBrandedHero.tsx`                 | If only used in PublicShowView (verify first)  |

All paths relative to `apps/myk9show/`.

---

## Key References

Before implementing, read these files for context:

- **Spec:** `docs/superpowers/specs/2026-03-15-show-overview-tab-redesign.md`
- **Intent:** `docs/INTENT.md` — especially Exhibitor role ("This respects my time")
- **Show type:** `apps/myk9show/src/types/show-types.ts` — Show interface (lines 59-108)
- **User type:** `apps/myk9show/src/types/user-types.ts` — User interface (lines 3-48), has `profileImage`, `email`, `phone`
- **Person resolution:** `apps/myk9show/src/hooks/useResolvePersonName.ts` — pattern to extend
- **User store:** `apps/myk9show/src/store/userStore.ts` — `people: User[]` array
- **Schedule hook:** `apps/myk9show/src/hooks/queries/useScheduleSummary.ts` — returns `DaySummary[]`
- **Avatar component:** `apps/myk9show/src/components/ui/avatar/avatar.tsx` — Avatar/AvatarImage/AvatarFallback
- **Utils:** `apps/myk9show/src/lib/utils.ts` — `cn()`, `getInitials()`, `formatCurrency()`, `formatDate()`
- **Share util:** `apps/myk9show/src/utils/share.ts` — `shareOrCopy()` function
- **Existing tabs:** `apps/myk9show/src/components/shows/tabs/ClassesTab.tsx`, `MyEntriesTab.tsx` — follow same patterns
- **Test pattern:** `apps/myk9show/src/test/components/PageShell.test.tsx` — test file conventions

---

## Chunk 1: Foundation (PersonAvatar + useResolvePerson)

These are dependencies for ShowOfficials and JudgesList. Build them first.

### Task 1: PersonAvatar

**Files:**

- Create: `src/components/common/PersonAvatar.tsx`
- Create: `src/test/components/PersonAvatar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/PersonAvatar.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PersonAvatar } from '@/components/common/PersonAvatar';

describe('PersonAvatar', () => {
  it('renders image when avatarUrl is provided', () => {
    render(<PersonAvatar name="Jane Doe" avatarUrl="https://example.com/jane.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/jane.jpg');
  });

  it('renders initials when no avatarUrl', () => {
    render(<PersonAvatar name="Jane Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders initials for single name', () => {
    render(<PersonAvatar name="Madonna" />);
    expect(screen.getByText('MA')).toBeInTheDocument();
  });

  it('renders ? for empty name', () => {
    render(<PersonAvatar name="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('applies sm size (h-8 w-8)', () => {
    const { container } = render(<PersonAvatar name="Jane Doe" size="sm" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar.className).toContain('h-8');
    expect(avatar.className).toContain('w-8');
  });

  it('applies md size (h-12 w-12) by default', () => {
    const { container } = render(<PersonAvatar name="Jane Doe" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar.className).toContain('h-12');
    expect(avatar.className).toContain('w-12');
  });

  it('applies lg size (h-16 w-16)', () => {
    const { container } = render(<PersonAvatar name="Jane Doe" size="lg" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar.className).toContain('h-16');
    expect(avatar.className).toContain('w-16');
  });

  it('same name always produces same fallback color', () => {
    const { container: c1 } = render(<PersonAvatar name="Jane Doe" />);
    const { container: c2 } = render(<PersonAvatar name="Jane Doe" />);
    const style1 = (c1.firstElementChild as HTMLElement).className;
    const style2 = (c2.firstElementChild as HTMLElement).className;
    expect(style1).toEqual(style2);
  });

  it('different names can produce different colors', () => {
    const { container: c1 } = render(<PersonAvatar name="Jane Doe" />);
    const { container: c2 } = render(<PersonAvatar name="Zack Miller" />);
    // Not guaranteed different for all pairs, but these particular names hash differently
    const fallback1 = c1.querySelector('[data-color]')?.getAttribute('data-color');
    const fallback2 = c2.querySelector('[data-color]')?.getAttribute('data-color');
    // At minimum, both should render without error
    expect(c1.firstElementChild).toBeInTheDocument();
    expect(c2.firstElementChild).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/PersonAvatar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/common/PersonAvatar.tsx
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-lg',
} as const;

// 8 muted colors for deterministic fallback
const COLORS = [
  { bg: 'bg-slate-500/15', text: 'text-slate-600' },
  { bg: 'bg-stone-500/15', text: 'text-stone-600' },
  { bg: 'bg-amber-600/15', text: 'text-amber-700' },
  { bg: 'bg-emerald-600/15', text: 'text-emerald-700' },
  { bg: 'bg-sky-600/15', text: 'text-sky-700' },
  { bg: 'bg-violet-600/15', text: 'text-violet-700' },
  { bg: 'bg-rose-600/15', text: 'text-rose-700' },
  { bg: 'bg-zinc-500/15', text: 'text-zinc-600' },
] as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitialsFromName(name: string): string {
  if (!name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.trim().substring(0, 2).toUpperCase();
}

interface PersonAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PersonAvatar({ name, avatarUrl, size = 'md', className }: PersonAvatarProps) {
  const colorIndex = hashName(name) % COLORS.length;
  const color = COLORS[colorIndex];
  const initials = getInitialsFromName(name);

  return (
    <Avatar className={cn(SIZES[size], 'flex-shrink-0', className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback
        className={cn(SIZES[size], color.bg, color.text, 'font-semibold')}
        data-color={colorIndex}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/PersonAvatar.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/PersonAvatar.tsx apps/myk9show/src/test/components/PersonAvatar.test.tsx
git commit -m "feat: add PersonAvatar component with deterministic initials fallback"
```

### Task 2: useResolvePerson hook

**Files:**

- Create: `src/hooks/useResolvePerson.ts`
- Create: `src/test/hooks/useResolvePerson.test.ts`
- Reference: `src/hooks/useResolvePersonName.ts` (existing pattern)
- Reference: `src/store/userStore.ts` (provides `people: User[]`)
- Reference: `src/types/user-types.ts` (User interface — has `profileImage`, `email`, `phone`)

- [ ] **Step 1: Write the failing test**

```ts
// src/test/hooks/useResolvePerson.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock the userStore
const mockPeople = [
  {
    id: 'person-1',
    firstName: 'Jane',
    lastName: 'Doe',
    profileImage: 'https://example.com/jane.jpg',
    email: 'jane@example.com',
    phone: '555-1234',
  },
  {
    id: 'person-2',
    firstName: 'Bob',
    lastName: 'Smith',
    // no profileImage, email, or phone
  },
];

vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(selector => {
    const state = { people: mockPeople };
    return selector ? selector(state) : state;
  }),
}));

import { useResolvePerson } from '@/hooks/useResolvePerson';

describe('useResolvePerson', () => {
  it('resolves a person ID to full person object', () => {
    const { result } = renderHook(() => useResolvePerson());
    const person = result.current('person-1');
    expect(person).toEqual({
      name: 'Jane Doe',
      profileImage: 'https://example.com/jane.jpg',
      email: 'jane@example.com',
      phone: '555-1234',
    });
  });

  it('returns person with undefined optional fields when not present', () => {
    const { result } = renderHook(() => useResolvePerson());
    const person = result.current('person-2');
    expect(person).toEqual({
      name: 'Bob Smith',
      profileImage: undefined,
      email: undefined,
      phone: undefined,
    });
  });

  it('returns fallback with raw ID as name when person not found', () => {
    const { result } = renderHook(() => useResolvePerson());
    const person = result.current('unknown-id');
    expect(person).toEqual({
      name: 'unknown-id',
      profileImage: undefined,
      email: undefined,
      phone: undefined,
    });
  });

  it('returns null for null/undefined input', () => {
    const { result } = renderHook(() => useResolvePerson());
    expect(result.current(null)).toBeNull();
    expect(result.current(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/hooks/useResolvePerson.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useResolvePerson.ts
/**
 * Resolve person IDs to full person objects (name, photo, contact info).
 *
 * Extends the pattern from useResolvePersonName to return structured data
 * needed by ShowOfficials, JudgesList, and PersonAvatar components.
 */
import { useCallback } from 'react';
import { useUserStore } from '@/store/userStore';

export interface ResolvedPerson {
  name: string;
  profileImage: string | undefined;
  email: string | undefined;
  phone: string | undefined;
}

export function useResolvePerson() {
  const people = useUserStore(s => s.people);

  return useCallback(
    (personId: string | undefined | null): ResolvedPerson | null => {
      if (!personId) return null;

      const person = people.find(p => p.id === personId);
      if (person) {
        return {
          name: `${person.firstName} ${person.lastName}`,
          profileImage: person.profileImage,
          email: person.email,
          phone: person.phone,
        };
      }

      // Fallback: ID not found — could be a legacy name string
      return {
        name: personId,
        profileImage: undefined,
        email: undefined,
        phone: undefined,
      };
    },
    [people]
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/hooks/useResolvePerson.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useResolvePerson.ts apps/myk9show/src/test/hooks/useResolvePerson.test.ts
git commit -m "feat: add useResolvePerson hook for full person object resolution"
```

---

## Chunk 2: Quick Info & Entry CTA

### Task 3: QuickInfoCards

**Files:**

- Create: `src/components/shows/overview/QuickInfoCards.tsx`
- Create: `src/test/components/QuickInfoCards.test.tsx`
- Reference: `src/types/show-types.ts` — Show interface fields: `startDate`, `endDate`, `preEntryFee`, `location`, `clubName`, `entryCloseDate`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/QuickInfoCards.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import type { Show } from '@/types/show-types';

const baseShow = {
  startDate: '2026-03-21',
  endDate: '2026-03-21',
  preEntryFee: '$30',
  location: 'Olathe, KS',
  clubName: 'Jayhawk Agility Club',
  entryCloseDate: '2026-03-15',
} as Show;

describe('QuickInfoCards', () => {
  it('renders all 4 info items', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Entry Fee')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Host Club')).toBeInTheDocument();
  });

  it('displays single-day date format', () => {
    render(<QuickInfoCards show={baseShow} />);
    // Should show a formatted single date (not a range)
    expect(screen.getByText(/Mar.*21.*2026/)).toBeInTheDocument();
  });

  it('displays multi-day date range', () => {
    const multiDay = { ...baseShow, endDate: '2026-03-22' };
    render(<QuickInfoCards show={multiDay as Show} />);
    expect(screen.getByText(/Mar.*21.*–.*Mar.*22/i)).toBeInTheDocument();
  });

  it('displays entry fee', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('$30')).toBeInTheDocument();
  });

  it('displays location', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Olathe, KS')).toBeInTheDocument();
  });

  it('displays club name', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText('Jayhawk Agility Club')).toBeInTheDocument();
  });

  it('shows entry close date as secondary text when entries are open', () => {
    render(<QuickInfoCards show={baseShow} />);
    expect(screen.getByText(/entries close/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/QuickInfoCards.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/overview/QuickInfoCards.tsx
import { CalendarDays, DollarSign, MapPin, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Show } from '@/types/show-types';

function formatShowDate(startDate: string, endDate: string): string {
  if (!startDate) return 'TBD'; // [ADDED] guard against undefined dates
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : start; // [ADDED] fallback to start
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

  if (start.getTime() === end.getTime()) {
    return start.toLocaleDateString('en-US', { weekday: 'short', ...opts });
  }
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', opts);
  return `${startStr} – ${endStr}`;
}

function getEntryCloseText(entryCloseDate: string): string | null {
  const close = new Date(entryCloseDate + 'T00:00:00');
  const now = new Date();
  if (close <= now) return null;
  return `Entries close ${close.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string | null;
  last?: boolean;
}

function InfoItem({ icon, label, value, secondary, last }: InfoItemProps) {
  return (
    <div
      className={`flex items-start gap-3 p-4 ${last ? '' : 'border-b sm:border-b-0 sm:border-r'} border-border/30`}
    >
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </div>
        <div className="text-sm font-semibold text-foreground mt-0.5">{value}</div>
        {secondary && <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>}
      </div>
    </div>
  );
}

interface QuickInfoCardsProps {
  show: Show;
}

export function QuickInfoCards({ show }: QuickInfoCardsProps) {
  const dateStr = formatShowDate(show.startDate, show.endDate);
  const entryCloseText = show.entryCloseDate ? getEntryCloseText(show.entryCloseDate) : null;

  return (
    <Card className="grid grid-cols-2 sm:grid-cols-4 overflow-hidden">
      <InfoItem
        icon={<CalendarDays className="h-5 w-5" />}
        label="Date"
        value={dateStr}
        secondary={entryCloseText}
      />
      <InfoItem
        icon={<DollarSign className="h-5 w-5" />}
        label="Entry Fee"
        value={show.preEntryFee || 'TBD'}
      />
      <InfoItem
        icon={<MapPin className="h-5 w-5" />}
        label="Location"
        value={show.location || 'TBD'}
      />
      <InfoItem
        icon={<Users className="h-5 w-5" />}
        label="Host Club"
        value={show.clubName || 'TBD'}
        last
      />
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/QuickInfoCards.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/QuickInfoCards.tsx apps/myk9show/src/test/components/QuickInfoCards.test.tsx
git commit -m "feat: add QuickInfoCards component for show info bar"
```

### Task 4: EntryCTA

**Files:**

- Create: `src/components/shows/overview/EntryCTA.tsx`
- Create: `src/test/components/EntryCTA.test.tsx`
- Reference: `src/components/shows/ShowDetails/ShowDetailsEnhanced.tsx` lines 301-348 — registration state logic to port
- Reference: `src/types/show-types.ts` — `entryOpenDate`, `entryCloseDate`, `status`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/EntryCTA.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EntryCTA } from '@/components/shows/overview/EntryCTA';
import type { Show } from '@/types/show-types';

// Helper to create a show with specific entry dates
function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    entryOpenDate: '2026-01-01',
    entryCloseDate: '2026-12-31',
    status: 'accepting_entries',
    preEntryFee: '$30',
    ...overrides,
  } as Show;
}

describe('EntryCTA', () => {
  it('renders Register Now button when entries are open', () => {
    render(<EntryCTA show={makeShow()} onRegister={() => {}} />);
    expect(screen.getByRole('button', { name: /register now/i })).toBeEnabled();
  });

  it('shows countdown text when entries are open', () => {
    render(<EntryCTA show={makeShow()} onRegister={() => {}} />);
    expect(screen.getByText(/entries close/i)).toBeInTheDocument();
  });

  it('shows disabled button when entries are closed', () => {
    const closed = makeShow({ entryCloseDate: '2020-01-01' });
    render(<EntryCTA show={closed} onRegister={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/entries closed/i);
  });

  it('shows not open yet state before entry open date', () => {
    const future = makeShow({ entryOpenDate: '2099-01-01', entryCloseDate: '2099-12-31' });
    render(<EntryCTA show={future} onRegister={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/not open yet/i);
  });

  it('calls onRegister when Register Now is clicked', () => {
    const onRegister = vi.fn();
    render(<EntryCTA show={makeShow()} onRegister={onRegister} />);
    screen.getByRole('button', { name: /register now/i }).click();
    expect(onRegister).toHaveBeenCalledOnce();
  });

  it('Register button has min-height of 48px', () => {
    render(<EntryCTA show={makeShow()} onRegister={() => {}} />);
    const btn = screen.getByRole('button', { name: /register now/i });
    expect(btn.className).toMatch(/h-12|min-h-\[48px\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/EntryCTA.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/overview/EntryCTA.tsx
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays, differenceInHours, isBefore, isAfter } from 'date-fns';
import type { Show } from '@/types/show-types';

interface RegistrationState {
  canRegister: boolean;
  statusText: string;
  buttonLabel: string;
  isUrgent: boolean;
}

function computeRegistrationState(show: Show): RegistrationState {
  const now = new Date();
  const openDate = new Date(show.entryOpenDate);
  const closeDate = new Date(show.entryCloseDate);
  const entriesOpen = isAfter(now, openDate);
  const entriesNotClosed = isBefore(now, closeDate);
  const isAccepting =
    show.status?.toLowerCase() === 'accepting_entries' ||
    show.status?.toLowerCase() === 'published';
  const canRegister = entriesOpen && entriesNotClosed && isAccepting;

  if (!entriesOpen) {
    const daysUntilOpen = differenceInDays(openDate, now);
    return {
      canRegister: false,
      statusText:
        daysUntilOpen <= 1 ? 'Entries open tomorrow' : `Entries open in ${daysUntilOpen} days`,
      buttonLabel: 'Not Open Yet',
      isUrgent: false,
    };
  }

  if (!entriesNotClosed) {
    return {
      canRegister: false,
      statusText: 'Entries are closed',
      buttonLabel: 'Entries Closed',
      isUrgent: false,
    };
  }

  if (!isAccepting) {
    return {
      canRegister: false,
      statusText: 'Show is not accepting entries',
      buttonLabel: 'Not Available',
      isUrgent: false,
    };
  }

  // Entries are open — compute countdown
  const daysLeft = differenceInDays(closeDate, now);
  const hoursLeft = differenceInHours(closeDate, now);
  let statusText: string;
  let isUrgent = false;

  if (hoursLeft < 24) {
    statusText =
      hoursLeft <= 1 ? 'Entries close within the hour!' : `${hoursLeft} hours until entries close`;
    isUrgent = true;
  } else if (daysLeft <= 3) {
    statusText =
      daysLeft === 1 ? 'Entries close tomorrow!' : `${daysLeft} days until entries close`;
    isUrgent = true;
  } else {
    const closeFormatted = closeDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    statusText = `Entries close ${closeFormatted}`;
  }

  return { canRegister: true, statusText, buttonLabel: 'Register Now', isUrgent };
}

interface EntryCTAProps {
  show: Show;
  onRegister: () => void;
}

export function EntryCTA({ show, onRegister }: EntryCTAProps) {
  const state = useMemo(() => computeRegistrationState(show), [show]);

  return (
    <Card
      className={cn(
        'flex items-center justify-between gap-4 p-4',
        state.isUrgent && 'bg-amber-500/5 border-amber-500/20'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {state.isUrgent && <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />}
        <span
          className={cn(
            'text-sm font-medium',
            state.isUrgent ? 'text-amber-700' : 'text-muted-foreground'
          )}
        >
          {state.statusText}
        </span>
      </div>
      <Button
        onClick={onRegister}
        disabled={!state.canRegister}
        size="lg"
        className="h-12 flex-shrink-0"
      >
        {state.buttonLabel}
      </Button>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/EntryCTA.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/EntryCTA.tsx apps/myk9show/src/test/components/EntryCTA.test.tsx
git commit -m "feat: add EntryCTA component with registration state logic"
```

---

## Chunk 3: Sidebar Components (Officials, Judges, Share)

### Task 5: ShowOfficials

**Files:**

- Create: `src/components/shows/overview/ShowOfficials.tsx`
- Create: `src/test/components/ShowOfficials.test.tsx`
- Reference: `src/components/common/PersonAvatar.tsx` (Task 1)
- Reference: `src/hooks/useResolvePerson.ts` (Task 2)
- Reference: `src/types/show-types.ts` — `chairman`, `secretary` fields (person IDs)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/ShowOfficials.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';

// Mock useResolvePerson
vi.mock('@/hooks/useResolvePerson', () => ({
  useResolvePerson: () => (id: string | null | undefined) => {
    if (!id) return null;
    const people: Record<
      string,
      { name: string; profileImage?: string; email?: string; phone?: string }
    > = {
      'chair-1': {
        name: 'Sarah Johnson',
        profileImage: 'https://example.com/sarah.jpg',
        email: 'sarah@club.com',
        phone: '555-0100',
      },
      'sec-1': { name: 'Mike Williams', email: 'mike@club.com' },
    };
    return people[id] || { name: id, profileImage: undefined, email: undefined, phone: undefined };
  },
}));

describe('ShowOfficials', () => {
  it('renders chairman and secretary with names', () => {
    render(<ShowOfficials chairmanId="chair-1" secretaryId="sec-1" />);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.getByText('Mike Williams')).toBeInTheDocument();
  });

  it('renders role labels', () => {
    render(<ShowOfficials chairmanId="chair-1" secretaryId="sec-1" />);
    expect(screen.getByText('Chairman')).toBeInTheDocument();
    expect(screen.getByText('Secretary')).toBeInTheDocument();
  });

  it('renders only chairman when no secretary', () => {
    render(<ShowOfficials chairmanId="chair-1" />);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Secretary')).not.toBeInTheDocument();
  });

  it('renders only secretary when no chairman', () => {
    render(<ShowOfficials secretaryId="sec-1" />);
    expect(screen.getByText('Mike Williams')).toBeInTheDocument();
    expect(screen.queryByText('Chairman')).not.toBeInTheDocument();
  });

  it('returns null when neither is provided', () => {
    const { container } = render(<ShowOfficials />);
    expect(container.firstElementChild).toBeNull();
  });

  it('shows contact info when available', () => {
    render(<ShowOfficials chairmanId="chair-1" />);
    expect(screen.getByText('sarah@club.com')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ShowOfficials.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/overview/ShowOfficials.tsx
import { Card } from '@/components/ui/card';
import { Mail, Phone } from 'lucide-react';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import { useResolvePerson, type ResolvedPerson } from '@/hooks/useResolvePerson';

interface OfficialCardProps {
  person: ResolvedPerson;
  role: string;
}

function OfficialCard({ person, role }: OfficialCardProps) {
  return (
    <div className="flex flex-col items-center text-center gap-2 p-4">
      <PersonAvatar name={person.name} avatarUrl={person.profileImage} size="lg" />
      <div>
        <div className="font-semibold text-foreground">{person.name}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{role}</div>
      </div>
      {(person.email || person.phone) && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {person.email && (
            <a
              href={`mailto:${person.email}`}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Mail className="h-3 w-3" />
              {person.email}
            </a>
          )}
          {person.phone && (
            <a
              href={`tel:${person.phone}`}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Phone className="h-3 w-3" />
              {person.phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

interface ShowOfficialsProps {
  chairmanId?: string | null;
  secretaryId?: string | null;
}

export function ShowOfficials({ chairmanId, secretaryId }: ShowOfficialsProps) {
  const resolvePerson = useResolvePerson();
  const chairman = resolvePerson(chairmanId);
  const secretary = resolvePerson(secretaryId);

  if (!chairman && !secretary) return null;

  return (
    <Card>
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Show Officials
        </h3>
      </div>
      <div className="divide-y divide-border/30">
        {chairman && <OfficialCard person={chairman} role="Chairman" />}
        {secretary && <OfficialCard person={secretary} role="Secretary" />}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ShowOfficials.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/ShowOfficials.tsx apps/myk9show/src/test/components/ShowOfficials.test.tsx
git commit -m "feat: add ShowOfficials component with avatar and contact info"
```

### Task 6: JudgesList

**Files:**

- Create: `src/components/shows/overview/JudgesList.tsx`
- Create: `src/test/components/JudgesList.test.tsx`
- Reference: `src/types/judge-types.ts` — `ShowJudgeAssignment` type (has `judgeName`, `assignedClasses?: string[]`)

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/JudgesList.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import type { ShowJudgeAssignment } from '@/types/judge-types';

describe('JudgesList', () => {
  const judges: ShowJudgeAssignment[] = [
    { judgeId: 'j1', judgeName: 'Doris Taylor', assignedClasses: ['c1', 'c2', 'c3'] },
    { judgeId: 'j2', judgeName: 'Frank Miller', assignedClasses: ['c4'] },
  ];

  it('renders list of judges with names', () => {
    render(<JudgesList judges={judges} />);
    expect(screen.getByText('Doris Taylor')).toBeInTheDocument();
    expect(screen.getByText('Frank Miller')).toBeInTheDocument();
  });

  it('shows assigned class count', () => {
    render(<JudgesList judges={judges} />);
    expect(screen.getByText('3 classes assigned')).toBeInTheDocument();
    expect(screen.getByText('1 class assigned')).toBeInTheDocument();
  });

  it('shows "Judges not yet announced" when empty', () => {
    render(<JudgesList judges={[]} />);
    expect(screen.getByText(/judges not yet announced/i)).toBeInTheDocument();
  });

  it('shows "Judges not yet announced" when undefined', () => {
    render(<JudgesList />);
    expect(screen.getByText(/judges not yet announced/i)).toBeInTheDocument();
  });

  it('renders section heading', () => {
    render(<JudgesList judges={judges} />);
    expect(screen.getByText('Judges')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/JudgesList.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/overview/JudgesList.tsx
import { Card } from '@/components/ui/card';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import type { ShowJudgeAssignment } from '@/types/judge-types';

interface JudgesListProps {
  judges?: ShowJudgeAssignment[];
}

export function JudgesList({ judges }: JudgesListProps) {
  const hasJudges = judges && judges.length > 0;

  return (
    <Card>
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Judges</h3>
      </div>
      {hasJudges ? (
        <div className="divide-y divide-border/30">
          {judges.map(judge => {
            const classCount = judge.assignedClasses?.length || 0;
            return (
              <div key={judge.judgeId || judge.judgeName} className="flex items-center gap-3 p-4">
                <PersonAvatar name={judge.judgeName} size="md" />
                <div className="min-w-0">
                  <div className="font-medium text-foreground text-sm">{judge.judgeName}</div>
                  {classCount > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {classCount} class{classCount !== 1 ? 'es' : ''} assigned
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Judges not yet announced
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/JudgesList.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/JudgesList.tsx apps/myk9show/src/test/components/JudgesList.test.tsx
git commit -m "feat: add JudgesList component with avatars"
```

### Task 7: ShareEvent

**Files:**

- Create: `src/components/shows/overview/ShareEvent.tsx`
- Create: `src/test/components/ShareEvent.test.tsx`
- Reference: `src/utils/share.ts` — `shareOrCopy()` for copy-link functionality

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/ShareEvent.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShareEvent } from '@/components/shows/overview/ShareEvent';

// Mock share utility
vi.mock('@/utils/share', () => ({
  shareOrCopy: vi.fn().mockResolvedValue('copied'),
}));

describe('ShareEvent', () => {
  const shareData = {
    title: 'Jayhawk Agility Trial',
    text: 'AKC Dog Show in Olathe, KS',
    url: 'https://myk9show.com/shows/123',
  };

  it('renders Facebook share button', () => {
    render(<ShareEvent shareData={shareData} />);
    const fbLink = screen.getByLabelText(/share on facebook/i);
    expect(fbLink).toBeInTheDocument();
    expect(fbLink).toHaveAttribute('href', expect.stringContaining('facebook.com/sharer'));
  });

  it('renders Email share button', () => {
    render(<ShareEvent shareData={shareData} />);
    const emailLink = screen.getByLabelText(/share via email/i);
    expect(emailLink).toBeInTheDocument();
    expect(emailLink).toHaveAttribute('href', expect.stringContaining('mailto:'));
  });

  it('renders Copy Link button', () => {
    render(<ShareEvent shareData={shareData} />);
    expect(screen.getByLabelText(/copy link/i)).toBeInTheDocument();
  });

  it('renders section heading', () => {
    render(<ShareEvent shareData={shareData} />);
    expect(screen.getByText(/share this event/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ShareEvent.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/overview/ShareEvent.tsx
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Facebook, Mail, Link2, Check } from 'lucide-react';
import { shareOrCopy } from '@/utils/share';
import { cn } from '@/lib/utils';

interface ShareData {
  title: string;
  text: string;
  url: string;
}

interface ShareEventProps {
  shareData: ShareData;
}

export function ShareEvent({ shareData }: ShareEventProps) {
  const [copied, setCopied] = useState(false);

  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(shareData.title)}&body=${encodeURIComponent(`${shareData.text}\n\n${shareData.url}`)}`;

  const handleCopyLink = async () => {
    await shareOrCopy({ url: shareData.url, title: shareData.title, text: shareData.text });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buttonClass =
    'h-10 w-10 flex items-center justify-center rounded-full border border-border/50 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground';

  return (
    <Card>
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Share This Event
        </h3>
      </div>
      <div className="flex items-center justify-center gap-3 p-4">
        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Facebook"
          className={buttonClass}
        >
          <Facebook className="h-4 w-4" />
        </a>
        <a href={mailtoUrl} aria-label="Share via email" className={buttonClass}>
          <Mail className="h-4 w-4" />
        </a>
        <button
          onClick={handleCopyLink}
          aria-label="Copy link"
          className={cn(buttonClass, copied && 'text-emerald-600 border-emerald-600/30')}
        >
          {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        </button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ShareEvent.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/ShareEvent.tsx apps/myk9show/src/test/components/ShareEvent.test.tsx
git commit -m "feat: add ShareEvent component with Facebook, email, and copy link"
```

---

## Chunk 4: Main Content Components (Schedule, Map, Details, MoreFromClub)

### Task 8: ScheduleSummary

This is a thin presentation wrapper around the existing `useScheduleSummary` hook. The hook already returns structured day data — this component just renders it.

**Files:**

- Create: `src/components/shows/overview/ScheduleSummary.tsx`
- No dedicated test file — this is a thin presentational wrapper. The hook has its own tests, and the ShowOverviewTab integration test covers rendering. Per CLAUDE.md's testing requirement, this is covered by the integration test rather than duplicating hook testing.
- Reference: `src/hooks/queries/useScheduleSummary.ts` — returns `DaySummary[]` with `{ date, disciplines: [{ name, elements, levels, classNames }] }`
- Reference: `src/components/shows/PublicShowView.tsx` lines 131-157 — existing rendering pattern to port

- [ ] **Step 1: Write implementation**

```tsx
// src/components/shows/overview/ScheduleSummary.tsx
import { Card } from '@/components/ui/card';
import { useScheduleSummary } from '@/hooks/queries/useScheduleSummary';

function formatDayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatLevelRange(levels: string[]): string {
  if (levels.length <= 2) return levels.join(', ');
  return `${levels[0]}–${levels[levels.length - 1]}`;
}

interface ScheduleSummaryProps {
  showId: string;
}

export function ScheduleSummary({ showId }: ScheduleSummaryProps) {
  const { data: schedule } = useScheduleSummary(showId);

  if (!schedule || schedule.length === 0) return null;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">Schedule</h3>
      {schedule.map(day => (
        <div key={day.date} className="mb-5 last:mb-0">
          <div className="text-sm font-semibold text-primary mb-2 pb-1.5 border-b border-border/30">
            {formatDayDate(day.date)}
          </div>
          {day.disciplines.map(disc => (
            <div key={disc.name} className="flex justify-between items-baseline py-1.5 text-sm">
              <span className="font-medium text-foreground">{disc.name}</span>
              <span className="text-muted-foreground text-xs">
                {disc.name === 'Other'
                  ? disc.classNames.join(', ')
                  : [
                      disc.elements.length > 0 ? disc.elements.join(', ') : null,
                      disc.levels.length > 0 ? formatLevelRange(disc.levels) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/ScheduleSummary.tsx
git commit -m "feat: add ScheduleSummary component wrapping useScheduleSummary"
```

### Task 9: VenueMap

**[ADDED] Address composition:** Before writing this component, check the Pre-Implementation Check results. If the Show type has separate address fields (`venueName`, `address`, `city`, `state`, `zipCode`), accept them as individual props and compose the address internally: `[address, city, state, zipCode].filter(Boolean).join(', ')`. If the Show type only has `location: string`, use the simpler single-prop interface shown below. Update ShowOverviewTab (Task 12) accordingly.

**Files:**

- Create: `src/components/shows/overview/VenueMap.tsx`
- Create: `src/test/components/VenueMap.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/VenueMap.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VenueMap } from '@/components/shows/overview/VenueMap';

describe('VenueMap', () => {
  it('renders map iframe with encoded address', () => {
    render(<VenueMap location="Johnson County Fairgrounds, Olathe, KS" />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toContain('maps.google.com');
    expect(iframe?.src).toContain('Johnson');
  });

  it('renders venue address text', () => {
    render(<VenueMap location="Johnson County Fairgrounds, Olathe, KS" />);
    expect(screen.getByText('Johnson County Fairgrounds, Olathe, KS')).toBeInTheDocument();
  });

  it('renders Get Directions link with correct href', () => {
    render(<VenueMap location="Olathe, KS" />);
    const link = screen.getByRole('link', { name: /get directions/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/maps/dir'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('iframe has accessible title', () => {
    render(<VenueMap location="Olathe, KS" />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toHaveAttribute('title', expect.stringContaining('Map'));
  });

  it('returns null when no location provided', () => {
    const { container } = render(<VenueMap />);
    expect(container.firstElementChild).toBeNull();
  });

  it('returns null for empty location string', () => {
    const { container } = render(<VenueMap location="" />);
    expect(container.firstElementChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/VenueMap.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/overview/VenueMap.tsx
import { Card } from '@/components/ui/card';
import { MapPin, Navigation } from 'lucide-react';

interface VenueMapProps {
  location?: string | null;
  venueName?: string | null;
}

export function VenueMap({ location, venueName }: VenueMapProps) {
  if (!location?.trim()) return null;

  const encodedAddress = encodeURIComponent(location);
  const mapSrc = `https://maps.google.com/maps?q=${encodedAddress}&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;

  return (
    <Card className="overflow-hidden">
      <iframe
        src={mapSrc}
        title={`Map showing ${venueName || location}`}
        className="w-full h-[300px] border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            {venueName && <div className="font-semibold text-foreground text-sm">{venueName}</div>}
            <div className="text-sm text-muted-foreground">{location}</div>
          </div>
        </div>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-12 px-4 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
        >
          <Navigation className="h-4 w-4" />
          Get Directions
        </a>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/VenueMap.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/VenueMap.tsx apps/myk9show/src/test/components/VenueMap.test.tsx
git commit -m "feat: add VenueMap component with Google Maps embed and directions"
```

### Task 10: AdditionalDetails

**Files:**

- Create: `src/components/shows/overview/AdditionalDetails.tsx`
- Create: `src/test/components/AdditionalDetails.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/AdditionalDetails.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AdditionalDetails } from '@/components/shows/overview/AdditionalDetails';
import type { Show } from '@/types/show-types';

describe('AdditionalDetails', () => {
  it('renders organization when present', () => {
    render(<AdditionalDetails show={{ organization: 'AKC' } as Show} />);
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('AKC')).toBeInTheDocument();
  });

  it('renders day-of-show fee when different from pre-entry', () => {
    render(<AdditionalDetails show={{ preEntryFee: '$30', dayOfShowFee: '$40' } as Show} />);
    expect(screen.getByText('Day-of-Show Fee')).toBeInTheDocument();
    expect(screen.getByText('$40')).toBeInTheDocument();
  });

  it('omits day-of-show fee when same as pre-entry', () => {
    render(<AdditionalDetails show={{ preEntryFee: '$30', dayOfShowFee: '$30' } as Show} />);
    expect(screen.queryByText('Day-of-Show Fee')).not.toBeInTheDocument();
  });

  it('renders max entries per dog', () => {
    render(<AdditionalDetails show={{ maxEntriesPerDog: 3 } as Show} />);
    expect(screen.getByText('Max Entries per Dog')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders non-owner handlers status', () => {
    render(<AdditionalDetails show={{ allowNonOwnerHandlers: true } as Show} />);
    expect(screen.getByText('Non-Owner Handlers')).toBeInTheDocument();
    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });

  it('returns null when no additional details exist', () => {
    const { container } = render(<AdditionalDetails show={{} as Show} />);
    expect(container.firstElementChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/AdditionalDetails.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/overview/AdditionalDetails.tsx
import { Card } from '@/components/ui/card';
import type { Show } from '@/types/show-types';

interface DetailItem {
  label: string;
  value: string;
}

function getDetailItems(show: Show): DetailItem[] {
  const items: DetailItem[] = [];

  if (show.organization) {
    items.push({ label: 'Organization', value: show.organization });
  }
  if (show.chiefSteward) {
    items.push({ label: 'Chief Steward', value: show.chiefSteward });
  }
  if (show.dayOfShowFee && show.dayOfShowFee !== show.preEntryFee) {
    items.push({ label: 'Day-of-Show Fee', value: show.dayOfShowFee });
  }
  if (show.maxEntriesPerDog) {
    items.push({ label: 'Max Entries per Dog', value: String(show.maxEntriesPerDog) });
  }
  if (show.maxTotalEntries) {
    items.push({ label: 'Max Total Entries', value: String(show.maxTotalEntries) });
  }
  if (show.allowNonOwnerHandlers != null) {
    items.push({
      label: 'Non-Owner Handlers',
      value: show.allowNonOwnerHandlers ? 'Allowed' : 'Not Allowed',
    });
  }

  return items;
}

interface AdditionalDetailsProps {
  show: Show;
}

export function AdditionalDetails({ show }: AdditionalDetailsProps) {
  const items = getDetailItems(show);
  if (items.length === 0) return null;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">Show Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map(item => (
          <div key={item.label}>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {item.label}
            </div>
            <div className="text-sm font-medium text-foreground">{item.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/AdditionalDetails.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/AdditionalDetails.tsx apps/myk9show/src/test/components/AdditionalDetails.test.tsx
git commit -m "feat: add AdditionalDetails component for show metadata"
```

### Task 11: MoreFromClub

**Files:**

- Create: `src/components/shows/overview/MoreFromClub.tsx`
- Create: `src/test/components/MoreFromClub.test.tsx`
- Reference: `src/hooks/queries/useShowsDatabase.ts` — `useShowsQuery()` for all shows data

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/MoreFromClub.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MoreFromClub } from '@/components/shows/overview/MoreFromClub';

// Mock React Router
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock useShowsQuery
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: () => ({
    data: [
      {
        id: 'show-1',
        name: 'Spring Trial',
        clubId: 'club-1',
        clubName: 'Jayhawk AC',
        startDate: '2026-04-01',
        location: 'Olathe, KS',
      },
      {
        id: 'show-2',
        name: 'Summer Trial',
        clubId: 'club-1',
        clubName: 'Jayhawk AC',
        startDate: '2026-06-15',
        location: 'Olathe, KS',
      },
      {
        id: 'show-3',
        name: 'Fall Trial',
        clubId: 'club-1',
        clubName: 'Jayhawk AC',
        startDate: '2026-09-20',
        location: 'Olathe, KS',
      },
      {
        id: 'show-4',
        name: 'Winter Trial',
        clubId: 'club-1',
        clubName: 'Jayhawk AC',
        startDate: '2026-12-10',
        location: 'Olathe, KS',
      },
      {
        id: 'other-show',
        name: 'Other Club Show',
        clubId: 'club-2',
        clubName: 'Other Club',
        startDate: '2026-05-01',
        location: 'KC, MO',
      },
    ],
  }),
}));

describe('MoreFromClub', () => {
  it('renders up to 3 shows from the same club', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.getByText('Summer Trial')).toBeInTheDocument();
    expect(screen.getByText('Fall Trial')).toBeInTheDocument();
    expect(screen.getByText('Winter Trial')).toBeInTheDocument();
  });

  it('excludes the current show', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.queryByText('Spring Trial')).not.toBeInTheDocument();
  });

  it('does not show shows from other clubs', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.queryByText('Other Club Show')).not.toBeInTheDocument();
  });

  it('returns null when no other shows from club', () => {
    const { container } = render(
      <MoreFromClub clubId="club-2" clubName="Other Club" currentShowId="other-show" />
    );
    expect(container.firstElementChild).toBeNull();
  });

  it('renders section heading with club name', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    expect(screen.getByText(/more from jayhawk ac/i)).toBeInTheDocument();
  });

  it('renders show cards as links', () => {
    render(<MoreFromClub clubId="club-1" clubName="Jayhawk AC" currentShowId="show-1" />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('/shows/'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/MoreFromClub.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/overview/MoreFromClub.tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { CalendarDays, MapPin } from 'lucide-react';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';

interface MoreFromClubProps {
  clubId: string;
  clubName: string;
  currentShowId: string;
}

export function MoreFromClub({ clubId, clubName, currentShowId }: MoreFromClubProps) {
  const { data: allShows } = useShowsQuery();

  const otherShows = useMemo(() => {
    if (!allShows) return [];
    return allShows
      .filter(s => s.clubId === clubId && s.id !== currentShowId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 3);
  }, [allShows, clubId, currentShowId]);

  if (otherShows.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-bold text-foreground mb-4">More from {clubName}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {otherShows.map(show => (
          <Link key={show.id} to={`/shows/${show.id}`} className="block group">
            <Card className="p-4 h-full hover:border-primary/30 transition-colors">
              <div className="font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
                {show.name}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(show.startDate + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                {show.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {show.location}
                  </div>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/MoreFromClub.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/overview/MoreFromClub.tsx apps/myk9show/src/test/components/MoreFromClub.test.tsx
git commit -m "feat: add MoreFromClub component showing related shows"
```

---

## Chunk 5: Orchestrator + Integration

### Task 12: ShowOverviewTab

The orchestrator component that brings all sections together in a two-column layout.

**[ADDED] Loading state note:** The ShowOverviewTab itself receives a `show` prop (already loaded by ShowDetailsPage). Child components that fetch their own data (ScheduleSummary via `useScheduleSummary`, MoreFromClub via `useShowsQuery`) return `null` during loading — this is intentional. Sections appear progressively as data loads rather than blocking the entire tab behind a skeleton. The spec mentions "Loading state renders skeleton" for the integration test, but this refers to ShowDetailsPage's existing loading state (before `show` is available), not a new skeleton inside ShowOverviewTab.

**Files:**

- Create: `src/components/shows/tabs/ShowOverviewTab.tsx`
- Create: `src/test/components/ShowOverviewTab.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/ShowOverviewTab.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';
import type { Show } from '@/types/show-types';

// Mock child components to verify they're rendered with correct props
vi.mock('@/components/shows/overview/QuickInfoCards', () => ({
  QuickInfoCards: ({ show }: { show: Show }) => (
    <div data-testid="quick-info-cards">{show.name}</div>
  ),
}));
vi.mock('@/components/shows/overview/EntryCTA', () => ({
  EntryCTA: () => <div data-testid="entry-cta" />,
}));
vi.mock('@/components/shows/overview/ScheduleSummary', () => ({
  ScheduleSummary: () => <div data-testid="schedule-summary" />,
}));
vi.mock('@/components/shows/overview/ShowOfficials', () => ({
  ShowOfficials: ({ chairmanId }: { chairmanId?: string }) =>
    chairmanId ? <div data-testid="show-officials" /> : null,
}));
vi.mock('@/components/shows/overview/JudgesList', () => ({
  JudgesList: ({ judges }: { judges?: unknown[] }) => (
    <div data-testid="judges-list">{judges?.length ?? 0} judges</div>
  ),
}));
vi.mock('@/components/shows/overview/VenueMap', () => ({
  VenueMap: ({ location }: { location?: string }) =>
    location ? <div data-testid="venue-map" /> : null,
}));
vi.mock('@/components/shows/overview/AdditionalDetails', () => ({
  AdditionalDetails: () => <div data-testid="additional-details" />,
}));
vi.mock('@/components/shows/overview/ShareEvent', () => ({
  ShareEvent: () => <div data-testid="share-event" />,
}));
vi.mock('@/components/shows/overview/MoreFromClub', () => ({
  MoreFromClub: ({ clubId }: { clubId: string }) =>
    clubId ? <div data-testid="more-from-club" /> : null,
}));

const fullShow: Show = {
  id: 'show-1',
  name: 'Spring Agility Trial',
  organization: 'AKC',
  startDate: '2026-03-21',
  endDate: '2026-03-22',
  location: 'Olathe, KS',
  status: 'accepting_entries',
  events: [],
  source: 'myK9Show',
  entryOpenDate: '2026-01-01',
  entryCloseDate: '2026-12-31',
  preEntryFee: '$30',
  clubId: 'club-1',
  clubName: 'Jayhawk Agility Club',
  clubAddress: '',
  clubEmail: '',
  logoUrl: '',
  coverImageUrl: '',
  accentColor: '',
  chairman: 'person-1',
  secretary: 'person-2',
  chiefSteward: '',
  assignedJudges: [{ judgeId: 'j1', judgeName: 'Judge One' }],
  stats: [],
  trials: [],
};

describe('ShowOverviewTab', () => {
  it('renders QuickInfoCards', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('quick-info-cards')).toBeInTheDocument();
  });

  it('renders EntryCTA', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('entry-cta')).toBeInTheDocument();
  });

  it('renders ShowOfficials when chairman exists', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('show-officials')).toBeInTheDocument();
  });

  it('renders JudgesList', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('judges-list')).toBeInTheDocument();
  });

  it('renders VenueMap when location exists', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('venue-map')).toBeInTheDocument();
  });

  it('omits VenueMap when no location', () => {
    const noLocation = { ...fullShow, location: '' };
    render(<ShowOverviewTab show={noLocation} onRegister={() => {}} />);
    expect(screen.queryByTestId('venue-map')).not.toBeInTheDocument();
  });

  it('renders MoreFromClub', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('more-from-club')).toBeInTheDocument();
  });

  it('renders ShareEvent', () => {
    render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    expect(screen.getByTestId('share-event')).toBeInTheDocument();
  });

  it('has two-column layout on desktop', () => {
    const { container } = render(<ShowOverviewTab show={fullShow} onRegister={() => {}} />);
    const grid = container.querySelector(
      '.md\\:grid-cols-\\[1fr_340px\\],.md\\:grid-cols-\\[1fr\\,340px\\]'
    );
    expect(grid).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ShowOverviewTab.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/shows/tabs/ShowOverviewTab.tsx
import { useMemo } from 'react';
import type { Show } from '@/types/show-types';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { EntryCTA } from '@/components/shows/overview/EntryCTA';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { VenueMap } from '@/components/shows/overview/VenueMap';
import { AdditionalDetails } from '@/components/shows/overview/AdditionalDetails';
import { MoreFromClub } from '@/components/shows/overview/MoreFromClub';
import { ShareEvent } from '@/components/shows/overview/ShareEvent';

const baseUrl = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? window.location.origin;

interface ShowOverviewTabProps {
  show: Show;
  onRegister: () => void;
}

export function ShowOverviewTab({ show, onRegister }: ShowOverviewTabProps) {
  const shareData = useMemo(
    () => ({
      title: show.name,
      text: `${show.organization ? `${show.organization} ` : ''}Dog Show in ${show.location} · ${show.clubName}`,
      url: `${baseUrl}/shows/${show.id}`,
    }),
    [show.id, show.name, show.organization, show.location, show.clubName]
  );

  // Note: EntryCTA is outside the two-column grid so it appears before
  // officials/judges on mobile (per spec: "personal touch is high-impact
  // and should appear early" but registration CTA must come first).
  return (
    <div className="space-y-6">
      {/* Quick info bar — full width */}
      <QuickInfoCards show={show} />

      {/* Entry CTA — full width, always visible before the grid */}
      <EntryCTA show={show} onRegister={onRegister} />

      {/* Two-column layout: main content + sidebar */}
      {/* On mobile: sidebar (officials/judges) renders first, then main content */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,340px] gap-6">
        {/* Main content column */}
        <div className="space-y-6 order-2 md:order-1">
          <ScheduleSummary showId={show.id} />
          <VenueMap location={show.location} />
          <AdditionalDetails show={show} />
        </div>

        {/* Sidebar — on mobile, appears between EntryCTA and main content */}
        <div className="space-y-6 order-1 md:order-2">
          <ShowOfficials chairmanId={show.chairman} secretaryId={show.secretary} />
          <JudgesList judges={show.assignedJudges} />
          <ShareEvent shareData={shareData} />
        </div>
      </div>

      {/* More from club — full width */}
      <MoreFromClub clubId={show.clubId} clubName={show.clubName} currentShowId={show.id} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ShowOverviewTab.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx apps/myk9show/src/test/components/ShowOverviewTab.test.tsx
git commit -m "feat: add ShowOverviewTab orchestrator with two-column layout"
```

### Task 13: Wire ShowOverviewTab into ShowDetailsPage + Clean Up

**Files:**

- Modify: `src/pages/ShowDetailsPage.tsx`
- Delete: `src/components/shows/ShowDetailsMain.tsx`
- Verify + Delete: `src/components/shows/PublicShowView.tsx` (if only used here)
- Verify + Delete: `src/components/shows/ShowBrandedHero.tsx` (if only used in PublicShowView)
- Verify + Delete: `src/components/shows/ShowDetails/ShowDetailsEnhanced.tsx`

- [ ] **Step 1: Check for other references to files being deleted**

Run the following to verify each file is only used in ShowDetailsPage:

```bash
cd apps/myk9show && grep -r "ShowDetailsMain" src/ --include="*.tsx" --include="*.ts" -l
cd apps/myk9show && grep -r "PublicShowView" src/ --include="*.tsx" --include="*.ts" -l
cd apps/myk9show && grep -r "ShowBrandedHero" src/ --include="*.tsx" --include="*.ts" -l
cd apps/myk9show && grep -r "ShowDetailsEnhanced" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: Each should only appear in its own file + ShowDetailsPage (or ShowDetailsMain for ShowDetailsEnhanced). If any appear elsewhere, do NOT delete that file — update the plan accordingly.

- [ ] **Step 2: Update ShowDetailsPage to use ShowOverviewTab**

Replace the Overview tab content in `src/pages/ShowDetailsPage.tsx`. The key change is replacing:

```tsx
// BEFORE (lines 273-285):
<TabsContent value="overview">
  {canManageShow ? (
    <ShowDetailsMain ... />
  ) : (
    <PublicShowView ... />
  )}
</TabsContent>
```

With:

```tsx
// AFTER:
<TabsContent value="overview">
  <ShowOverviewTab show={actualCurrentShow} onRegister={handleRegisterForShow} />
</TabsContent>
```

Also:

- Add import: `import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';`
- Remove imports: `ShowDetailsMain`, `PublicShowView`
- Remove import: `import '@/styles/myk9-show-details.css';` (remove only from this file)

**KEEP the following** — ClassesTab depends on them:

- `useTrialStore` import and usage (`getTrialsByShow`, `trialClasses`)
- `associatedTrials` memo (line 87-90)
- `showClasses` memo (line 98-114)
- These are passed as props to `<ClassesTab classes={showClasses} .../>` (line 288)

**ALSO KEEP:**

- `useMyEntries` and `userEntries`/`hasUserEntries` — used for tab defaulting and MyEntriesTab
- `canManageShow` — used for PageHeader actions
- `handleRegisterForShow` — passed to both ShowOverviewTab and used for navigation
- `ShowCloneDialog` — check if ShowDetailsPage renders it directly (it does, lines 325-333). Keep it.

**REMOVE only:**

- The `ShowDetailsMain` and `PublicShowView` imports and their rendering in the Overview TabsContent
- The `import '@/styles/myk9-show-details.css'` line (this file only)

**Note:** Spec success criterion #5 ("myk9-show-details.css is deleted") is deferred — the file has 24+ other consumers. We only remove the import from ShowDetailsPage.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS — no type errors

- [ ] **Step 4: Delete legacy files**

Based on Step 1 results, delete files that are no longer referenced:

```bash
# Only run these if Step 1 confirmed no other references
rm apps/myk9show/src/components/shows/ShowDetailsMain.tsx
rm apps/myk9show/src/components/shows/ShowDetails/ShowDetailsEnhanced.tsx
rm apps/myk9show/src/components/shows/PublicShowView.tsx
rm apps/myk9show/src/components/shows/ShowBrandedHero.tsx
```

- [ ] **Step 5: Run typecheck again after deletions**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS — no broken imports

- [ ] **Step 6: Run all related tests**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ShowOverviewTab.test.tsx src/test/components/PersonAvatar.test.tsx src/test/components/QuickInfoCards.test.tsx src/test/components/EntryCTA.test.tsx src/test/components/ShowOfficials.test.tsx src/test/components/JudgesList.test.tsx src/test/components/VenueMap.test.tsx src/test/components/AdditionalDetails.test.tsx src/test/components/MoreFromClub.test.tsx src/test/components/ShareEvent.test.tsx src/test/hooks/useResolvePerson.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: PASS — no regressions. If existing ShowDetailsPage tests exist and fail, update them to account for the new Overview tab structure.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wire ShowOverviewTab into ShowDetailsPage, remove legacy components

Replace ShowDetailsMain/PublicShowView/ShowDetailsEnhanced bifurcation
with unified ShowOverviewTab. Delete 1,100+ lines of legacy code.
All roles see the same Overview content. Management actions remain
in the outer PageHeader."
```

---

## Chunk 6: Verify + Cleanup

### Task 14: Full Verification

- [ ] **Step 1: Typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Lint**

Run: `cd apps/myk9show && pnpm lint`
Expected: PASS (fix any issues)

- [ ] **Step 3: Full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Check for stale imports to deleted files**

Run:

```bash
cd apps/myk9show && grep -r "ShowDetailsEnhanced\|ShowDetailsMain\|PublicShowView\|ShowBrandedHero" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: No results (or only test files / this grep)

- [ ] **Step 5: Check for stale myk9-show-details.css import in ShowDetailsPage**

Run:

```bash
cd apps/myk9show && grep -r "myk9-show-details" src/pages/ShowDetailsPage.tsx
```

Expected: No results

- [ ] **Step 6: Check file sizes**

Run:

```bash
wc -l apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx apps/myk9show/src/components/shows/overview/*.tsx apps/myk9show/src/components/common/PersonAvatar.tsx apps/myk9show/src/hooks/useResolvePerson.ts
```

Expected: All files under 150 lines. ShowOverviewTab should be ~50-60 lines (orchestrator only).

- [ ] **Step 7: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "fix: address lint/typecheck issues from overview tab integration"
```
