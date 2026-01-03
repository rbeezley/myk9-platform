# Push Notifications Implementation Status

## ✅ Completed (Phase 1 & 2)

### Database Infrastructure
- **Migration 017**: [supabase/migrations/017_add_push_notifications_support.sql](supabase/migrations/017_add_push_notifications_support.sql)
  - ✅ `push_subscriptions` table with RLS policies
  - ✅ `announcement_rate_limits` table (10 announcements/hour spam limit)
  - ✅ Database triggers for announcements and "up soon" notifications
  - ✅ Helper functions for cleanup and subscription management

- **Migration 018**: [supabase/migrations/018_fix_run_order_notifications.sql](supabase/migrations/018_fix_run_order_notifications.sql)
  - ✅ **Fixed out-of-order scoring bug** in `notify_up_soon()` trigger
  - ✅ Now uses `COALESCE(NULLIF(exhibitor_order, 0), armband_number)` for correct run order
  - ✅ Handles volunteers going first/last, scoring conflicts, and custom run orders

### User Identification Solution
**Problem**: Passcodes are shared (e.g., all exhibitors use `e4b6c`)

**Solution**: Browser-based unique user IDs
- Format: `{role}_{uuid}` (e.g., `exhibitor_a1b2c3d4-e5f6-...`)
- Generated via `crypto.randomUUID()` on first subscription
- Stored in localStorage key: `push_user_id`
- Persists across sessions on same browser/device
- Each device gets its own unique subscription

### Backend Services
- **Edge Function**: [supabase/functions/send-push-notification/index.ts](supabase/functions/send-push-notification/index.ts)
  - Sends Web Push notifications via `web-push` library
  - Filters by user preferences and favorite armbands
  - Handles expired subscriptions (410/404 errors)
  - Updates `last_used_at` timestamps

- **Push Service**: [src/services/pushNotificationService.ts](src/services/pushNotificationService.ts)
  - `subscribe()` - Subscribe user to push notifications
  - `unsubscribe()` - Unsubscribe from push notifications
  - `updateFavoriteArmbands()` - Sync localStorage favorites to database
  - `isSubscribed()` - Check subscription status
  - Auto-generates browser-unique user IDs

### VAPID Keys
- **Public Key**: Stored in `.env.local` as `VITE_VAPID_PUBLIC_KEY`
- **Private Key**: Stored in `.env.local` as `VAPID_PRIVATE_KEY`

## ✅ Completed (Phase 3 - Frontend Integration)

### Service Worker
- **Custom Service Worker**: [src/sw.ts](src/sw.ts)
  - ✅ Handles `push` events from browser
  - ✅ Shows notifications even when app is closed
  - ✅ Handles notification clicks (opens app, navigates to relevant page)
  - ✅ Action buttons (View / Dismiss)
  - ✅ Vibration patterns for tactile feedback
  - ✅ Uses Workbox for caching and precaching
- **Vite Config Updated**: [vite.config.ts](vite.config.ts)
  - ✅ Switched from `generateSW` to `injectManifest` strategy
  - ✅ Custom service worker will be compiled and injected

### Settings Page UI
- **Push Notification Toggle**: [src/pages/Settings/Settings.tsx](src/pages/Settings/Settings.tsx)
  - ✅ Enable/disable push notifications button
  - ✅ Visual status indicator (green = active, orange = disabled)
  - ✅ Subscription status check on mount
  - ✅ Integrates with `PushNotificationService`
  - ✅ Loads favorite armbands from localStorage
  - ✅ User-friendly messaging and error handling

### Auto-Switch Integration
- **App.tsx Integration**: [src/App.tsx](src/App.tsx)
  - ✅ `usePushNotificationAutoSwitch` hook integrated
  - ✅ Automatically updates subscription when license key changes
  - ✅ Zero user friction for show switching

