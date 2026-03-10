# Exhibitor Notifications — Design Spec

Phase 6 of the Exhibitor Dashboard Redesign. Extracts myK9Q's notification system into a shared package and builds real-time show-day alerts for myK9Show exhibitors.

## Scope

**In scope:** Alert delivery system (toast, sound, voice, vibration, push) for show-day events. Shared `@myk9/notifications` package. Service worker for background push.

**Out of scope:** Notification inbox / history view, system announcements (separate todo created), myK9Q migration to shared package (later phase), DND/quiet hours (myK9Q has timed DND with expiry and quiet hours — descoped because show-day context is simpler: auto-suppress while in-ring handles the primary use case without user configuration).

**Deviations from Phase 6 plan:** The original plan (`docs/plans/exhibitor-dashboard-redesign.md`) specified `dnd.ts`, a slide-out `NotificationCenter.tsx`, and a `ToastContainer.tsx`. This spec simplifies: DND replaced by auto-suppress, NotificationCenter replaced by a lightweight bell dropdown (full inbox is a separate feature), ToastContainer replaced by reusing the existing working Sonner helpers in `src/lib/notifications.tsx`.

## Notification Types

| Type                | Trigger                                                 | Priority |
| ------------------- | ------------------------------------------------------- | -------- |
| `your_turn`         | Dog reaches position ≤ `leadDogs` in run order          | `urgent` |
| `class_starting`    | Class status changes to `in_progress` for entered class | `high`   |
| `check_in_reminder` | Class is `check_in_open` and dog hasn't checked in      | `high`   |
| `results_posted`    | Score appears for dog that was pending                  | `normal` |
| `announcement`      | System broadcast (future use)                           | `normal` |

## Section 1: `@myk9/notifications` Package Architecture

Pure TypeScript package, no React dependency. Extracted from myK9Q's working notification services.

### Package Structure

```
packages/notifications/
├── package.json          # @myk9/notifications
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts          # Public API re-exports
│   ├── types.ts          # Shared types
│   ├── sound.ts          # Web Audio API tone synthesis
│   ├── voice.ts          # SpeechSynthesis TTS wrapper
│   ├── voice-text.ts     # Pure text generators per notification type
│   ├── push.ts           # VAPID subscription lifecycle
│   ├── handlers.ts       # Notification content builders per type
│   └── suppression.ts    # Auto-suppress logic (in-ring check)
└── __tests__/
    ├── sound.test.ts
    ├── voice.test.ts
    ├── voice-text.test.ts
    ├── push.test.ts
    ├── handlers.test.ts
    └── suppression.test.ts
```

### Core Types

```typescript
type NotificationType =
  | 'your_turn'
  | 'results_posted'
  | 'class_starting'
  | 'check_in_reminder'
  | 'announcement';

type NotificationPriority = 'normal' | 'high' | 'urgent';

interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  data?: Record<string, unknown>;
  timestamp: number;
}

interface NotificationPreferences {
  enabled: boolean; // Master toggle
  leadDogs: number; // 1-5, default 3
  soundEnabled: boolean;
  voiceEnabled: boolean;
  vibrationEnabled: boolean;
  pushEnabled: boolean;
}
```

### Module Responsibilities

**`sound.ts`** — Synthesized tones via Web Audio API. Three tiers mapped to priority: normal (gentle chime), high (attention tone), urgent (distinctive alert). Ported from myK9Q's `notificationSoundService.ts`.

**`voice.ts`** — Wrapper around `SpeechSynthesis` API. Accepts text string, speaks it. Handles edge cases (synthesis not available, utterance queue).

**`voice-text.ts`** — Pure functions that generate human-readable announcement strings per notification type. Example: `"Bella is 2 dogs away in Open Agility"`. Note: ring number is not currently in `ShowDayClass` — add `ringNumber` to the type and `useShowDayData` query during implementation to enable ring-aware announcements.

