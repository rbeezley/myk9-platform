# Exhibitor Notifications Phase 6: Push Subscription Lifecycle

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the push notification pipeline — the only missing piece of the exhibitor notification system.

**Architecture:** The notification system is ~95% built. Stores, hooks, UI, edge functions, service worker, and the `@myk9/notifications` package are all wired. The gap is the push subscription lifecycle: when a user enables push in NotificationSettings, the browser subscription needs to be created and saved to the `push_subscriptions` table in Supabase. This plan fills that gap and adds a UI polish pass.

**Tech Stack:** React, Zustand, `@myk9/notifications` (push.ts), Supabase (direct client), VitePWA, Web Push API

---

## What Already Exists (Do Not Rebuild)

| Layer                                                     | File(s)                                                                                 | Status                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------- |
| Package: types, handlers, sound, voice, push, suppression | `packages/notifications/src/*`                                                          | Built + tested              |
| Stores: notification, toast, announcement                 | `apps/myk9show/src/store/notificationStore.ts`, `toastStore.ts`, `announcementStore.ts` | Built + wired               |
| Alert trigger hook                                        | `apps/myk9show/src/hooks/useShowDayAlerts.ts`                                           | Wired in ExhibitorDashboard |
| Delivery hook                                             | `apps/myk9show/src/hooks/useNotificationDelivery.ts`                                    | Wired via useShowDayAlerts  |
| UI: NotificationBell                                      | `apps/myk9show/src/components/notifications/NotificationBell.tsx`                       | Rendered in AppHeader       |
| UI: NotificationCenter                                    | `apps/myk9show/src/components/notifications/NotificationCenter.tsx`                     | Rendered in main.tsx        |
| UI: NotificationSettings                                  | `apps/myk9show/src/components/notifications/NotificationSettings.tsx`                   | Rendered in PreferencesPage |
| UI: ToastContainer                                        | `apps/myk9show/src/components/notifications/ToastContainer.tsx`                         | Rendered in main.tsx        |
| Service worker                                            | `apps/myk9show/src/sw-custom.ts`                                                        | Push + click handlers       |
| PWA config                                                | `apps/myk9show/vite.config.ts`                                                          | VitePWA injectManifest      |
| Edge fn: send-push-notification                           | `supabase/functions/send-push-notification/index.ts`                                    | Deployed                    |
| Edge fn: push-trigger-class-status                        | `supabase/functions/push-trigger-class-status/index.ts`                                 | Deployed                    |
| Edge fn: push-trigger-scoring                             | `supabase/functions/push-trigger-scoring/index.ts`                                      | Deployed                    |
| Migration: push_subscriptions                             | `supabase/migrations/056_push_subscriptions.sql`                                        | Applied                     |
| Tests                                                     | 6 package + 6 app test files                                                            | Full coverage               |

## What's Missing

1. **Push subscription hook** — `usePushSubscription` to subscribe/unsubscribe browser + save to Supabase
2. **NotificationSettings wiring** — Call the hook when user toggles push
3. **VAPID public key env var** — `VITE_VAPID_PUBLIC_KEY` for client-side subscription
4. **UI polish** — NotificationSettings uses raw HTML checkboxes; align with app design system
5. **Tests for new hook**

---

## Phase 1: Push Subscription Hook

### Task 1: Create `usePushSubscription` hook

**Files:**

