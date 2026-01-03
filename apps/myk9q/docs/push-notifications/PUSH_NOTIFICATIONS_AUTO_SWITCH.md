# Push Notifications: Auto-Switch Implementation

## ✅ Implementation Complete

### Strategy: Option 1 + Auto-Switch
- User subscribes to push notifications **once** (one-time setup)
- When user opens a different show, subscription **automatically switches** to new show
- **Zero friction** - completely transparent to the user
- Only one active show subscription per browser at a time

## How It Works

### 1. Initial Subscription (One-Time)
```typescript
// User enables notifications in Settings
await PushNotificationService.subscribe('exhibitor', 'show-A-license', [5, 12]);

// Database stores:
{
  endpoint: "https://fcm.googleapis.com/...",
  user_id: "exhibitor_a1b2c3d4-...",
  license_key: "show-A-license",
  notification_preferences: {
    favorite_armbands: [5, 12]
  }
}
```

### 2. User Opens Different Show (Auto-Switch)
```typescript
// User opens Show B (different license_key detected)
// usePushNotificationAutoSwitch hook automatically calls:
await PushNotificationService.switchToShow('show-B-license', [3, 8]);

// Database UPDATES same row:
{
  endpoint: "https://fcm.googleapis.com/...",  // Same endpoint
  user_id: "exhibitor_a1b2c3d4-...",           // Same user_id
  license_key: "show-B-license",               // ← UPDATED
  notification_preferences: {
    favorite_armbands: [3, 8]                   // ← UPDATED
  }
}
```

### 3. Notifications Work for Current Show
```typescript
// Judge scores entry in Show B
// Trigger fires: notify_up_soon()
// Edge Function queries: WHERE license_key = 'show-B-license'
// Finds subscription and sends notification to user
// ✓ User receives "You're up soon!" notification for Show B
```

## Implementation Files

### 1. Service: [src/services/pushNotificationService.ts](src/services/pushNotificationService.ts)

**New Method Added:**
```typescript
static async switchToShow(licenseKey: string, favoriteArmbands: number[]): Promise<boolean>
```

**What it does:**
- Gets current browser subscription (endpoint)
- UPDATEs database row with new `license_key` and `favorite_armbands`
- Called automatically when show changes

### 2. Hook: [src/hooks/usePushNotificationAutoSwitch.ts](src/hooks/usePushNotificationAutoSwitch.ts)

**Purpose:** Monitors license_key changes and automatically switches subscription

**Usage in App.tsx:**
```typescript
import { usePushNotificationAutoSwitch } from '@/hooks/usePushNotificationAutoSwitch';

function App() {
  const { showContext } = useShowContext();

  // Add this one line:
  usePushNotificationAutoSwitch(showContext?.licenseKey);

  // Rest of App component...
}
```

**What it monitors:**
1. **License Key Changes**: When `showContext.licenseKey` changes
2. **Favorite Changes**: When localStorage `dog_favorites_{licenseKey}` changes

**Behavior:**
- ✅ Only switches if user is already subscribed
- ✅ Loads favorites from localStorage for new show
- ✅ Silent operation - no user interaction needed
- ✅ Logs all actions to console for debugging

## User Experience

### Scenario: Exhibitor with 2 Shows

**Weekend 1: Spring Trial**
1. User enables notifications in Settings (one-time)
2. Favorites dogs #5 and #12
3. Receives notifications when #5 or #12 are up soon

**Weekend 2: Summer Nationals**
1. User opens app → **automatically switches to Summer Nationals**
2. Favorites dogs #3 and #8
3. Receives notifications when #3 or #8 are up soon
4. **No manual re-subscription needed!**

### Scenario: Judge Working Back-to-Back Shows

**Saturday: Show A (Ring 1)**
- Opens Show A → subscribed to Show A
- Receives announcements for Show A

**Sunday: Show B (Ring 2)**
- Opens Show B → **automatically switches to Show B**
- Receives announcements for Show B
- **No manual action needed!**

