# Notification System Guide

This document explains the notification system in myK9Q, covering browser permissions, push subscriptions, service worker integration, and quiet hours logic.

## Quick Reference

| Notification Type | Trigger | Priority | Push? |
|-------------------|---------|----------|-------|
| Your Turn | Dog N positions from ring | High | Yes |
| Class Starting | 5 min before scheduled | Normal | Yes |
| Results Posted | Class complete | High (if placed) | Yes |
| Come to Gate | Manual status change | High | Yes |
| Announcement | Admin creates | Varies | Yes |
| Sync Error | Data sync failure | Normal | No (in-app) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        App Events / Store Changes                        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    NotificationIntegration Service                       │
│                 (Listens to events, determines recipients)               │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NotificationHandlers                                │
│              (Format messages, set priority/actions)                     │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       NotificationService                                │
│    (Check permissions, DND, quiet hours, voice, haptics, delivery)      │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
           ┌───────────────────────┴───────────────────────┐
           │                                               │
           ▼                                               ▼
┌─────────────────────┐                       ┌─────────────────────┐
│   Native/Browser    │                       │   Service Worker    │
│   Notification API  │                       │     (Push API)      │
│   (foreground)      │                       │   (background)      │
└─────────────────────┘                       └─────────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────────┐
                                              │  NotificationContext │
                                              │   (In-app center)    │
                                              └─────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/services/notificationService.ts` | Core notification management |
| `src/services/pushNotificationService.ts` | Web Push API wrapper |
| `src/services/notificationHandlers.ts` | Type-specific formatting |
| `src/services/notificationIntegration.ts` | App event listeners |
| `src/contexts/NotificationContext.tsx` | React state/in-app center |
| `src/hooks/useNotificationPermissions.ts` | Permission state hook |
| `src/hooks/usePushNotificationAutoSwitch.ts` | Multi-show support |
| `public/sw-custom.js` | Service worker push handling |

---

## Browser Notification Permissions

### Permission States

| State | Meaning | Can Request? |
|-------|---------|--------------|
| `granted` | User allowed notifications | N/A |
| `denied` | User blocked notifications | No (permanent) |
| `default` | Not yet asked | Yes |

### Permission Request Flow

```typescript
// src/services/notificationService.ts

// 1. Check current status
const status = notificationService.getPermissionStatus();
// Returns: { permission: 'granted'|'denied'|'default', canRequest: boolean }

// 2. Request permission (only if canRequest is true)
const result = await notificationService.requestPermission();
// Returns: 'granted' | 'denied' | 'default'
```

### Browser Compatibility

```typescript
// src/services/pushNotificationService.ts

const compat = PushNotificationService.getBrowserCompatibility();
// Returns:
// {
//   supported: boolean,
//   browser: 'chrome' | 'firefox' | 'safari' | 'edge' | 'opera' | 'unknown',
//   serviceWorker: boolean,
//   pushManager: boolean,
//   recommendation?: string  // User-facing guidance
// }
```

**Platform Notes:**
- **iOS Safari**: Requires iOS 16.4+ (first version with Web Push)
- **HTTPS Required**: Push notifications need secure connection
- **Desktop Safari**: Requires macOS Ventura+

### Permission Hook

```typescript
// src/hooks/useNotificationPermissions.ts

const {
  permission,      // 'granted' | 'denied' | 'default'
  canRequest,      // boolean
  isSupported,     // boolean
  requestPermission // () => Promise<NotificationPermission>
} = useNotificationPermissions();
```

---

## Service Worker Integration

### Registration

The service worker is registered automatically when the app loads:

```typescript
// src/services/notificationService.ts
private async initializeServiceWorker(): Promise<void> {
  if ('serviceWorker' in navigator) {
    this.registration = await navigator.serviceWorker.ready;
  }
}
```

### Push Event Handling

```javascript
// public/sw-custom.js

self.addEventListener('push', (event) => {
  const data = event.data.json();

  // 1. Check if notification is for current show
  if (data.licenseKey !== self.currentLicenseKey) {
    return; // Ignore notifications from other shows
  }

  // 2. Forward to open clients (notification center)
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type: 'PUSH_RECEIVED', data });
  });

  // 3. Display system notification
  await self.registration.showNotification(title, options);
});
```

### Notification Click Handling

```javascript
// public/sw-custom.js

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = event.notification.data;

  // Action routing
  switch (action) {
    case 'view':
    case 'view-class':
      // Open/focus app with specific URL
      const url = data.url || '/home';
      await openOrFocusWindow(url);
      break;
    case 'dismiss':
    case 'acknowledge':
      // Just close notification
      break;
  }

  // Notify app of click
  client.postMessage({
    type: 'NOTIFICATION_CLICK',
    notificationId: data.id,
    action: action
  });
});
```

### Multi-Tenant Filtering

The service worker tracks the current show's license key:

```javascript
// public/sw-custom.js