- Create: `apps/myk9show/src/hooks/usePushSubscription.ts`
- Test: `apps/myk9show/src/hooks/__tests__/usePushSubscription.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/hooks/__tests__/usePushSubscription.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Must stub env BEFORE importing the hook (it reads env at module scope)
vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'test-vapid-key');

import { usePushSubscription } from '../usePushSubscription';

// Mock @myk9/notifications — spread actual exports to avoid clobbering
vi.mock('@myk9/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/notifications')>()),
  isPushSupported: vi.fn(() => true),
  subscribeToPush: vi.fn(() =>
    Promise.resolve({
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key1', auth: 'auth1' },
    })
  ),
  unsubscribeFromPush: vi.fn(() => Promise.resolve(true)),
  getExistingSubscription: vi.fn(() => Promise.resolve(null)),
}));

// Mock supabase client — chainable .eq() calls
const mockEq = vi.fn().mockReturnThis();
mockEq.mockImplementation(() => ({
  eq: mockEq,
  then: (r: (v: unknown) => void) => r({ error: null }),
}));
const mockUpsert = vi.fn(() => Promise.resolve({ error: null }));
const mockDelete = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ upsert: mockUpsert, delete: mockDelete }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

// Mock auth context
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-123' } }),
}));

// Mock notification store
const mockUpdatePreferences = vi.fn();
const mockRequestPermission = vi.fn();
vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      preferences: { pushEnabled: false },
      permissionStatus: 'default',
      updatePreferences: mockUpdatePreferences,
      requestPermission: mockRequestPermission,
    })
  ),
}));

describe('usePushSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose subscribe and unsubscribe functions', () => {
    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.subscribe).toBeInstanceOf(Function);
    expect(result.current.unsubscribe).toBeInstanceOf(Function);
    expect(result.current.isSupported).toBe(true);
  });

  it('should subscribe and save to Supabase', async () => {
    const { subscribeToPush } = await import('@myk9/notifications');
    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(subscribeToPush).toHaveBeenCalledWith('test-vapid-key');
    expect(mockFrom).toHaveBeenCalledWith('push_subscriptions');
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user-123',
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'key1', auth: 'auth1' },
      },
      { onConflict: 'user_id,endpoint' }
    );
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ pushEnabled: true });
  });

  it('should unsubscribe and delete from Supabase', async () => {
    // Override mock to return existing subscription (otherwise delete is skipped)
    const { unsubscribeFromPush, getExistingSubscription } = await import('@myk9/notifications');
    vi.mocked(getExistingSubscription).mockResolvedValueOnce({
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key1', auth: 'auth1' },
    });

    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(unsubscribeFromPush).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('push_subscriptions');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ pushEnabled: false });
  });

  // [ADDED] Test permission-denied flow
  it('should return reason when permission is denied', async () => {
    // Simulate Notification.permission = 'denied' after request
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'denied' },
      configurable: true,
    });

    const { result } = renderHook(() => usePushSubscription());

    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.subscribe();
    });

    expect(response).toEqual({ ok: false, reason: 'permission-denied' });
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });

  // [ADDED] Test subscribe error handling
  it('should return reason when subscribeToPush throws', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
    });

    const { subscribeToPush } = await import('@myk9/notifications');
    vi.mocked(subscribeToPush).mockRejectedValueOnce(new Error('SW not ready'));

    const { result } = renderHook(() => usePushSubscription());

    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.subscribe();
    });

    expect(response).toEqual({ ok: false, reason: 'subscribe-failed' });
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm vitest run src/hooks/__tests__/usePushSubscription.test.ts`
Expected: FAIL with "Cannot find module '../usePushSubscription'"

- [ ] **Step 3: Write the hook implementation**

```typescript
// apps/myk9show/src/hooks/usePushSubscription.ts
import { useCallback, useMemo } from 'react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
} from '@myk9/notifications';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNotificationStore } from '@/store/notificationStore';

/**
 * Manages the push subscription lifecycle:
 * subscribe (browser + Supabase), unsubscribe, and sync status.
 */
export function usePushSubscription() {
  const { user } = useAuthContext();
  const updatePreferences = useNotificationStore(s => s.updatePreferences);
  const requestPermission = useNotificationStore(s => s.requestPermission);
  const permissionStatus = useNotificationStore(s => s.permissionStatus);

  // Read env inside hook body so tests can stub before import
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const isSupported = useMemo(() => isPushSupported() && !!vapidKey, [vapidKey]);

  // [EXPANDED] subscribe wraps all async calls in try/catch for graceful failure
  const subscribe = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
    if (!user?.id || !vapidKey) return { ok: false, reason: 'not-supported' };

    // Request notification permission if needed
    if (permissionStatus === 'default') {
      await requestPermission();
    }

    // Check permission after request
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

    try {
      // Subscribe in browser
      const subscriptionData = await subscribeToPush(vapidKey);

      // Save to Supabase (upsert on user_id + endpoint)
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: subscriptionData.endpoint,
          keys: subscriptionData.keys,
        },
        { onConflict: 'user_id,endpoint' }
      );

      if (error) {
        console.error('Failed to save push subscription:', error.message);
        return { ok: false, reason: 'save-failed' };
      }

      updatePreferences({ pushEnabled: true });
      return { ok: true };
    } catch (err) {
      console.error('Push subscription failed:', err);
      return { ok: false, reason: 'subscribe-failed' };
    }
  }, [user?.id, vapidKey, permissionStatus, requestPermission, updatePreferences]);

  // [EXPANDED] unsubscribe wraps all async calls in try/catch
  const unsubscribe = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Get current subscription before unsubscribing
      const existing = await getExistingSubscription();

      // Unsubscribe from browser
      await unsubscribeFromPush();

      // Delete from Supabase
      if (existing) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', existing.endpoint);
      }
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }

    // Always update preferences even if cleanup partially fails
    updatePreferences({ pushEnabled: false });
  }, [user?.id, updatePreferences]);

  return { subscribe, unsubscribe, isSupported };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/hooks/__tests__/usePushSubscription.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/usePushSubscription.ts apps/myk9show/src/hooks/__tests__/usePushSubscription.test.ts
git commit -m "feat(notifications): add usePushSubscription hook for browser + Supabase lifecycle"
```