**`push.ts`** — VAPID subscription lifecycle: subscribe, unsubscribe, get existing subscription. Does not send push notifications (that's server-side).

**`handlers.ts`** — Content builders: given a notification type + context data, returns a `NotificationPayload` with appropriate title, body, and priority.

**`suppression.ts`** — Pure function: `shouldSuppress(preferences, context) => boolean`. Returns `true` when `isInRing` is true or master toggle is off.

### Extraction Approach

Parallel extraction: build the package from myK9Q source as reference, not a direct copy-paste. myK9Q's notification code stays untouched — myK9Q can migrate its imports to `@myk9/notifications` in a later phase.

## Section 2: myK9Show App-Level Architecture

### Notification Store (Zustand)

```typescript
// src/store/notificationStore.ts
interface NotificationState {
  preferences: NotificationPreferences;
  permissionStatus: NotificationPermission; // 'default' | 'granted' | 'denied'
  isInRing: boolean;
  recentAlerts: Array<{ payload: NotificationPayload; read: boolean }>; // Last 10, for bell dropdown

  // Actions
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  requestPermission: () => Promise<void>;
  setInRing: (value: boolean) => void;
  addAlert: (payload: NotificationPayload) => void;
  markAllRead: () => void;
}
```

Preferences persist to `localStorage` via Zustand `persist` middleware. No database table needed — these are device-specific settings.

### Alert Trigger Hook

```typescript
// src/hooks/useShowDayAlerts.ts
function useShowDayAlerts(showDayData: ShowDayData): void;
```

Watches `useShowDayData` output and fires notifications when trigger conditions are met. No-ops when `showDayData.isLoading` is true or `showDayData.error` is set:

| Trigger           | Condition                                               | Priority |
| ----------------- | ------------------------------------------------------- | -------- |
| Your turn         | Dog moves to position ≤ `leadDogs` in run order         | `urgent` |
| Class starting    | Class status changes to `in_progress` for entered class | `high`   |
| Results posted    | Score appears for dog that was pending                  | `normal` |
| Check-in reminder | Class is `check_in_open` and dog hasn't checked in      | `high`   |

Uses `useRef` sets to track "already notified" IDs, preventing duplicate alerts on re-renders. Reads `isInRing` from the store and skips all notifications when true.

### Multi-Channel Delivery Flow

```
Trigger detected
  -> Build NotificationPayload (via @myk9/notifications handlers)
  -> Check suppression (isInRing? master toggle off? -> skip)
  -> Deliver in parallel:
      |-- Sonner toast (always, uses existing lib/notifications.tsx)
      |-- Sound (if soundEnabled, via @myk9/notifications sound)
      |-- Voice TTS (if voiceEnabled, via @myk9/notifications voice)
      |-- Vibration (if vibrationEnabled, navigator.vibrate())
      |-- Push (if pushEnabled + permission granted, for background tab)
```

Delivery orchestrator lives in myK9Show as `useNotificationDelivery` hook since it coordinates React state (Sonner) with package-level pure functions.

### Service Worker / Push

- `vite-plugin-pwa` (new dependency for `apps/myk9show`) for service worker generation
- Service worker handles `push` events when tab is backgrounded
- VAPID keys stored in Supabase project env (shared between apps)
- Push subscription saved to `push_subscriptions` table (`user_id`, `endpoint`, `keys`, `created_at`)
- One Edge Function: `send-push-notification` in `supabase/functions/` (root, shared between apps) — called by Supabase realtime database webhooks or directly from client for testing

## Section 3: UI Components

### Stub Cleanup

Existing unwired myK9Show notification files to remove:

| File                                                  | Action                                                   |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `src/services/NotificationService.ts`                 | Delete (WebSocket pub/sub, replaced by package)          |
| `src/services/EnhancedNotificationService.ts`         | Delete (delivery queue, replaced by hook)                |
| `src/components/common/NotificationCenter.tsx`        | Delete (rebuilt in this phase)                           |
| `src/hooks/useSmartNotifications.ts`                  | Delete (replaced by `useShowDayAlerts`)                  |
| `src/types/notification-types.ts`                     | Delete (FCM types, replaced by package types)            |
| `src/lib/notifications.tsx`                           | **Keep** (Sonner toast helpers, working)                 |
| `src/components/preferences/NotificationSettings.tsx` | Rewrite (new settings UI)                                |
| `src/components/layout/AppHeader.tsx` (import)        | Update import: `NotificationCenter` → `NotificationBell` |

### New Components

**`NotificationBell`** (`src/components/notifications/NotificationBell.tsx`)

Header icon with unread badge. Clicking opens a dropdown with recent alerts (last 10). Simple list, not a full inbox.

```
+----------------------------+
| Notifications              |
|----------------------------|
| ! Your turn! Ring 2        |
|   Bella - Open Agility     |
|   2 min ago                |
|----------------------------|
| # Check in now             |
|   Max - Novice Standard    |
|   15 min ago               |
|----------------------------|
| Mark all read              |
+----------------------------+
```

**`NotificationSettings`** (`src/components/notifications/NotificationSettings.tsx`)

Rewrite of existing stub. Contains:

- Master toggle (enable/disable all)
- Lead dogs slider (1-5, default 3)
- Channel toggles: Sound, Voice, Vibration
- Push notification toggle (triggers browser permission prompt)
- "Test notification" button

## Section 4: Testing Strategy

### Package Tests (`@myk9/notifications`)

| Module           | Key Tests                                                                              |
| ---------------- | -------------------------------------------------------------------------------------- |
| `handlers.ts`    | Correct title/body/priority for each `NotificationType`                                |
| `suppression.ts` | Returns `true` when `isInRing`, `false` otherwise; respects master toggle              |
| `voice-text.ts`  | Text generators produce expected strings for each notification type                    |
| `sound.ts`       | Calls Web Audio API with correct frequency/duration per priority (mock `AudioContext`) |
| `voice.ts`       | Calls `speechSynthesis.speak()` with correct utterance (mock `SpeechSynthesis`)        |
| `push.ts`        | Subscription lifecycle: subscribe, unsubscribe, handles denied permission              |

### App Tests (`myK9Show`)

| Component/Hook            | Key Tests                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `useShowDayAlerts`        | Fires correct notification type for each trigger; no duplicates; suppresses when `isInRing`  |
| `useNotificationDelivery` | Calls correct channels based on preferences; skips disabled channels                         |
| `notificationStore`       | Preference updates persist; permission state management                                      |
| `NotificationBell`        | Renders badge count; dropdown shows recent alerts; mark-all-read clears badge                |
| `NotificationSettings`    | Toggle states match store; slider updates `leadDogs`; push toggle triggers permission prompt |

### Not Tested

- Actual browser notification permission prompts (browser API)
- Real Web Audio playback (mocked)
- Real SpeechSynthesis output (mocked)
- Service worker push events (manual testing, E2E later)

## Database Changes

One new table (migration 007):

```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,        -- { p256dh, auth }
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);

create index idx_push_subscriptions_user_id on push_subscriptions(user_id);

-- RLS: users can only manage their own subscriptions
alter table push_subscriptions enable row level security;
create policy "Users manage own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id);
```

## Edge Function

`send-push-notification` in `supabase/functions/send-push-notification/`: Accepts `{ user_id, payload }`, looks up subscriptions by `user_id`, sends via Web Push protocol with VAPID credentials. Deployed with `--no-verify-jwt` (handles auth internally). Called by Supabase realtime database webhooks or directly from client for testing.
