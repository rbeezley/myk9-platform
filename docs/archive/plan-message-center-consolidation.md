# Message Center Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the top-menu Message Center the single secretary communication hub, while keeping `/secretary/messages` as the full conversation history view.

**Architecture:** Consolidate compose/read entry points around `MessageCenterPanel`. Reuse the existing `MessageShowComposer` for show-wide and targeted show messages, and remove duplicate primary navigation from the left sidebar and Show Desk tools sheet. Keep the secretary messages route as a deep-linked full view for message history and long-thread review.

**Tech Stack:** React, TypeScript, Zustand stores, React Query, shadcn/ui primitives, Vitest with `src/test/utils/testUtils.tsx`.

---

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This changes secretary communication navigation and compose flow inside one app, with no DB migrations or shared-system writes.

## Context

This plan follows the project's consolidation rule: do not keep multiple surfaces that appear to do the same job unless their jobs are clearly different.

The agreed product model:

- Top Message Center is the one place for communication.
- Message Center supports reading notifications and show messages.
- Message Center supports secretary compose for show-wide and targeted show messages.
- "Announcement" remains an internal delivery lane where needed; the user-facing model is just "Show messages."
- `/secretary/messages` remains available as a full conversation/history view.
- Messages no longer appears as a primary left-sidebar destination.
- Show Desk tools no longer includes `Message Show`; the top Message Center button is already present on every page.

Duplication answer:

The old left-sidebar Messages item and Show Desk `Message Show` tool duplicate the always-available top Message Center. That duplication is not justified because it creates multiple places to start the same communication workflow. The full route remains justified only as a history/detail destination opened from Message Center.

## Files

- Modify: `apps/myk9show/src/components/notifications/MessageCenterPanel.tsx`
  - Add secretary compose entry.
  - Replace the announcement-only create dialog with the shared `MessageShowComposer`.
  - Fold show-wide posts into the `Show messages` tab instead of exposing a separate `Announcements` tab.
  - Add explicit show selection before composing.
  - Add a full-view/history link.
- Create: `apps/myk9show/src/features/messages/hooks/useMessageShowClassOptions.ts`
  - Centralize the class option query currently embedded in `SecretaryMessagesPage`.
  - [ADDED] Gate the query so Message Center does not fetch class counts until the compose dialog has a selected show.
- Modify: `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx`
  - Reframe as communication history/full view.
  - Remove the `Message Show` composer entry and dialog.
  - Keep show filter and thread detail behavior.
- Modify: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
  - Remove the `message-show` Show Desk tool section and unused imports.
- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`
  - Remove the Manage > Messages item.
- Modify: `apps/myk9show/src/components/layout/sidebar/RoleSidebar.tsx`
  - Remove message-specific sidebar badge logic if it becomes unused.
- Modify tests:
  - `apps/myk9show/src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts`
  - `apps/myk9show/src/components/notifications/__tests__/MessageCenterPanel.test.tsx`
  - `apps/myk9show/src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx`
  - Add or update a focused workbench test if an existing `ShowWorkbenchPage` test already covers tool labels.

---

## Task 1: Remove Messages From Primary Sidebar

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`
- Modify: `apps/myk9show/src/components/layout/sidebar/RoleSidebar.tsx`
- Test: `apps/myk9show/src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts`

- [x] **Step 1: Write the failing sidebar expectations**

Update the Manage lifecycle test so `Messages` is absent:

```ts
expect(titles).toEqual([
  'Dashboard',
  'Entries',
  'Schedule',
  'Day of Show',
  'Reports',
  'Results Control',
  'Submit Results',
]);
```

Replace the existing `manage sidebar includes Messages with the /secretary/messages href` test with:

```ts
it('manage sidebar omits Messages because Message Center is the communication hub', () => {
  const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
  const group = config.groups.find(g => g.title === 'Manage');
  const titles = group?.items.map(i => i.title) ?? [];

  expect(titles).not.toContain('Messages');
  expect(group?.items.some(i => i.href === '/secretary/messages')).toBe(false);
});
```

- [x] **Step 2: Run the focused sidebar test red**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts
```

Expected: FAIL because the Manage group still contains `Messages`.

- [x] **Step 3: Remove the sidebar item**

In `unifiedSidebarConfig.ts`, delete this item from the Manage group:

```ts
{
  title: 'Messages',
  href: '/secretary/messages',
  icon: MessageSquare,
  description: 'Conversations with exhibitors across your shows',
},
```

Remove the now-unused `MessageSquare` import if TypeScript reports it unused.

- [x] **Step 4: Clean up sidebar badge logic if unused**

In `RoleSidebar.tsx`, remove message-specific badge logic if `messageUnreadCount` is no longer used by any sidebar item:

```ts
const active = isActive(item.href);
const badgeLabel = item.badge;
```

If the component prop still needs `messageUnreadCount` for compatibility elsewhere, leave the prop but remove only the local `/messages` detection.

- [x] **Step 5: Run the focused sidebar test green**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts
```