---

## Phase 2: Wire Push Subscription into NotificationSettings

### Task 2: Update NotificationSettings to use the hook

**Files:**

- Modify: `apps/myk9show/src/components/notifications/NotificationSettings.tsx`
- Modify: `apps/myk9show/src/components/notifications/__tests__/NotificationSettings.test.tsx`

- [ ] **Step 1: Read existing test to understand current coverage**

Read: `apps/myk9show/src/components/notifications/__tests__/NotificationSettings.test.tsx`

- [ ] **Step 2: Update NotificationSettings to call usePushSubscription**

Replace the push checkbox's `onChange` handler. Currently it calls `requestPermission()` + `updatePreferences({ pushEnabled })` directly. Change to call `subscribe()` / `unsubscribe()` from the hook.

Key changes to `NotificationSettings.tsx`:

- Import `usePushSubscription`
- Get `{ subscribe, unsubscribe, isSupported }` from the hook
- Replace push checkbox onChange: `checked ? subscribe() : unsubscribe()`
- Disable push checkbox when `!isSupported` (no SW or no VAPID key)
- Show "Not supported on this browser" when `!isSupported`

```typescript
// Add to imports:
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { notifications } from '@/lib/notifications';

// Inside the component, add:
const { subscribe, unsubscribe, isSupported } = usePushSubscription();

// Replace the push checkbox onChange:
// [EXPANDED] Show user feedback on failure via toast
onChange={async e => {
  if (e.target.checked) {
    const result = await subscribe();
    if (!result.ok) {
      if (result.reason === 'permission-denied') {
        notifications.warning('Push notifications blocked. Check browser settings.');
      } else {
        notifications.error('Failed to enable push notifications.');
      }
    }
  } else {
    await unsubscribe();
  }
}}
disabled={!isSupported}

// Add helper text when not supported:
{!isSupported && (
  <p className="text-xs text-muted-foreground">Not supported on this browser</p>
)}
```

- [ ] **Step 3: Update existing test to mock usePushSubscription**

Add mock for the new hook and verify subscribe/unsubscribe are called when checkbox is toggled.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm vitest run src/components/notifications/__tests__/NotificationSettings.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/notifications/NotificationSettings.tsx apps/myk9show/src/components/notifications/__tests__/NotificationSettings.test.tsx
git commit -m "feat(notifications): wire push subscription lifecycle into NotificationSettings"
```

---

## Phase 3: VAPID Key Configuration

### Task 3: Generate VAPID keys and configure environment

**Files:**

- Modify: `apps/myk9show/.env.local` (local dev)
- Document: steps for Vercel + Supabase env config

- [ ] **Step 1: Generate VAPID key pair**

Run: `npx web-push generate-vapid-keys`

This outputs a public key and private key. Save both.

- [ ] **Step 2: Add client env var locally**

Add to `apps/myk9show/.env.local`:

```
VITE_VAPID_PUBLIC_KEY=<generated-public-key>
```

- [ ] **Step 3: Document Supabase + Vercel configuration**

Create a short checklist file or add to existing docs:

**Supabase secrets** (via Dashboard → Settings → Edge Functions → Secrets):

- `VAPID_PUBLIC_KEY` = same public key
- `VAPID_PRIVATE_KEY` = generated private key
- `VAPID_SUBJECT` = `mailto:support@myk9show.com`

**Vercel env vars** (via Dashboard → Settings → Environment Variables):

- `VITE_VAPID_PUBLIC_KEY` = same public key

- [ ] **Step 4: Deploy edge functions**

```bash
supabase functions deploy send-push-notification --no-verify-jwt
supabase functions deploy push-trigger-class-status --no-verify-jwt
supabase functions deploy push-trigger-scoring --no-verify-jwt
```

- [ ] **Step 5: Update `.env.example` and commit**

Add `VITE_VAPID_PUBLIC_KEY=` (empty value) to `apps/myk9show/.env.example` so other developers know the variable exists. Do NOT commit actual keys.

```bash
git add apps/myk9show/.env.example
git commit -m "docs(notifications): add VAPID key configuration steps and env template"
```

---

## Phase 4: UI Polish — NotificationSettings

### Task 4: Upgrade NotificationSettings to use app design system

**Files:**

- Modify: `apps/myk9show/src/components/notifications/NotificationSettings.tsx`

Currently uses raw `<input type="checkbox">` and `<input type="range">`. Upgrade to match the app's Tailwind design system with proper toggle switches, styled slider, and section cards.

- [ ] **Step 1: Audit existing design patterns**

Read the show settings page for reference styling:

- `apps/myk9show/src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx`

Look for toggle switch patterns, card layouts, and section headers used in the app.

- [ ] **Step 2: Redesign NotificationSettings with consistent styling**

Key changes:

- Replace checkboxes with toggle switch styling (consistent with settings pages)
- Add section cards with headers (General, Channels, Push)
- Add descriptive text under each toggle
- Style the lead dogs slider with markers
- Add a "Test" button per channel (sound test, voice test)
- Keep it under 150 lines — extract sub-components if needed

- [ ] **Step 3: Update tests if selectors changed**

- [ ] **Step 4: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/notifications/__tests__/NotificationSettings.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/notifications/NotificationSettings.tsx
git commit -m "style(notifications): polish NotificationSettings to match app design system"
```

