# Admin Help — Navigation Flow Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Flow" view to the Admin Help Page Directory that renders a role-filtered Mermaid.js navigation diagram with click-to-navigate nodes.

**Architecture:** Extend `PageEntry` with `linksTo?: string[]`, generate a Mermaid `flowchart LR` string via a pure `buildMermaidGraph` helper, render it in a new `PageFlowDiagram` component, and wire a `ViewToggle` (list/flow) into `AdminHelpPage`. The existing role filter dropdown scopes the graph automatically — only edges where both endpoints are in `filteredPages` are emitted.

**Tech Stack:** React 18, TypeScript, Mermaid.js v10+ (new runtime dep), lucide-react (`Network` icon), vitest + React Testing Library.

---

## File Map

| File                                                          | Action | Responsibility                                      |
| ------------------------------------------------------------- | ------ | --------------------------------------------------- |
| `src/components/common/ViewToggle.tsx`                        | Modify | Add `flow: Network` to `iconMap`                    |
| `src/features/admin-help/types.ts`                            | Modify | Add `linksTo?: string[]` to `PageEntry`             |
| `src/features/admin-help/data/pageDirectory.ts`               | Modify | Populate `linksTo` for all 63 entries               |
| `src/features/admin-help/utils/buildMermaidGraph.ts`          | Create | Pure function: `PageEntry[]` → Mermaid graph string |
| `src/features/admin-help/components/PageFlowDiagram.tsx`      | Create | Mermaid render + click-to-navigate component        |
| `src/features/admin-help/components/AdminHelpPage.tsx`        | Modify | Add ViewToggle + flow mode rendering                |
| `src/features/admin-help/index.ts`                            | Modify | Export `PageFlowDiagram`                            |
| `apps/myk9show/package.json`                                  | Modify | Add `mermaid` runtime dep                           |
| `src/features/admin-help/__tests__/buildMermaidGraph.test.ts` | Create | 5 unit tests for pure function                      |
| `src/features/admin-help/__tests__/PageFlowDiagram.test.tsx`  | Create | 4 component tests                                   |
| `src/features/admin-help/__tests__/AdminHelpPage.test.tsx`    | Modify | 4 new tests for toggle + flow mode                  |
| `src/features/admin-help/__tests__/pageDirectory.test.ts`     | Modify | 1 new integrity test for linksTo paths              |

All paths relative to `apps/myk9show/`.

---

### Task 1: Add `flow` icon to ViewToggle

**Files:**

- Modify: `apps/myk9show/src/components/common/ViewToggle.tsx`

The current `iconMap` only has `grid | list | table | calendar`. Adding `flow` makes `{ key: 'flow', icon: 'flow' }` valid in `ViewMode`. The existing `ViewToggleProps.modes` type already accepts it since `icon` is `keyof typeof iconMap`.

- [ ] **Step 1: Write failing test**