Expected: PASS.

---

## Task 2: Extract Shared Message Show Class Query

**Files:**

- Create: `apps/myk9show/src/features/messages/hooks/useMessageShowClassOptions.ts`
- Modify: `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx`
- Test: `apps/myk9show/src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx`

- [x] **Step 1: Create the shared hook**

Create `useMessageShowClassOptions.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import {
  buildMessageShowClassLabel,
  type MessageShowClassOption,
} from '@/features/show-workbench/messageShow';

interface UseMessageShowClassOptionsOptions {
  enabled?: boolean;
}

export function useMessageShowClassOptions(
  showId: string | null | undefined,
  options: UseMessageShowClassOptionsOptions = {}
) {
  return useQuery<MessageShowClassOption[]>({
    queryKey: ['show-classes-for-messages', showId],
    queryFn: async () => {
      if (!showId) return [];

      const { data } = await supabase
        .from('classes')
        .select('id, class_number, name, element, level, section, trials!inner(show_id)')
        .eq('trials.show_id' as string, showId)
        .order('class_number');

      return Promise.all(
        (data ?? []).map(async cls => {
          const { count } = await supabase
            .from('entries')
            .select('id', { count: 'exact', head: true })
            .eq('class_id', cls.id)
            .is('deleted_at', null);

          return {
            id: cls.id,
            label: buildMessageShowClassLabel({
              name: cls.name,
              element: cls.element,
              level: cls.level,
              section: cls.section,
            }),
            entryCount: count ?? 0,
          };
        })
      );
    },
    enabled: !!showId && (options.enabled ?? true),
  });
}
```

- [x] **Step 2: Replace the inline query in `SecretaryMessagesPage`**

Remove the inline `useQuery` block and replace it with:

```ts
import { useMessageShowClassOptions } from '@/features/messages/hooks/useMessageShowClassOptions';
```

Then derive:

```ts
const { data: classes = [] } = useMessageShowClassOptions(selectedShowId);
```

This keeps the page behavior stable before the page compose UI is removed in Task 4.

- [x] **Step 3: Add coverage for disabled class queries**

Add a focused hook test if a nearby hook test pattern exists. The important assertion is:

```ts
expect(supabase.from).not.toHaveBeenCalled();
```

when rendering the hook with:

```ts
useMessageShowClassOptions('show-1', { enabled: false });
```

If there is no existing hook-test harness nearby, cover this behavior through the Message Center test in Task 3 by asserting that opening the panel without opening compose does not call the class query.