---

## Phase 5: Database Webhook Triggers

### Task 5: Create Supabase database webhooks for push triggers

The edge functions `push-trigger-class-status` and `push-trigger-scoring` exist but need database webhooks configured in Supabase to call them.

- [ ] **Step 1: Configure webhooks via Supabase Dashboard**

Supabase database webhooks are configured via the Dashboard UI, not SQL migrations. Follow these steps:

1. Dashboard → Database → Webhooks → Create
2. **Class starting webhook:**
   - Table: `classes`
   - Events: UPDATE
   - Condition: `status = 'in_progress' AND old_status != 'in_progress'`
   - Function: `push-trigger-class-status`
3. **Scoring complete webhook:**
   - Table: `entries`
   - Events: UPDATE
   - Condition: `scoring_completed_at IS NOT NULL AND old_scoring_completed_at IS NULL`
   - Function: `push-trigger-scoring`

- [ ] **Step 2: Document webhook configuration in docs**

- [ ] **Step 3: Commit documentation**

```bash
git commit -m "docs(notifications): add database webhook configuration steps for push triggers"
```

---

## Phase 6: Verification & Phase Review

### Task 6: Full verification pass

- [ ] **Step 1: Run full test suite**

```bash
cd apps/myk9show && pnpm test
```

Verify all notification-related tests pass:

- `hooks/__tests__/usePushSubscription.test.ts`
- `hooks/__tests__/useShowDayAlerts.test.ts`
- `hooks/__tests__/useNotificationDelivery.test.ts`
- `store/__tests__/notificationStore.test.ts`
- `components/notifications/__tests__/NotificationBell.test.tsx`
- `components/notifications/__tests__/NotificationCenter.test.tsx`
- `components/notifications/__tests__/NotificationSettings.test.tsx`
- `components/notifications/__tests__/ToastContainer.test.tsx`

- [ ] **Step 2: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Manual testing checklist (local dev)**

1. Open Preferences → Notifications tab
2. Toggle "Enable notifications" on
3. Adjust "Dogs ahead" slider — verify it updates
4. Toggle Sound on → click "Test notification" → verify sound plays
5. Toggle Push on → verify browser permission prompt appears
6. If granted → verify subscription saved to `push_subscriptions` table
7. Toggle Push off → verify subscription removed from table
8. If browser doesn't support push → verify "Not supported" message shows

- [ ] **Step 4: Phase review**

Run `/phase-review` on all commits from this plan.

---

## Summary

| Phase | What                           | Estimated Steps |
| ----- | ------------------------------ | --------------- |
| 1     | Push subscription hook + tests | 5               |
| 2     | Wire into NotificationSettings | 5               |
| 3     | VAPID key configuration        | 5               |
| 4     | UI polish                      | 5               |
| 5     | Database webhook documentation | 3               |
| 6     | Verification & review          | 4               |

**Scope note:** This plan is intentionally small because the notification system was largely built in earlier work. The original design spec's Phase 6 scope (build everything from scratch) was superseded by incremental development across previous phases.
