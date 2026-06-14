# NotificationCenter + ToastContainer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two remaining Phase 6 UI components — a slide-out notification inbox (NotificationCenter) and a floating toast container (ToastContainer) — completing the exhibitor notification system.

**Architecture:** Both components read from the existing `notificationStore` (Zustand). ToastContainer gets its own lightweight `useToastStore` for ephemeral toast state. `useNotificationDelivery` is updated to push toasts to the new store instead of Sonner. NotificationBell gets a "View all" link that opens the center.

**Tech Stack:** React, Zustand, Tailwind CSS, Lucide icons, `@myk9/notifications` types

**Spec:** `docs/superpowers/specs/2026-03-10-notification-center-toasts-design.md`

---

## File Structure

| File                                                                               | Action | Responsibility                                                 |
| ---------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `packages/notifications/src/types.ts`                                              | Modify | Add `actionUrl?: string` to `NotificationPayload`              |
| `apps/myk9show/src/store/notificationStore.ts`                                     | Modify | Add `markRead`, `dismissAlert`, `isCenterOpen`, bump max to 50 |
| `apps/myk9show/src/store/toastStore.ts`                                            | Create | Ephemeral toast state: `addToast`, `dismissToast`, max 3       |
| `apps/myk9show/src/components/notifications/NotificationCenter.tsx`                | Create | Slide-out inbox panel                                          |
| `apps/myk9show/src/components/notifications/ToastContainer.tsx`                    | Create | Fixed-position floating toasts                                 |
| `apps/myk9show/src/components/notifications/NotificationBell.tsx`                  | Modify | Add "View all" link → opens center                             |
| `apps/myk9show/src/hooks/useNotificationDelivery.ts`                               | Modify | Replace Sonner call with `useToastStore.addToast`              |
| `apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx` | Create | Tests                                                          |
| `apps/myk9show/src/components/notifications/__tests__/ToastContainer.test.tsx`     | Create | Tests                                                          |
| `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`   | Modify | Add "View all" test                                            |

---

## Chunk 1: Store Layer + Type Update

### Task 1: Add `actionUrl` to NotificationPayload

**Files:**

- Modify: `packages/notifications/src/types.ts`

- [ ] **Step 1: Add optional actionUrl field**

In `packages/notifications/src/types.ts`, add `actionUrl` to `NotificationPayload`:

```typescript
export interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  data?: Record<string, unknown>;
  actionUrl?: string;
  timestamp: number;
}
```

- [ ] **Step 2: Run typecheck to ensure no breakage**

Run: `pnpm typecheck`
Expected: PASS (field is optional, no consumers break)

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/types.ts
git commit -m "feat(notifications): add actionUrl to NotificationPayload"
```

### Task 2: Extend notificationStore

**Files:**

- Modify: `apps/myk9show/src/store/notificationStore.ts`
- Modify: `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`

- [ ] **Step 1: Write failing tests for new store actions**

**IMPORTANT:** The existing file `apps/myk9show/src/store/__tests__/notificationStore.test.ts` already has 8 tests. APPEND the new tests to the existing file — do NOT replace it. Also update the existing `beforeEach` to include `isCenterOpen: false` and `unreadCount: 0`, and update the existing "limits recent alerts to 10" test to assert 50 instead.

Add the following tests inside the existing `describe('notificationStore')` block:

```typescript
it('limits recent alerts to 50', () => {
  for (let i = 0; i < 55; i++) {
    useNotificationStore.getState().addAlert(makePayload(`id-${i}`));
  }
  expect(useNotificationStore.getState().recentAlerts).toHaveLength(50);
  expect(useNotificationStore.getState().recentAlerts[0].payload.id).toBe('id-54');
});

it('markRead marks a single alert as read and recomputes unreadCount', () => {
  useNotificationStore.getState().addAlert(makePayload('1'));
  useNotificationStore.getState().addAlert(makePayload('2'));
  expect(useNotificationStore.getState().unreadCount).toBe(2);

  useNotificationStore.getState().markRead('1');

  const state = useNotificationStore.getState();
  const alert1 = state.recentAlerts.find(a => a.payload.id === '1');
  expect(alert1?.read).toBe(true);
  expect(state.unreadCount).toBe(1);
});

it('markRead is a no-op for unknown ids', () => {
  useNotificationStore.getState().addAlert(makePayload('1'));
  useNotificationStore.getState().markRead('unknown');
  expect(useNotificationStore.getState().unreadCount).toBe(1);
});