- [x] **Step 4: Run the secretary messages page tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx
```

Expected: PASS.

---

## Task 3: Add Secretary Compose To Message Center

**Files:**

- Modify: `apps/myk9show/src/components/notifications/MessageCenterPanel.tsx`
- Test: `apps/myk9show/src/components/notifications/__tests__/MessageCenterPanel.test.tsx`

- [x] **Step 1: Write failing Message Center tests**

Add a staff-user test that proves the compose entry appears:

```ts
it('shows a compose action for staff users', async () => {
  authContext = {
    user: { id: 'secretary-1', email: 'secretary@test.com' },
    userWithRoles: { id: 'secretary-1', roles: ['secretary'], scopes: [], user_metadata: {} },
    isSecretary: true,
    isAdmin: false,
    hasRole: () => false,
  };
  const { useAnnouncementStore } = await import('@/store/announcementStore');
  (useAnnouncementStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    currentShowIds: ['show-1'],
  });

  renderPanel();

  expect(screen.getByRole('button', { name: /compose/i })).toBeInTheDocument();
});
```

Add a test that proves composing requires an explicit show when multiple managed shows are available:

```ts
it('requires staff users to pick a show before composing when multiple shows are active', async () => {
  authContext = {
    user: { id: 'secretary-1', email: 'secretary@test.com' },
    userWithRoles: { id: 'secretary-1', roles: ['secretary'], scopes: [], user_metadata: {} },
    isSecretary: true,
    isAdmin: false,
    hasRole: () => false,
  };
  const { useAnnouncementStore } = await import('@/store/announcementStore');
  (useAnnouncementStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    currentShowIds: ['show-1', 'show-2'],
  });
  const { useShowStore } = await import('@/store/showStore');
  (useShowStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    shows: [
      { id: 'show-1', name: 'Spring Trial' },
      { id: 'show-2', name: 'Summer Trial' },
    ],
  });

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: /compose/i }));

  expect(screen.getByRole('dialog', { name: /compose show communication/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/show/i)).toBeInTheDocument();
});
```

Add a test that proves the panel does not fetch class options before the compose dialog opens:

```ts
it('does not load compose class options until staff opens compose', async () => {
  authContext = {
    user: { id: 'secretary-1', email: 'secretary@test.com' },
    userWithRoles: { id: 'secretary-1', roles: ['secretary'], scopes: [], user_metadata: {} },
    isSecretary: true,
    isAdmin: false,
    hasRole: () => false,
  };
  const { useAnnouncementStore } = await import('@/store/announcementStore');
  (useAnnouncementStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    currentShowIds: ['show-1'],
  });

  renderPanel();

  expect(screen.queryByRole('dialog', { name: /compose show communication/i })).not.toBeInTheDocument();
  expect(classOptionsHookMock).toHaveBeenCalledWith(null, { enabled: false });
});
```

Add a test that proves full view opens the existing secretary route:

```ts
it('opens the secretary full communication view from Message Center', async () => {
  authContext = {
    user: { id: 'secretary-1', email: 'secretary@test.com' },
    userWithRoles: { id: 'secretary-1', roles: ['secretary'], scopes: [], user_metadata: {} },
    isSecretary: true,
    isAdmin: false,
    hasRole: () => false,
  };

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: /open full view/i }));

  expect(navigateMock).toHaveBeenCalledWith('/secretary/messages');
});
```

- [x] **Step 2: Run the Message Center tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/notifications/__tests__/MessageCenterPanel.test.tsx
```

Expected: FAIL because the compose action, full-view action, and supporting mocks do not exist yet.

- [x] **Step 3: Add test mocks for the shared composer, show store, and class options hook**

In `MessageCenterPanel.test.tsx`, add a lightweight `MessageShowComposer` mock so tests assert integration without exercising the full composer:

```ts
vi.mock('@/features/show-workbench/MessageShowComposer', () => ({
  MessageShowComposer: ({ showId }: { showId: string }) => (
    <div data-testid="message-show-composer">Composer for {showId}</div>
  ),
}));
```

Add a zustand-backed `useShowStore` mock:

```ts
vi.mock('@/store/showStore', async () => {
  const { create } = await import('zustand');
  const useShowStore = create<Record<string, unknown>>()(() => ({
    shows: [
      { id: 'show-1', name: 'Spring Trial' },
      { id: 'show-2', name: 'Summer Trial' },
    ],
  }));
  return { useShowStore };
});
```

Add a hook mock that can prove disabled queries stay disabled:

```ts
const classOptionsHookMock = vi.fn(() => ({ data: [] }));

vi.mock('@/features/messages/hooks/useMessageShowClassOptions', () => ({
  useMessageShowClassOptions: (...args: unknown[]) => classOptionsHookMock(...args),
}));
```

Reset `classOptionsHookMock` in `beforeEach`.

- [x] **Step 4: Add imports and local state**

In `MessageCenterPanel.tsx`, add:

```ts
import { MessageShowComposer } from '@/features/show-workbench/MessageShowComposer';
import { useShowStore } from '@/store/showStore';
import { useMessageShowClassOptions } from '@/features/messages/hooks/useMessageShowClassOptions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

Add state near the existing tab state:

```ts
const shows = useShowStore(s => s.shows);
const staffShowIds = currentShowIds.length > 0 ? currentShowIds : shows.map(show => show.id);
const staffShows = shows.filter(show => staffShowIds.includes(show.id));
const [isComposeOpen, setIsComposeOpen] = useState(false);
const [composeShowId, setComposeShowId] = useState<string>('');
const selectedComposeShowId =
  composeShowId || (staffShows.length === 1 ? staffShows[0].id : '');
const { data: composeClasses = [] } = useMessageShowClassOptions(
  isComposeOpen && selectedComposeShowId ? selectedComposeShowId : null,
  { enabled: isComposeOpen && !!selectedComposeShowId }
);
```

[ADDED] `staffShowIds` falls back to managed shows when the message/announcement subscriptions have not yet established `currentShowIds`, so the always-available top Message Center can still compose from dashboard-like pages.

- [x] **Step 5: Add compose and full-view handlers**

Add:

```ts
function handleOpenCompose() {
  setComposeShowId(staffShows.length === 1 ? staffShows[0].id : '');
  setIsComposeOpen(true);
}

