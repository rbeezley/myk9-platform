# Show Status Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ShowStatusPill` component to the show details page header that lets secretaries toggle a show between Draft and Published with a single click.

**Architecture:** One new self-contained component (`ShowStatusPill`) that derives available transitions from the current status and calls `useUpdateShowMutation` on selection. The component is added to `ShowDetailsPage`'s `secondaryActions` block, guarded by `canManageShow`. All other statuses render as read-only badges.

**Tech Stack:** React, TypeScript, shadcn/ui (`DropdownMenu`, `Button`), sonner (`toast`), Vitest + Testing Library

---

## File Map

| Action | File                                                                   |
| ------ | ---------------------------------------------------------------------- |
| Create | `apps/myk9show/src/components/shows/ShowStatusPill.tsx`                |
| Create | `apps/myk9show/src/components/shows/__tests__/ShowStatusPill.test.tsx` |
| Modify | `apps/myk9show/src/pages/ShowDetailsPage.tsx`                          |

---

## Task 1: Build `ShowStatusPill` with tests

**Files:**

- Create: `apps/myk9show/src/components/shows/ShowStatusPill.tsx`
- Create: `apps/myk9show/src/components/shows/__tests__/ShowStatusPill.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/myk9show/src/components/shows/__tests__/ShowStatusPill.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowStatusPill } from '../ShowStatusPill';

const mockMutateAsync = vi.fn();
const mockIsPending = { value: false };

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useUpdateShowMutation: () => ({
    mutateAsync: mockMutateAsync,
    get isPending() {
      return mockIsPending.value;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ShowStatusPill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
  });

  // --- Badge colors and labels ---

  it('renders "Draft" label for draft status', () => {
    render(<ShowStatusPill showId="show-1" status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders "Published" label for published status', () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('renders "Upcoming" label for upcoming status', () => {
    render(<ShowStatusPill showId="show-1" status="upcoming" />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('renders "In Progress" label for in_progress status', () => {
    render(<ShowStatusPill showId="show-1" status="in_progress" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders "Completed" label for completed status', () => {
    render(<ShowStatusPill showId="show-1" status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders "Cancelled" label for cancelled status', () => {
    render(<ShowStatusPill showId="show-1" status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  // --- Actionable vs read-only ---

  it('renders a button (dropdown trigger) for draft status', () => {
    render(<ShowStatusPill showId="show-1" status="draft" />);
    expect(screen.getByRole('button', { name: /draft/i })).toBeInTheDocument();
  });

  it('renders a button (dropdown trigger) for published status', () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    expect(screen.getByRole('button', { name: /published/i })).toBeInTheDocument();
  });

  it('does not render a button for upcoming status', () => {
    render(<ShowStatusPill showId="show-1" status="upcoming" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a button for in_progress status', () => {
    render(<ShowStatusPill showId="show-1" status="in_progress" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a button for completed status', () => {
    render(<ShowStatusPill showId="show-1" status="completed" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render a button for cancelled status', () => {
    render(<ShowStatusPill showId="show-1" status="cancelled" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // --- Dropdown options ---

  it('shows "Publish Show" option when status is draft', async () => {
    render(<ShowStatusPill showId="show-1" status="draft" />);
    fireEvent.click(screen.getByRole('button', { name: /draft/i }));
    expect(await screen.findByText('Publish Show')).toBeInTheDocument();
  });

  it('shows "Move to Draft" option when status is published', async () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    fireEvent.click(screen.getByRole('button', { name: /published/i }));
    expect(await screen.findByText('Move to Draft')).toBeInTheDocument();
  });

  // --- Mutation calls ---

  it('calls updateShow with published when "Publish Show" is clicked', async () => {
    render(<ShowStatusPill showId="show-1" status="draft" />);
    fireEvent.click(screen.getByRole('button', { name: /draft/i }));
    fireEvent.click(await screen.findByText('Publish Show'));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'show-1',
        updates: { status: 'published' },
      })
    );
  });

  it('calls updateShow with draft when "Move to Draft" is clicked', async () => {
    render(<ShowStatusPill showId="show-1" status="published" />);
    fireEvent.click(screen.getByRole('button', { name: /published/i }));
    fireEvent.click(await screen.findByText('Move to Draft'));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'show-1', updates: { status: 'draft' } })
    );
  });

  // [ADDED] --- Error handling ---

  it('shows error toast when mutation fails', async () => {
    const { toast } = await import('sonner');
    mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));
    render(<ShowStatusPill showId="show-1" status="draft" />);
    fireEvent.click(screen.getByRole('button', { name: /draft/i }));
    fireEvent.click(await screen.findByText('Publish Show'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to update show status. Please try again.')
    );
  });

  // [ADDED] --- isPending state ---

  it('disables the trigger button while mutation is pending', () => {
    mockIsPending.value = true;
    render(<ShowStatusPill showId="show-1" status="draft" />);
    expect(screen.getByRole('button', { name: /draft/i })).toBeDisabled();
    mockIsPending.value = false;
  });

  // [ADDED] --- Unknown status fallback ---

  it('renders unknown status string as label with muted styling', () => {
    render(<ShowStatusPill showId="show-1" status="unknown_future_status" />);
    expect(screen.getByText('unknown_future_status')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/myk9show && npx vitest run src/components/shows/__tests__/ShowStatusPill.test.tsx
```

