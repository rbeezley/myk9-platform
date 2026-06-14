# Show Desk Tools Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Show Desk tools side panel easier to scan by rendering each tool as an independently collapsible, per-show remembered section.

**Architecture:** `ShowDeskToolsSheet` becomes the owner of section rendering, open-state defaults, and localStorage persistence. `ShowWorkbenchPage` keeps ownership of the nine existing tool contents, but passes them as structured metadata plus JSX instead of anonymous children. State logic lives in a small sibling helper so the component stays focused and testable.

**Tech Stack:** React, TypeScript, Base UI-backed shadcn `Collapsible`, existing `Button`, `Badge`, `Sheet`, Vitest, Testing Library, `user-event`, localStorage.

---

## Validation Profile [ADDED]

- Risk: medium
- Validation: app
- Rationale: This is a small production UI/state change inside myK9Show that affects a secretary show-day workflow, so focused component/helper tests plus app typecheck are required before PR.

## Scope And Duplication Check

This refines the existing `ShowDeskToolsSheet` only. It must not add another page, route, drawer, or tool entry point. The work should preserve each existing tool card's internal behavior and only change how the tools are grouped inside the sheet.

## File Structure

- Create: `apps/myk9show/src/features/show-map/showDeskToolsState.ts`
  - Responsibility: pure helpers for deriving default open section IDs, loading saved state, and saving section state.
- Modify: `apps/myk9show/src/features/show-map/ShowDeskToolsSheet.tsx`
  - Responsibility: trigger button, sheet shell, collapsible section UI, and wiring helper state to UI events.
- Modify: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
  - Responsibility: pass a structured `tools` array using the nine current tool contents in the current order.
- Modify: `apps/myk9show/src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx`
  - Responsibility: focused component coverage for trigger behavior, collapsed sections, toggles, keyboard interaction, persistence, corrupted storage, and content rendering.
- Create: `apps/myk9show/src/features/show-map/__tests__/showDeskToolsState.test.ts`
  - Responsibility: pure helper coverage for default state and localStorage resilience.
- Modify after implementation: top-level backlog tracking file
  - Responsibility: mark the selected Show Desk collapse item complete only after tests pass.

## Task 1: Add Helper Tests First

**Files:**
- Create: `apps/myk9show/src/features/show-map/__tests__/showDeskToolsState.test.ts`
- Create later in Task 2: `apps/myk9show/src/features/show-map/showDeskToolsState.ts`

- [ ] **Step 1: Write the failing helper tests** [EXPANDED]

Create `apps/myk9show/src/features/show-map/__tests__/showDeskToolsState.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDefaultOpenToolIds,
  getShowDeskToolsStorageKey,
  loadOpenToolIds,
  saveOpenToolIds,
} from '../showDeskToolsState';

const tools = [
  { id: 'late-entry', defaultOpen: true },
  { id: 'access-codes', attentionLabel: 'Needs review' },
  { id: 'broadcast' },
  { id: 'tasks' },
];

describe('showDeskToolsState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds first-visit defaults from defaultOpen and attention tools', () => {
    expect(buildDefaultOpenToolIds(tools)).toEqual(['late-entry', 'access-codes']);
  });

  it('uses the show id in the storage key', () => {
    expect(getShowDeskToolsStorageKey('show-123')).toBe('show-desk-tools:show-123');
  });

  it('loads saved section state for a show', () => {
    window.localStorage.setItem(
      getShowDeskToolsStorageKey('show-123'),
      JSON.stringify(['broadcast', 'tasks'])
    );

    expect(loadOpenToolIds('show-123', tools)).toEqual(['broadcast', 'tasks']);
  });

  it('falls back to defaults when storage is corrupted', () => {
    window.localStorage.setItem(getShowDeskToolsStorageKey('show-123'), 'not json');

    expect(loadOpenToolIds('show-123', tools)).toEqual(['late-entry', 'access-codes']);
  });

  it('falls back to defaults when storage reads fail', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(loadOpenToolIds('show-123', tools)).toEqual(['late-entry', 'access-codes']);
  });

  it('drops saved ids that are not in the current tool list', () => {
    window.localStorage.setItem(
      getShowDeskToolsStorageKey('show-123'),
      JSON.stringify(['broadcast', 'missing-tool'])
    );

    expect(loadOpenToolIds('show-123', tools)).toEqual(['broadcast']);
  });

  it('saves open section ids without throwing', () => {
    saveOpenToolIds('show-123', ['access-codes']);

    expect(window.localStorage.getItem(getShowDeskToolsStorageKey('show-123'))).toBe(
      JSON.stringify(['access-codes'])
    );
  });

  it('does not throw when storage writes fail', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => saveOpenToolIds('show-123', ['access-codes'])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the helper test and verify it fails**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showDeskToolsState.test.ts
```