// Updated via postMessage from main app
self.currentLicenseKey = null;

self.addEventListener('message', (event) => {
  if (event.data.type === 'UPDATE_LICENSE_KEY') {
    self.currentLicenseKey = event.data.licenseKey;
  }
});
```

---

## Push Subscription Management

### Subscription Flow

```typescript
// src/services/pushNotificationService.ts

// 1. Subscribe to push notifications
const result = await PushNotificationService.subscribe(licenseKey, userRole);
// Creates subscription, saves to database

// 2. Update when favorites change
await PushNotificationService.updateFavoriteArmbands(armbands);
// Updates notification_preferences in database

// 3. Unsubscribe
await PushNotificationService.unsubscribe();
// Removes subscription from browser and database
```

### Browser-Unique User ID

Since passcodes are shared (e.g., all exhibitors use same code), we generate a unique ID per browser:

```typescript
// Format: "{role}_{uuid}"
// Example: "exhibitor_a1b2c3d4-e5f6-7890-abcd-ef1234567890"

private static getBrowserUserId(role: string): string {
  let userId = localStorage.getItem('push_user_id');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('push_user_id', userId);
  }
  return `${role}_${userId}`;
}
```

### Database Schema

```sql
-- supabase/migrations/017_add_push_notifications_support.sql

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY,
  license_key TEXT NOT NULL,
  user_id TEXT NOT NULL,           -- "{role}_{uuid}"
  user_role TEXT NOT NULL,         -- admin/judge/steward/exhibitor
  endpoint TEXT NOT NULL UNIQUE,   -- Push service URL
  p256dh TEXT NOT NULL,            -- Encryption public key
  auth TEXT NOT NULL,              -- Auth secret
  notification_preferences JSONB,  -- See below
  user_agent TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN
);

-- notification_preferences structure:
-- {
--   "announcements": true,
--   "up_soon": true,
--   "favorite_armbands": [1, 5, 23]
-- }
```

### Multi-Show Auto-Switch

When the user switches shows, subscriptions are automatically updated:

```typescript
// src/hooks/usePushNotificationAutoSwitch.ts

// Called when licenseKey changes
usePushNotificationAutoSwitch(showContext?.licenseKey);

// Internally calls:
await PushNotificationService.switchToShow(newLicenseKey, favoriteArmbands);
```

### VAPID Key Configuration

```env
# .env
VITE_VAPID_PUBLIC_KEY=BIxxx...
```

Used when creating subscriptions:
```typescript
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
});
```

---

## DND / Quiet Hours Logic

### Do Not Disturb (DND)

Temporary, user-initiated silencing of notifications.

```typescript
// src/services/notificationService.ts

interface DoNotDisturbConfig {
  enabled: boolean;
  until?: number;              // Auto-disable timestamp
  allowUrgent: boolean;        // Let urgent notifications through
  allowedTypes: NotificationType[];
}

// Enable for 1 hour, allow urgent
notificationService.enableDNDFor(60, true);

// Manual configuration
notificationService.setDND({
  enabled: true,
  until: Date.now() + 3600000,  // 1 hour
  allowUrgent: true,
  allowedTypes: ['urgent_announcement']
});

// Check status
const isActive = notificationService.isDNDActive();

// Disable
notificationService.disableDND();
```

**Auto-Expiration**: DND automatically disables when `until` timestamp passes.

### Quiet Hours

Recurring daily schedule for automatic notification silencing.

```typescript
interface QuietHoursConfig {
  enabled: boolean;
  startTime: string;    // "22:00" (24-hour format)
  endTime: string;      // "08:00"
  allowUrgent: boolean;
}

// Configure quiet hours
notificationService.setQuietHours({
  enabled: true,
  startTime: '22:00',
  endTime: '08:00',
  allowUrgent: true
});
```

**Overnight Support**: Correctly handles times that span midnight (e.g., 22:00 to 08:00).

### Notification Blocking Logic

```
Should Block Notification?
        │
        ▼