it('dismissAlert removes an alert from the list', () => {
  useNotificationStore.getState().addAlert(makePayload('1'));
  useNotificationStore.getState().addAlert(makePayload('2'));

  useNotificationStore.getState().dismissAlert('1');

  const state = useNotificationStore.getState();
  expect(state.recentAlerts).toHaveLength(1);
  expect(state.recentAlerts[0].payload.id).toBe('2');
});

it('dismissAlert recomputes unreadCount', () => {
  useNotificationStore.getState().addAlert(makePayload('1'));
  useNotificationStore.getState().addAlert(makePayload('2'));
  useNotificationStore.getState().markRead('1');
  expect(useNotificationStore.getState().unreadCount).toBe(1);

  useNotificationStore.getState().dismissAlert('2');
  expect(useNotificationStore.getState().unreadCount).toBe(0);
});

it('openCenter / closeCenter toggles isCenterOpen', () => {
  expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  useNotificationStore.getState().openCenter();
  expect(useNotificationStore.getState().isCenterOpen).toBe(true);
  useNotificationStore.getState().closeCenter();
  expect(useNotificationStore.getState().isCenterOpen).toBe(false);
});
```

Also update the existing test: change `it('limits recent alerts to 10'` → delete it (replaced by the new "limits recent alerts to 50" test above).

Update existing `beforeEach` to include `isCenterOpen: false` and `unreadCount: 0`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/store/__tests__/notificationStore.test.ts`
Expected: FAIL — `markRead`, `dismissAlert`, `openCenter`, `closeCenter`, `isCenterOpen` don't exist

- [ ] **Step 3: Implement store changes**

Update `apps/myk9show/src/store/notificationStore.ts`:

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { NotificationPayload, NotificationPreferences } from '@myk9/notifications';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

export interface AlertEntry {
  payload: NotificationPayload;
  read: boolean;
}

interface NotificationState {
  preferences: NotificationPreferences;
  permissionStatus: NotificationPermission;
  isInRing: boolean;
  recentAlerts: AlertEntry[];
  unreadCount: number;
  isCenterOpen: boolean;

  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  requestPermission: () => Promise<void>;
  setInRing: (value: boolean) => void;
  addAlert: (payload: NotificationPayload) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissAlert: (id: string) => void;
  openCenter: () => void;
  closeCenter: () => void;
}

const MAX_RECENT_ALERTS = 50;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    set => ({
      preferences: { ...DEFAULT_PREFERENCES },
      permissionStatus: 'default' as NotificationPermission,
      isInRing: false,
      recentAlerts: [],
      unreadCount: 0,
      isCenterOpen: false,

      updatePreferences: prefs =>
        set(state => {
          const updated = { ...state.preferences, ...prefs };
          if ('leadDogs' in prefs) {
            updated.leadDogs = clamp(updated.leadDogs, 1, 5);
          }
          return { preferences: updated };
        }),

      requestPermission: async () => {
        if (typeof Notification === 'undefined') {
          set({ permissionStatus: 'denied' });
          return;
        }
        if (Notification.permission !== 'default') {
          set({ permissionStatus: Notification.permission });
          return;
        }
        const result = await Notification.requestPermission();
        set({ permissionStatus: result });
      },

      setInRing: value => set({ isInRing: value }),

      addAlert: payload =>
        set(state => {
          const entry: AlertEntry = { payload, read: false };
          const updated = [entry, ...state.recentAlerts].slice(0, MAX_RECENT_ALERTS);
          return {
            recentAlerts: updated,
            unreadCount: updated.filter(a => !a.read).length,
          };
        }),

      markRead: id =>
        set(state => {
          const updated = state.recentAlerts.map(a =>
            a.payload.id === id ? { ...a, read: true } : a
          );
          return {
            recentAlerts: updated,
            unreadCount: updated.filter(a => !a.read).length,
          };
        }),

      markAllRead: () =>
        set(state => ({
          recentAlerts: state.recentAlerts.map(a => ({ ...a, read: true })),
          unreadCount: 0,
        })),

      dismissAlert: id =>
        set(state => {
          const updated = state.recentAlerts.filter(a => a.payload.id !== id);
          return {
            recentAlerts: updated,
            unreadCount: updated.filter(a => !a.read).length,
          };
        }),

      openCenter: () => set({ isCenterOpen: true }),
      closeCenter: () => set({ isCenterOpen: false }),
    }),
    {
      name: 'myk9-notification-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        preferences: state.preferences,
      }),
    }
  )
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/store/__tests__/notificationStore.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Run existing NotificationBell tests to check for regressions**

