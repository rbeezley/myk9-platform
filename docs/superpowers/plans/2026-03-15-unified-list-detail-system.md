# Unified List/Detail System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a consistent list/detail page system for the exhibitor experience across Shows → Trials → Classes → Entries, extracting shared primitives along the way.

**Architecture:** Refactor the existing BrowseShowsPage and ShowDetailsPage as the "golden template," extracting reusable primitives (PageShell, PageHeader, DetailHero, SearchBar, FilterChips, MineToggle, ViewToggle, EmptyState, ErrorState, LoadingSkeleton, LiveClassCard, EntryRow) into `components/common/`. Then apply those primitives to build the Classes and Entries views within the show detail page. TDD throughout — write failing tests first, then implement.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (Base UI), React Query, Vitest + React Testing Library, Supabase real-time subscriptions.

**Spec:** `docs/superpowers/specs/2026-03-15-unified-list-detail-system-design.md`

---

## File Structure

### New Files (Shared Primitives)

| File                                        | Responsibility                                          |
| ------------------------------------------- | ------------------------------------------------------- |
| `src/components/common/PageShell.tsx`       | Page container: max-w-7xl, padding, spacing             |
| `src/components/common/PageHeader.tsx`      | Breadcrumb + sr-only title + action buttons             |
| `src/components/common/DetailHero.tsx`      | Detail page header card: name, metadata, primary action |
| `src/components/common/SearchBar.tsx`       | Search input with 48px touch target                     |
| `src/components/common/FilterChips.tsx`     | Horizontal pill-style filter chips                      |
| `src/components/common/MineToggle.tsx`      | "All / Mine" segmented control                          |
| `src/components/common/ViewToggle.tsx`      | Cards / Table (/ Calendar) switcher                     |
| `src/components/common/ResultsCount.tsx`    | Filtered results count display                          |
| `src/components/common/ErrorState.tsx`      | Plain-English error with retry button                   |
| `src/components/common/NotFoundState.tsx`   | Entity not found with back button                       |
| `src/components/common/LoadingSkeleton.tsx` | Content-shape-matching skeleton loader                  |

**Note:** `src/components/common/EmptyState.tsx` already exists with premium styling, icon variants, and PremiumButton integration. Rather than creating a new file, Task 6 will **extend the existing EmptyState** to ensure it meets the spec's requirements (configurable message, description, CTA, friendly tone). No new file needed.

### New Files (Live Components)

| File                                     | Responsibility                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `src/components/live/LiveClassCard.tsx`  | Real-time class card: status, progress, in-ring, next 3, remaining      |
| `src/components/live/EntryRow.tsx`       | Entry display: armband, dog, handler, status, color border, "YOU" badge |
| `src/components/live/DogsAheadBadge.tsx` | "X dogs ahead" / "You're next!" / "In Ring" indicator                   |
| `src/hooks/useMineToggle.ts`             | Persisted "All / Mine" preference per entity type                       |
| `src/hooks/useClassEntries.ts`           | Fetches entries for a class with run order + user highlighting          |
| `src/hooks/useMyEntries.ts`              | Fetches all of user's entries for a show with position data             |

### New Test Files

| File                                           | Tests for                                                  |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `src/test/components/PageShell.test.tsx`       | PageShell                                                  |
| `src/test/components/PageHeader.test.tsx`      | PageHeader                                                 |
| `src/test/components/DetailHero.test.tsx`      | DetailHero                                                 |
| `src/test/components/SearchBar.test.tsx`       | SearchBar                                                  |
| `src/test/components/FilterChips.test.tsx`     | FilterChips                                                |
| `src/test/components/MineToggle.test.tsx`      | MineToggle                                                 |
| `src/test/components/ViewToggle.test.tsx`      | ViewToggle                                                 |
| `src/test/components/EmptyState.test.tsx`      | EmptyState (existing, add tests if missing)                |
| `src/test/components/ErrorState.test.tsx`      | ErrorState                                                 |
| `src/test/components/NotFoundState.test.tsx`   | NotFoundState                                              |
| `src/test/components/ResultsCount.test.tsx`    | ResultsCount                                               |
| `src/test/components/LoadingSkeleton.test.tsx` | LoadingSkeleton                                            |
| `src/test/components/LiveClassCard.test.tsx`   | LiveClassCard                                              |
| `src/test/components/EntryRow.test.tsx`        | EntryRow                                                   |
| `src/test/components/DogsAheadBadge.test.tsx`  | DogsAheadBadge                                             |
| `src/test/hooks/useMineToggle.test.ts`         | useMineToggle                                              |
| `src/test/hooks/useClassEntries.test.ts`       | useClassEntries                                            |
| `src/test/hooks/useMyEntries.test.ts`          | useMyEntries                                               |
| `src/test/pages/BrowseShowsPage.test.tsx`      | Updated BrowseShowsPage tests (exists, 537 lines — update) |
| `src/test/pages/ShowDetailsPage.test.tsx`      | New ShowDetailsPage tests                                  |

### Files to Modify

| File                                                        | Change                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `src/pages/BrowseShowsPage.tsx` (703 lines)                 | Refactor to use shared primitives, reduce view modes 4→3 |
| `src/pages/ShowDetailsPage.tsx` (217 lines)                 | Refactor to use PageShell, DetailHero, tabbed layout     |
| `src/components/shows/ShowDetailsMain.tsx` (48 lines)       | Likely replaced by new tabbed detail structure           |
| `src/components/shows/PublicShowView.tsx` (189 lines)       | Refactor to use PageShell, DetailHero                    |
| `src/components/shows/browse/ShowsGridView.tsx` (228 lines) | Merge with ShowsListView into unified CardGrid           |
| `src/components/shows/browse/ShowsListView.tsx` (217 lines) | Merge into CardGrid (grid+list → cards)                  |
| `src/components/shows/EnhancedEmptyStates.tsx` (286 lines)  | Replace with new EmptyState primitive                    |
| `src/test/pages/BrowseShowsPage.test.tsx` (537 lines)       | Update to match refactored page                          |

All paths are relative to `apps/myk9show/`.

**[ADDED] Role-adaptive design note:** Phase 1 builds the exhibitor experience only. The shared primitives (FilterChips, ViewToggle, MineToggle) accept their configuration as props — the page decides what to pass. This means secretary/admin features (Phase 2) are added by passing different props to the same components, not by modifying the components themselves. For example, `FilterChips` receives a `filters` array — exhibitors get 3 items, secretaries get 5. No conditional role logic inside the primitives.

---

## Chunk 1: Page Structure Primitives

These are the foundation — every other task depends on them.

### Task 1: PageShell

**Files:**

- Create: `src/components/common/PageShell.tsx`
- Create: `src/test/components/PageShell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/PageShell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PageShell } from '@/components/common/PageShell';

describe('PageShell', () => {
  it('renders children within a constrained container', () => {
    render(
      <PageShell>
        <p>Content</p>
      </PageShell>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('applies max-w-7xl container by default', () => {
    const { container } = render(
      <PageShell>
        <p>Content</p>
      </PageShell>
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('max-w-7xl');
    expect(shell.className).toContain('mx-auto');
  });

  it('accepts a custom maxWidth', () => {
    const { container } = render(
      <PageShell maxWidth="max-w-5xl">
        <p>Content</p>
      </PageShell>
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('max-w-5xl');
    expect(shell.className).not.toContain('max-w-7xl');
  });

  it('accepts additional className', () => {
    const { container } = render(
      <PageShell className="bg-red-500">
        <p>Content</p>
      </PageShell>
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('bg-red-500');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/PageShell.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/common/PageShell.tsx
import { cn } from '@/lib/utils';

interface PageShellProps {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

export function PageShell({ children, maxWidth = 'max-w-7xl', className }: PageShellProps) {
  return (
    <div className={cn('bg-background', className)}>
      <div className={cn(maxWidth, 'mx-auto px-4 sm:px-6 py-6 space-y-6')}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/PageShell.test.tsx`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/PageShell.tsx apps/myk9show/src/test/components/PageShell.test.tsx