Expected: fail because `../showDeskToolsState` does not exist.

## Task 2: Implement The State Helper

**Files:**
- Create: `apps/myk9show/src/features/show-map/showDeskToolsState.ts`
- Test: `apps/myk9show/src/features/show-map/__tests__/showDeskToolsState.test.ts`

- [ ] **Step 1: Add the helper module**

Create `apps/myk9show/src/features/show-map/showDeskToolsState.ts`:

```ts
export interface ShowDeskToolStateInput {
  id: string;
  defaultOpen?: boolean;
  attentionLabel?: string;
}

export function getShowDeskToolsStorageKey(showId: string): string {
  return `show-desk-tools:${showId}`;
}

export function buildDefaultOpenToolIds(
  tools: readonly ShowDeskToolStateInput[]
): string[] {
  return tools
    .filter(tool => tool.defaultOpen === true || Boolean(tool.attentionLabel))
    .map(tool => tool.id);
}

export function loadOpenToolIds(
  showId: string,
  tools: readonly ShowDeskToolStateInput[]
): string[] {
  const defaults = buildDefaultOpenToolIds(tools);

  try {
    const raw = window.localStorage.getItem(getShowDeskToolsStorageKey(showId));
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;

    const validIds = new Set(tools.map(tool => tool.id));
    return parsed.filter((id): id is string => typeof id === 'string' && validIds.has(id));
  } catch {
    return defaults;
  }
}

export function saveOpenToolIds(showId: string, openToolIds: readonly string[]): void {
  try {
    window.localStorage.setItem(
      getShowDeskToolsStorageKey(showId),
      JSON.stringify([...openToolIds])
    );
  } catch {
    // Preference persistence is non-critical; the sheet remains usable.
  }
}
```

- [ ] **Step 2: Run the helper test and verify it passes**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showDeskToolsState.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit the helper**

Run:

```bash
git add apps/myk9show/src/features/show-map/showDeskToolsState.ts apps/myk9show/src/features/show-map/__tests__/showDeskToolsState.test.ts
git commit -m "test(show): cover show desk tools state"
```

## Task 3: Add Failing Component Tests For Collapsible Sections

**Files:**
- Modify: `apps/myk9show/src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx`
- Modify later in Task 4: `apps/myk9show/src/features/show-map/ShowDeskToolsSheet.tsx`

- [ ] **Step 1: Replace the test render helper with structured tools**

In `ShowDeskToolsSheet.test.tsx`, update the imports and render helper to pass `showId` and `tools`, and clear localStorage between tests so persisted state does not leak between cases. [EXPANDED]

```tsx
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
});

function makeTools() {
  return [
    {
      id: 'late-entry',
      title: 'Late entries',
      summary: 'Add a day-of entry without leaving Show Desk',
      defaultOpen: true,
      content: <div data-testid="late-entry-tool">Late entry content</div>,
    },
    {
      id: 'access-codes',
      title: 'Access codes',
      summary: 'Share judge and ringside entry codes',
      attentionLabel: 'Needs review',
      content: <div data-testid="access-codes-tool">Access code content</div>,
    },
    {
      id: 'broadcast',
      title: 'Broadcast',
      summary: 'Send show-day updates',
      content: <div data-testid="broadcast-tool">Broadcast content</div>,
    },
  ];
}

function renderSheet(props?: { toolCount?: number; actionableCount?: number; showId?: string }) {
  return render(
    <ShowDeskToolsSheet
      showId={props?.showId ?? 'show-1'}
      tools={makeTools()}
      toolCount={props?.toolCount}
      {...(props?.actionableCount !== undefined && { actionableCount: props.actionableCount })}
    />
  );
}
```

- [ ] **Step 2: Update the existing child-rendering assertions**

Replace assertions that look for `tool-stub`, `tool-1`, or `tool-2` with section assertions:

```tsx
await user.click(screen.getByRole('button', { name: /open tools panel/i }));

expect(screen.getByRole('dialog', { name: /show desk tools/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /late entries/i })).toHaveAttribute(
  'aria-expanded',
  'true'
);
expect(screen.getByRole('button', { name: /broadcast/i })).toHaveAttribute(
  'aria-expanded',
  'false'
);
expect(screen.getByTestId('late-entry-tool')).toBeInTheDocument();
expect(screen.queryByTestId('broadcast-tool')).not.toBeInTheDocument();
```