Run: `cd apps/myk9show && pnpm test -- --run src/components/notifications/__tests__/NotificationBell.test.tsx`
Expected: PASS — existing tests should still work (we only added fields, didn't change existing ones). If any fail due to missing `isCenterOpen` in `setState`, update the `beforeEach` in that test file to include `isCenterOpen: false`.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/store/notificationStore.ts apps/myk9show/src/store/__tests__/notificationStore.test.ts
git commit -m "feat(notifications): extend store with markRead, dismissAlert, center visibility"
```

### Task 3: Create toastStore

**Files:**

- Create: `apps/myk9show/src/store/toastStore.ts`
- Create: `apps/myk9show/src/store/__tests__/toastStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/store/__tests__/toastStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useToastStore } from '../toastStore';
import type { NotificationPayload } from '@myk9/notifications';

function makePayload(
  id: string,
  priority: NotificationPayload['priority'] = 'normal'
): NotificationPayload {
  return {
    id,
    type: 'your_turn',
    title: `Alert ${id}`,
    body: `Body ${id}`,
    priority,
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toastStore', () => {
  it('addToast adds a toast', () => {
    useToastStore.getState().addToast(makePayload('1'));
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].payload.id).toBe('1');
  });

  it('limits to 3 visible toasts (oldest removed first)', () => {
    useToastStore.getState().addToast(makePayload('1'));
    useToastStore.getState().addToast(makePayload('2'));
    useToastStore.getState().addToast(makePayload('3'));
    useToastStore.getState().addToast(makePayload('4'));

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(3);
    expect(toasts.map(t => t.payload.id)).toEqual(['2', '3', '4']);
  });

  it('dismissToast removes a toast by id', () => {
    useToastStore.getState().addToast(makePayload('1'));
    useToastStore.getState().addToast(makePayload('2'));

    useToastStore.getState().dismissToast('1');

    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].payload.id).toBe('2');
  });

  it('does not add duplicate toast ids', () => {
    useToastStore.getState().addToast(makePayload('1'));
    useToastStore.getState().addToast(makePayload('1'));

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/store/__tests__/toastStore.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement toastStore**

Create `apps/myk9show/src/store/toastStore.ts`:

```typescript
import { create } from 'zustand';
import type { NotificationPayload } from '@myk9/notifications';

export interface ToastEntry {
  payload: NotificationPayload;
  createdAt: number;
}

interface ToastState {
  toasts: ToastEntry[];
  addToast: (payload: NotificationPayload) => void;
  dismissToast: (id: string) => void;
}

const MAX_VISIBLE_TOASTS = 3;

export const useToastStore = create<ToastState>()(set => ({
  toasts: [],

  addToast: payload =>
    set(state => {
      // Deduplicate by id
      if (state.toasts.some(t => t.payload.id === payload.id)) return state;

      const entry: ToastEntry = { payload, createdAt: Date.now() };
      const updated = [...state.toasts, entry];

      // Keep only the newest MAX_VISIBLE_TOASTS
      return { toasts: updated.slice(-MAX_VISIBLE_TOASTS) };
    }),

  dismissToast: id =>
    set(state => ({
      toasts: state.toasts.filter(t => t.payload.id !== id),
    })),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/store/__tests__/toastStore.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/store/toastStore.ts apps/myk9show/src/store/__tests__/toastStore.test.ts
git commit -m "feat(notifications): add toastStore for ephemeral toast state"
```

---

## Chunk 2: ToastContainer Component

### Task 4: Build ToastContainer

**Files:**

- Create: `apps/myk9show/src/components/notifications/ToastContainer.tsx`
- Create: `apps/myk9show/src/components/notifications/__tests__/ToastContainer.test.tsx`

- [ ] **Step 1: Write tests**

Create `apps/myk9show/src/components/notifications/__tests__/ToastContainer.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastContainer } from '../ToastContainer';
import { useToastStore } from '@/store/toastStore';
import type { NotificationPayload } from '@myk9/notifications';

function makePayload(
  id: string,
  priority: NotificationPayload['priority'] = 'normal',
  type: NotificationPayload['type'] = 'your_turn'
): NotificationPayload {
  return { id, type, title: `Alert ${id}`, body: `Body ${id}`, priority, timestamp: Date.now() };
}

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastContainer', () => {
  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders toast with title and body', () => {
    useToastStore.getState().addToast(makePayload('1'));
    render(<ToastContainer />);

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
    expect(screen.getByText('Body 1')).toBeInTheDocument();
  });

  it('dismisses toast when close button clicked', () => {
    useToastStore.getState().addToast(makePayload('1'));
    render(<ToastContainer />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses non-urgent toast after 8 seconds', () => {
    useToastStore.getState().addToast(makePayload('1', 'normal'));
    render(<ToastContainer />);

    expect(screen.getByText('Alert 1')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(8100); });

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does NOT auto-dismiss urgent toasts', () => {
    useToastStore.getState().addToast(makePayload('1', 'urgent'));
    render(<ToastContainer />);

    act(() => { vi.advanceTimersByTime(10000); });

    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(screen.getByText('Alert 1')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    useToastStore.getState().addToast(makePayload('1'));
    useToastStore.getState().addToast(makePayload('2'));
    render(<ToastContainer />);

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
    expect(screen.getByText('Alert 2')).toBeInTheDocument();
  });

  it('shows correct icon for announcement type', () => {
    useToastStore.getState().addToast(makePayload('1', 'normal', 'announcement'));
    render(<ToastContainer />);

    expect(screen.getByLabelText(/announcement/i)).toBeInTheDocument();
  });

  it('shows correct icon for dog alert types', () => {
    useToastStore.getState().addToast(makePayload('1', 'normal', 'your_turn'));
    render(<ToastContainer />);

    expect(screen.getByLabelText(/dog alert/i)).toBeInTheDocument();
  });

  it('pauses auto-dismiss on hover and resumes on mouse leave', () => {
    useToastStore.getState().addToast(makePayload('1', 'normal'));
    render(<ToastContainer />);

    const toast = screen.getByText('Alert 1').closest('[role="status"]')!;

    // Advance 4s, then hover
    act(() => { vi.advanceTimersByTime(4000); });
    fireEvent.mouseEnter(toast);

    // Advance another 6s while hovered — should NOT dismiss
    act(() => { vi.advanceTimersByTime(6000); });
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Mouse leave — remaining ~4s timer restarts
    fireEvent.mouseLeave(toast);
    act(() => { vi.advanceTimersByTime(4100); });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/components/notifications/__tests__/ToastContainer.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ToastContainer**

Create `apps/myk9show/src/components/notifications/ToastContainer.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Dog, Megaphone } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';
import type { ToastEntry } from '@/store/toastStore';
import type { NotificationPriority, NotificationType } from '@myk9/notifications';
import { formatRelativeTime } from '@/lib/timeUtils';

const AUTO_DISMISS_MS = 8000;
const EXIT_ANIMATION_MS = 300; // [ADDED] exit animation duration

const PRIORITY_BORDER: Record<NotificationPriority, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-amber-500',
  normal: 'border-l-blue-500',
};