### Auto-Sync Favorites
- **Home.tsx Integration**: [src/pages/Home/Home.tsx:309-341](src/pages/Home/Home.tsx#L309-L341)
  - ✅ Already implemented (from previous session)
  - ✅ Automatically syncs favorites to push_subscriptions when user favorites/unfavorites

## 📋 Next Steps

### Phase 2 Remaining:
1. **Deploy Edge Function**:
   ```bash
   supabase functions deploy send-push-notification --project-ref yyzgjyiqgmjzyhzkqdfx
   ```

2. **Set Environment Variables** (Supabase Dashboard → Edge Functions → Secrets):
   - `VITE_VAPID_PUBLIC_KEY` (from .env.local)
   - `VAPID_PRIVATE_KEY` (from .env.local)

3. **Update Database Triggers** to call Edge Function via HTTP instead of `pg_notify`

### Phase 4: Testing
1. Test announcement notifications locally
2. Test "up soon" notifications (requires scoring entries)
3. Test on mobile devices (iOS requires PWA installation)
4. Test favorite dog notifications

### Phase 5: Production Deployment
1. Verify spam limits working (10 announcements/hour)
2. Monitor Edge Function logs for errors
3. Set up cleanup cron job (deactivate subscriptions older than 90 days)

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│ User Actions                                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. Enable notifications in Settings                          │
│ 2. Favorite dogs on Home page (localStorage)                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend (pushNotificationService.ts)                        │
├─────────────────────────────────────────────────────────────┤
│ - Generate browser-unique user_id                            │
│ - Request notification permission                            │
│ - Subscribe to PushManager                                   │
│ - Save subscription + favorites to database                  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Database (push_subscriptions table)                          │
├─────────────────────────────────────────────────────────────┤
│ - endpoint (unique)                                          │
│ - user_id (browser-unique: "exhibitor_uuid")                │
│ - notification_preferences.favorite_armbands: [1, 5, 12]    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Database Triggers                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. INSERT on announcements → notify_announcement_created()   │
│ 2. UPDATE on results (is_scored) → notify_up_soon()         │
│    - Checks next 5 entries                                   │
│    - Finds subscriptions with matching favorite_armbands     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Edge Function (send-push-notification)                       │
├─────────────────────────────────────────────────────────────┤
│ - Receives payload from trigger                              │
│ - Queries push_subscriptions for license_key                 │
│ - Filters by preferences + favorite_armbands                 │
│ - Sends via web-push library                                 │
│ - Handles expired subscriptions (410/404)                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Service Worker (sw.js)                                       │
├─────────────────────────────────────────────────────────────┤
│ - Receives push event from browser                           │
│ - Shows notification (even when app closed)                  │
│ - Handles notification clicks                                │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Browser-Based User IDs**: Solves shared passcode problem
2. **localStorage Favorites**: Synced to database on subscription
3. **Conservative Notifications**: Single notification at configurable threshold
4. **Spam Protection**: 10 announcements/hour limit per license_key
5. **Automatic Cleanup**: Deactivates subscriptions inactive for 90+ days
6. **Endpoint as Primary Key**: Already unique, simplifies schema
7. **Run Order Logic**: Uses `COALESCE(NULLIF(exhibitor_order, 0), armband_number)` to handle out-of-order scoring

## Run Order vs Armband Order

**Critical Understanding**: Dogs are NOT always scored in armband order.

### How Run Order Works:

1. **Default Behavior** (`exhibitor_order = 0`):
   - Dogs scored in armband order (1, 2, 3, 4...)
   - Most common scenario

2. **Custom Run Order** (`exhibitor_order > 0`):
   - Dogs scored in custom order
   - Common scenarios:
     - Volunteers go first or last
     - Conflict dogs moved (same handler running back-to-back)
     - Judge requests specific order
     - Entry list manually reordered

### Database Fields:
- `armband_number`: Permanent ID (never changes)
- `exhibitor_order`: Run order position (0 = use armband, >0 = custom order)
- `run_order`: Copy of `exhibitor_order` (both set by Microsoft Access export)

### Frontend Sorting (CORRECT):
```typescript
// From runOrderService.ts
const aOrder = a.exhibitorOrder ?? a.armband;
```

### Database Trigger Sorting (NOW CORRECT):
```sql
-- Migration 018 fixed this
COALESCE(NULLIF(exhibitor_order, 0), armband_number)
```

This ensures "up soon" notifications work correctly regardless of run order changes.

## Cost Analysis

Using Supabase free tier:
- **Edge Functions**: 500K invocations/month (free)
- **Database**: Unlimited rows (free tier sufficient)
- **Estimated Usage**: Large trial with 150 announcements + 800 entries = 950 invocations
- **10 large trials/month**: 9,500 invocations = **1.9% of free tier**
- **Cost**: **$0**

## Security

- **RLS Policies**: Users can only access subscriptions for their license_keys
- **VAPID Keys**: Secure in .env.local (not committed to git)
- **Spam Protection**: Rate limiting prevents abuse
- **Expired Subs**: Automatically deactivated on 410/404 errors