Expected: multiple failures — `ShowStatusPill` not found.

- [ ] **Step 3: Create `ShowStatusPill.tsx`**

Create `apps/myk9show/src/components/shows/ShowStatusPill.tsx`:

```tsx
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';

interface ShowStatusPillProps {
  showId: string;
  status: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-amber-950 border border-amber-800 text-amber-400',
  },
  published: {
    label: 'Published',
    className: 'bg-green-950 border border-green-800 text-green-400',
  },
  upcoming: {
    label: 'Upcoming',
    className: 'bg-blue-950 border border-blue-800 text-blue-400',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-orange-950 border border-orange-800 text-orange-400',
  },
  completed: {
    label: 'Completed',
    className: 'bg-muted border border-border text-muted-foreground',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-red-950 border border-red-900 text-red-400',
  },
};

const TRANSITIONS: Record<string, { label: string; next: string }[]> = {
  draft: [{ label: 'Publish Show', next: 'published' }],
  published: [{ label: 'Move to Draft', next: 'draft' }],
};

export function ShowStatusPill({ showId, status }: ShowStatusPillProps) {
  const { mutateAsync, isPending } = useUpdateShowMutation();
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-muted border border-border text-muted-foreground',
  };
  const transitions = TRANSITIONS[status] ?? [];

  async function handleTransition(next: string) {
    try {
      await mutateAsync({ id: showId, updates: { status: next } });
      toast.success(`Show ${next === 'published' ? 'published' : 'moved to draft'}.`);
    } catch {
      toast.error('Failed to update show status. Please try again.');
    }
  }

  const pill = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${config.className}`}
    >
      {config.label}
      {transitions.length > 0 && <ChevronDown className="h-3 w-3 opacity-70" />}
    </span>
  );

  if (transitions.length === 0) {
    return pill;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={isPending}>
        <button aria-label={config.label}>{pill}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {transitions.map(({ label, next }) => (
          <DropdownMenuItem key={next} onClick={() => handleTransition(next)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/components/shows/__tests__/ShowStatusPill.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowStatusPill.tsx \
        apps/myk9show/src/components/shows/__tests__/ShowStatusPill.test.tsx
git commit -m "feat(shows): add ShowStatusPill component"
```

---

## Task 2: Wire `ShowStatusPill` into `ShowDetailsPage`

**Files:**

- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`

- [ ] **Step 1: Add the import**

In `apps/myk9show/src/pages/ShowDetailsPage.tsx`, find the imports block and add:

```tsx
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
```

- [ ] **Step 2: Add the pill to `secondaryActions`**

Find the `secondaryActions` block (around line 341–359). Replace:

```tsx
          secondaryActions={
            canManageShow && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setShowEditPanel(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
```

With:

```tsx
          secondaryActions={
            canManageShow && (
              <div className="flex items-center gap-1">
                <ShowStatusPill showId={actualCurrentShow.id} status={actualCurrentShow.status} />
                <Button variant="outline" size="sm" onClick={() => setShowEditPanel(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
```

- [ ] **Step 3: Run typecheck**

```bash
cd /path/to/repo && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Smoke-test in the browser**

Start the dev server (`pnpm dev:show`) and navigate to a draft show's detail page. Confirm:

- Amber "Draft" pill appears left of the Edit button
- Clicking it reveals "Publish Show" option
- Selecting "Publish Show" updates the pill to green "Published" and shows a success toast
- Clicking "Published" reveals "Move to Draft"
- Navigate to an upcoming/completed/cancelled show — pill renders without a chevron and is not clickable

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/ShowDetailsPage.tsx
git commit -m "feat(shows): wire ShowStatusPill into show details header"
```