- [ ] **Step 3: Add tests for mouse toggle, keyboard toggle, persistence, corrupted storage, and attention badge**

Append these cases:

```tsx
it('expands and collapses a single tool section', async () => {
  const { user } = renderSheet();

  await user.click(screen.getByRole('button', { name: /open tools panel/i }));
  await user.click(screen.getByRole('button', { name: /broadcast/i }));

  expect(screen.getByRole('button', { name: /broadcast/i })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
  expect(screen.getByTestId('late-entry-tool')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /late entries/i }));

  expect(screen.getByRole('button', { name: /late entries/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.queryByTestId('late-entry-tool')).not.toBeInTheDocument();
});

it('toggles a section from the keyboard', async () => {
  const { user } = renderSheet();

  await user.click(screen.getByRole('button', { name: /open tools panel/i }));
  const broadcast = screen.getByRole('button', { name: /broadcast/i });
  broadcast.focus();
  await user.keyboard('{Enter}');

  expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
});

it('persists open sections per show', async () => {
  const { user, unmount } = renderSheet({ showId: 'show-1' });

  await user.click(screen.getByRole('button', { name: /open tools panel/i }));
  await user.click(screen.getByRole('button', { name: /broadcast/i }));
  unmount();

  const second = renderSheet({ showId: 'show-1' });
  await second.user.click(screen.getByRole('button', { name: /open tools panel/i }));

  expect(screen.getByTestId('broadcast-tool')).toBeInTheDocument();
});

it('keeps saved state scoped by show', async () => {
  window.localStorage.setItem('show-desk-tools:show-1', JSON.stringify(['broadcast']));

  const { user } = renderSheet({ showId: 'show-2' });
  await user.click(screen.getByRole('button', { name: /open tools panel/i }));

  expect(screen.queryByTestId('broadcast-tool')).not.toBeInTheDocument();
  expect(screen.getByTestId('late-entry-tool')).toBeInTheDocument();
});

it('falls back to defaults when saved state is corrupted', async () => {
  window.localStorage.setItem('show-desk-tools:show-1', 'not json');
  const { user } = renderSheet({ showId: 'show-1' });

  await user.click(screen.getByRole('button', { name: /open tools panel/i }));

  expect(screen.getByTestId('late-entry-tool')).toBeInTheDocument();
  expect(screen.getByTestId('access-codes-tool')).toBeInTheDocument();
});

it('shows attention labels on collapsed headers without forcing saved sections open', async () => {
  window.localStorage.setItem('show-desk-tools:show-1', JSON.stringify(['late-entry']));
  const { user } = renderSheet({ showId: 'show-1' });

  await user.click(screen.getByRole('button', { name: /open tools panel/i }));

  expect(screen.getByText('Needs review')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /access codes/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  expect(screen.queryByTestId('access-codes-tool')).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the component test and verify it fails**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx
```

Expected: fail because `ShowDeskToolsSheet` does not yet accept `showId` or `tools`.

## Task 4: Implement Collapsible Tool Sections

**Files:**
- Modify: `apps/myk9show/src/features/show-map/ShowDeskToolsSheet.tsx`
- Test: `apps/myk9show/src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx`

- [ ] **Step 1: Update imports and props**

Change the imports at the top of `ShowDeskToolsSheet.tsx`:

```tsx
import { ChevronRight, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { loadOpenToolIds, saveOpenToolIds } from './showDeskToolsState';
```

Replace the props interface with:

```tsx
export interface ShowDeskToolSection {
  id: string;
  title: string;
  summary: string;
  content: ReactNode;
  defaultOpen?: boolean;
  attentionLabel?: string;
}

interface ShowDeskToolsSheetProps {
  showId: string;
  toolCount?: number;
  actionableCount?: number;
  tools: readonly ShowDeskToolSection[];
}
```

- [ ] **Step 2: Add controlled open-state logic**

Inside `ShowDeskToolsSheet`, replace `children` with `tools`, initialize state from the helper, and persist on user changes:

```tsx
export function ShowDeskToolsSheet({
  showId,
  toolCount,
  actionableCount,
  tools,
}: ShowDeskToolsSheetProps) {
  const effectiveToolCount = toolCount ?? tools.length;
  const hasActionable = typeof actionableCount === 'number' && actionableCount > 0;
  const badgeValue = hasActionable ? actionableCount : effectiveToolCount;
  const badgeAriaLabel = hasActionable
    ? `${actionableCount} ${actionableCount === 1 ? 'item needs' : 'items need'} attention`
    : `${effectiveToolCount} tools available`;
  const defaultOpenToolIds = useMemo(() => loadOpenToolIds(showId, tools), [showId, tools]);
  const [openToolIds, setOpenToolIds] = useState<Set<string>>(() => new Set(defaultOpenToolIds));

  useEffect(() => {
    setOpenToolIds(new Set(loadOpenToolIds(showId, tools)));
  }, [showId, tools]);

  const toggleTool = (toolId: string, open: boolean) => {
    setOpenToolIds(current => {
      const next = new Set(current);
      if (open) next.add(toolId);
      else next.delete(toolId);
      saveOpenToolIds(showId, [...next]);
      return next;
    });
  };
```