git commit -m "feat: add PageShell shared primitive"
```

### Task 2: PageHeader

**Files:**

- Create: `src/components/common/PageHeader.tsx`
- Create: `src/test/components/PageHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/PageHeader.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PageHeader', () => {
  it('renders breadcrumb items', () => {
    renderWithRouter(
      <PageHeader
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Shows', href: '/shows' },
        ]}
        title="Shows"
      />
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Shows')).toBeInTheDocument();
  });

  it('renders sr-only title for accessibility', () => {
    renderWithRouter(
      <PageHeader breadcrumbs={[{ label: 'Shows', href: '/shows' }]} title="Shows" />
    );
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveClass('sr-only');
    expect(title).toHaveTextContent('Shows');
  });

  it('renders action buttons when provided', () => {
    renderWithRouter(
      <PageHeader
        breadcrumbs={[{ label: 'Shows', href: '/shows' }]}
        title="Shows"
        actions={<button>Create Show</button>}
      />
    );
    expect(screen.getByText('Create Show')).toBeInTheDocument();
  });

  it('renders without actions', () => {
    renderWithRouter(
      <PageHeader breadcrumbs={[{ label: 'Shows', href: '/shows' }]} title="Shows" />
    );
    expect(screen.getByText('Shows')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/PageHeader.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/common/PageHeader.tsx
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href: string;
  onClick?: () => void;
}

interface PageHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ breadcrumbs, title, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <h1 className="sr-only">{title}</h1>
      <div className="flex items-center justify-between">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link to="/" className="hover:text-foreground transition-colors p-1">
            <Home className="h-4 w-4" />
          </Link>
          {breadcrumbs.map((item, i) => (
            <span key={item.href} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              {i === breadcrumbs.length - 1 ? (
                <span className="text-foreground font-medium">{item.label}</span>
              ) : (
                <Link
                  to={item.href}
                  onClick={item.onClick}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/PageHeader.test.tsx`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/PageHeader.tsx apps/myk9show/src/test/components/PageHeader.test.tsx
git commit -m "feat: add PageHeader shared primitive"
```

### Task 3: SearchBar

**Files:**

- Create: `src/components/common/SearchBar.tsx`
- Create: `src/test/components/SearchBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/SearchBar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchBar } from '@/components/common/SearchBar';

describe('SearchBar', () => {
  it('renders with placeholder text', () => {
    render(<SearchBar value="" onChange={vi.fn()} placeholder="Search shows..." />);
    expect(screen.getByPlaceholderText('Search shows...')).toBeInTheDocument();
  });

  it('fires onChange when user types', () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} placeholder="Search..." />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'agility' } });
    expect(onChange).toHaveBeenCalledWith('agility');
  });

  it('has minimum 48px touch target height', () => {
    const { container } = render(<SearchBar value="" onChange={vi.fn()} placeholder="Search..." />);
    const input = container.querySelector('input') as HTMLElement;
    expect(input.className).toMatch(/h-12|min-h-\[48px\]/);
  });

  it('shows search icon', () => {
    const { container } = render(<SearchBar value="" onChange={vi.fn()} placeholder="Search..." />);
    // Search icon should be present as an SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('displays the current value', () => {
    render(<SearchBar value="scent work" onChange={vi.fn()} placeholder="Search..." />);
    expect(screen.getByDisplayValue('scent work')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/SearchBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/common/SearchBar.tsx
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: SearchBarProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-12 pl-11 text-base bg-background border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl"
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/SearchBar.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/SearchBar.tsx apps/myk9show/src/test/components/SearchBar.test.tsx
git commit -m "feat: add SearchBar shared primitive with 48px touch target"
```

### Task 4: FilterChips

**Files:**

- Create: `src/components/common/FilterChips.tsx`
- Create: `src/test/components/FilterChips.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/FilterChips.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChips } from '@/components/common/FilterChips';

const filters = [
  {
    key: 'discipline',
    label: 'Discipline',
    options: [
      { label: 'Agility', value: 'agility' },
      { label: 'Rally', value: 'rally' },
    ],
  },
  {
    key: 'dateRange',
    label: 'Upcoming',
    options: [
      { label: 'This Month', value: 'this_month' },
      { label: 'Next Month', value: 'next_month' },
    ],
  },
];

describe('FilterChips', () => {
  it('renders filter chips for each filter', () => {
    render(<FilterChips filters={filters} values={{}} onChange={vi.fn()} />);
    expect(screen.getByText('Discipline')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('shows active state when a filter has a value', () => {
    render(<FilterChips filters={filters} values={{ discipline: 'agility' }} onChange={vi.fn()} />);
    const chip = screen.getByText('Agility');
    expect(chip).toBeInTheDocument();
  });

  it('calls onChange when a filter value is selected', () => {
    const onChange = vi.fn();
    render(<FilterChips filters={filters} values={{}} onChange={onChange} />);
    // Click the discipline chip to open dropdown
    fireEvent.click(screen.getByText('Discipline'));
    // Select an option
    fireEvent.click(screen.getByText('Agility'));
    expect(onChange).toHaveBeenCalledWith('discipline', 'agility');
  });

  it('has minimum 48px touch target on chips', () => {
    const { container } = render(<FilterChips filters={filters} values={{}} onChange={vi.fn()} />);
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
      expect(btn.className).toMatch(/h-12|min-h-\[48px\]|py-3/);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/FilterChips.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/common/FilterChips.tsx
import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterDefinition {
  key: string;
  label: string;
  options: FilterOption[];
}

interface FilterChipsProps {
  filters: FilterDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string | null) => void;
  className?: string;
}

export function FilterChips({ filters, values, onChange, className }: FilterChipsProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {filters.map(filter => {
        const activeValue = values[filter.key];
        const activeOption = filter.options.find(o => o.value === activeValue);
        const isOpen = openKey === filter.key;

        return (
          <div key={filter.key} className="relative">
            <Button
              variant={activeValue ? 'default' : 'outline'}
              size="default"
              className={cn('h-12 rounded-full px-4 text-base', activeValue && 'pr-3')}
              onClick={() => setOpenKey(isOpen ? null : filter.key)}
            >
              {activeOption ? activeOption.label : filter.label}
              {activeValue ? (
                <X
                  className="h-4 w-4 ml-2"
                  onClick={e => {
                    e.stopPropagation();
                    onChange(filter.key, null);
                    setOpenKey(null);
                  }}
                />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </Button>
            {isOpen && (
              <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-xl shadow-lg z-50 min-w-[160px] py-1">
                {filter.options.map(option => (
                  <button
                    key={option.value}
                    className={cn(
                      'w-full text-left px-4 py-3 text-base hover:bg-accent transition-colors',
                      activeValue === option.value && 'bg-accent font-medium'
                    )}
                    onClick={() => {
                      onChange(filter.key, option.value);
                      setOpenKey(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { FilterDefinition, FilterOption };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/FilterChips.test.tsx`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/FilterChips.tsx apps/myk9show/src/test/components/FilterChips.test.tsx
git commit -m "feat: add FilterChips shared primitive with 48px touch targets"
```

### Task 5: MineToggle + useMineToggle hook

**Files:**

- Create: `src/components/common/MineToggle.tsx`
- Create: `src/hooks/useMineToggle.ts`
- Create: `src/test/components/MineToggle.test.tsx`
- Create: `src/test/hooks/useMineToggle.test.ts`

- [ ] **Step 1: Write the failing hook test**

```tsx
// src/test/hooks/useMineToggle.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useMineToggle } from '@/hooks/useMineToggle';

describe('useMineToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to "all" when no defaultMine', () => {
    const { result } = renderHook(() => useMineToggle('shows'));
    expect(result.current.isMine).toBe(false);
  });

  it('defaults to "mine" when defaultMine is true', () => {
    const { result } = renderHook(() => useMineToggle('classes', true));
    expect(result.current.isMine).toBe(true);
  });

  it('toggles between all and mine', () => {
    const { result } = renderHook(() => useMineToggle('shows'));
    expect(result.current.isMine).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.isMine).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isMine).toBe(false);
  });

  it('persists preference to localStorage', () => {
    const { result } = renderHook(() => useMineToggle('shows'));
    act(() => result.current.toggle());
    expect(localStorage.getItem('myk9-mine-toggle-shows')).toBe('true');
  });

  it('reads persisted preference on mount', () => {
    localStorage.setItem('myk9-mine-toggle-shows', 'true');
    const { result } = renderHook(() => useMineToggle('shows'));
    expect(result.current.isMine).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing component test**

```tsx
// src/test/components/MineToggle.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MineToggle } from '@/components/common/MineToggle';

describe('MineToggle', () => {
  it('renders All and Mine labels', () => {
    render(
      <MineToggle isMine={false} onToggle={vi.fn()} allLabel="All Shows" mineLabel="My Shows" />
    );
    expect(screen.getByText('All Shows')).toBeInTheDocument();
    expect(screen.getByText('My Shows')).toBeInTheDocument();
  });

  it('highlights the active segment', () => {
    const { rerender } = render(
      <MineToggle isMine={false} onToggle={vi.fn()} allLabel="All" mineLabel="Mine" />
    );
    // "All" should be active
    const allBtn = screen.getByText('All');
    expect(allBtn.closest('button')?.className).toMatch(/bg-/);

    rerender(<MineToggle isMine={true} onToggle={vi.fn()} allLabel="All" mineLabel="Mine" />);
    const mineBtn = screen.getByText('Mine');
    expect(mineBtn.closest('button')?.className).toMatch(/bg-/);
  });

  it('calls onToggle when clicking the inactive segment', () => {
    const onToggle = vi.fn();
    render(<MineToggle isMine={false} onToggle={onToggle} allLabel="All" mineLabel="Mine" />);
    fireEvent.click(screen.getByText('Mine'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows counts when provided', () => {
    render(
      <MineToggle
        isMine={false}
        onToggle={vi.fn()}
        allLabel="All Classes"
        mineLabel="My Classes"
        allCount={48}
        mineCount={6}
      />
    );
    expect(screen.getByText('All Classes (48)')).toBeInTheDocument();
    expect(screen.getByText('My Classes (6)')).toBeInTheDocument();
  });

  it('is hidden when hidden prop is true', () => {
    const { container } = render(
      <MineToggle isMine={false} onToggle={vi.fn()} allLabel="All" mineLabel="Mine" hidden={true} />
    );
    expect(container.firstElementChild).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/test/hooks/useMineToggle.test.ts src/test/components/MineToggle.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement useMineToggle hook**

```tsx
// src/hooks/useMineToggle.ts
import { useState, useCallback } from 'react';

const STORAGE_PREFIX = 'myk9-mine-toggle-';

export function useMineToggle(entityType: string, defaultMine = false) {
  const storageKey = `${STORAGE_PREFIX}${entityType}`;

  const [isMine, setIsMine] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === 'true';
    return defaultMine;
  });

  const toggle = useCallback(() => {
    setIsMine(prev => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);

  const setMine = useCallback(
    (value: boolean) => {
      setIsMine(value);
      localStorage.setItem(storageKey, String(value));
    },
    [storageKey]
  );

  return { isMine, toggle, setMine };
}
```

- [ ] **Step 5: Implement MineToggle component**

```tsx
// src/components/common/MineToggle.tsx
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MineToggleProps {
  isMine: boolean;
  onToggle: () => void;
  allLabel: string;
  mineLabel: string;
  allCount?: number;
  mineCount?: number;
  hidden?: boolean;
  className?: string;
}

export function MineToggle({
  isMine,
  onToggle,
  allLabel,
  mineLabel,
  allCount,
  mineCount,
  hidden,
  className,
}: MineToggleProps) {
  if (hidden) return null;

  const allText = allCount !== undefined ? `${allLabel} (${allCount})` : allLabel;
  const mineText = mineCount !== undefined ? `${mineLabel} (${mineCount})` : mineLabel;

  return (
    <div className={cn('flex bg-muted/50 rounded-lg p-1 gap-0.5', className)}>
      <Button
        variant={!isMine ? 'default' : 'ghost'}
        size="default"
        className="h-10 rounded-md px-4 text-sm font-medium"
        onClick={() => isMine && onToggle()}
      >
        {allText}
      </Button>
      <Button
        variant={isMine ? 'default' : 'ghost'}
        size="default"
        className="h-10 rounded-md px-4 text-sm font-medium"
        onClick={() => !isMine && onToggle()}
      >
        {mineText}
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/test/hooks/useMineToggle.test.ts src/test/components/MineToggle.test.tsx`
Expected: 10 tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/common/MineToggle.tsx apps/myk9show/src/hooks/useMineToggle.ts apps/myk9show/src/test/components/MineToggle.test.tsx apps/myk9show/src/test/hooks/useMineToggle.test.ts
git commit -m "feat: add MineToggle component and useMineToggle hook with persistence"
```

### Task 6: ViewToggle, ResultsCount, State Components

**Files:**

- Create: `src/components/common/ViewToggle.tsx`
- Create: `src/components/common/ResultsCount.tsx`
- Create: `src/components/common/EmptyState.tsx`
- Create: `src/components/common/ErrorState.tsx`
- Create: `src/components/common/NotFoundState.tsx`
- Create: `src/components/common/LoadingSkeleton.tsx`
- Create: `src/test/components/ViewToggle.test.tsx`
- Create: `src/test/components/EmptyState.test.tsx`
- Create: `src/test/components/ErrorState.test.tsx`
- Create: `src/test/components/LoadingSkeleton.test.tsx`

- [ ] **Step 1: Write failing tests for ViewToggle**

```tsx
// src/test/components/ViewToggle.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ViewToggle } from '@/components/common/ViewToggle';

describe('ViewToggle', () => {
  const modes = [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ] as const;

  it('renders all view mode buttons', () => {
    render(<ViewToggle modes={modes} active="cards" onChange={vi.fn()} />);
    expect(screen.getByText('Cards')).toBeInTheDocument();
    expect(screen.getByText('Table')).toBeInTheDocument();
  });

  it('highlights the active mode', () => {
    render(<ViewToggle modes={modes} active="cards" onChange={vi.fn()} />);
    const cardsBtn = screen.getByText('Cards').closest('button');
    expect(cardsBtn?.className).toMatch(/bg-/);
  });

  it('calls onChange when a different mode is clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle modes={modes} active="cards" onChange={onChange} />);
    fireEvent.click(screen.getByText('Table'));
    expect(onChange).toHaveBeenCalledWith('table');
  });

  it('does not render when only one mode', () => {
    const { container } = render(
      <ViewToggle modes={[modes[0]]} active="cards" onChange={vi.fn()} />
    );
    expect(container.firstElementChild).toBeNull();
  });
});
```

- [ ] **Step 2: Write failing tests for EmptyState and ErrorState**

```tsx
// src/test/components/EmptyState.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmptyState } from '@/components/common/EmptyState';

describe('EmptyState', () => {
  it('renders message', () => {
    render(<EmptyState message="No shows found" />);
    expect(screen.getByText('No shows found')).toBeInTheDocument();
  });

  it('renders CTA button when provided', () => {
    const onAction = vi.fn();
    render(<EmptyState message="No shows" actionLabel="Browse Shows" onAction={onAction} />);
    fireEvent.click(screen.getByText('Browse Shows'));
    expect(onAction).toHaveBeenCalled();
  });

  it('renders description when provided', () => {
    render(<EmptyState message="No shows" description="Try adjusting your filters" />);
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
  });
});
```

```tsx
// src/test/components/ErrorState.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorState } from '@/components/common/ErrorState';

describe('ErrorState', () => {
  it('renders error message in plain English', () => {
    render(<ErrorState message="We couldn't load the shows." onRetry={vi.fn()} />);
    expect(screen.getByText("We couldn't load the shows.")).toBeInTheDocument();
  });

  it('renders retry button', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Error" onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalled();
  });
});
```

```tsx
// src/test/components/LoadingSkeleton.test.tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';

describe('LoadingSkeleton', () => {
  it('renders cards skeleton by default', () => {
    const { container } = render(<LoadingSkeleton variant="cards" count={3} />);
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('renders table skeleton when variant is table', () => {
    const { container } = render(<LoadingSkeleton variant="table" count={5} />);
    const rows = container.querySelectorAll('[class*="animate-pulse"]');
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ViewToggle.test.tsx src/test/components/EmptyState.test.tsx src/test/components/ErrorState.test.tsx src/test/components/LoadingSkeleton.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement ViewToggle**

```tsx
// src/components/common/ViewToggle.tsx
import { Grid3X3, Table2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const iconMap = {
  grid: Grid3X3,
  table: Table2,
  calendar: CalendarDays,
} as const;

interface ViewMode {
  key: string;
  label: string;
  icon: keyof typeof iconMap;
}

interface ViewToggleProps {
  modes: readonly ViewMode[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function ViewToggle({ modes, active, onChange, className }: ViewToggleProps) {
  if (modes.length <= 1) return null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm font-medium text-muted-foreground">View:</span>
      <div className="flex bg-muted/50 rounded-lg p-1 gap-0.5">
        {modes.map(mode => {
          const Icon = iconMap[mode.icon];
          return (
            <Button
              key={mode.key}
              variant={active === mode.key ? 'default' : 'ghost'}
              size="default"
              className="h-10 px-3 text-sm"
              onClick={() => onChange(mode.key)}
            >
              <Icon className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{mode.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement ResultsCount**

```tsx
// src/components/common/ResultsCount.tsx
import { cn } from '@/lib/utils';

interface ResultsCountProps {
  showing: number;
  total: number;
  filtered?: boolean;
  entityName?: string;
  className?: string;
}

export function ResultsCount({
  showing,
  total,
  filtered,
  entityName = 'items',
  className,
}: ResultsCountProps) {
  const text =
    showing === total ? `${total} ${entityName}` : `${showing} of ${total} ${entityName}`;

  return (
    <span className={cn('text-sm text-muted-foreground', className)}>
      {text}
      {filtered && ' (filtered)'}
    </span>
  );
}
```

- [ ] **Step 6: Verify existing EmptyState and add tests**

`src/components/common/EmptyState.tsx` already exists with premium styling, icon variants, and PremiumButton integration. Read it and verify it supports: configurable message, description, icon, and CTA. If it does, write tests for the behaviors we need (`src/test/components/EmptyState.test.tsx`). If it lacks any of those, extend it. Do NOT create a new EmptyState file.

- [ ] **Step 7: Implement ErrorState**

```tsx
// src/components/common/ErrorState.tsx
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="bg-destructive/10 rounded-full p-4 mb-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{message}</h3>
      <p className="text-muted-foreground mb-6">Check your connection and try again.</p>
      <Button onClick={onRetry} variant="outline" size="lg" className="h-12 text-base">
        Try Again
      </Button>
    </div>
  );
}
```

- [ ] **Step 8: Implement NotFoundState**

```tsx
// src/components/common/NotFoundState.tsx
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NotFoundStateProps {
  entityName: string;
  backTo: string;
  backLabel: string;
  className?: string;
}

export function NotFoundState({ entityName, backTo, backLabel, className }: NotFoundStateProps) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-[50vh] text-center',
        className
      )}
    >
      <div className="bg-muted rounded-full p-4 mb-4">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{entityName} Not Found</h3>
      <p className="text-muted-foreground mb-6">
        The {entityName.toLowerCase()} you're looking for doesn't exist or has been removed.
      </p>
      <Button onClick={() => navigate(backTo)} size="lg" className="h-12 text-base">
        {backLabel}
      </Button>
    </div>
  );
}
```

- [ ] **Step 9: Implement LoadingSkeleton**

```tsx
// src/components/common/LoadingSkeleton.tsx
import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  variant: 'cards' | 'table';
  count?: number;
  className?: string;
}

export function LoadingSkeleton({ variant, count = 6, className }: LoadingSkeletonProps) {
  if (variant === 'table') {
    return (
      <div className={cn('space-y-2', className)}>
        {/* Table header */}
        <div className="h-10 bg-muted/50 rounded-lg animate-pulse" />
        {/* Table rows */}
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  // Cards variant
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-40 bg-muted/30 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Write tests for ResultsCount and NotFoundState**

```tsx
// src/test/components/ResultsCount.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ResultsCount } from '@/components/common/ResultsCount';

describe('ResultsCount', () => {
  it('shows total when showing equals total', () => {
    render(<ResultsCount showing={12} total={12} entityName="shows" />);
    expect(screen.getByText('12 shows')).toBeInTheDocument();
  });

  it('shows "X of Y" when filtered', () => {
    render(<ResultsCount showing={6} total={48} entityName="classes" filtered />);
    expect(screen.getByText('6 of 48 classes (filtered)')).toBeInTheDocument();
  });
});
```

```tsx
// src/test/components/NotFoundState.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundState } from '@/components/common/NotFoundState';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('NotFoundState', () => {
  it('renders entity name in message', () => {
    render(
      <MemoryRouter>
        <NotFoundState entityName="Show" backTo="/shows" backLabel="Back to Shows" />
      </MemoryRouter>
    );
    expect(screen.getByText('Show Not Found')).toBeInTheDocument();
  });

  it('navigates back when button clicked', () => {
    render(
      <MemoryRouter>
        <NotFoundState entityName="Show" backTo="/shows" backLabel="Back to Shows" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Back to Shows'));
    expect(mockNavigate).toHaveBeenCalledWith('/shows');
  });
});
```

- [ ] **Step 11: Run all tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/ViewToggle.test.tsx src/test/components/EmptyState.test.tsx src/test/components/ErrorState.test.tsx src/test/components/LoadingSkeleton.test.tsx src/test/components/ResultsCount.test.tsx src/test/components/NotFoundState.test.tsx`
Expected: All tests PASS

- [ ] **Step 12: Commit**

```bash
git add apps/myk9show/src/components/common/ViewToggle.tsx apps/myk9show/src/components/common/ResultsCount.tsx apps/myk9show/src/components/common/ErrorState.tsx apps/myk9show/src/components/common/NotFoundState.tsx apps/myk9show/src/components/common/LoadingSkeleton.tsx apps/myk9show/src/test/components/
git commit -m "feat: add ViewToggle, ResultsCount, ErrorState, NotFoundState, LoadingSkeleton primitives"
```

### Task 7: DetailHero

**Files:**

- Create: `src/components/common/DetailHero.tsx`
- Create: `src/test/components/DetailHero.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/DetailHero.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DetailHero } from '@/components/common/DetailHero';

describe('DetailHero', () => {
  it('renders entity name', () => {
    render(<DetailHero name="Bluegrass Classic Agility Trial" />);
    expect(screen.getByText('Bluegrass Classic Agility Trial')).toBeInTheDocument();
  });

  it('renders metadata items', () => {
    render(
      <DetailHero
        name="Test Show"
        metadata={[
          { label: 'Mar 22-23, 2026' },
          { label: 'Louisville, KY' },
          { label: 'Bluegrass KC' },
        ]}
      />
    );
    expect(screen.getByText('Mar 22-23, 2026')).toBeInTheDocument();
    expect(screen.getByText('Louisville, KY')).toBeInTheDocument();
    expect(screen.getByText('Bluegrass KC')).toBeInTheDocument();
  });

  it('renders badge when provided', () => {
    render(<DetailHero name="Test" badge={{ label: 'Open for Entries', variant: 'success' }} />);
    expect(screen.getByText('Open for Entries')).toBeInTheDocument();
  });

  it('renders primary action button', () => {
    const onAction = vi.fn();
    render(<DetailHero name="Test" primaryAction={{ label: 'Register', onClick: onAction }} />);
    fireEvent.click(screen.getByText('Register'));
    expect(onAction).toHaveBeenCalled();
  });

  it('primary action button has 48px touch target', () => {
    render(<DetailHero name="Test" primaryAction={{ label: 'Register', onClick: vi.fn() }} />);
    const btn = screen.getByText('Register').closest('button');
    expect(btn?.className).toMatch(/h-12|min-h-\[48px\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/DetailHero.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/common/DetailHero.tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetadataItem {
  label: string;
  icon?: React.ReactNode;
}

interface HeroBadge {
  label: string;
  variant: 'success' | 'warning' | 'destructive' | 'default';
}

interface HeroAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

interface DetailHeroProps {
  name: string;
  metadata?: MetadataItem[];
  badge?: HeroBadge;
  primaryAction?: HeroAction;
  secondaryActions?: React.ReactNode;
  className?: string;
}

const badgeStyles: Record<string, string> = {
  success: 'bg-green-500/10 text-green-600 border-green-500/20',
  warning: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  default: '',
};

export function DetailHero({
  name,
  metadata,
  badge,
  primaryAction,
  secondaryActions,
  className,
}: DetailHeroProps) {
  return (
    <Card className={cn('border-border/50', className)}>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold tracking-tight">{name}</h2>
              {badge && (
                <Badge variant="outline" className={cn('text-sm', badgeStyles[badge.variant])}>
                  {badge.label}
                </Badge>
              )}
            </div>
            {metadata && metadata.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                {metadata.map((item, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-sm">
                    {item.icon}
                    {item.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {secondaryActions}
            {primaryAction && (
              <Button onClick={primaryAction.onClick} size="lg" className="h-12 text-base">
                {primaryAction.icon}
                {primaryAction.label}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/DetailHero.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/DetailHero.tsx apps/myk9show/src/test/components/DetailHero.test.tsx
git commit -m "feat: add DetailHero shared primitive for detail pages"
```

---

## Chunk 2: Refactor BrowseShowsPage (Golden Template)

### Task 8: Merge Grid + List views into unified CardGrid

The current `ShowsGridView` (228 lines) and `ShowsListView` (217 lines) are nearly identical. Merge them into a single `ShowCardGrid` component.

**Files:**

- Create: `src/components/shows/browse/ShowCardGrid.tsx`
- Modify: `src/pages/BrowseShowsPage.tsx` (remove grid/list distinction)
- Delete: `src/components/shows/browse/ShowsListView.tsx` (after merge)
- Rename: `src/components/shows/browse/ShowsGridView.tsx` → replaced by ShowCardGrid

- [ ] **Step 1: Read ShowsGridView and ShowsListView to understand differences**

Read: `src/components/shows/browse/ShowsGridView.tsx` and `src/components/shows/browse/ShowsListView.tsx`
Purpose: Identify what differs between grid and list to create a unified card component.

- [ ] **Step 2: Create ShowCardGrid combining both views**

Create `src/components/shows/browse/ShowCardGrid.tsx` that renders show cards in a responsive grid. Use the best parts of both views. The card layout should show: show name, dates, location, club, entry status badge.

- [ ] **Step 3: Update BrowseShowsPage to use ShowCardGrid instead of separate grid/list**

Replace the `case 'grid'` and `case 'list'` branches in `renderShowsView()` with a single `case 'cards'` using `ShowCardGrid`.

- [ ] **Step 4: Run existing BrowseShowsPage tests**

Run: `cd apps/myk9show && pnpm vitest run src/test/pages/BrowseShowsPage.test.tsx`
Purpose: Check which tests need updating. Some will fail because view mode 'grid' and 'list' are gone.

- [ ] **Step 5: Update tests for new view mode names**

Replace references to 'grid' and 'list' with 'cards' in test file.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/test/pages/BrowseShowsPage.test.tsx`
Expected: PASS

- [ ] **Step 7: [ADDED] Delete merged files**

Delete `src/components/shows/browse/ShowsListView.tsx` and `src/components/shows/browse/ShowsGridView.tsx`. Search for any remaining imports of these files across the codebase and remove them.

```bash
grep -r "ShowsListView\|ShowsGridView" apps/myk9show/src/ --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 8: Commit**

```bash
git commit -m "refactor: merge grid + list views into unified ShowCardGrid"
```

### Task 9: Refactor BrowseShowsPage to use shared primitives

**Files:**

- Modify: `src/pages/BrowseShowsPage.tsx`
- Modify: `src/test/pages/BrowseShowsPage.test.tsx`

- [ ] **Step 1: Replace wrapper div with PageShell**

Replace the outer `<div className="bg-background">` and `<div className="container mx-auto px-6 py-6 max-w-7xl">` with `<PageShell>`.

- [ ] **Step 2: Replace breadcrumb + actions with PageHeader**

Replace the inline breadcrumb/actions layout (lines 483-539) with `<PageHeader breadcrumbs={...} title="Shows" actions={...} />`.

- [ ] **Step 3: Replace inline search with SearchBar**

Replace the search Card + Input (lines 542-561) with `<SearchBar>`.

- [ ] **Step 4: Replace FilterBar with FilterChips**

Replace the existing `<FilterBar>` usage with `<FilterChips>`, converting filter definitions to the new format. The existing `useBrowseShowsFilters` hook continues to manage state.

- [ ] **Step 5: Replace inline view mode toggle with ViewToggle**

Replace the view mode buttons (lines 564-607) with `<ViewToggle modes={[...]} active={viewMode} onChange={handleViewModeChange} />`. Define modes as `cards`, `table`, `calendar`.

- [ ] **Step 6: Replace inline stats with ResultsCount**

Replace the quick stats span (lines 611-643) with `<ResultsCount>`.

- [ ] **Step 7: Replace inline error state with ErrorState**

Replace `errorStateContent` (lines 436-458) with `<ErrorState>`.

- [ ] **Step 8: Replace EnhancedEmptyState with EmptyState**

Replace the `EnhancedEmptyState` import and usage with the new `EmptyState` primitive.

- [ ] **Step 9: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS (or fix any issues)

- [ ] **Step 10: Update tests to match new component structure**

Tests may reference old class names or component structure. Update assertions to match the new primitives.

- [ ] **Step 11: Run all tests**

Run: `cd apps/myk9show && pnpm vitest run src/test/pages/BrowseShowsPage.test.tsx`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git commit -m "refactor: BrowseShowsPage to use shared primitives (PageShell, PageHeader, SearchBar, etc.)"
```

### Task 10: Add MineToggle to BrowseShowsPage

**Files:**

- Modify: `src/pages/BrowseShowsPage.tsx`
- Modify: `src/hooks/useBrowseShowsFilters.ts`

- [ ] **Step 1: Wire useMineToggle into BrowseShowsPage**

```tsx
const { isMine, toggle } = useMineToggle('shows');
```

- [ ] **Step 2: Add MineToggle component between FilterChips and ResultsCount**

```tsx
<MineToggle
  isMine={isMine}
  onToggle={toggle}
  allLabel="All Shows"
  mineLabel="My Shows"
  hidden={!user} // hidden for unauthenticated users
/>
```

- [ ] **Step 3: Filter shows when isMine is true**

In `useBrowseShowsFilters` or in the page, filter `filteredShows` to only include shows where the user has entries when `isMine` is true. This requires checking the `entries` array from `useBrowseShowsData`.

- [ ] **Step 4: Write test for MineToggle integration**

Add a test to `BrowseShowsPage.test.tsx` that verifies the toggle filters shows correctly.

- [ ] **Step 5: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/test/pages/BrowseShowsPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add MineToggle to BrowseShowsPage for exhibitor filtering"
```

---

## Chunk 3: Refactor ShowDetailsPage

### Task 11: Build tabbed ShowDetailsPage with DetailHero

**Files:**

- Modify: `src/pages/ShowDetailsPage.tsx`
- Modify: `src/components/shows/ShowDetailsMain.tsx`
- Create: `src/test/pages/ShowDetailsPage.test.tsx`

- [ ] **Step 1: Write failing tests for new structure**

```tsx
// src/test/pages/ShowDetailsPage.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ShowDetailsPage from '@/pages/ShowDetailsPage';

// Mock auth context
const mockAuthContext = { user: { id: 'user-1' }, isSecretary: false, isAdmin: false };
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthContext,
}));

// Mock show query — override per test
let mockShow = {
  id: 'show-1',
  name: 'Bluegrass Classic',
  start_date: '2026-03-22',
  end_date: '2026-03-23',
  location: 'Louisville, KY',
  clubName: 'Bluegrass KC',
};
let mockLoading = false;
vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: mockLoading ? null : mockShow,
    isLoading: mockLoading,
    hasData: !mockLoading && !!mockShow,
    showId: mockShow?.id,
  }),
}));

// Mock entries for "mine" detection
let mockUserEntries: Array<{ id: string; showId: string }> = [];
vi.mock('@/hooks/useMyEntries', () => ({
  useMyEntries: () => ({ entries: mockUserEntries, isLoading: false }),
}));

function renderPage(showId = 'show-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/shows/${showId}`]}>
        <Routes>
          <Route path="/shows/:id" element={<ShowDetailsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ShowDetailsPage', () => {
  beforeEach(() => {
    mockShow = {
      id: 'show-1',
      name: 'Bluegrass Classic',
      start_date: '2026-03-22',
      end_date: '2026-03-23',
      location: 'Louisville, KY',
      clubName: 'Bluegrass KC',
    };
    mockLoading = false;
    mockUserEntries = [];
    mockAuthContext.user = { id: 'user-1' };
  });

  it('renders DetailHero with show name', () => {
    renderPage();
    expect(screen.getByText('Bluegrass Classic')).toBeInTheDocument();
  });

  it('renders tabs: Overview, Classes, My Entries, Results', () => {
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }]; // needs entries for My Entries tab
    renderPage();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('My Entries')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('defaults to My Entries tab when user has entries', () => {
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
    renderPage();
    // My Entries tab should be active (data-state="active" or aria-selected)
    const tab = screen.getByText('My Entries');
    expect(tab.closest('[data-state="active"], [aria-selected="true"]')).toBeTruthy();
  });

  it('defaults to Overview tab when user has no entries', () => {
    mockUserEntries = [];
    renderPage();
    const tab = screen.getByText('Overview');
    expect(tab.closest('[data-state="active"], [aria-selected="true"]')).toBeTruthy();
  });

  it('hides My Entries and Results tabs for unauthenticated users', () => {
    mockAuthContext.user = null as any;
    renderPage();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.queryByText('My Entries')).toBeNull();
    expect(screen.queryByText('Results')).toBeNull();
  });

  it('renders NotFoundState when show does not exist', () => {
    mockShow = null as any;
    renderPage('nonexistent');
    expect(screen.getByText(/Not Found/)).toBeInTheDocument();
  });

  it('renders loading skeleton while loading', () => {
    mockLoading = true;
    const { container } = renderPage();
    expect(container.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/test/pages/ShowDetailsPage.test.tsx`
Expected: FAIL

- [ ] **Step 4: Refactor ShowDetailsPage to use PageShell + DetailHero + Tabs**

Replace the current `renderContent()` approach with:

- `PageShell` wrapper
- `PageHeader` with breadcrumbs (Home / Shows / [Show Name])
- `DetailHero` with show name, dates, location, club, entry status badge, Register button
- `Tabs` with Overview, Classes, My Entries, Results
- Smart default tab: "My Entries" when user has entries, "Overview" otherwise
- `LoadingSkeleton` for loading state
- `NotFoundState` for missing show
- `ErrorState` for errors

Tab content components will be built in subsequent tasks. For now, use placeholder content.

- [ ] **Step 5: Update URL param handling for tabs**

Use `?tab=overview|classes|my-entries|results` search params. Read from URL on mount, update URL on tab change.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/test/pages/ShowDetailsPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git commit -m "refactor: ShowDetailsPage with PageShell, DetailHero, tabbed layout"
```

---

## Chunk 4: Live Components + Entry Views

### Task 12: DogsAheadBadge

**Files:**

- Create: `src/components/live/DogsAheadBadge.tsx`
- Create: `src/test/components/DogsAheadBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/DogsAheadBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DogsAheadBadge } from '@/components/live/DogsAheadBadge';

describe('DogsAheadBadge', () => {
  it('shows "5 dogs ahead" when position is 5', () => {
    render(<DogsAheadBadge dogsAhead={5} />);
    expect(screen.getByText('5 dogs ahead')).toBeInTheDocument();
  });

  it('shows "You\'re next!" when position is 1', () => {
    render(<DogsAheadBadge dogsAhead={1} />);
    expect(screen.getByText("You're next!")).toBeInTheDocument();
  });

  it('shows "In Ring" when position is 0', () => {
    render(<DogsAheadBadge dogsAhead={0} />);
    expect(screen.getByText('In Ring')).toBeInTheDocument();
  });

  it('shows result when completed', () => {
    render(<DogsAheadBadge dogsAhead={-1} result="Q" />);
    expect(screen.getByText('Q')).toBeInTheDocument();
  });

  it('shows stale indicator when staleMinutes provided', () => {
    render(<DogsAheadBadge dogsAhead={3} staleMinutes={5} />);
    expect(screen.getByText(/Updated 5m ago/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/DogsAheadBadge.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement DogsAheadBadge**

```tsx
// src/components/live/DogsAheadBadge.tsx
import { cn } from '@/lib/utils';

interface DogsAheadBadgeProps {
  dogsAhead: number; // -1 = completed, 0 = in ring, 1+ = dogs ahead
  result?: 'Q' | 'NQ' | string;
  staleMinutes?: number;
  className?: string;
}

export function DogsAheadBadge({
  dogsAhead,
  result,
  staleMinutes,
  className,
}: DogsAheadBadgeProps) {
  let text: string;
  let style: string;

  if (dogsAhead < 0 && result) {
    text = result;
    style = result === 'Q' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground';
  } else if (dogsAhead === 0) {
    text = 'In Ring';
    style = 'bg-primary/10 text-primary animate-pulse';
  } else if (dogsAhead === 1) {
    text = "You're next!";
    style = 'bg-orange-500/10 text-orange-600';
  } else {
    text = `${dogsAhead} dogs ahead`;
    style = 'bg-muted text-muted-foreground';
  }

  return (
    <div className={cn('flex flex-col items-end gap-0.5', className)}>
      <span className={cn('px-3 py-1 rounded-lg text-sm font-medium', style)}>{text}</span>
      {staleMinutes !== undefined && staleMinutes > 0 && (
        <span className="text-xs text-muted-foreground/60">Updated {staleMinutes}m ago</span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/DogsAheadBadge.test.tsx`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/live/DogsAheadBadge.tsx apps/myk9show/src/test/components/DogsAheadBadge.test.tsx
git commit -m "feat: add DogsAheadBadge live indicator component"
```

### Task 13: EntryRow

**Files:**

- Create: `src/components/live/EntryRow.tsx`
- Create: `src/test/components/EntryRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/EntryRow.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EntryRow } from '@/components/live/EntryRow';

describe('EntryRow', () => {
  const baseProps = {
    armband: '148',
    dogName: 'Bella',
    breed: 'Aussie',
    handlerName: 'Sarah Johnson',
    status: 'checked_in' as const,
  };

  it('renders armband number prominently', () => {
    render(<EntryRow {...baseProps} />);
    expect(screen.getByText('#148')).toBeInTheDocument();
  });

  it('renders dog name and handler', () => {
    render(<EntryRow {...baseProps} />);
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText(/Sarah Johnson/)).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<EntryRow {...baseProps} />);
    expect(screen.getByText('Checked In')).toBeInTheDocument();
  });

  it('shows "YOU" badge when isCurrentUser is true', () => {
    render(<EntryRow {...baseProps} isCurrentUser />);
    expect(screen.getByText('YOU')).toBeInTheDocument();
  });

  it('applies orange border when isCurrentUser is true', () => {
    const { container } = render(<EntryRow {...baseProps} isCurrentUser />);
    expect(container.firstElementChild?.className).toContain('border-orange');
  });

  it('applies blue highlight when status is in_ring', () => {
    const { container } = render(<EntryRow {...baseProps} status="in_ring" />);
    expect(container.firstElementChild?.className).toContain('border-primary');
  });

  it('renders result when provided', () => {
    render(<EntryRow {...baseProps} status="completed" result="Q" time="42.3s" />);
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('42.3s')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/EntryRow.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement EntryRow**

Build `src/components/live/EntryRow.tsx` with:

- Large armband badge (left side)
- Dog name + breed + handler (center)
- Status badge (right side) — color-coded
- "YOU" badge when `isCurrentUser`
- Orange left border for user's dog, blue for in-ring, green for checked in, gray for not checked in, red for pulled
- Result display (Q/NQ + time) when completed
- Reference myK9Q's `SortableEntryCardComponents.tsx` for the proven layout

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/EntryRow.test.tsx`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/live/EntryRow.tsx apps/myk9show/src/test/components/EntryRow.test.tsx
git commit -m "feat: add EntryRow component with armband, status borders, YOU badge"
```

### Task 14: LiveClassCard

**Files:**

- Create: `src/components/live/LiveClassCard.tsx`
- Create: `src/test/components/LiveClassCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/components/LiveClassCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LiveClassCard } from '@/components/live/LiveClassCard';

describe('LiveClassCard', () => {
  const baseProps = {
    className_: 'Novice JWW',
    judgeName: 'Jane Smith',
    status: 'in_progress' as const,
    totalEntries: 28,
    completedEntries: 12,
    inRingArmband: '142',
    nextArmbands: ['145', '146', '148'],
  };

  it('renders class name and judge', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('Novice JWW')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    const { container } = render(<LiveClassCard {...baseProps} />);
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('renders in-ring dog armband', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('#142')).toBeInTheDocument();
  });

  it('renders next 3 armbands', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('#145')).toBeInTheDocument();
    expect(screen.getByText('#146')).toBeInTheDocument();
    expect(screen.getByText('#148')).toBeInTheDocument();
  });

  it('renders remaining count', () => {
    render(<LiveClassCard {...baseProps} />);
    expect(screen.getByText('16 of 28 remaining')).toBeInTheDocument();
  });

  it('shows "X dogs ahead" for user entry', () => {
    render(<LiveClassCard {...baseProps} userDogsAhead={3} userDogName="Bella" />);
    expect(screen.getByText('3 dogs ahead')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/LiveClassCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement LiveClassCard**

Build `src/components/live/LiveClassCard.tsx` with:

- Class name + judge name header
- Status badge (pulsing when in_progress)
- Progress bar (completed/total, animated width)
- In-ring dog armband with indicator dot
- Next 3 armbands preview
- Remaining count ("16 of 28 remaining")
- Optional DogsAheadBadge for user's entry
- Stale data warning when offline
- Reference myK9Q's ClassCard pattern for layout

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/LiveClassCard.test.tsx`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/live/LiveClassCard.tsx apps/myk9show/src/test/components/LiveClassCard.test.tsx
git commit -m "feat: add LiveClassCard with progress bar, in-ring dog, next armbands"
```

---

## Chunk 5: Show Detail Tab Content + Data Hooks

### Task 15: useMyEntries hook

**Files:**

- Create: `src/hooks/useMyEntries.ts`
- Create: `src/test/hooks/useMyEntries.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/hooks/useMyEntries.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyEntries } from '@/hooks/useMyEntries';

// Mock Supabase client
const mockSelect = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: mockSelect }) },
}));

// Mock auth
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' }, personId: 'person-1' }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useMyEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns entries grouped by class for the given show', async () => {
    mockSelect.mockResolvedValue({
      data: [
        {
          id: 'e1',
          class_id: 'c1',
          class_name: 'Novice JWW',
          dog_name: 'Bella',
          armband: '148',
          run_order: 5,
          scored: false,
        },
        {
          id: 'e2',
          class_id: 'c2',
          class_name: 'Open Standard',
          dog_name: 'Bella',
          armband: '148',
          run_order: 12,
          scored: false,
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useMyEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entriesByClass).toHaveLength(2);
    expect(result.current.entriesByClass[0].className).toBe('Novice JWW');
  });

  it('calculates dogsAhead based on run order and scored count', async () => {
    mockSelect.mockResolvedValue({
      data: [
        {
          id: 'e1',
          class_id: 'c1',
          class_name: 'Novice JWW',
          dog_name: 'Bella',
          armband: '148',
          run_order: 5,
          scored: false,
          scored_count: 2,
          in_ring_order: 3,
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useMyEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entriesByClass[0].dogsAhead).toBeGreaterThanOrEqual(0);
  });

  it('returns empty array when user has no entries', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useMyEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entriesByClass).toHaveLength(0);
  });

  // [ADDED] Error handling
  it('returns error state when Supabase query fails', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'Network error' } });
    const { result } = renderHook(() => useMyEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.entriesByClass).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/hooks/useMyEntries.test.ts`

- [ ] **Step 3: Implement useMyEntries**

Query entries joined with classes for the given show where the handler/owner matches the current user (`people.id`). Calculate `dogsAhead` for each entry: `run_order - scored_count - 1` (entries ahead that haven't been scored yet). Return entries grouped by class. Use React Query with `cacheStrategies.dynamic` (1min) for auto-refresh. Data source: `src/hooks/queries/useShowDayData.ts:232` for reference on how existing show-day queries work. [ADDED] Return `isError` flag when query fails — the consuming component renders ErrorState.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add useMyEntries hook for exhibitor entry data with position"
```

### Task 16: useClassEntries hook

**Files:**

- Create: `src/hooks/useClassEntries.ts`
- Create: `src/test/hooks/useClassEntries.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/hooks/useClassEntries.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClassEntries } from '@/hooks/useClassEntries';

const mockSelect = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: mockSelect }) },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' }, personId: 'person-1' }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useClassEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('splits entries into pending and completed', async () => {
    mockSelect.mockResolvedValue({
      data: [
        {
          id: 'e1',
          armband: '142',
          dog_name: 'Ziggy',
          handler_name: 'Sarah',
          run_order: 1,
          scored: true,
          result: 'Q',
          time: '42.3',
        },
        {
          id: 'e2',
          armband: '145',
          dog_name: 'Pepper',
          handler_name: 'Mary',
          run_order: 2,
          scored: false,
        },
        {
          id: 'e3',
          armband: '148',
          dog_name: 'Bella',
          handler_name: 'You',
          run_order: 3,
          scored: false,
          person_id: 'person-1',
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useClassEntries('class-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pending).toHaveLength(2);
    expect(result.current.completed).toHaveLength(1);
  });

  it('marks current user entries with isCurrentUser', async () => {
    mockSelect.mockResolvedValue({
      data: [
        {
          id: 'e1',
          armband: '148',
          dog_name: 'Bella',
          handler_name: 'You',
          run_order: 3,
          scored: false,
          person_id: 'person-1',
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useClassEntries('class-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pending[0].isCurrentUser).toBe(true);
  });

  it('calculates dogsAhead for user entries', async () => {
    mockSelect.mockResolvedValue({
      data: [
        {
          id: 'e1',
          armband: '142',
          dog_name: 'Ziggy',
          run_order: 1,
          scored: false,
          status: 'in_ring',
        },
        { id: 'e2', armband: '145', dog_name: 'Pepper', run_order: 2, scored: false },
        {
          id: 'e3',
          armband: '148',
          dog_name: 'Bella',
          run_order: 3,
          scored: false,
          person_id: 'person-1',
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useClassEntries('class-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const userEntry = result.current.pending.find(e => e.isCurrentUser);
    expect(userEntry?.dogsAhead).toBe(2); // Ziggy (in ring) + Pepper ahead
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/test/hooks/useClassEntries.test.ts`

- [ ] **Step 3: Implement useClassEntries**

Query entries for a class ordered by run order. Split into pending (unscored) and completed (scored). Mark `isCurrentUser` on entries where `person_id` matches auth user's `personId`. Calculate `dogsAhead` for user's entries (count of unscored entries with lower run_order). Pin in-ring entry to top of pending list. Use React Query with 30s refetch interval (matching `useShowDayData` tier 2).

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add useClassEntries hook with pending/completed split and user highlighting"
```

### Task 17: Build "My Entries" tab content

**Files:**

- Create: `src/components/shows/tabs/MyEntriesTab.tsx`
- Create: `src/test/components/MyEntriesTab.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/test/components/MyEntriesTab.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';

vi.mock('@/hooks/useMyEntries', () => ({
  useMyEntries: () => ({
    entriesByClass: [
      {
        classId: 'c1',
        className: 'Novice JWW',
        dogName: 'Bella',
        armband: '148',
        dogsAhead: 3,
        status: 'checked_in',
        judgeName: 'Jane Smith',
        totalEntries: 28,
        completedEntries: 12,
      },
      {
        classId: 'c2',
        className: 'Open Standard',
        dogName: 'Bella',
        armband: '148',
        dogsAhead: 8,
        status: 'not_checked_in',
        judgeName: 'Bob Jones',
        totalEntries: 20,
        completedEntries: 0,
      },
    ],
    isLoading: false,
  }),
}));

describe('MyEntriesTab', () => {
  it('renders a LiveClassCard for each class entry', () => {
    render(<MyEntriesTab showId="show-1" />);
    expect(screen.getByText('Novice JWW')).toBeInTheDocument();
    expect(screen.getByText('Open Standard')).toBeInTheDocument();
  });

  it('shows DogsAheadBadge on each card', () => {
    render(<MyEntriesTab showId="show-1" />);
    expect(screen.getByText('3 dogs ahead')).toBeInTheDocument();
    expect(screen.getByText('8 dogs ahead')).toBeInTheDocument();
  });

  it('shows empty state when no entries', () => {
    vi.mocked(require('@/hooks/useMyEntries').useMyEntries).mockReturnValue({
      entriesByClass: [],
      isLoading: false,
    });
    render(<MyEntriesTab showId="show-1" />);
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  // [ADDED] Edge case: all entries completed
  it('shows celebration state when all entries are completed', () => {
    vi.mocked(require('@/hooks/useMyEntries').useMyEntries).mockReturnValue({
      entriesByClass: [
        {
          classId: 'c1',
          className: 'Novice JWW',
          dogName: 'Bella',
          armband: '148',
          dogsAhead: -1,
          result: 'Q',
          status: 'completed',
          judgeName: 'Jane Smith',
          totalEntries: 28,
          completedEntries: 28,
        },
      ],
      isLoading: false,
    });
    render(<MyEntriesTab showId="show-1" />);
    expect(screen.getByText('Q')).toBeInTheDocument(); // Result shown instead of dogs ahead
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement MyEntriesTab**

Uses `useMyEntries` hook. Renders a list of LiveClassCards, one per class the user has entries in. Each card shows the class name, the user's dog armband, DogsAheadBadge, and check-in status. Tap a card to expand/navigate to the full entry list. Shows EmptyState with "Browse Classes" CTA when no entries.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add MyEntriesTab with LiveClassCards and DogsAheadBadge"
```

### Task 18: Build "Classes" tab content

**Files:**

- Create: `src/components/shows/tabs/ClassesTab.tsx`
- Create: `src/test/components/ClassesTab.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/test/components/ClassesTab.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';

const mockClasses = [
  {
    id: 'c1',
    element: 'Containers',
    level: 'Novice',
    time: '9:00 AM',
    ring: 1,
    status: 'in_progress',
    entryCount: 28,
    userHasEntry: true,
  },
  {
    id: 'c2',
    element: 'Interior',
    level: 'Novice',
    time: '10:30 AM',
    ring: 1,
    status: 'pending',
    entryCount: 22,
    userHasEntry: true,
  },
  {
    id: 'c3',
    element: 'Exterior',
    level: 'Advanced',
    time: '1:00 PM',
    ring: 2,
    status: 'pending',
    entryCount: 15,
    userHasEntry: false,
  },
];

vi.mock('@/hooks/queries/useClassesData', () => ({
  useClassesData: () => ({ classes: mockClasses, isLoading: false }),
}));

describe('ClassesTab', () => {
  it('renders a table with columns: element, level, time, ring, status, entries', () => {
    render(<ClassesTab showId="show-1" userHasEntries={true} />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Novice')).toBeInTheDocument();
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
  });

  it('defaults MineToggle to "My Classes" when user has entries', () => {
    render(<ClassesTab showId="show-1" userHasEntries={true} />);
    // Should show only 2 classes (user's), not all 3
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.queryByText('Exterior')).toBeNull();
  });

  it('shows all classes when toggled to "All Classes"', () => {
    render(<ClassesTab showId="show-1" userHasEntries={true} />);
    fireEvent.click(screen.getByText(/All Classes/));
    expect(screen.getByText('Exterior')).toBeInTheDocument();
  });

  // [ADDED] Edge case: show with 0 classes
  it('shows empty state when show has no classes', () => {
    vi.mocked(require('@/hooks/queries/useClassesData').useClassesData).mockReturnValue({
      classes: [],
      isLoading: false,
    });
    render(<ClassesTab showId="show-1" userHasEntries={false} />);
    expect(screen.getByText(/no classes/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement ClassesTab**

Renders MineToggle (defaulting to "My Classes" when user has entries) + table with columns: element, level, time, ring, status, entries count. Optionally toggle to LiveClassCards view. Clicking a row expands to show the entry list for that class.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add ClassesTab with MineToggle and class table"
```

### Task 19: Build entry list with Pending/Completed tabs

**Files:**

- Create: `src/components/shows/EntryList.tsx`
- Create: `src/test/components/EntryList.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/test/components/EntryList.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EntryList } from '@/components/shows/EntryList';

const mockEntries = {
  pending: [
    {
      id: 'e1',
      armband: '142',
      dogName: 'Ziggy',
      breed: 'Border Collie',
      handlerName: 'Sarah',
      status: 'in_ring' as const,
      isCurrentUser: false,
    },
    {
      id: 'e2',
      armband: '145',
      dogName: 'Pepper',
      breed: 'Sheltie',
      handlerName: 'Mary',
      status: 'checked_in' as const,
      isCurrentUser: false,
    },
    {
      id: 'e3',
      armband: '148',
      dogName: 'Bella',
      breed: 'Aussie',
      handlerName: 'You',
      status: 'checked_in' as const,
      isCurrentUser: true,
      dogsAhead: 2,
    },
  ],
  completed: [
    {
      id: 'e4',
      armband: '139',
      dogName: 'Max',
      breed: 'Lab',
      handlerName: 'Tom',
      status: 'completed' as const,
      result: 'Q',
      time: '42.3s',
      isCurrentUser: false,
    },
  ],
  isLoading: false,
};

vi.mock('@/hooks/useClassEntries', () => ({
  useClassEntries: () => mockEntries,
}));

describe('EntryList', () => {
  it('renders Pending and Completed tabs', () => {
    render(<EntryList classId="class-1" />);
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it('shows pending entries in run order on Pending tab', () => {
    render(<EntryList classId="class-1" />);
    expect(screen.getByText('#142')).toBeInTheDocument(); // in-ring first
    expect(screen.getByText('#145')).toBeInTheDocument();
    expect(screen.getByText('#148')).toBeInTheDocument();
  });

  it('highlights user dog with YOU badge', () => {
    render(<EntryList classId="class-1" />);
    expect(screen.getByText('YOU')).toBeInTheDocument();
  });

  it('shows DogsAheadBadge for user entry', () => {
    render(<EntryList classId="class-1" />);
    expect(screen.getByText('Bella is 3rd up')).toBeInTheDocument();
  });

  it('shows completed entries with results on Completed tab', () => {
    render(<EntryList classId="class-1" />);
    fireEvent.click(screen.getByText(/Completed/));
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('42.3s')).toBeInTheDocument();
  });
});
```

Test that entry list renders Pending and Completed tabs. Test that user's dogs are highlighted. Test that DogsAheadBadge shows position.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement EntryList**

Uses `useClassEntries` hook. Renders:

- MineToggle ("All Entries" / "My Dogs")
- DogsAheadBadge showing "[Dog] is Xth up" when viewing All
- Tabs: Pending (EntryRows in run order, in-ring pinned to top) / Completed (EntryRows with results)
- Each EntryRow uses the shared component with color-coded borders

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add EntryList with Pending/Completed tabs and run order"
```

---

## Chunk 6: Wire Show Detail Tabs + Integration

### Task 20: Wire all tabs into ShowDetailsPage

**Files:**

- Modify: `src/pages/ShowDetailsPage.tsx`

- [ ] **Step 1: Import and wire MyEntriesTab, ClassesTab into the ShowDetailsPage tabs**

Replace placeholder tab content with actual components. Wire the "Overview" tab to existing show info (from PublicShowView or ShowDetailsEnhanced). The "Results" tab reuses the Completed tab content from EntryList — it shows completed classes with scores. For the initial implementation, the Results tab aggregates completed entries across all classes. If this proves too complex, it can show a simple "Results will appear after classes are scored" message and be enhanced later.

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

- [ ] **Step 3: Run ShowDetailsPage tests**

Run: `cd apps/myk9show && pnpm vitest run src/test/pages/ShowDetailsPage.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: wire all tabs into ShowDetailsPage (Overview, Classes, My Entries)"
```

### Task 21: Wire real-time updates

**Files:**

- Modify: `src/components/live/LiveClassCard.tsx`
- Modify: `src/components/live/EntryRow.tsx`
- Modify: `src/hooks/useClassEntries.ts`
- Modify: `src/hooks/useMyEntries.ts`

- [ ] **Step 1: Connect hooks to Supabase real-time subscriptions**

Use React Query's `refetchInterval` (30s for entries, 30s for class progress — matching existing `useShowDayData` tiers) and/or Supabase channel subscriptions to keep data fresh.

- [ ] **Step 2: Implement offline fallback**

When real-time updates stop arriving, detect staleness (timestamp of last update vs now). Pass `staleMinutes` to DogsAheadBadge to show "Updated Xm ago". No error modals — just the quiet indicator.

- [ ] **Step 3: Write tests for offline fallback**

Test that when last update timestamp is >2 minutes old, the stale indicator appears.

- [ ] **Step 4: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/test/components/DogsAheadBadge.test.tsx src/test/hooks/useClassEntries.test.ts src/test/hooks/useMyEntries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: wire real-time updates to LiveClassCard and EntryRow with offline fallback"
```

### Task 22: Full integration test + UX audit

- [ ] **Step 1: Run all tests in the test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests PASS, no regressions

- [ ] **Step 2: Run typecheck and lint across monorepo**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev:show`
Navigate through: Shows list → Show detail → Classes tab → Entry list. Verify all shared primitives render correctly, MineToggle works, view modes switch properly.

- [ ] **Step 4: UX audit**

Run the `/UX-Audit` skill against each refactored page:

1. BrowseShowsPage — check against INTENT.md exhibitor intent
2. ShowDetailsPage — check tab navigation, DetailHero, accessibility
3. Entry list — check Pending/Completed tabs, DogsAheadBadge, EntryRow

Fix all critical and major findings before committing.

- [ ] **Step 5: Final commit**

```bash
git commit -m "chore: fix UX audit findings for unified list/detail system"
```

---

## Summary

| Chunk | Tasks       | What it delivers                                                                                                                                                                               |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Tasks 1-7   | All 13 shared primitives (PageShell, PageHeader, DetailHero, SearchBar, FilterChips, MineToggle, ViewToggle, ResultsCount, EmptyState, ErrorState, NotFoundState, LoadingSkeleton, DetailHero) |
| 2     | Tasks 8-10  | Refactored BrowseShowsPage using shared primitives + MineToggle                                                                                                                                |
| 3     | Task 11     | Refactored ShowDetailsPage with DetailHero + tabbed layout                                                                                                                                     |
| 4     | Tasks 12-14 | Live components: DogsAheadBadge, EntryRow, LiveClassCard                                                                                                                                       |
| 5     | Tasks 15-19 | Data hooks + tab content: useMyEntries, useClassEntries, MyEntriesTab, ClassesTab, EntryList                                                                                                   |
| 6     | Tasks 20-22 | Integration: wire tabs, real-time updates, UX audit                                                                                                                                            |