┌─────────────────┐
│  DND Active?    │
└────────┬────────┘
         │
    YES  │  NO
    ▼    │
┌────────┴────────┐
│ Is Urgent AND   │──→ NO ──→ BLOCK
│ allowUrgent?    │
└────────┬────────┘
         │ YES
         ▼
      ALLOW
         │
         ▼
┌─────────────────┐
│ Quiet Hours?    │
└────────┬────────┘
         │
    YES  │  NO
    ▼    │
┌────────┴────────┐
│ Is Urgent AND   │──→ NO ──→ BLOCK (queue high priority)
│ allowUrgent?    │
└────────┬────────┘
         │ YES
         ▼
      ALLOW
```

**Queue for Later**: High-priority notifications blocked by quiet hours are queued and delivered when quiet hours end.

### Storage

```typescript
// DND config
localStorage.setItem('notification_dnd', JSON.stringify(config));

// Quiet hours config
localStorage.setItem('notification_quiet_hours', JSON.stringify(config));
```

---

## Notification Types

### 1. Your Turn

**Trigger**: Dog is N positions from entering the ring (configurable 1-5).

```typescript
notifyYourTurn(entry: Entry, previousEntry?: Entry, dogsAhead: number = 1);
```

| Field | Value |
|-------|-------|
| Title | "Fido (#42) - You're Up Next!" |
| Body | "After Max (#41) - head to the ring!" |
| Priority | High |
| Vibrate | Double pulse |
| RequireInteraction | Yes |
| Actions | View Entry, Got It! |

**Voice**: "Fido, number 42, you're up next"

### 2. Class Starting

**Trigger**: 5 minutes before scheduled start time.

```typescript
notifyClassStarting(classData: Class, minutesBefore: number = 5);
```

| Field | Value |
|-------|-------|
| Title | "Class Starting Soon" |
| Body | "Agility Novice starts in 5 minutes" |
| Priority | Normal |
| Actions | View Class, Dismiss |

### 3. Results Posted

**Trigger**: Entry scored AND class is complete.

```typescript
notifyResultsPosted(entry: Entry, placement?: number, qualified?: boolean);
```

| Field | Value |
|-------|-------|
| Title | "1st Place - Fido!" (if placed) |
| Body | "Qualified! View full results..." |
| Priority | High (if placement ≤ 4) |
| Icon | `/icon-qualified.png` (if Q) |
| Actions | View Results, Share |

**Voice**: "Fido, first place, qualified"

### 4. Announcement

**Trigger**: Admin creates announcement in dashboard.

```typescript
notifyAnnouncement(title: string, content: string, priority: Priority, id: number);
```

| Field | Normal | Urgent |
|-------|--------|--------|
| Title | Title | "🚨 URGENT: {title}" |
| Vibrate | Single | Triple pulse |
| RequireInteraction | No | Yes |

### 5. Come to Gate

**Trigger**: Steward manually sets entry status to `'come-to-gate'`.

| Field | Value |
|-------|-------|
| Type | `come_to_gate` |
| Priority | High |
| Actions | View Class, Got It! |

### 6. Sync Error (In-App Only)

**Trigger**: Data synchronization failure.

```typescript
notifySyncError(errorMessage: string, operation: string, retryable: boolean);
```

Not sent as push - only appears in in-app notification center.

---

## Notification Payload Structure

```typescript
interface NotificationPayload {
  id?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requireInteraction?: boolean;
  silent?: boolean;
  tag?: string;              // Grouping/deduplication
  icon?: string;
  badge?: string;
  image?: string;
  vibrate?: number[];        // Vibration pattern [ms]
  sound?: string;
  actions?: NotificationAction[];
  timestamp?: number;
}
```

### Haptic Feedback Patterns

| Priority | Pattern | Description |
|----------|---------|-------------|
| Urgent | `[200, 100, 200, 100, 200]` | Triple pulse |
| High | `[200, 100, 200]` | Double pulse |
| Normal | `[150]` | Single medium |
| Low | `[100]` | Single short |

---

## User Settings

### Available Settings

| Setting | Key | Type | Default |
|---------|-----|------|---------|
| Enable Notifications | `enableNotifications` | boolean | false |
| Lead Dogs Warning | `notifyYourTurnLeadDogs` | 1-5 | 1 |
| Voice Announcements | `voiceNotifications` | boolean | false |
| Show Badges | `showBadges` | boolean | true |
| Haptic Feedback | `hapticFeedback` | boolean | true |

### Lead Dogs Setting

Controls when "Your Turn" notifications are sent:

| Value | When Notified |
|-------|---------------|
| 1 | Next in ring (1 dog away) |
| 2 | 2nd in line |
| 3 | 3rd in line |
| 4 | 4th in line |
| 5 | 5th in line |

### Settings UI

Located at: `src/pages/Settings/sections/NotificationSettings.tsx`

Shows:
- Browser compatibility status
- Master enable/disable toggle
- Lead dogs dropdown
- Voice announcements toggle
- Permission request button (if needed)

---

## Favorite Dogs

Favorites determine which dogs trigger "Your Turn" and "Results Posted" notifications.

### Storage

```typescript
// localStorage key pattern
`dog_favorites_{licenseKey}`

