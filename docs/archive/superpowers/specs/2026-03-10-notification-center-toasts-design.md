# NotificationCenter + ToastContainer Design

**Date:** 2026-03-10
**Status:** Approved
**Phase:** Exhibitor Dashboard Phase 6 (final two components)

---

## Context

Phase 6 (Exhibitor Notifications) is nearly complete. The `@myk9/notifications` package, notification store, delivery hook, alert triggers, service worker, push edge function, NotificationBell, and NotificationSettings are all built. Two UI components remain: a slide-out notification inbox and a floating toast container.

## Components

### 1. NotificationCenter (Slide-out Inbox)

A right-aligned slide-out panel triggered by a "View all" link in the NotificationBell dropdown or a dedicated open action.

**Layout:**

- Header: "Notifications" title, unread count, "Mark all read" button, close button
- Filter row: type tabs (All / Dogs / Announcements) + "Unread only" checkbox
- Scrollable list of notification items (max 50, newest first)
- Empty state when no notifications match filters

**Notification items:**

- Priority icon with color-coded background (red=urgent, amber=high, blue=normal, purple=announcement)
- Title (bold), body (muted), relative timestamp
- Unread indicator: left border accent + subtle background highlight
- Read items: reduced opacity
- "View →" button on unread items — navigates to context URL, marks as read, closes panel

**Filter categories:**

- **All**: everything
- **Dogs**: `your_turn`, `check_in_reminder`, `results_posted`, `class_starting`
- **Announcements**: `announcement` type

**Behavior:**

- Slides in from right with backdrop overlay
- Backdrop click or close button dismisses
- Full width on mobile (<640px), 400px on desktop
- Escape key closes
- Focus trapped inside panel when open

**Store changes needed:**

- `markRead(id)` — mark single notification as read (recompute `unreadCount`)
- `dismissAlert(id)` — remove from list
- Increase `MAX_RECENT_ALERTS` from 10 to 50
- `openCenter` / `closeCenter` state for panel visibility
- Add `actionUrl?: string` to `NotificationPayload` in `@myk9/notifications` types (formalize the context navigation URL)

### 2. ToastContainer (Floating Toasts)

Fixed-position container rendering ephemeral toast notifications as they arrive.

**Layout:**

- Fixed top-right (16px inset), z-50
- Max 3 visible toasts, stacked vertically with 8px gap
- Each toast: priority-colored left border, icon, title, body, dismiss button, progress bar

**Toast behavior:**

- Non-urgent: auto-dismiss after 8 seconds with animated progress bar
- Urgent: persists until manually dismissed, labeled "will not auto-dismiss"
- Hover pauses the auto-dismiss timer
- Slide-in animation on enter, slide-out on exit
- "View →" button navigates + dismisses

**Integration:**

- `useNotificationDelivery` currently calls Sonner for notification-channel toasts — replace **only** the notification-delivery Sonner calls with this custom ToastContainer. The app-wide Sonner `<Toaster>` and `notifications.*` helper remain for general CRUD toasts (success/error confirmations etc.)
- Toast state managed via a Zustand store (`useToastStore`) with `addToast` / `dismissToast` actions, exported for `useNotificationDelivery` to call
- Each toast gets a unique ID from the notification payload

## Data Flow

```
useShowDayAlerts → useNotificationDelivery → notificationStore.addAlert()
                                            → ToastContainer (ephemeral display)

NotificationBell (dropdown) → "View all" → NotificationCenter (slide-out)
```

## Files to Create

- `apps/myk9show/src/components/notifications/NotificationCenter.tsx`
- `apps/myk9show/src/components/notifications/ToastContainer.tsx`

## Files to Modify

- `apps/myk9show/src/store/notificationStore.ts` — add `markRead`, `dismissAlert`, increase max, add `isCenterOpen`
- `apps/myk9show/src/components/notifications/NotificationBell.tsx` — add "View all" link that opens center
- `apps/myk9show/src/hooks/useNotificationDelivery.ts` — replace Sonner toast with ToastContainer integration
