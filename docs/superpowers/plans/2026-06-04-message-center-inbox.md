# Message Center Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the top-bar bell open a universal Message Center slide-out for every role, ordered Notifications, Announcements, Messages.

**Architecture:** Reuse the existing notification and announcement stores, add message threads from `messageStore`, and render them in one `SlideOverPanel`-backed panel. Keep existing destination pages (`/notifications`, `/messages/:showId`, `/secretary/messages`) as the canonical full surfaces; the bell is the global entry point.

**Tech Stack:** React, TypeScript, Zustand, React Router, Vitest, Testing Library, existing `SlideOverPanel`, existing shadcn/Base UI components.

---

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This is a small myK9Show TypeScript/UI-state change that affects a global header workflow for all roles, so focused unit tests plus app typecheck are required before PR.

---

## File Structure

- Modify `apps/myk9show/src/components/panels/SlideOverPanel.tsx` to support `side="left" | "right"` with right as the default.
- Add `apps/myk9show/src/components/panels/__tests__/SlideOverPanel.test.tsx` for left/right panel behavior.
- Add `apps/myk9show/src/components/notifications/MessageCenterPanel.tsx` as the new bell-driven panel.
- Keep `apps/myk9show/src/components/notifications/NotificationCenter.tsx` as a compatibility wrapper that exports `MessageCenterPanel` as `NotificationCenter`, so `App.tsx` can be changed in a small follow-up or remain stable during the transition.
- Modify `apps/myk9show/src/components/notifications/NotificationBell.tsx` so the bell opens the center directly and the badge includes messages.
- Modify `apps/myk9show/src/hooks/useMessageSubscription.ts` to subscribe to all role-relevant message shows: active-today exhibitor shows, all entered exhibitor shows discoverable from local entry/dog stores, selected show, and staff-managed shows.
- Add or update tests:
  - `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`
  - `apps/myk9show/src/components/notifications/__tests__/MessageCenterPanel.test.tsx`
  - `apps/myk9show/src/hooks/__tests__/useMessageSubscription.test.tsx`
  - `apps/myk9show/src/test/components/layout/AppHeader-message-center.test.tsx`

---

### Task 1: Add Left-Side Support To `SlideOverPanel`

**Files:**
- Modify: `apps/myk9show/src/components/panels/SlideOverPanel.tsx`
- Create: `apps/myk9show/src/components/panels/__tests__/SlideOverPanel.test.tsx`

- [ ] **Step 1: Write the failing panel-side tests**

Create `apps/myk9show/src/components/panels/__tests__/SlideOverPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SlideOverPanel } from '../SlideOverPanel';

describe('SlideOverPanel side support', () => {
  it('defaults to a right-side panel', () => {
    render(
      <SlideOverPanel open onClose={vi.fn()} title="Panel">
        <p>Body</p>
      </SlideOverPanel>
    );

    const panel = screen.getByRole('dialog').querySelector('.slide-over-panel');
    expect(panel).toHaveClass('right-0');
    expect(panel).toHaveClass('rounded-l-xl');
  });

  it('can render as a left-side panel', () => {
    render(
      <SlideOverPanel open onClose={vi.fn()} title="Message Center" side="left">
        <p>Body</p>
      </SlideOverPanel>
    );

    const panel = screen.getByRole('dialog').querySelector('.slide-over-panel');
    expect(panel).toHaveClass('left-0');
    expect(panel).toHaveClass('rounded-r-xl');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/panels/__tests__/SlideOverPanel.test.tsx
```

Expected: FAIL because `SlideOverPanelProps` does not accept `side`.

- [ ] **Step 3: Implement side support**

In `apps/myk9show/src/components/panels/SlideOverPanel.tsx`, update the props and class selection:

```tsx
export interface SlideOverPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  side?: 'left' | 'right';
  showBackButton?: boolean;
  onBack?: () => void;
  loading?: boolean;
  className?: string;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  preventClose?: boolean;
}
```

Destructure `side = 'right'` in the component props:

```tsx
  size = 'lg',
  side = 'right',
  showBackButton = false,
```

Before `panelContent`, add:

```tsx
  const isLeft = side === 'left';
```

Replace the panel positioning and animation classes inside the panel `<div>` with:

```tsx
          'fixed inset-y-0 flex flex-col slide-over-panel',
          isLeft ? 'left-0' : 'right-0',
          appleDesign.panelBackground,
          isLeft ? 'border-r border-border' : appleDesign.border,
          appleDesign.shadow,
          isLeft ? 'rounded-r-xl' : 'rounded-l-xl',
          sizeClasses[size],
          isLeft
            ? 'sm:max-w-none sm:w-full sm:rounded-none md:max-w-lg md:rounded-r-xl lg:max-w-2xl xl:max-w-4xl'
            : 'sm:max-w-none sm:w-full sm:rounded-none md:max-w-lg md:rounded-l-xl lg:max-w-2xl xl:max-w-4xl',
          `transition-all ${appleDesign.animation.duration} ${appleDesign.animation.easing}`,
          open ? '' : isLeft ? '-translate-x-full' : 'translate-x-full',
          className
```

- [ ] **Step 4: Run the panel test**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/panels/__tests__/SlideOverPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/panels/SlideOverPanel.tsx apps/myk9show/src/components/panels/__tests__/SlideOverPanel.test.tsx
git commit -m "feat(show): support left slide-over panels"
```

---

### Task 2: Make The Bell Open The Center And Count Messages

**Files:**
- Modify: `apps/myk9show/src/components/notifications/NotificationBell.tsx`
- Modify: `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`

- [ ] **Step 1: Replace dropdown expectations with center-opening expectations**

Update `NotificationBell.test.tsx` mocks to include message unread count:

```tsx
vi.mock('@/store/messageStore', async () => {
  const { create } = await import('zustand');
  const useMessageStore = create<Record<string, unknown>>()(() => ({
    unreadCount: 0,
  }));
  return { useMessageStore };
});
```

Replace the old `"opens dropdown on click"` and `"shows empty state when no alerts"` tests with:

```tsx
  it('opens Message Center on click instead of rendering a compact dropdown', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /message center/i }));

    expect(useNotificationStore.getState().isCenterOpen).toBe(true);
    expect(screen.queryByText('Alert 1')).not.toBeInTheDocument();
  });
```

Replace the combined unread test with:

```tsx
  it('shows combined unread count from notifications, announcements, and messages', async () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    const { useAnnouncementStore: annStore } = await import('@/store/announcementStore');
    (annStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      unreadCount: 3,
    });
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      unreadCount: 2,
    });

    render(<NotificationBell />);
    expect(screen.getByText('6')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the failing bell test**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/notifications/__tests__/NotificationBell.test.tsx
```

Expected: FAIL because the current bell opens a dropdown and does not read `messageStore.unreadCount`.

- [ ] **Step 3: Implement the bell launcher**

In `NotificationBell.tsx`, remove local dropdown state, refs, preview item memo, outside-click behavior, and compact dropdown JSX.

Use this compact component shape:

```tsx
import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useMessageStore } from '@/store/messageStore';