- [ ] **Step 3: Render each tool as a collapsible section**

Replace the sheet body content:

```tsx
<div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
  {tools.map(tool => {
    const isOpen = openToolIds.has(tool.id);

    return (
      <Collapsible
        key={tool.id}
        open={isOpen}
        onOpenChange={open => toggleTool(tool.id, open)}
        className="rounded-md border bg-background"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronRight
              className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', {
                'rotate-90': isOpen,
              })}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-none text-foreground">{tool.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{tool.summary}</span>
            </span>
            {tool.attentionLabel && (
              <Badge variant="destructive" className="shrink-0">
                {tool.attentionLabel}
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t p-4">{tool.content}</div>
        </CollapsibleContent>
      </Collapsible>
    );
  })}
</div>
```

- [ ] **Step 4: Preserve the existing trigger and header**

Keep the existing trigger button, `SheetHeader`, title, and description. Only update the badge fallback to use `effectiveToolCount`.

- [ ] **Step 5: Run the component test and verify it passes**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit the component implementation**

Run:

```bash
git add apps/myk9show/src/features/show-map/ShowDeskToolsSheet.tsx apps/myk9show/src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx
git commit -m "feat(show): collapse show desk tools"
```

## Task 5: Wire The Show Workbench Call Site

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
- Test: existing `apps/myk9show/src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx`

- [ ] **Step 1: Import the tool section type**

Add the type import near the `ShowDeskPanel` lazy import area or the existing show-map imports:

```tsx
import type { ShowDeskToolSection } from '@/features/show-map/ShowDeskToolsSheet';
```

- [ ] **Step 2: Build structured tools before rendering `ShowDeskPanel`**

Inside `ShowWorkbenchPage`, after values like `effectiveJudges`, `showClasses`, `incidentEntryOptions`, and `canRegenerate` are available, add a memoized tool list:

```tsx
const showDeskTools = useMemo<ShowDeskToolSection[]>(
  () => [
    {
      id: 'late-entry',
      title: 'Late entries',
      summary: 'Add a day-of entry without leaving Show Desk',
      defaultOpen: true,
      content: <WorkbenchLateEntryAction showId={currentShow.id} />,
    },
    {
      id: 'judge-hospitality',
      title: 'Judge hospitality',
      summary: 'Track judge meals, breaks, and show-day notes',
      content: (
        <JudgeHospitalityCard
          showId={currentShow.id}
          judges={effectiveJudges.map(judge => ({
            id: judge.judgeId,
            name: judge.judgeName,
          }))}
        />
      ),
    },
    {
      id: 'quick-broadcast',
      title: 'Quick broadcast',
      summary: 'Send a general update to show participants',
      content: <QuickBroadcastCard showId={currentShow.id} />,
    },
    {
      id: 'class-broadcast',
      title: 'Class broadcast',
      summary: 'Send a class-specific update',
      content: (
        <ClassBroadcastCard
          showId={currentShow.id}
          classes={showClasses.map(cls => ({
            id: cls.id,
            label: buildClassBroadcastClassLabel({
              name: cls.name,
              section: cls.section,
            }),
            entryCount: cls.entryCount,
          }))}
        />
      ),
    },
    {
      id: 'incident-log',
      title: 'Incident log',
      summary: 'Record incidents while details are fresh',
      content: (
        <IncidentLogCard
          showId={currentShow.id}
          entries={incidentEntryOptions}
          judges={effectiveJudges.map(judge => ({
            id: judge.judgeId,
            name: judge.judgeName,
            personId: isValidUUID(judge.judgeId.trim()) ? judge.judgeId.trim() : null,
          }))}
        />
      ),
    },
    {
      id: 'schedule-slip',
      title: 'Delay scripts',
      summary: 'Draft calm wording for schedule slips',
      content: (
        <ScheduleSlipScriptCard
          showId={currentShow.id}
          showName={currentShow.name}
          defaultClassName={showClasses[0]?.name ?? ''}
        />
      ),
    },
    {
      id: 'access-codes',
      title: 'Access codes',
      summary: 'Share judge and ringside entry codes',
      content: (
        <ShowAccessCodesCard
          showId={currentShow.id}
          showName={currentShow.name}
          showDate={currentShow.startDate}
          canRegenerate={canRegenerate}
        />
      ),
    },
    {
      id: 'volunteers',
      title: 'Volunteers',
      summary: 'Track helper assignments and gaps',
      content: <VolunteersCard showId={currentShow.id} />,
    },
    {
      id: 'tasks-notes',
      title: 'Tasks and notes',
      summary: 'Keep show-specific reminders together',
      content: <TasksNotesCard showId={currentShow.id} clubId={currentShow.clubId} />,
    },
  ],
  [
    canRegenerate,
    currentShow.clubId,
    currentShow.id,
    currentShow.name,
    currentShow.startDate,
    effectiveJudges,
    incidentEntryOptions,
    showClasses,
  ]
);
```