Add to a new describe block at the bottom of `apps/myk9show/src/components/common/__tests__/ViewToggle.test.tsx` (create the file if it doesn't exist):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle — flow icon', () => {
  it('renders a button with title "Flow view" when flow mode is present', () => {
    const modes = [
      { key: 'list', label: 'List', icon: 'list' as const },
      { key: 'flow', label: 'Flow', icon: 'flow' as const },
    ] as const;
    render(<ViewToggle modes={modes} active="list" onChange={vi.fn()} />);
    expect(screen.getByTitle('Flow view')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && npx vitest run src/components/common/__tests__/ViewToggle.test.tsx
```

Expected: TypeScript error — `'flow'` is not assignable to `keyof typeof iconMap`.

- [ ] **Step 3: Add `flow` to `iconMap` in ViewToggle**

```typescript
// apps/myk9show/src/components/common/ViewToggle.tsx
import { LayoutGrid, List, Table2, CalendarDays, Network } from 'lucide-react';

const iconMap = {
  grid: LayoutGrid,
  list: List,
  table: Table2,
  calendar: CalendarDays,
  flow: Network,
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/myk9show && npx vitest run src/components/common/__tests__/ViewToggle.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/common/ViewToggle.tsx \
        apps/myk9show/src/components/common/__tests__/ViewToggle.test.tsx
git commit -m "feat(view-toggle): add flow/Network icon to ViewToggle iconMap"
```

---

### Task 2: Extend PageEntry type + registry integrity test

**Files:**

- Modify: `apps/myk9show/src/features/admin-help/types.ts`
- Modify: `apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts`

The `linksTo` integrity test runs against the real `pageDirectory` array. It fails until `pageDirectory.ts` is updated in Task 4 — that's intentional (TDD for data).

- [ ] **Step 1: Add `linksTo` to `PageEntry` in types.ts**

```typescript
// apps/myk9show/src/features/admin-help/types.ts
import type { UserRole } from '@/types/auth-types';

export type PageStatus = 'working' | 'stub' | 'known-issues';
export type PageClassification = 'critical-path' | 'park' | 'hidden';

export interface PageEntry {
  /** Must match a key in fullRouteRegistry (may contain :params) */
  path: string;
  /** Display title, e.g. "Show Entries" */
  title: string;
  /** 1-2 sentences, plain English */
  description: string;
  /** Who uses the page; drives role grouping */
  roles: UserRole[];
  /** Critical-path = keep, park = deprioritized, hidden = dev/internal */
  classification: PageClassification;
  /** Cross-role slice, free-form in v1 */
  category: string;
  /** Triage flag visible to admin */
  status: PageStatus;
  /** Paths this page navigates to (nav links, CTAs, tab/child routes) */
  linksTo?: string[];
}

export interface ExampleIds {
  showId?: string;
  trialId?: string;
  trialShowId?: string;
  classId?: string;
  classTrialId?: string;
  classShowId?: string;
  dogId?: string;
  clubId?: string;
  roleId?: string;
  templateId?: string;
  entryId?: string;
}
```

- [ ] **Step 2: Add linksTo integrity test to pageDirectory.test.ts**

Append inside the existing `describe('pageDirectory (invariant)', ...)` block:

```typescript
it('every linksTo path resolves to an existing PageEntry path', () => {
  const knownPaths = new Set(pageDirectory.map(e => e.path));
  const orphans: string[] = [];
  for (const entry of pageDirectory) {
    for (const target of entry.linksTo ?? []) {
      if (!knownPaths.has(target)) {
        orphans.push(`${entry.path} → ${target}`);
      }
    }
  }
  expect(orphans).toEqual([]);
});
```

- [ ] **Step 3: Run test (it passes vacuously — no linksTo entries exist yet)**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/pageDirectory.test.ts
```

Expected: PASS (vacuously — no `linksTo` arrays exist yet to violate the constraint)

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/features/admin-help/types.ts \
        apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts
git commit -m "feat(admin-help): add linksTo to PageEntry + orphan-edge integrity test"
```

---

### Task 3: Create `buildMermaidGraph` pure function (TDD)

**Files:**

- Create: `apps/myk9show/src/features/admin-help/utils/buildMermaidGraph.ts`
- Create: `apps/myk9show/src/features/admin-help/__tests__/buildMermaidGraph.test.ts`

- [ ] **Step 1: Write all failing tests**

Create `apps/myk9show/src/features/admin-help/__tests__/buildMermaidGraph.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildMermaidGraph, sanitizePath } from '../utils/buildMermaidGraph';
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

function entry(path: string, linksTo?: string[]): PageEntry {
  return {
    path,
    title: path.split('/').filter(Boolean).pop() ?? 'root',
    description: 'test entry',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'test',
    status: 'working',
    linksTo,
  };
}

describe('sanitizePath', () => {
  it('strips leading slash and replaces / and : with _', () => {
    expect(sanitizePath('/admin/users/:id')).toBe('admin_users__id');
  });

  it('handles root path', () => {
    expect(sanitizePath('/')).toBe('root');
  });
});

describe('buildMermaidGraph', () => {
  it('returns empty string for empty pages array', () => {
    expect(buildMermaidGraph([])).toBe('');
  });

  it('emits an edge when both source and target are in pages', () => {
    const pages = [entry('/admin/users', ['/admin/users/:id']), entry('/admin/users/:id')];
    const graph = buildMermaidGraph(pages);
    expect(graph).toContain('admin_users --> admin_users__id');
  });

  it('omits edge when target path is not in pages', () => {
    const pages = [entry('/admin/users', ['/admin/missing'])];
    const graph = buildMermaidGraph(pages);
    expect(graph).not.toContain('-->');
  });

  it('includes a click directive for every node', () => {
    const pages = [entry('/admin/users')];
    const graph = buildMermaidGraph(pages);
    expect(graph).toContain('click admin_users "__myk9FlowNav"');
  });

  it('does not throw on cyclic edges (A → B → A)', () => {
    const pages = [entry('/a', ['/b']), entry('/b', ['/a'])];
    expect(() => buildMermaidGraph(pages)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/buildMermaidGraph.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `buildMermaidGraph.ts`**

Create `apps/myk9show/src/features/admin-help/utils/buildMermaidGraph.ts`:

```typescript
import type { PageEntry } from '../types';

const CALLBACK_NAME = '__myk9FlowNav';

export function sanitizePath(path: string): string {
  const result = path.replace(/^\//, '').replace(/[/:]/g, '_');
  return result || 'root';
}

export function buildMermaidGraph(pages: PageEntry[]): string {
  if (pages.length === 0) return '';

  const pathSet = new Set(pages.map(p => p.path));
  const lines: string[] = ['flowchart LR'];

  // Node definitions + click directives
  for (const page of pages) {
    const id = sanitizePath(page.path);
    const label = `${page.title}<br/>${page.path}`;
    lines.push(`  ${id}["${label}"]`);
    lines.push(`  click ${id} "${CALLBACK_NAME}"`);
  }

  // Edge definitions — only when both endpoints are in the filtered set
  for (const page of pages) {
    const sourceId = sanitizePath(page.path);
    for (const target of page.linksTo ?? []) {
      if (pathSet.has(target)) {
        lines.push(`  ${sourceId} --> ${sanitizePath(target)}`);
      }
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/buildMermaidGraph.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/admin-help/utils/buildMermaidGraph.ts \
        apps/myk9show/src/features/admin-help/__tests__/buildMermaidGraph.test.ts
git commit -m "feat(admin-help): add buildMermaidGraph pure function + tests"
```

---

### Task 4: Populate `linksTo` in pageDirectory.ts

**Files:**

- Modify: `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`

**Methodology:** For each `PageEntry`, open its page component file and grep for navigation calls. The patterns to look for:

```bash
# Find navigate() calls in a component:
grep -n "navigate(" apps/myk9show/src/pages/admin/AdminDashboard*.tsx

# Find Link components:
grep -n "<Link to=" apps/myk9show/src/pages/admin/AdminDashboard*.tsx

# Find href strings:
grep -n 'href="/' apps/myk9show/src/pages/admin/AdminDashboard*.tsx
```

Add each destination path to `linksTo` for the source page. Only include paths that exist in `pageDirectory` — the integrity test from Task 2 will catch any invalid paths.

**Edge levels to capture:**

1. **Nav links** — sidebar destinations the page's header/nav links to
2. **CTA links** — "View", "Edit", "Create" buttons that navigate
3. **Tab/child links** — tabs rendered within this page (e.g. a show detail page with tabs for Classes, Entries, Trials should list those tab routes)

**Complete worked example — Admin section:**

```typescript
// In pageDirectory.ts — Admin entries
{
  path: '/admin/dashboard',
  title: 'Admin Dashboard',
  // ... existing fields ...
  linksTo: ['/admin/users', '/admin/permissions', '/shows', '/admin/help'],
},
{
  path: '/admin/help',
  title: 'Help — Page Directory',
  // ... existing fields ...
  linksTo: [], // terminal page — no outbound navigation
},
{
  path: '/admin/permissions',
  title: 'Roles & Permissions',
  // ... existing fields ...
  linksTo: ['/admin/permissions/roles', '/admin/users'],
},
{
  path: '/admin/permissions/roles',
  title: 'Role List',
  // ... existing fields ...
  linksTo: ['/admin/permissions/roles/new', '/admin/permissions/roles/:roleId'],
},
{
  path: '/admin/users',
  title: 'Users',
  // ... existing fields ...
  linksTo: ['/admin/users/:userId'],
},
```

**Follow the same pattern for all remaining entries** (Secretary, Club Admin, Judge, Exhibitor, Public). Read each component file to discover actual navigation calls — do not guess.

- [ ] **Step 1: Read the full pageDirectory.ts**

```bash
cat apps/myk9show/src/features/admin-help/data/pageDirectory.ts
```

Note all 63 entries. For each, identify the corresponding component file under `apps/myk9show/src/pages/` or `apps/myk9show/src/features/`.

- [ ] **Step 2: Add `linksTo` to Admin entries**

For each admin page entry, grep its component for navigation calls and add the `linksTo` array. Run the integrity test after each role section to catch typos immediately:

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/pageDirectory.test.ts -t "linksTo"
```

- [ ] **Step 3: Add `linksTo` to Secretary entries**

Same process — grep each secretary page component, add `linksTo`. Run integrity test.

- [ ] **Step 4: Add `linksTo` to Club Admin, Judge, Exhibitor, and Public entries**

Same process. Run integrity test after each section.

- [ ] **Step 5: Run full integrity test suite**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/pageDirectory.test.ts
```

Expected: all 5 tests PASS (including the new linksTo integrity test)

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/features/admin-help/data/pageDirectory.ts
git commit -m "feat(admin-help): populate linksTo edges for all 63 pageDirectory entries"
```

---

### Task 5: Install Mermaid + create PageFlowDiagram component (TDD)

**Files:**

- Modify: `apps/myk9show/package.json` (via pnpm)
- Create: `apps/myk9show/src/features/admin-help/components/PageFlowDiagram.tsx`
- Create: `apps/myk9show/src/features/admin-help/__tests__/PageFlowDiagram.test.tsx`

- [ ] **Step 1: Install mermaid**

```bash
cd apps/myk9show && pnpm add mermaid
```

Expected: `mermaid` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write failing tests**

Create `apps/myk9show/src/features/admin-help/__tests__/PageFlowDiagram.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import mermaid from 'mermaid';
import { PageFlowDiagram } from '../components/PageFlowDiagram';
import type { PageEntry } from '../types';
import { UserRole } from '@/types/auth-types';

// Mock mermaid — it does DOM manipulation incompatible with jsdom.
// Import mermaid above the mock so vi.mocked(mermaid) works in tests.
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function entry(path: string): PageEntry {
  return {
    path,
    title: path.split('/').filter(Boolean).pop() ?? 'root',
    description: 'test',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'test',
    status: 'working',
  };
}

beforeEach(() => {
  mockNavigate.mockReset();
  // Default: resolve immediately so render completes
  vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>' });
});

describe('PageFlowDiagram', () => {
  it('shows empty state when pages is empty', () => {
    render(<PageFlowDiagram pages={[]} />);
    expect(screen.getByText(/no pages match/i)).toBeInTheDocument();
  });

  it('shows spinner while mermaid is rendering', () => {
    // Never resolves — spinner stays visible for the duration of this test
    vi.mocked(mermaid.render).mockReturnValue(new Promise(() => {}));
    render(<PageFlowDiagram pages={[entry('/admin/users')]} />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('calls mermaid.render with the graph string', async () => {
    render(<PageFlowDiagram pages={[entry('/admin/users')]} />);
    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledWith(
        expect.stringContaining('myk9-flow-'),
        expect.stringContaining('flowchart LR')
      );
    });
  });

  it('calls navigate with the correct path when __myk9FlowNav is invoked', async () => {
    render(<PageFlowDiagram pages={[entry('/admin/users')]} />);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());

    // Simulate a Mermaid node click via the global callback
    (window as any).__myk9FlowNav('admin_users');

    expect(mockNavigate).toHaveBeenCalledWith('/admin/users');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/PageFlowDiagram.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 4: Create PageFlowDiagram component**

Create `apps/myk9show/src/features/admin-help/components/PageFlowDiagram.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import mermaid from 'mermaid';
import { buildMermaidGraph, sanitizePath } from '../utils/buildMermaidGraph';
import type { PageEntry } from '../types';

const CALLBACK_NAME = '__myk9FlowNav';

// Initialize once at module load — sets global Mermaid config
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  flowchart: { curve: 'basis', useMaxWidth: true, htmlLabels: true },
});

interface PageFlowDiagramProps {
  pages: PageEntry[];
}

export function PageFlowDiagram({ pages }: PageFlowDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const graph = buildMermaidGraph(pages);
    if (!graph) return;

    let cancelled = false;
    setRendering(true);

    // Build path lookup map so the click callback can resolve node ID → path
    const pathMap: Record<string, string> = {};
    for (const page of pages) {
      pathMap[sanitizePath(page.path)] = page.path;
    }

    (window as any)[CALLBACK_NAME] = (nodeId: string) => {
      const path = pathMap[nodeId];
      if (path) navigate(path);
    };

    const id = `myk9-flow-${Date.now()}`;
    mermaid
      .render(id, graph)
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
      delete (window as any)[CALLBACK_NAME];
    };
  }, [pages, navigate]);

  if (pages.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No pages match the current filters.
      </p>
    );
  }

  return (
    <div className="relative">
      {rendering && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={containerRef} className={rendering ? 'invisible' : ''} />
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/PageFlowDiagram.test.tsx
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/package.json \
        apps/myk9show/src/features/admin-help/components/PageFlowDiagram.tsx \
        apps/myk9show/src/features/admin-help/__tests__/PageFlowDiagram.test.tsx
git commit -m "feat(admin-help): add PageFlowDiagram component with Mermaid rendering"
```

---

### Task 6: Wire flow view into AdminHelpPage + tests

**Files:**

- Modify: `apps/myk9show/src/features/admin-help/components/AdminHelpPage.tsx`
- Modify: `apps/myk9show/src/features/admin-help/__tests__/AdminHelpPage.test.tsx`

`useViewPreference` is typed to `'cards' | 'table'` and cannot be used here without modifying the shared hook. Use inline localStorage state instead — it's 8 lines and keeps the shared hook unchanged.

- [ ] **Step 1: Write failing tests**

Add the following describe block to the bottom of `apps/myk9show/src/features/admin-help/__tests__/AdminHelpPage.test.tsx`, after the existing imports and mocks:

```typescript
// Add this mock at the top of the file, alongside the other vi.mock() calls:
vi.mock('../components/PageFlowDiagram', () => ({
  PageFlowDiagram: ({ pages }: { pages: unknown[] }) => (
    <div data-testid="page-flow-diagram" data-page-count={String(pages.length)} />
  ),
}));
```

Then add this describe block at the bottom of the file:

```typescript
describe('AdminHelpPage — view toggle', () => {
  beforeEach(() => localStorage.clear());

  it('renders ViewToggle with list and flow modes', () => {
    render(<AdminHelpPage />);
    expect(screen.getByTitle('List view')).toBeInTheDocument();
    expect(screen.getByTitle('Flow view')).toBeInTheDocument();
  });

  it('shows list accordion by default, not PageFlowDiagram', () => {
    render(<AdminHelpPage />);
    expect(screen.queryByTestId('page-flow-diagram')).not.toBeInTheDocument();
  });

  it('mounts PageFlowDiagram when Flow mode is selected', async () => {
    const user = userEvent.setup();
    render(<AdminHelpPage />);
    await user.click(screen.getByTitle('Flow view'));
    expect(screen.getByTestId('page-flow-diagram')).toBeInTheDocument();
  });

  it('persists view mode to localStorage', async () => {
    const user = userEvent.setup();
    render(<AdminHelpPage />);
    await user.click(screen.getByTitle('Flow view'));
    expect(localStorage.getItem('view-pref-admin-help')).toBe('flow');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/AdminHelpPage.test.tsx -t "view toggle"
```

Expected: FAIL — ViewToggle and PageFlowDiagram not yet wired

- [ ] **Step 3: Update AdminHelpPage.tsx**

Add these imports at the top (alongside existing imports):

```typescript
import { ViewToggle } from '@/components/common/ViewToggle';
import { PageFlowDiagram } from './PageFlowDiagram';
```

Add viewMode state inside `AdminHelpPage` (after the existing `useState` calls):

```typescript
const [viewMode, setViewModeRaw] = useState<'list' | 'flow'>(() => {
  try {
    const stored = localStorage.getItem('view-pref-admin-help');
    return stored === 'flow' ? 'flow' : 'list';
  } catch {
    return 'list';
  }
});

const setViewMode = useCallback((mode: string) => {
  const validated: 'list' | 'flow' = mode === 'flow' ? 'flow' : 'list';
  setViewModeRaw(validated);
  try {
    localStorage.setItem('view-pref-admin-help', validated);
  } catch {}
}, []);
```

Add the `VIEW_MODES` constant outside the component (alongside `ROLE_ORDER`):

```typescript
const VIEW_MODES = [
  { key: 'list', label: 'List', icon: 'list' as const },
  { key: 'flow', label: 'Flow', icon: 'flow' as const },
] as const;
```

In the JSX, locate the page title/subtitle block (it renders `<h1>Page Directory</h1>` or similar) and add `ViewToggle` to its right side. Wrap the title and toggle in a flex row:

```tsx
{
  /* Replace the existing title block with: */
}
<div className="flex items-start justify-between">
  <div>
    <h1 className="font-display text-2xl font-bold">Page Directory</h1>
    <p className="text-sm text-muted-foreground">Every page in myK9Show, grouped by role.</p>
  </div>
  <ViewToggle modes={VIEW_MODES} active={viewMode} onChange={setViewMode} />
</div>;
```

Replace the section that renders `grouped.map(...)` accordion sections with a conditional:

```tsx
{viewMode === 'flow' ? (
  <PageFlowDiagram pages={filtered} />
) : (
  <>
    {grouped.map(group => (
      <PageDirectorySection
        key={group.key}
        // ... existing props unchanged
      />
    ))}
    <UndocumentedRoutesPanel ... />
  </>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/__tests__/AdminHelpPage.test.tsx
```

Expected: all tests PASS (existing + 4 new)

- [ ] **Step 5: Run full feature test suite**

```bash
cd apps/myk9show && npx vitest run src/features/admin-help/
```

Expected: all tests across the feature PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/features/admin-help/components/AdminHelpPage.tsx \
        apps/myk9show/src/features/admin-help/__tests__/AdminHelpPage.test.tsx
git commit -m "feat(admin-help): wire List/Flow ViewToggle into AdminHelpPage"
```

---

### Task 7: Export PageFlowDiagram + typecheck + final commit

**Files:**

- Modify: `apps/myk9show/src/features/admin-help/index.ts`

- [ ] **Step 1: Add export to index.ts**

Open `apps/myk9show/src/features/admin-help/index.ts` and add:

```typescript
export { PageFlowDiagram } from './components/PageFlowDiagram';
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: 0 errors. Fix any type errors before proceeding.

- [ ] **Step 3: Run full test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: all tests pass. If any hang for more than 30 seconds, stop and report — do not retry in a loop.

- [ ] **Step 4: Final commit**

```bash
git add apps/myk9show/src/features/admin-help/index.ts
git commit -m "feat(admin-help): export PageFlowDiagram from feature index"
```

- [ ] **Step 5: Mark todo resolved in TO-DOS.md**

In `TO-DOS.md`, find the `## Admin Help — Navigation Flow Diagram (v2)` section and mark it resolved:

```markdown
## ✅ Admin Help — Navigation Flow Diagram (v2) - 2026-04-23 10:55

**Resolved 2026-05-02.** Flow view added to AdminHelpPage with Mermaid.js rendering,
role-filter scoping, click-to-navigate nodes, and localStorage view preference.
```

```bash
git add TO-DOS.md
git commit -m "docs: mark admin help flow diagram todo as resolved"
```