export function NotificationBell() {
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const openCenter = useNotificationStore(s => s.openCenter);
  const announcementUnread = useAnnouncementStore(s => s.unreadCount);
  const messageUnread = useMessageStore(s => s.unreadCount);

  const totalUnread = unreadCount + announcementUnread + messageUnread;

  return (
    <button
      aria-label="Message Center"
      onClick={openCenter}
      className="relative rounded-md p-2 hover:bg-muted"
    >
      <Bell className="h-5 w-5" />
      {totalUnread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run the bell test**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/notifications/__tests__/NotificationBell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/notifications/NotificationBell.tsx apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx
git commit -m "feat(show): make bell open message center"
```

---

### Task 3: Build The Message Center Panel

**Files:**
- Create: `apps/myk9show/src/components/notifications/MessageCenterPanel.tsx`
- Modify: `apps/myk9show/src/components/notifications/NotificationCenter.tsx`
- Create: `apps/myk9show/src/components/notifications/__tests__/MessageCenterPanel.test.tsx`
- Modify: `apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx`

- [ ] **Step 1: Write the failing Message Center tests**

Create `MessageCenterPanel.test.tsx` with store mocks modeled after the existing notification center test:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessageCenterPanel } from '../MessageCenterPanel';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/store/announcementStore', async () => {
  const { create } = await import('zustand');
  const useAnnouncementStore = create<Record<string, unknown>>()(() => ({
    announcements: [],
    unreadCount: 0,
    currentShowIds: [],
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  }));
  return { useAnnouncementStore };
});

vi.mock('@/store/messageStore', async () => {
  const { create } = await import('zustand');
  const useMessageStore = create<Record<string, unknown>>()(() => ({
    threads: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    currentShowIds: [],
    subscribe: vi.fn(),
  }));
  return { useMessageStore };
});

let authContext: Record<string, unknown> = {
  user: { id: 'user-1', email: 'test@test.com' },
  userWithRoles: { id: 'user-1', roles: ['exhibitor'], scopes: [], user_metadata: {} },
  isSecretary: false,
  isAdmin: false,
  hasRole: () => false,
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authContext,
}));

vi.mock('@/components/announcements/AnnouncementItem', () => ({
  AnnouncementItem: ({ announcement }: { announcement: { title: string } }) => (
    <div data-testid="announcement-item">{announcement.title}</div>
  ),
}));

vi.mock('@/components/announcements/CreateAnnouncementDialog', () => ({
  CreateAnnouncementDialog: () => <div data-testid="create-announcement-dialog" />,
}));

function makePayload(id: string): NotificationPayload {
  return {
    id,
    type: 'your_turn',
    title: `Alert ${id}`,
    body: `Body ${id}`,
    priority: 'normal',
    timestamp: Date.now(),
    actionUrl: '/test',
  };
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <MessageCenterPanel />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  navigateMock.mockReset();
  authContext = {
    user: { id: 'user-1', email: 'test@test.com' },
    userWithRoles: { id: 'user-1', roles: ['exhibitor'], scopes: [], user_metadata: {} },
    isSecretary: false,
    isAdmin: false,
    hasRole: () => false,
  };
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: true,
    permissionStatus: 'default' as NotificationPermission,
  });
  const { useAnnouncementStore } = await import('@/store/announcementStore');
  (useAnnouncementStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    announcements: [],
    unreadCount: 0,
    currentShowIds: [],
  });
  const { useMessageStore } = await import('@/store/messageStore');
  (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
    threads: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    currentShowIds: [],
    subscribe: vi.fn(),
  });
});

describe('MessageCenterPanel', () => {
  it('renders a left-side Message Center dialog', () => {
    renderPanel();
    expect(screen.getByRole('dialog', { name: /message center/i })).toBeInTheDocument();
    expect(screen.getByText('Message Center')).toBeInTheDocument();
  });

  it('orders tabs as Notifications, Announcements, Messages', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab').map(tab => tab.textContent);
    expect(tabs).toEqual(['Notifications', 'Announcements', 'Messages']);
  });

  it('defaults to the Notifications tab', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    renderPanel();
    expect(screen.getByText('Alert 1')).toBeInTheDocument();
  });

  it('renders messages and routes exhibitors to /messages/:showId', async () => {
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      threads: [
        {
          id: 'thread-1',
          show_id: 'show-1',
          participant_id: 'user-1',
          participant_name: 'Trial Secretary',
          show_name: 'Spring Trial',
          last_message_at: '2026-06-04T12:00:00Z',
          created_at: '2026-06-04T12:00:00Z',
          unread_count: 2,
          last_message_preview: 'Can you confirm your armband?',
        },
      ],
      unreadCount: 2,
    });

    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    fireEvent.click(screen.getByRole('button', { name: /Spring Trial/i }));

    expect(navigateMock).toHaveBeenCalledWith('/messages/show-1');
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });

  it('routes staff users to /secretary/messages?showId=:showId', async () => {
    authContext = {
      user: { id: 'user-1', email: 'test@test.com' },
      userWithRoles: { id: 'user-1', roles: ['secretary'], scopes: [], user_metadata: {} },
      isSecretary: true,
      isAdmin: false,
      hasRole: () => false,
    };
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      threads: [
        {
          id: 'thread-1',
          show_id: 'show-1',
          participant_id: 'user-1',
          show_name: 'Spring Trial',
          last_message_at: '2026-06-04T12:00:00Z',
          created_at: '2026-06-04T12:00:00Z',
        },
      ],
    });

    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    fireEvent.click(screen.getByRole('button', { name: /Spring Trial/i }));

    expect(navigateMock).toHaveBeenCalledWith('/secretary/messages?showId=show-1');
  });

  it('renders independent empty states for every tab', () => {
    renderPanel();

    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Announcements' }));
    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('shows a retry action when message loading fails', async () => {
    const subscribe = vi.fn();
    const { useMessageStore } = await import('@/store/messageStore');
    (useMessageStore as unknown as { setState: (s: Record<string, unknown>) => void }).setState({
      error: 'Failed to load messages',
      currentShowIds: ['show-1'],
      subscribe,
    });

    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(subscribe).toHaveBeenCalledWith(['show-1']);
  });
});
```

- [ ] **Step 2: Run the failing panel test**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/notifications/__tests__/MessageCenterPanel.test.tsx
```

Expected: FAIL because `MessageCenterPanel` does not exist.

- [ ] **Step 3: Implement `MessageCenterPanel`**

Create `apps/myk9show/src/components/notifications/MessageCenterPanel.tsx` by moving the useful logic from `NotificationCenter.tsx` and changing the shell to `SlideOverPanel`.

Use these core definitions at the top:

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Dog, Inbox, Megaphone, MessageSquare, Plus } from 'lucide-react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { useNotificationStore, type AlertEntry } from '@/store/notificationStore';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useMessageStore } from '@/store/messageStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { NotificationType, NotificationPriority } from '@myk9/notifications';
import { formatRelativeTime } from '@/lib/timeUtils';
import { PRIORITY_BORDER } from './notification-styles';
import { AnnouncementItem } from '@/components/announcements/AnnouncementItem';
import { CreateAnnouncementDialog } from '@/components/announcements/CreateAnnouncementDialog';
import { getAnnouncementAuthor } from '@/types/announcement-types';

type MessageCenterTab = 'notifications' | 'announcements' | 'messages';
```

Render the panel with this structure:

```tsx
export function MessageCenterPanel() {
  const navigate = useNavigate();
  const isCenterOpen = useNotificationStore(s => s.isCenterOpen);
  const closeCenter = useNotificationStore(s => s.closeCenter);
  const recentAlerts = useNotificationStore(s => s.recentAlerts);
  const notificationUnread = useNotificationStore(s => s.unreadCount);
  const markAllRead = useNotificationStore(s => s.markAllRead);
  const markRead = useNotificationStore(s => s.markRead);
  const dismissAlert = useNotificationStore(s => s.dismissAlert);

  const announcements = useAnnouncementStore(s => s.announcements);
  const announcementUnread = useAnnouncementStore(s => s.unreadCount);
  const currentShowIds = useAnnouncementStore(s => s.currentShowIds);
  const annMarkRead = useAnnouncementStore(s => s.markRead);
  const annMarkAllRead = useAnnouncementStore(s => s.markAllRead);

  const threads = useMessageStore(s => s.threads);
  const messageUnread = useMessageStore(s => s.unreadCount);
  const messagesLoading = useMessageStore(s => s.isLoading);
  const messagesError = useMessageStore(s => s.error);
  const messageShowIds = useMessageStore(s => s.currentShowIds);
  const retryMessageSubscribe = useMessageStore(s => s.subscribe);

  const { user, userWithRoles, isSecretary, isAdmin, hasRole } = useAuthContext();
  const author = getAnnouncementAuthor(user, userWithRoles);
  const [activeTab, setActiveTab] = useState<MessageCenterTab>('notifications');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const isStaffDestination = isSecretary || isAdmin || hasRole('club_admin');
  const totalUnread = notificationUnread + announcementUnread + messageUnread;
```

Use the same notification item logic from `NotificationCenter.tsx`, then add a messages list:

```tsx
  function handleThreadClick(showId: string) {
    closeCenter();
    navigate(isStaffDestination ? `/secretary/messages?showId=${showId}` : `/messages/${showId}`);
  }

  function handleRetryMessages() {
    void retryMessageSubscribe(messageShowIds);
  }

  function EmptyPanelState({
    icon: Icon,
    title,
    body,
  }: {
    icon: typeof Inbox;
    title: string;
    body: string;
  }) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <Icon className="mb-3 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground/60">{body}</p>
      </div>
    );
  }

  function renderNotificationsTab() {
    const filteredAlerts = unreadOnly ? recentAlerts.filter(alert => !alert.read) : recentAlerts;
    if (filteredAlerts.length === 0) {
      return (
        <EmptyPanelState
          icon={Inbox}
          title="No notifications yet"
          body={unreadOnly ? 'No unread notifications' : "You're all caught up"}
        />
      );
    }
    return (
      <div className="flex-1 overflow-y-auto">
        {filteredAlerts.map(entry => (
          <NotificationItem
            key={entry.payload.id}
            entry={entry}
            onView={id => {
              markRead(id);
              closeCenter();
            }}
            onDismiss={dismissAlert}
          />
        ))}
      </div>
    );
  }

  function renderAnnouncementsTab() {
    const filteredAnnouncements = unreadOnly
      ? announcements.filter(announcement => !announcement.is_read)
      : announcements;
    if (filteredAnnouncements.length === 0) {
      return (
        <EmptyPanelState
          icon={Megaphone}
          title="No announcements yet"
          body={unreadOnly ? 'No unread announcements' : "You're all caught up"}
        />
      );
    }
    return (
      <div className="flex-1 overflow-y-auto">
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
        {filteredAnnouncements.map(announcement => (
          <AnnouncementItem
            key={announcement.id}
            announcement={announcement}
            onMarkRead={id => {
              if (author.id) void annMarkRead(id, author.id);
            }}
          />
        ))}
      </div>
    );
  }

  function renderMessagesTab() {
    const visibleThreads = unreadOnly
      ? threads.filter(thread => (thread.unread_count ?? 0) > 0)
      : threads;
    return (
      <div className="flex-1 overflow-y-auto">
        {messagesLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading messages...</div>
        ) : messagesError ? (
          <div className="space-y-3 p-6">
            <p className="text-sm text-destructive">Couldn&apos;t load messages.</p>
            <Button variant="outline" size="sm" onClick={handleRetryMessages}>
              Try again
            </Button>
          </div>
        ) : visibleThreads.length === 0 ? (
          <EmptyPanelState
            icon={MessageSquare}
            title="No messages yet"
            body={unreadOnly ? 'No unread messages' : 'Conversations with show organizers will appear here.'}
          />
        ) : (
          visibleThreads.map(thread => (
            <button
              key={thread.id}
              type="button"
              onClick={() => handleThreadClick(thread.show_id)}
              className="flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-left hover:bg-muted/40"
            >
              <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{thread.show_name ?? 'Show message'}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {thread.last_message_preview ?? thread.participant_name ?? 'Open conversation'}
                </span>
              </span>
              {(thread.unread_count ?? 0) > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {thread.unread_count}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    );
  }
```

The `renderMessagesTab()` helper above owns loading, retry, empty, unread-only, and row rendering for the Messages tab.

Wrap the panel:

```tsx
  if (!isCenterOpen) return null;

  return (
    <SlideOverPanel
      open={isCenterOpen}
      onClose={closeCenter}
      title="Message Center"
      subtitle={totalUnread > 0 ? `${totalUnread} unread` : undefined}
      side="left"
      size="sm"
      headerActions={
        totalUnread > 0 ? (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Mark all read
          </Button>
        ) : undefined
      }
    >
      <div className="flex border-b border-border/50 px-4" role="tablist">
        {[
          { key: 'notifications' as const, label: 'Notifications', icon: Bell },
          { key: 'announcements' as const, label: 'Announcements', icon: Megaphone },
          { key: 'messages' as const, label: 'Messages', icon: MessageSquare },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium ${
              activeTab === tab.key
                ? 'border-b-2 border-orange-500 text-orange-500'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={event => setUnreadOnly(event.target.checked)}
            aria-label="Unread only"
            className="h-3 w-3 rounded border-border"
          />
          Unread only
        </label>
      </div>
      {activeTab === 'notifications' && renderNotificationsTab()}
      {activeTab === 'announcements' && renderAnnouncementsTab()}
      {activeTab === 'messages' && renderMessagesTab()}
    </SlideOverPanel>
  );
}
```

- [ ] **Step 4: Keep `NotificationCenter` as a wrapper**

Replace `NotificationCenter.tsx` contents with:

```tsx
export { MessageCenterPanel as NotificationCenter } from './MessageCenterPanel';
```

- [ ] **Step 5: Run Message Center and existing NotificationCenter tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/notifications/__tests__/MessageCenterPanel.test.tsx src/components/notifications/__tests__/NotificationCenter.test.tsx
```

Expected: `MessageCenterPanel.test.tsx` passes. Update `NotificationCenter.test.tsx` expectations to the new `Message Center` title and tab names, or replace it with a wrapper smoke test:

```tsx
it('exports the Message Center compatibility wrapper', () => {
  renderCenter();
  expect(screen.getByRole('dialog', { name: /message center/i })).toBeInTheDocument();
});
```

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/notifications/MessageCenterPanel.tsx apps/myk9show/src/components/notifications/NotificationCenter.tsx apps/myk9show/src/components/notifications/__tests__/MessageCenterPanel.test.tsx apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx
git commit -m "feat(show): add unified message center panel"
```

---

### Task 4: Widen Message Subscription Scope

**Files:**
- Modify: `apps/myk9show/src/hooks/useMessageSubscription.ts`
- Add or modify: `apps/myk9show/src/hooks/__tests__/useMessageSubscription.test.tsx`

- [ ] **Step 1: Write the failing subscription tests**

Create `apps/myk9show/src/hooks/__tests__/useMessageSubscription.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessageSubscription } from '../useMessageSubscription';

const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
const setCurrentUserIdMock = vi.fn();

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (s: unknown) => unknown) =>
    selector({
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      setCurrentUserId: setCurrentUserIdMock,
    }),
}));

let authState: Record<string, unknown> = {
  user: { id: 'auth-user-1' },
  userWithRoles: { id: 'person-1', roles: ['exhibitor'], scopes: [] },
  isSecretary: false,
  isAdmin: false,
  hasRole: () => false,
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authState,
}));

let activeShows = [{ showId: 'today-show' }];
vi.mock('@/hooks/queries/useShowDayData', () => ({
  useShowDayData: () => ({ activeShows }),
}));

let selectedShowId: string | null = null;
let shows: Array<{ id: string }> = [];
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: unknown) => unknown) =>
    selector({ selectedShowId, shows }),
}));

let storeEntries: Array<{ id: string; showId: string; dogId: string }> = [];
vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector: (s: unknown) => unknown) =>
    selector({ entries: storeEntries }),
}));

let dogs: Array<{ id: string; ownerId: string }> = [];
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs }),
}));

beforeEach(() => {
  subscribeMock.mockReset();
  unsubscribeMock.mockReset();
  setCurrentUserIdMock.mockReset();
  authState = {
    user: { id: 'auth-user-1' },
    userWithRoles: { id: 'person-1', roles: ['exhibitor'], scopes: [] },
    isSecretary: false,
    isAdmin: false,
    hasRole: () => false,
  };
  activeShows = [{ showId: 'today-show' }];
  selectedShowId = null;
  shows = [];
  storeEntries = [];
  dogs = [];
});

describe('useMessageSubscription', () => {
  it('subscribes exhibitors to active show-day shows', () => {
    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['today-show']);
  });

  it('subscribes staff to managed shows', () => {
    authState = {
      user: { id: 'auth-user-1' },
      userWithRoles: { id: 'person-1', roles: ['secretary'], scopes: [] },
      isSecretary: true,
      isAdmin: false,
      hasRole: () => false,
    };
    shows = [{ id: 'managed-1' }, { id: 'managed-2' }];

    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['managed-1', 'managed-2']);
  });

  it('subscribes exhibitors to entered shows beyond active show-day shows', () => {
    activeShows = [];
    authState = {
      user: { id: 'auth-user-1' },
      userWithRoles: {
        id: 'person-1',
        databaseUserId: 'person-1',
        roles: ['exhibitor'],
        scopes: [],
      },
      isSecretary: false,
      isAdmin: false,
      hasRole: () => false,
    };
    dogs = [{ id: 'dog-1', ownerId: 'person-1' }];
    storeEntries = [
      { id: 'entry-1', showId: 'upcoming-show', dogId: 'dog-1' },
      { id: 'entry-2', showId: 'other-owner-show', dogId: 'dog-2' },
    ];

    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['upcoming-show']);
  });


  it('unions active, selected, and managed shows without duplicates', () => {
    authState = {
      user: { id: 'auth-user-1' },
      userWithRoles: { id: 'person-1', roles: ['secretary', 'exhibitor'], scopes: [] },
      isSecretary: true,
      isAdmin: false,
      hasRole: () => false,
    };
    activeShows = [{ showId: 'show-1' }];
    selectedShowId = 'show-2';
    shows = [{ id: 'show-1' }, { id: 'show-3' }];

    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['show-1', 'show-2', 'show-3']);
  });
});
```

- [ ] **Step 2: Run the failing subscription test**

Run:

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useMessageSubscription.test.tsx
```

Expected: staff-managed show cases fail with the current hook.

- [ ] **Step 3: Implement role-relevant show union**

In `useMessageSubscription.ts`, read `isSecretary`, `isAdmin`, and `hasRole`:

```tsx
const { user, userWithRoles, isSecretary, isAdmin, hasRole } = useAuthContext();
```

Read shows:

```tsx
const shows = useShowStore(s => s.shows);
```

Replace the show ID union with:

```tsx
const databaseUserId = userWithRoles?.databaseUserId;
const storeEntries = useEntryStore(s => s.entries);
const { dogs } = useDogStoreCompat();

const exhibitorEnteredShowIds = useMemo(() => {
  if (!databaseUserId) return [];
  const ownedDogIds = new Set(dogs.filter(dog => dog.ownerId === databaseUserId).map(dog => dog.id));
  const showIds = new Set<string>();
  for (const entry of storeEntries) {
    if (ownedDogIds.has(entry.dogId) && entry.showId) {
      showIds.add(entry.showId);
    }
  }
  return [...showIds];
}, [databaseUserId, dogs, storeEntries]);

const managedShowIds = useMemo(() => {
  if (!(isSecretary || isAdmin || hasRole('club_admin'))) return [];
  return shows.map(show => show.id).filter(Boolean);
}, [shows, isSecretary, isAdmin, hasRole]);

const showIds = useMemo(() => {
  const ids = new Set<string>();
  for (const showId of exhibitorShowIds) ids.add(showId);
  for (const showId of exhibitorEnteredShowIds) ids.add(showId);
  if (selectedShowId) ids.add(selectedShowId);
  for (const showId of managedShowIds) ids.add(showId);
  return [...ids];
}, [exhibitorShowIds, exhibitorEnteredShowIds, selectedShowId, managedShowIds]);
```

Add the required imports:

```tsx
import { useEntryStore } from '@/store/entryStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
```

- [ ] **Step 4: Run the subscription test**

Run:

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useMessageSubscription.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useMessageSubscription.ts apps/myk9show/src/hooks/__tests__/useMessageSubscription.test.tsx
git commit -m "feat(show): subscribe message center to role shows"
```

---

### Task 5: Verify Header Integration For Roles

**Files:**
- Create: `apps/myk9show/src/test/components/layout/AppHeader-message-center.test.tsx`

- [ ] **Step 1: Write the AppHeader integration tests**

Create `AppHeader-message-center.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import AppHeader from '@/components/layout/AppHeader';
import { useNotificationStore } from '@/store/notificationStore';

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

let roles: string[] = ['exhibitor'];

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    hasRole: (role: string) => roles.includes(role),
    signOut: vi.fn(),
    userWithRoles: { id: 'person-1', roles, scopes: [], user_metadata: {} },
    getUserRoles: () => roles,
  }),
}));

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ status: 'synced' }),
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
  getShortcutDisplays: () => [],
}));

vi.mock('@/store/cartStore', () => ({
  useCartItemCount: () => 0,
}));

vi.mock('@/components/common/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('@/components/common/KeyboardShortcutsOverlay', () => ({
  KeyboardShortcutsOverlay: () => null,
}));

vi.mock('@/components/common/AboutDialog', () => ({
  AboutDialog: () => null,
}));

describe('AppHeader Message Center integration', () => {
  beforeEach(() => {
    roles = ['exhibitor'];
    useNotificationStore.setState({ isCenterOpen: false });
  });

  it('opens the global Message Center for exhibitor-only users', async () => {
    const { user } = render(<AppHeader />);
    await user.click(screen.getByRole('button', { name: /message center/i }));
    expect(useNotificationStore.getState().isCenterOpen).toBe(true);
  });

  it('opens the same global Message Center for secretary users', async () => {
    roles = ['secretary'];
    const { user } = render(<AppHeader />);
    await user.click(screen.getByRole('button', { name: /message center/i }));
    expect(useNotificationStore.getState().isCenterOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run the AppHeader integration test**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/components/layout/AppHeader-message-center.test.tsx
```

Expected: PASS after Task 2.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/test/components/layout/AppHeader-message-center.test.tsx
git commit -m "test(show): cover message center header entry"
```

---

### Task 6: Final Verification And Tracking Cleanup

**Files:**
- Modify: `OPEN-TODOS.md`
- Modify: `TO-DOS.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/components/panels/__tests__/SlideOverPanel.test.tsx \
  src/components/notifications/__tests__/NotificationBell.test.tsx \
  src/components/notifications/__tests__/MessageCenterPanel.test.tsx \
  src/components/notifications/__tests__/NotificationCenter.test.tsx \
  src/hooks/__tests__/useMessageSubscription.test.tsx \
  src/test/components/layout/AppHeader-message-center.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck if focused tests pass**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If it hangs for more than 60 seconds without useful output, stop and report the hang per project instructions.

- [ ] **Step 3: Update tracking docs**

In `OPEN-TODOS.md`, replace the unchecked Message Center todo with:

```markdown
- [x] ~~**Make the bell the global Message Center**~~ — Resolved in this branch. The top-bar bell now opens a left-side Message Center slide-out for every role. The center is ordered Notifications, Announcements, Messages; unread badge counts all three sources; and message rows route to `/messages/:showId` for exhibitors and `/secretary/messages?showId=:showId` for staff.
```

In `TO-DOS.md`, append a `RESOLVED` note under `Bell should be the global Message Center` describing:

```markdown
**Resolved:** The top-bar bell now opens a left-side Message Center slide-out for every role. The center is ordered Notifications, Announcements, Messages; unread badge counts all three sources; message rows route to `/messages/:showId` for exhibitors and `/secretary/messages?showId=:showId` for staff.
```

- [ ] **Step 4: Commit tracking updates**

```bash
git add OPEN-TODOS.md TO-DOS.md
git commit -m "docs: mark message center todo resolved"
```

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
```

Expected: clean working tree.