function isAnnouncementType(type: NotificationType): boolean {
  return type === 'announcement';
}

function ToastIcon({ type }: { type: NotificationType }) {
  if (isAnnouncementType(type)) {
    return <Megaphone className="h-4 w-4 text-purple-400" aria-label="Announcement" />;
  }
  return <Dog className="h-4 w-4 text-orange-400" aria-label="Dog alert" />;
}

function Toast({ entry, onDismiss }: { entry: ToastEntry; onDismiss: (id: string) => void }) {
  const { payload } = entry;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startTimeRef = useRef(Date.now());
  const [exiting, setExiting] = useState(false); // [ADDED] exit animation state

  // [ADDED] Animate out before removing from store
  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(payload.id), EXIT_ANIMATION_MS);
  }, [onDismiss, payload.id]);

  // Auto-dismiss for non-urgent
  useEffect(() => {
    if (payload.priority === 'urgent') return;

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, remainingRef.current);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [payload.priority, dismiss]);

  const handleMouseEnter = () => {
    if (payload.priority === 'urgent') return;
    pausedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    remainingRef.current -= Date.now() - startTimeRef.current;
  };

  const handleMouseLeave = () => {
    if (payload.priority === 'urgent' || !pausedRef.current) return;
    pausedRef.current = false;
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, Math.max(remainingRef.current, 500));
  };

  return (
    <div
      role="status"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-lg border border-border/50 border-l-[3px] bg-popover shadow-lg transition-all duration-300 ${
        exiting ? 'translate-x-full opacity-0' : 'animate-in slide-in-from-right-full'
      } ${PRIORITY_BORDER[payload.priority]}`}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 flex-shrink-0">
          <ToastIcon type={payload.type} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{payload.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{payload.body}</p>
          <div className="mt-2 flex items-center gap-2">
            {payload.actionUrl && (
              <a
                href={payload.actionUrl}
                onClick={dismiss}
                className="text-xs font-medium text-orange-500 hover:text-orange-400"
              >
                View →
              </a>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(new Date(payload.timestamp))}
            </span>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss notification"
          className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {payload.priority === 'urgent' && (
        <p className="pb-1.5 text-center text-[9px] font-medium text-red-400">
          URGENT — will not auto-dismiss
        </p>
      )}

      {payload.priority !== 'urgent' && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-muted">
          <div
            className={`h-full ${payload.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500'}`}
            style={{
              animation: `toast-progress ${AUTO_DISMISS_MS}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  const dismissToast = useToastStore(s => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div aria-live="polite" className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2 sm:w-96">
        {toasts.map(entry => (
          <Toast key={entry.payload.id} entry={entry} onDismiss={dismissToast} />
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/components/notifications/__tests__/ToastContainer.test.tsx`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/notifications/ToastContainer.tsx apps/myk9show/src/components/notifications/__tests__/ToastContainer.test.tsx
git commit -m "feat(notifications): add ToastContainer with auto-dismiss and priority styling"
```

---

## Chunk 3: NotificationCenter Component

### Task 5: Build NotificationCenter

**Files:**

- Create: `apps/myk9show/src/components/notifications/NotificationCenter.tsx`
- Create: `apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx`

- [ ] **Step 1: Write tests**

Create `apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationCenter } from '../NotificationCenter';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

function makePayload(
  id: string,
  type: NotificationPayload['type'] = 'your_turn',
  priority: NotificationPayload['priority'] = 'normal'
): NotificationPayload {
  return { id, type, title: `Alert ${id}`, body: `Body ${id}`, priority, timestamp: Date.now() };
}

function renderCenter() {
  return render(
    <MemoryRouter>
      <NotificationCenter />
    </MemoryRouter>
  );
}

beforeEach(() => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: true,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('NotificationCenter', () => {
  it('renders nothing when isCenterOpen is false', () => {
    useNotificationStore.setState({ isCenterOpen: false });
    const { container } = renderCenter();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders panel when isCenterOpen is true', () => {
    renderCenter();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', () => {
    renderCenter();
    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });

  it('renders notification items', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    renderCenter();

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
    expect(screen.getByText('Alert 2')).toBeInTheDocument();
  });

  it('shows unread count in header', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    renderCenter();

    expect(screen.getByText('2 unread')).toBeInTheDocument();
  });

  it('closes when close button clicked', () => {
    renderCenter();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });

  it('closes when backdrop clicked', () => {
    renderCenter();
    fireEvent.click(screen.getByTestId('notification-backdrop'));
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });

  it('closes on Escape key', () => {
    renderCenter();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useNotificationStore.getState().isCenterOpen).toBe(false);
  });

  it('marks all read when button clicked', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    renderCenter();

    fireEvent.click(screen.getByText(/mark all read/i));
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('marks single item read when View clicked', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    renderCenter();

    const viewBtn = screen.getByRole('link', { name: /view/i });
    fireEvent.click(viewBtn);

    expect(useNotificationStore.getState().recentAlerts[0].read).toBe(true);
  });

  it('filters by Dogs tab', () => {
    useNotificationStore.getState().addAlert(makePayload('1', 'your_turn'));
    useNotificationStore.getState().addAlert(makePayload('2', 'announcement'));
    renderCenter();

    fireEvent.click(screen.getByRole('tab', { name: /dogs/i }));

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
    expect(screen.queryByText('Alert 2')).not.toBeInTheDocument();
  });

  it('filters by Announcements tab', () => {
    useNotificationStore.getState().addAlert(makePayload('1', 'your_turn'));
    useNotificationStore.getState().addAlert(makePayload('2', 'announcement'));
    renderCenter();

    fireEvent.click(screen.getByRole('tab', { name: /announcements/i }));

    expect(screen.queryByText('Alert 1')).not.toBeInTheDocument();
    expect(screen.getByText('Alert 2')).toBeInTheDocument();
  });

  it('filters by unread only toggle', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));
    useNotificationStore.getState().markRead('1');
    renderCenter();

    fireEvent.click(screen.getByRole('checkbox', { name: /unread only/i }));

    expect(screen.queryByText('Alert 1')).not.toBeInTheDocument();
    expect(screen.getByText('Alert 2')).toBeInTheDocument();
  });

  it('dismisses individual notification', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    renderCenter();

    fireEvent.click(screen.getByRole('button', { name: /dismiss.*1/i }));
    expect(useNotificationStore.getState().recentAlerts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/components/notifications/__tests__/NotificationCenter.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement NotificationCenter**

Create `apps/myk9show/src/components/notifications/NotificationCenter.tsx`:

```tsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Dog, Megaphone, AlertCircle, AlertTriangle, Inbox } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import type { AlertEntry } from '@/store/notificationStore';
import type { NotificationType, NotificationPriority } from '@myk9/notifications';
import { formatRelativeTime } from '@/lib/timeUtils';

type FilterTab = 'all' | 'dogs' | 'announcements';

const DOG_TYPES: NotificationType[] = [
  'your_turn',
  'check_in_reminder',
  'results_posted',
  'class_starting',
];

const PRIORITY_BORDER: Record<NotificationPriority, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-amber-500',
  normal: 'border-l-blue-500',
};

function PriorityIcon({
  priority,
  type,
}: {
  priority: NotificationPriority;
  type: NotificationType;
}) {
  if (type === 'announcement') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
        <Megaphone className="h-4 w-4 text-purple-400" />
      </div>
    );
  }
  if (priority === 'urgent') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/15">
        <AlertCircle className="h-4 w-4 text-red-400" />
      </div>
    );
  }
  if (priority === 'high') {
    return (
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
      <Inbox className="h-4 w-4 text-blue-400" />
    </div>
  );
}

function NotificationItem({
  entry,
  onView,
  onDismiss,
}: {
  entry: AlertEntry;
  onView: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { payload, read } = entry;

  return (
    <div
      className={`border-b border-border/50 border-l-[3px] p-3.5 transition-opacity ${PRIORITY_BORDER[payload.priority]} ${
        read ? 'opacity-50' : 'bg-muted/5'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <PriorityIcon priority={payload.priority} type={payload.type} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">{payload.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{payload.body}</p>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/60">
              {formatRelativeTime(new Date(payload.timestamp))}
            </span>
            <div className="flex items-center gap-2">
              {!read && payload.actionUrl && (
                <a
                  href={payload.actionUrl}
                  onClick={() => onView(payload.id)}
                  className="rounded bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-500 hover:text-orange-400"
                  role="link"
                >
                  View →
                </a>
              )}
              <button
                onClick={() => onDismiss(payload.id)}
                aria-label={`Dismiss notification ${payload.id}`}
                className="rounded p-0.5 text-muted-foreground/40 hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const isCenterOpen = useNotificationStore(s => s.isCenterOpen);
  const recentAlerts = useNotificationStore(s => s.recentAlerts);
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const closeCenter = useNotificationStore(s => s.closeCenter);
  const markAllRead = useNotificationStore(s => s.markAllRead);
  const markRead = useNotificationStore(s => s.markRead);
  const dismissAlert = useNotificationStore(s => s.dismissAlert);
  const panelRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);

  // [ADDED] Body scroll lock — prevent background scrolling on mobile
  useEffect(() => {
    if (!isCenterOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isCenterOpen]);

  // Close on Escape + focus trap
  useEffect(() => {
    if (!isCenterOpen) return;

    // Focus the panel on open
    panelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeCenter();
        return;
      }

      // Focus trap: cycle Tab through focusable elements inside panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCenterOpen, closeCenter]);

  const filteredAlerts = useMemo(() => {
    let filtered = recentAlerts;

    if (activeTab === 'dogs') {
      filtered = filtered.filter(a => DOG_TYPES.includes(a.payload.type));
    } else if (activeTab === 'announcements') {
      filtered = filtered.filter(a => a.payload.type === 'announcement');
    }

    if (unreadOnly) {
      filtered = filtered.filter(a => !a.read);
    }

    return filtered;
  }, [recentAlerts, activeTab, unreadOnly]);

  const handleView = (id: string) => {
    markRead(id);
    closeCenter();
  };

  if (!isCenterOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="notification-backdrop"
        className="fixed inset-0 z-40 bg-black/40"
        onClick={closeCenter}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications"
        aria-modal="true"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border/50 bg-popover shadow-2xl animate-in slide-in-from-right duration-300 sm:w-[400px] outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 p-4">
          <div>
            <h2 className="text-base font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{unreadCount} unread</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] font-medium text-orange-500 hover:text-orange-400"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={closeCenter}
              aria-label="Close notifications"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center border-b border-border/50 px-4" role="tablist">
          {[
            { key: 'all' as const, label: 'All' },
            { key: 'dogs' as const, label: 'Dogs', icon: Dog },
            { key: 'announcements' as const, label: 'Announcements', icon: Megaphone },
          ].map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-label={tab.label}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-orange-500 text-orange-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon && <tab.icon className="h-3 w-3" />}
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={e => setUnreadOnly(e.target.checked)}
              aria-label="Unread only"
              className="h-3 w-3 rounded border-border"
            />
            Unread only
          </label>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <Inbox className="mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                {unreadOnly ? 'No unread notifications' : "You're all caught up"}
              </p>
            </div>
          ) : (
            filteredAlerts.map(entry => (
              <NotificationItem
                key={entry.payload.id}
                entry={entry}
                onView={handleView}
                onDismiss={dismissAlert}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/components/notifications/__tests__/NotificationCenter.test.tsx`
Expected: PASS (all 14 tests)

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/notifications/NotificationCenter.tsx apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx
git commit -m "feat(notifications): add NotificationCenter slide-out inbox with filtering"
```

---

## Chunk 4: Wiring + Integration

### Task 6: Update NotificationBell to open center

**Files:**

- Modify: `apps/myk9show/src/components/notifications/NotificationBell.tsx`
- Modify: `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`

- [ ] **Step 1: Add test for "View all" link**

Add to `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`:

```typescript
it('opens NotificationCenter when "View all" clicked', () => {
  useNotificationStore.getState().addAlert(makePayload('1'));

  render(<NotificationBell />);
  fireEvent.click(screen.getByRole('button', { name: /notification/i }));
  fireEvent.click(screen.getByText(/view all/i));

  expect(useNotificationStore.getState().isCenterOpen).toBe(true);
});
```

Also update the `beforeEach` to include `isCenterOpen: false`:

```typescript
beforeEach(() => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: false,
    permissionStatus: 'default' as NotificationPermission,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm test -- --run src/components/notifications/__tests__/NotificationBell.test.tsx`
Expected: FAIL on the new test — "View all" text not found

- [ ] **Step 3: Update NotificationBell**

Replace `apps/myk9show/src/components/notifications/NotificationBell.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { formatRelativeTime } from '@/lib/timeUtils';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recentAlerts = useNotificationStore(s => s.recentAlerts);
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const markAllRead = useNotificationStore(s => s.markAllRead);
  const openCenter = useNotificationStore(s => s.openCenter);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleViewAll = () => {
    setIsOpen(false);
    openCenter();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        aria-label="Notifications"
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-md p-2 hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="font-semibold">Notifications</span>
            {recentAlerts.length > 0 && (
              <button
                onClick={handleViewAll}
                className="text-xs font-medium text-orange-500 hover:text-orange-400"
              >
                View all
              </button>
            )}
          </div>
          {recentAlerts.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No notifications</div>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto divide-y">
                {recentAlerts.slice(0, 5).map(({ payload, read }) => (
                  <div key={payload.id} className={`p-3 ${read ? 'opacity-60' : ''}`}>
                    <div className="font-medium text-sm">{payload.title}</div>
                    <div className="text-xs text-muted-foreground">{payload.body}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatRelativeTime(new Date(payload.timestamp))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex border-t">
                <button
                  onClick={() => markAllRead()}
                  className="flex-1 p-2 text-center text-sm text-muted-foreground hover:bg-muted"
                >
                  Mark all read
                </button>
                <button
                  onClick={handleViewAll}
                  className="flex-1 p-2 text-center text-sm font-medium text-orange-500 hover:bg-muted border-l border-border"
                >
                  View all
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/components/notifications/__tests__/NotificationBell.test.tsx`
Expected: PASS (all 7 tests including new one)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/notifications/NotificationBell.tsx apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx
git commit -m "feat(notifications): add View All link to NotificationBell → opens center"
```

### Task 7: Wire useNotificationDelivery to ToastContainer

**Files:**

- Modify: `apps/myk9show/src/hooks/useNotificationDelivery.ts`
- Create: `apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts`

- [ ] **Step 1: Write test for toast delivery**

Create `apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationDelivery } from '../useNotificationDelivery';
import { useNotificationStore } from '@/store/notificationStore';
import { useToastStore } from '@/store/toastStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

// Mock sound/voice modules to avoid Web Audio API in tests
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual<typeof import('@myk9/notifications')>('@myk9/notifications');
  return {
    ...actual,
    playNotificationSound: vi.fn(),
    speak: vi.fn(),
    generateVoiceText: vi.fn(() => null),
  };
});

function makePayload(id: string): NotificationPayload {
  return {
    id,
    type: 'your_turn',
    title: 'Test',
    body: 'Test body',
    priority: 'normal',
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, enabled: true },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: false,
    permissionStatus: 'default' as NotificationPermission,
  });
  useToastStore.setState({ toasts: [] });
});

describe('useNotificationDelivery', () => {
  it('adds toast to toastStore when delivering', () => {
    const { result } = renderHook(() => useNotificationDelivery());
    const payload = makePayload('1');

    act(() => {
      result.current.deliver(payload);
    });

    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].payload.id).toBe('1');
  });

  it('adds alert to notificationStore when delivering', () => {
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(makePayload('1'));
    });

    expect(useNotificationStore.getState().recentAlerts).toHaveLength(1);
  });

  it('suppresses delivery when master toggle is off', () => {
    useNotificationStore.getState().updatePreferences({ enabled: false });
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(makePayload('1'));
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(useNotificationStore.getState().recentAlerts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (current code uses Sonner, not toastStore)**

Run: `cd apps/myk9show && pnpm test -- --run src/hooks/__tests__/useNotificationDelivery.test.ts`
Expected: FAIL — `addToast` not called (current code uses Sonner)

- [ ] **Step 3: Update delivery hook to use toastStore instead of Sonner**

Replace the toast section in `apps/myk9show/src/hooks/useNotificationDelivery.ts`:

```typescript
import { useCallback } from 'react';
import type { NotificationPayload } from '@myk9/notifications';
import {
  shouldSuppress,
  playNotificationSound,
  speak,
  generateVoiceText,
} from '@myk9/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useToastStore } from '@/store/toastStore';

/**
 * Returns a `deliver` function that sends a notification through all enabled channels:
 * toast (custom ToastContainer), sound, voice, vibration, and push (background tab).
 */
export function useNotificationDelivery() {
  const preferences = useNotificationStore(s => s.preferences);
  const isInRing = useNotificationStore(s => s.isInRing);
  const addAlert = useNotificationStore(s => s.addAlert);
  const addToast = useToastStore(s => s.addToast);

  const deliver = useCallback(
    (payload: NotificationPayload) => {
      // Check suppression
      if (shouldSuppress(preferences, { isInRing })) return;

      // Always add to store (for bell dropdown + center)
      addAlert(payload);

      // [EXPANDED] Each channel is wrapped in try/catch so one failure
      // doesn't prevent other channels from delivering.

      // Toast (custom ToastContainer — NOT Sonner; Sonner remains for app-wide CRUD toasts)
      try {
        addToast(payload);
      } catch {
        /* toast failure is non-fatal */
      }

      // Sound
      if (preferences.soundEnabled) {
        try {
          playNotificationSound(payload.priority);
        } catch {
          /* sound failure is non-fatal */
        }
      }

      // Voice
      if (preferences.voiceEnabled) {
        try {
          const voiceText = generateVoiceText(payload);
          if (voiceText) {
            speak(voiceText.text);
          }
        } catch {
          /* voice failure is non-fatal */
        }
      }

      // Vibration
      if (preferences.vibrationEnabled && navigator.vibrate) {
        const pattern = payload.priority === 'urgent' ? [200, 100, 200, 100, 200] : [150];
        navigator.vibrate(pattern);
      }

      // Push is server-triggered (database webhooks → edge function → service worker).
      // No client-side push delivery needed in this hook.
    },
    [preferences, isInRing, addAlert, addToast]
  );

  return { deliver };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run all notification tests to check for regressions**

Run: `cd apps/myk9show && pnpm test -- --run src/components/notifications/__tests__/ src/store/__tests__/notificationStore.test.ts src/store/__tests__/toastStore.test.ts`
Expected: PASS — all tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useNotificationDelivery.ts apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts
git commit -m "feat(notifications): wire delivery hook to ToastContainer instead of Sonner"
```

### Task 8: Mount components in App layout

**Files:**

- Modify: The root layout file that renders `<Toaster />` (Sonner). Find the file that mounts the Sonner `<Toaster>` and add `<ToastContainer />` and `<NotificationCenter />` alongside it.

- [ ] **Step 1: Find the layout mount point**

Search for `<Toaster` in `apps/myk9show/src/` to find where Sonner is mounted. Add the two new components at the same level:

```tsx
import { ToastContainer } from '@/components/notifications/ToastContainer';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

// In the JSX, alongside existing <Toaster />:
<Toaster />
<ToastContainer />
<NotificationCenter />
```

- [ ] **Step 2: Run typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/<layout-file>
git commit -m "feat(notifications): mount ToastContainer and NotificationCenter in app layout"
```

### Task 9: Run full test suite

- [ ] **Step 1: Run all myk9show tests**

Run: `cd apps/myk9show && pnpm test -- --run`
Expected: PASS — 0 failures

- [ ] **Step 2: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Mark Phase 6 complete in TO-DOS.md**

Update the Phase 6 line in `TO-DOS.md` from `- **Phase 6:` to `- [x] **Phase 6:` and append a completion summary.