function handleOpenFullView() {
  closeCenter();
  navigate('/secretary/messages');
}
```

- [x] **Step 6: Replace announcement-only creation with shared compose**

Remove the announcement-tab-only `New Announcement` block:

```tsx
{author.isOfficial && (
  <div className="border-b border-border/50 p-2">
    <Button
      variant="outline"
      size="sm"
      className="w-full"
      onClick={() => setIsCreateOpen(true)}
      disabled={currentShowIds.length === 0}
    >
      <Plus className="mr-1.5 h-3 w-3" />
      New Announcement
    </Button>
  </div>
)}
```

Add one staff action row near the top of the panel content, before the tab list:

```tsx
{author.isOfficial && (
  <div className="flex gap-2 border-b border-border/50 p-3">
    <Button
      variant="default"
      size="sm"
      className="flex-1"
      onClick={handleOpenCompose}
      disabled={staffShows.length === 0}
    >
      <Plus className="mr-1.5 h-4 w-4" />
      Compose
    </Button>
    <Button variant="outline" size="sm" onClick={handleOpenFullView}>
      Open full view
    </Button>
  </div>
)}
```

- [x] **Step 7: Render the shared composer dialog**

Replace `CreateAnnouncementDialog` usage with:

```tsx
{isComposeOpen && (
  <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Compose show message</DialogTitle>
        <DialogDescription>
          Send a show message to everyone, a class, or checked-in exhibitors.
        </DialogDescription>
      </DialogHeader>

      {staffShows.length > 1 && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="message-center-compose-show">
            Show
          </label>
          <Select value={composeShowId} onValueChange={setComposeShowId}>
            <SelectTrigger id="message-center-compose-show">
              <SelectValue placeholder="Select a show" />
            </SelectTrigger>
            <SelectContent>
              {staffShows.map(show => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {staffShows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Select or load a managed show before composing.
        </p>
      )}

      {selectedComposeShowId ? (
        <MessageShowComposer
          showId={selectedComposeShowId}
          classes={composeClasses}
          showHistoryLink={false}
          onSent={() => setIsComposeOpen(false)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Select a show to continue.</p>
      )}
    </DialogContent>
  </Dialog>
)}
```

Remove unused imports for `CreateAnnouncementDialog` and any unused `isCreateOpen` state.

- [x] **Step 8: Run the Message Center tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/notifications/__tests__/MessageCenterPanel.test.tsx
```

Expected: PASS.

---

## Task 4: Reframe Secretary Messages Page As Full View / History

**Files:**

- Modify: `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx`
- Test: `apps/myk9show/src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx`

- [x] **Step 1: Write failing page tests**

Update the page tests so the header no longer exposes `Message Show`:

```ts
it('does not expose compose because Message Center owns communication creation', () => {
  renderAtUrl('/secretary/messages?showId=show-1');

  expect(screen.queryByRole('button', { name: /message show/i })).not.toBeInTheDocument();
});
```

Add or update the heading test:

```ts
it('frames the page as communication history', () => {
  renderAtUrl('/secretary/messages');

  expect(screen.getByRole('heading', { name: /communication history/i })).toBeInTheDocument();
});
```

- [x] **Step 2: Run the secretary messages page tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx
```

Expected: FAIL because the page still says `Messages` and includes `Message Show`.

- [x] **Step 3: Remove page compose UI**

In `SecretaryMessagesPage.tsx`, remove:

- `showTargetedModal` state.
- `MessageShowComposer` import.
- `Dialog` imports used only for the composer.
- `classes` query if no longer used after Task 2.
- The `Message Show` button in the header.
- The composer dialog at the bottom of the component.

Change:

```tsx
<h1 className="text-lg font-semibold">Messages</h1>
```

to:

```tsx
<h1 className="text-lg font-semibold">Communication History</h1>
```

- [x] **Step 4: Keep route and history behavior intact**

Confirm these behaviors remain unchanged:

- `/secretary/messages` shows all visible threads.
- `/secretary/messages?showId=show-1` filters threads to that show.
- Selecting a thread still fetches messages and marks it read.
- Mobile back button still returns to the thread list.
- [ADDED] Existing deep links from notifications and bookmarks to `/secretary/messages` and `/secretary/messages?showId=...` still work because the route is not removed.

- [x] **Step 5: Run the secretary messages page tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx
```

Expected: PASS.

---

## Task 5: Remove Message Show From Show Desk Tools

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
- Modify tests only if an existing test asserts the tool list.

- [x] **Step 1: Write or update a failing workbench expectation**

If an existing `ShowWorkbenchPage` or Show Desk tools integration test renders the real tool list, add:

```ts
expect(screen.queryByRole('button', { name: /message show/i })).not.toBeInTheDocument();
```

If no test renders the real `ShowWorkbenchPage` tool list without heavy setup, skip adding a broad integration test and rely on Task 6 typecheck plus focused existing tests. Do not create a brittle full-page test just to inspect one label.

- [x] **Step 2: Remove the tool section**

In `ShowWorkbenchPage.tsx`, delete the `message-show` section:

```tsx
{
  id: 'message-show',
  title: 'Message Show',
  summary: 'Send updates, class messages, and push alerts',
  content: (
    <MessageShowComposer
      showId={currentShow.id}
      classes={showClasses.map(cls => ({
        id: cls.id,
        label: buildMessageShowClassLabel({
          name: cls.name,
          element: cls.element,
          level: cls.level,
          section: cls.section,
        }),
        entryCount: cls.entryCount,
      }))}
    />
  ),
},
```

Remove unused imports:

```ts
import { MessageShowComposer } from '@/features/show-workbench/MessageShowComposer';
import { buildMessageShowClassLabel } from '@/features/show-workbench/messageShow';
```

- [x] **Step 3: Preserve all other Show Desk tools**

Confirm the returned tool list still includes:

- `late-entry`
- `judge-hospitality`
- `incident-log`
- `schedule-slip`
- `tasks-notes`
- `access-codes`
- any closeout/reporting tool already present later in the array
- [ADDED] Confirm old localStorage values such as `message-show` do not reopen or break the sheet. `loadOpenToolIds` should continue filtering missing tool ids; keep or add a focused expectation in `showDeskToolsState.test.ts` if it is not already covered.

- [x] **Step 4: Run focused workbench tests**

Run the closest existing focused tests:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx src/features/show-map/__tests__/showDeskToolsState.test.ts
```

Expected: PASS.

---

## Task 6: Final Verification

**Files:**

- All modified files.

- [x] **Step 1: Run all focused tests touched by this plan**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts \
  src/components/notifications/__tests__/MessageCenterPanel.test.tsx \
  src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx \
  src/features/show-map/__tests__/ShowDeskToolsSheet.test.tsx \
  src/features/show-map/__tests__/showDeskToolsState.test.ts
```

Expected: PASS. If the runner hangs for more than 60 seconds without useful output, stop and report the hang instead of retrying in a loop.

- [x] **Step 2: Run TypeScript check for the app if focused tests pass**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If unrelated pre-existing type errors appear, capture the first relevant errors and note whether they are related to the touched files.

- [x] **Step 3: Run Markdown/diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [x] **Step 4: Manual UX check**

Start the dev server:

```bash
pnpm dev:show
```

Open the app and verify:

- Left sidebar Manage section no longer shows Messages.
- Top Message Center opens from any secretary page.
- Staff users see Compose and Open full view.
- Compose requires a show when multiple shows are available.
- Compose can send show-wide and targeted show messages through the shared composer.
- Show Desk tools no longer includes Message Show.
- `/secretary/messages` still loads directly and works as Communication History.
- Message Center compose from a dashboard page with managed shows but no active show subscription still offers show selection.

- [x] **Step 5: Update tracking docs if this implementation is completed**

After implementation, update the relevant backlog/tracking document, likely `OPEN-TODOS.md`, with the completed consolidation item and any deferred follow-up discovered during implementation.

---

## Self-Review

Spec coverage:

- One communication hub: covered by Tasks 3 and 5.
- Remove sidebar Messages: covered by Task 1.
- Keep full page as history/detail: covered by Task 4.
- Remove workbench duplicate: covered by Task 5.
- Explicit show selection: covered by Task 3.
- [ADDED] Avoid eager class-count queries before compose opens: covered by Task 2 and Task 3.
- [ADDED] Compose remains available from non-show pages when managed shows are known but `currentShowIds` is empty: covered by Task 3.
- [ADDED] Old Show Desk tool open-state recovery: covered by Task 5.
- Testing phase: covered by Task 6 and focused tests in each task.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified test steps remain.
- The only conditional test guidance is intentional: avoid creating a brittle full-page workbench test if no focused seam exists.

Type consistency:

- Shared class options use the existing `MessageShowClassOption` type.
- Existing `MessageShowComposer` props are preserved: `showId`, `classes`, `showHistoryLink`, and `onSent`.