// Value: array of armband numbers
[1, 5, 23, 42]
```

### Syncing with Push Subscriptions

When favorites change, they're synced to the push subscription:

```typescript
// Called when user toggles a favorite
await PushNotificationService.updateFavoriteArmbands(armbands);

// Updates notification_preferences.favorite_armbands in database
```

This allows the server to filter push notifications to only subscriptions where the dog is favorited.

---

## In-App Notification Center

### Context Provider

```typescript
// src/contexts/NotificationContext.tsx

const {
  notifications,        // NotificationItem[]
  unreadCount,         // number
  markAsRead,          // (id: string) => void
  markAllAsRead,       // () => void
  clearAll,            // () => void
  addNotification,     // (notification: NotificationItem) => void
} = useNotificationContext();
```

### Notification Item Structure

```typescript
interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
}
```

### Persistence

- Stored in localStorage
- Max 50 notifications kept
- 24-hour retention window
- Loaded on app startup

### Real-time Updates

Receives notifications from:
1. **Service Worker**: Via `postMessage` when push received
2. **Realtime Subscription**: Announcements table changes

---

## Delivery Analytics

### Tracking

```typescript
interface NotificationDeliveryRecord {
  id: string;
  type: NotificationType;
  sentAt: number;
  delivered: boolean;
  clicked: boolean;
  dismissed: boolean;
  error?: string;
}
```

### Available Metrics

- Total notifications sent
- Delivery success rate
- Click-through rate
- Dismissal rate
- Error count by type

---

## Best Practices

### DO

- Request permissions only after user interaction (not on page load)
- Show clear value proposition before requesting permission
- Respect quiet hours and DND settings
- Use appropriate priority levels (don't abuse "urgent")
- Provide actionable notifications with clear CTAs

### DON'T

- Request permission immediately on first visit
- Send too many notifications (causes user fatigue)
- Use urgent priority for non-urgent content
- Ignore browser compatibility - gracefully degrade
- Forget to update favorites when syncing subscriptions

---

## Troubleshooting

### Common Issues

**"Notifications not showing"**
1. Check permission status: `Notification.permission`
2. Verify service worker registered: `navigator.serviceWorker.ready`
3. Check DND/quiet hours settings
4. Verify HTTPS (required for push)

**"Wrong show's notifications"**
1. Check `currentLicenseKey` in service worker
2. Verify `usePushNotificationAutoSwitch` is mounted
3. Check subscription's `license_key` in database

**"Duplicate notifications"**
1. Check notification `tag` - same tag deduplicates
2. Verify not subscribed multiple times (check `push_subscriptions` table)

### Debug Tools

```typescript
// Check subscription status
const sub = await navigator.serviceWorker.ready
  .then(reg => reg.pushManager.getSubscription());
console.log('Subscription:', sub);

// Check service worker license key
navigator.serviceWorker.controller.postMessage({
  type: 'GET_LICENSE_KEY'
});

// Simulate push notification (dev only)
navigator.serviceWorker.controller.postMessage({
  type: 'SIMULATE_PUSH',
  data: { title: 'Test', body: 'Test notification' }
});
```

---

## Related Documentation

- [OFFLINE_FIRST_PATTERNS.md](./OFFLINE_FIRST_PATTERNS.md) - Offline data handling
- [SCORING_ARCHITECTURE.md](./SCORING_ARCHITECTURE.md) - Scoring system
- [DATABASE_REFERENCE.md](./DATABASE_REFERENCE.md) - Database schema