## Database Impact

### Single Row Per Browser
```sql
-- Before implementing multiple shows:
endpoint | user_id               | license_key    | favorite_armbands
---------|----------------------|----------------|------------------
fcm...   | exhibitor_abc123...  | show-A-license | [5, 12]

-- After user opens Show B (same row UPDATED):
endpoint | user_id               | license_key    | favorite_armbands
---------|----------------------|----------------|------------------
fcm...   | exhibitor_abc123...  | show-B-license | [3, 8]
```

**Benefits:**
- ✅ One row per browser (not N rows for N shows)
- ✅ Simple database queries
- ✅ No orphaned subscriptions
- ✅ Easy to debug

## Edge Cases Handled

### 1. User Not Subscribed
```typescript
if (!isSubscribed) {
  console.log('[Push Auto-Switch] Not subscribed - skipping show switch');
  return;
}
```
✅ Hook does nothing if user hasn't enabled notifications

### 2. Same Show Opened Again
```typescript
if (licenseKey === previousLicenseKey.current) {
  return;
}
```
✅ No unnecessary database updates

### 3. Invalid License Key
```typescript
if (!licenseKey) {
  return;
}
```
✅ Skips switch if license key is missing

### 4. Favorite Dogs Change Mid-Show
```typescript
window.addEventListener('storage', handleStorageChange);
```
✅ Automatically syncs favorites when user favorites/un-favorites dogs

### 5. Browser localStorage Cleared
```typescript
let favoriteArmbands: number[] = [];
if (savedFavorites) {
  favoriteArmbands = JSON.parse(savedFavorites);
}
```
✅ Defaults to empty array if favorites missing

## Next Steps

### Integration Required:

1. **Add hook to App.tsx**:
   ```typescript
   import { usePushNotificationAutoSwitch } from '@/hooks/usePushNotificationAutoSwitch';

   function App() {
     const { showContext } = useShowContext();
     usePushNotificationAutoSwitch(showContext?.licenseKey);
     // ...
   }
   ```

2. **Update Home.tsx favorite handler** (optional optimization):
   ```typescript
   const toggleFavorite = (armband: number) => {
     // Update localStorage
     const newFavorites = favoriteDogs.has(armband)
       ? Array.from(favoriteDogs).filter(a => a !== armband)
       : [...Array.from(favoriteDogs), armband];

     localStorage.setItem(`dog_favorites_${licenseKey}`, JSON.stringify(newFavorites));

     // Optionally: Manually trigger sync (hook will also catch it)
     if (await PushNotificationService.isSubscribed()) {
       await PushNotificationService.updateFavoriteArmbands(newFavorites);
     }
   };
   ```

### Testing Plan:

1. **Local Testing**:
   - Subscribe to notifications in Show A
   - Favorite dogs #5, #12
   - Switch to Show B (different license_key)
   - Verify database updated to Show B
   - Favorite dogs #3, #8
   - Verify database has Show B favorites

2. **Multi-Show Testing**:
   - Open Show A → Subscribe
   - Open Show B → Verify auto-switch
   - Return to Show A → Verify auto-switch back
   - Check console logs for confirmation

3. **Notification Testing**:
   - Subscribe to Show A
   - Create announcement in Show A → Should receive
   - Switch to Show B
   - Create announcement in Show A → Should NOT receive
   - Create announcement in Show B → Should receive

## Benefits vs. Multiple Show Subscriptions

| Feature | Auto-Switch (Implemented) | Multiple Shows |
|---------|---------------------------|----------------|
| User Friction | ✅ Zero | ❌ Manual per show |
| Database Rows | ✅ 1 per browser | ❌ N per browser |
| Notification Spam | ✅ Current show only | ❌ All shows |
| Implementation | ✅ Simple | ❌ Complex |
| Handles Simultaneous Shows | ❌ No (rare) | ✅ Yes (rare) |

**Conclusion**: Since simultaneous shows are rare, auto-switch provides better UX with simpler implementation.