- [ ] **Step 3: Pass the structured tools into `ShowDeskPanel`**

Change the `ShowDeskPanel` call from the anonymous `toolsContent` fragment:

```tsx
toolsContent={
  <>
    ...
  </>
}
```

to:

```tsx
tools={showDeskTools}
```

- [ ] **Step 4: Run TypeScript to catch call-site drift**

Run:

```bash
pnpm typecheck
```

Expected: fail only on `ShowDeskPanel` still expecting `toolsContent`. Task 6 is the immediate next task and updates that boundary.

## Task 6: Keep `ShowDeskPanel` As The Single Sheet Entry Point

**Files:**
- Modify: `apps/myk9show/src/features/show-map/ShowDeskPanel.tsx`
- Modify: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`

- [ ] **Step 1: Pass tools through `ShowDeskPanel`**

`ShowDeskPanel` currently owns the `ShowDeskToolsSheet` wrapper. Keep that boundary. Change its props from `toolsContent?: ReactNode` to:

```tsx
import type { ShowDeskToolSection } from './ShowDeskToolsSheet';

interface ShowDeskPanelProps extends BuildShowMapTreeInput {
  canManageShow?: boolean;
  tools?: readonly ShowDeskToolSection[];
  closeoutContent?: ReactNode;
}
```

- [ ] **Step 2: Render the sheet from `ShowDeskPanel` with `show.id`**

Replace:

```tsx
{toolsContent && (
  <div className="flex justify-end">
    <ShowDeskToolsSheet>{toolsContent}</ShowDeskToolsSheet>
  </div>
)}
```

with:

```tsx
{tools && tools.length > 0 && (
  <div className="flex justify-end">
    <ShowDeskToolsSheet showId={show.id} tools={tools} />
  </div>
)}
```

- [ ] **Step 3: Update the `ShowWorkbenchPage` prop**

Use:

```tsx
tools={showDeskTools}
```

instead of `toolsContent={...}`.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx
```

Then run from the repository root:

```bash
pnpm typecheck
```

Expected: focused test passes and typecheck passes, or only unrelated pre-existing failures are documented.

- [ ] **Step 5: Commit the call-site wiring**

Run:

```bash
git add apps/myk9show/src/features/show-map/ShowDeskPanel.tsx apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx
git commit -m "feat(show): wire structured show desk tools"
```

## Task 7: Verification And Tracking

**Files:**
- Modify: top-level backlog tracking file
- Read: `docs/superpowers/specs/2026-05-31-show-desk-tools-collapse-design.md`

- [ ] **Step 1: Run all focused verification**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showDeskToolsState.test.ts src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run relevant broader verification**

Run:

```bash
pnpm typecheck
```

Expected: pass, or report exact unrelated pre-existing failures.

- [ ] **Step 3: Update the backlog item**

In the top-level backlog tracking file, change the Show Desk tools collapse item from open to completed and append a short completion note:

```md
- [x] ~~**Show Desk tools collapse individually inside the side panel**~~ — Completed via the structured `ShowDeskToolsSheet` collapse contract. Tools now render as per-show remembered collapsible sections with focused coverage for section toggling, keyboard behavior, persistence fallback, and existing content rendering.
```

- [ ] **Step 4: Commit verification and tracking**

Run:

```bash
git add OPEN-TODOS.md
git commit -m "docs(todos): close show desk tools collapse"
```

- [ ] **Step 5: Final status**

Report:

```text
Implemented Show Desk tool sections as per-show remembered collapsibles.
Verification:
- showDeskToolsState.test.ts passed
- ShowDeskToolsSheet.test.tsx passed
- pnpm typecheck passed
```

If any verification was blocked or failed for unrelated reasons, include the exact command and failure summary instead of claiming success.
