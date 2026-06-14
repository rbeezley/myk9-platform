# Dog Notification Pipeline — Design Spec

## Overview

Wire up myK9Show's existing notification infrastructure so exhibitors receive real-time alerts about their dogs during show day. The notification store, payload builders, delivery system, UI components, and push notification infrastructure all exist but nothing generates alerts. This spec adds the monitoring hook that watches for trigger events and fires the four alert types.

## Scope

**In scope:**

- `useNotificationMonitor` hook — subscribes to Supabase realtime, computes run order, detects conflicts, fires alerts
- Run order by armband number (ascending) — derived at runtime, no new database column
- All four alert types: `your_turn`, `class_starting`, `check_in_reminder`, `results_posted`
- Dual delivery: in-app (toast/sound/voice/vibration) + push (Edge Function → service worker)
- Conflict detection for multi-class exhibitors
- Deduplication to prevent repeated alerts from status bounces
- Tests for run order, conflict detection, and monitor hook

**Out of scope:**

- Configurable run order (drag-and-drop, sort direction) — future enhancement
- TV run order display — separate feature
- Favorite-following (friend's dog) — future enhancement
- New UI components — existing NotificationCenter/NotificationBell already handle rendering

## Architecture

### Data Flow

```
Trigger Events (Supabase Realtime)
  │
  ├── Entry check_in_status → 'in-ring'     → your_turn
  ├── Class status → 'In Progress'           → class_starting / check_in_reminder
  └── Class is_scoring_finalized → true       → results_posted
  │
  ▼
useNotificationMonitor (React Hook — App.tsx)
  │  Subscribes to realtime changes
  │  Computes run order (armband ascending)
  │  Detects conflicts across classes
  │  Filters to user's dogs only
  │  Deduplicates
  │
  ▼
Payload Builders (@myk9/notifications — existing)
  │  buildYourTurnPayload()
  │  buildClassStartingPayload()
  │  buildCheckInReminderPayload()
  │  buildResultsPostedPayload()
  │
  ├──▶ In-App Delivery (existing)
  │      deliver(payload) → notificationStore → toast/sound/voice/vibration
  │      Always runs (keeps alerts in store for when user returns)
  │
  └──▶ Push Delivery (existing infra)
         Only when document.visibilityState !== 'visible'
         supabase.functions.invoke('send-push-notification', { userId, payload })
         → web-push → service worker → native OS notification
```

### Foreground vs Background — No Double Alerts

- **App foregrounded** (`document.visibilityState === 'visible'`): In-app delivery only (toast, sound, vibration, store). Push skipped.
- **App backgrounded/closed**: In-app delivery still adds to store. Push fires via Edge Function → service worker → native notification.

## Alert Types

### your_turn (Priority: URGENT)

**Trigger:** Any entry's `check_in_status` changes to `in-ring`.

**Logic:**

1. Get all entries for that class
2. Sort by armband ascending (run order)
3. Filter to unscored entries only (no `competitionData`)
4. Find the position of the in-ring entry
5. Look at the next N entries (N = user's `leadDogs` preference, default 3)
6. For each that belongs to the current user's dogs:
   - Check dedup map — skip if same entry was alerted within last 60 seconds
   - Run conflict detection across other in-progress classes
   - Build payload via `buildYourTurnPayload({ dogName, className, dogsAhead, armband, conflicts })`
   - Deliver in-app + push if backgrounded

**Conflict detection:** After building the `your_turn` payload, scan all other in-progress classes for the same dog. If found within `leadDogs` range in another class, append conflict data to the payload: `data.conflicts: [{ className, dogsAhead }]`.

**Example notification:**

- Title: "Buddy — 2 dogs away"
- Body: "Your turn in Novice A"
- Conflict line: "Also 4 dogs away in Excellent B"

### class_starting (Priority: HIGH)

**Trigger:** Class `status` changes to `In Progress`.

**Condition:** User has at least one entry in that class AND the entry's `check_in_status` is NOT `no-status` (i.e., they've already checked in). If they haven't checked in, `check_in_reminder` fires instead.

**Dedup:** `notifiedClassStarting: Set<classId>` — fires once per class per session.

**Example notification:**

- Title: "Novice A starting"
- Body: "Novice A is now in progress"

### check_in_reminder (Priority: HIGH)

**Trigger:** Same as `class_starting` (class → In Progress).

**Condition:** Fires **instead of** `class_starting` when the user's entry has `check_in_status === 'no-status'`. More actionable — "check in now" is more useful than "class starting" when you haven't checked in.

**Dedup:** Shares the same `notifiedClassStarting` set — one alert per class per session regardless of type.

**Example notification:**

- Title: "Check in now"
- Body: "Buddy — Novice A check-in is open"

### results_posted (Priority: NORMAL)

**Trigger:** Class `is_scoring_finalized` changes to `true`.

**Condition:** User has at least one entry in that class.

**Payload:** One notification per class (not per dog). `actionUrl` links to the results page for that class.

**Dedup:** `notifiedResultsPosted: Set<classId>` — fires once per class per session.

**Example notification:**

- Title: "Results posted"
- Body: "Buddy — Novice A"

## Run Order

Run order is determined by armband number, ascending. This is derived at runtime — no new database column or stored value.

```typescript
function getRunOrder(entries: Entry[]): Entry[] {
  return entries
    .filter(e => !e.competitionData) // unscored only
    .sort((a, b) => {
      const aNum = parseInt(a.registrationData?.armband ?? '0', 10);
      const bNum = parseInt(b.registrationData?.armband ?? '0', 10);
      return aNum - bNum;
    });
}
```

Entries without armbands sort to the front (armband 0). This is a safe default — the secretary will notice them immediately.

Future enhancement: configurable run order (drag-and-drop, sort direction options). The `getRunOrder` function is the only place that encodes the sort strategy, making it easy to swap later.

## useNotificationMonitor Hook

### Interface

```typescript
function useNotificationMonitor(): void;
// No return value — side-effect-only hook
// Mounted once in App.tsx, runs for the session lifetime
```

### Inputs (from context/stores)

- `userDogIds: Set<string>` — from AuthContext (`userWithRoles.databaseUserId` → dogs where `owner_id` matches)
- `showIds: string[]` — union of two sources (same pattern as `useAnnouncementSubscription`):
  - Exhibitor path: `useShowDayData().activeShows` (shows the user has entries for today)
  - Official path: `useShowStore().selectedShowId` (show being managed in Mission Control)
- `leadDogs: number` — from `notificationStore.preferences.leadDogs`
- `notificationsEnabled: boolean` — from `notificationStore.preferences.enabled`

### Subscriptions

Per show ID, two Supabase realtime channels are created (cleaned up when show IDs change):

1. **Entries channel** (`notification-entries:{showId}`): Listens for `UPDATE` events on `entries` table. Filters to entries in the show's classes. Watches `check_in_status` changes.

2. **Classes channel** (`notification-classes:{showId}`): Listens for `UPDATE` events on `classes` table filtered by show ID. Watches `status` and `is_scoring_finalized` changes.

### Internal State

```typescript
// Deduplication
const lastYourTurnAlert = useRef<Map<string, number>>(new Map()); // entryId → timestamp
const notifiedClassStarting = useRef<Set<string>>(new Set()); // classId
const notifiedResultsPosted = useRef<Set<string>>(new Set()); // classId
```

### Data Source

Uses the existing React Query cache for entry data (same data already fetched by entry store / class details). On mount, ensures entries for the active show are loaded. Realtime events trigger cache invalidation, which updates the data the hook reads.

### Early Returns

The hook does nothing (no subscriptions, no processing) when:

- `showIds` is empty (no active shows)
- `notificationsEnabled` is false
- `userDogIds` is empty (user has no dogs)

## Component Changes

### New Files

| File                                  | Purpose                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/hooks/useNotificationMonitor.ts` | Core monitoring hook — subscriptions, alert logic, dedup                                            |
| `src/utils/runOrderUtils.ts`          | `getRunOrder(entries)` — sort by armband ascending                                                  |
| `src/utils/conflictDetection.ts`      | `detectConflicts(dogId, classId, allClassEntries)` — scan for same dog in other in-progress classes |

### Modified Files

| File                              | Change                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `App.tsx`                         | Mount `useNotificationMonitor()` alongside existing `useAnnouncementSubscription`                               |
| `@myk9/notifications/handlers.ts` | Extend `BuildYourTurnInput` to accept optional `conflicts` array                                                |
| `NotificationCenter.tsx`          | Render conflict context line when `alert.payload.data.conflicts` exists (small conditional in NotificationItem) |

## Testing

### Unit Tests

**`runOrderUtils.test.ts`:**

- Sorts entries by armband ascending
- Filters out scored entries (entries with `competitionData`)
- Handles missing/undefined armbands (sorts to front)
- Handles string armbands with leading zeros
- Returns empty array for empty input

**`conflictDetection.test.ts`:**

- Detects same dog in another in-progress class within leadDogs range
- Returns empty array when no conflicts
- Handles multiple conflicts across multiple classes
- Ignores completed/cancelled classes
- Ignores the current class (no self-conflict)

**`useNotificationMonitor.test.ts`:**

- Fires `your_turn` when entry goes in-ring and user's dog is within N positions
- Does not fire `your_turn` when user's dog is beyond N positions
- Deduplicates `your_turn` within 60-second window
- Fires `class_starting` when class goes In Progress and user has checked-in entry
- Fires `check_in_reminder` instead when user's entry has `no-status` check-in
- Does not double-fire class_starting for same class
- Fires `results_posted` when scoring finalized and user has entries
- Does not fire when `notificationsEnabled` is false
- Does not fire when user has no dogs / no entries in show
- Sends push when `document.visibilityState !== 'visible'`
- Skips push when app is foregrounded
- Includes conflict data in `your_turn` payload when detected
- Cleans up subscriptions on unmount
