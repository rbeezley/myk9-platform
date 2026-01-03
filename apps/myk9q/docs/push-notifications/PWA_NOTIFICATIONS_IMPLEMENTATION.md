# PWA Installation & Favorites-Based Notifications Implementation

## Overview

This document describes the implementation of **PWA installation prompts** and **favorites-based notification filtering** for the myK9Q application.

## The Challenge We Solved

### Problem: Shared Exhibitor Authentication
- All exhibitors share the same passcode (e.g., `e4b6c`)
- No way to identify which specific exhibitor is logged in
- Can't determine which dogs/entries belong to which user
- Notifications would spam ALL exhibitors for EVERY dog

### Solution: Favorites System
We leverage the **existing favorites feature** where users can favorite specific dogs (theirs or friends') to determine which notifications to send.

**Benefits:**
✅ Uses existing, working UI (heart icon on dog cards)
✅ User has full control over what they get notified about
✅ Works for exhibitors watching their own dogs OR friends' dogs
✅ No authentication system changes needed
✅ No database schema changes needed

---

## Architecture

### 1. PWA Installation Detection (`usePWAInstall.ts`)

**Purpose:** Detect if app is installed as PWA and provide install prompting.

**Key Features:**
- Detects standalone mode (iOS, Android, Desktop)
- Captures `beforeinstallprompt` event
- Handles dismiss state with 7-day expiry
- Platform-specific installation instructions
- Tracks successful installations

**API:**
```typescript
const {
  isInstalled,      // Is app running as installed PWA?
  canInstall,       // Can we prompt for installation?
  isDismissed,      // Did user dismiss prompt recently?
  promptInstall,    // Trigger browser's install prompt
  dismissInstallPrompt, // Mark as dismissed for 7 days
  getInstallInstructions // Get platform-specific instructions
} = usePWAInstall();
```

**Browser Support:**
- ✅ Chrome/Edge (Android, Desktop): Native prompt
- ✅ Safari (iOS): Manual instructions via Share button
- ✅ Firefox: Limited support

---

### 2. Install Prompt Component (`InstallPrompt.tsx`)

**Purpose:** User-friendly prompts to install the app.

**Two Modes:**

**Banner Mode (Default):**
```tsx
<InstallPrompt
  mode="banner"
  showNotificationBenefit={true}
  favoritedCount={favoriteDogs.size}
/>
```

Displays:
```
┌─────────────────────────────────────────────────┐
│ 📱 Install myK9Q                                │
│ Get notified when your 3 dogs are up next!      │
│ [Install] [X]                                   │
└─────────────────────────────────────────────────┘
```

**Card Mode:**
Full-featured modal with benefits list and detailed instructions.

**Auto-Dismiss Logic:**
- User clicks "X" → Dismissed for 7 days
- User installs → Prompt never shows again
- User accepts prompt but cancels → Dismissed for 7 days

---

### 3. Notification Integration (`notificationIntegration.ts`)

**Purpose:** Connect notification system to real app events and filter by favorites.

**Key Changes:**

#### Loading Favorites from localStorage
```typescript
private loadFavoriteDogs(): void {
  const favoritesKey = `dog_favorites_${this.licenseKey}`;
  const savedFavorites = localStorage.getItem(favoritesKey);
  if (savedFavorites) {
    this.favoriteDogs = new Set(JSON.parse(savedFavorites));
  }
}
```

#### Filtering Notifications by Favorites
```typescript
private isFavorited(entry: Entry): boolean {
  return this.favoriteDogs.has(entry.armband);
}

// In onNextEntryUp():
if (!this.isFavorited(nextEntry)) {
  console.log('NOT favorited, skipping notification');
  return;
}
```

**Automatic License Key Detection:**
Reads from localStorage auth context:
```typescript
private loadLicenseKeyFromAuth(): void {
  const authData = localStorage.getItem('myK9Q_auth');
  const auth = JSON.parse(authData);
  this.licenseKey = auth.showContext?.licenseKey;
  this.loadFavoriteDogs();
}
```

**Real-Time Updates:**
Listens for favorites changes via localStorage events:
```typescript
window.addEventListener('storage', (e) => {
  if (e.key === `dog_favorites_${this.licenseKey}`) {
    this.loadFavoriteDogs(); // Reload when user favorites/unfavorites
  }
});
```

---

### 4. Notification Filtering Logic

#### "Your Turn" Notifications
**Triggers when:** A dog enters the ring
**Notifies:** The dog N positions ahead (configurable: 1-5 dogs)
**Filter:** Only if target dog is favorited

```typescript
// When dog #204 enters ring
// Settings: notifyYourTurnLeadDogs = 2
// Class order: [#201 (scored), #202, #203, #204 (in ring), #205, #206, #207]
//
// Logic:
// 1. Find #204's position in unscored list: index 2
// 2. Calculate target: index 2 + 2 = index 4 → #207
// 3. Check if #207 is favorited
// 4. If YES → Send notification "You're 2 dogs away"
// 5. If NO → Skip notification
```

#### "Results Posted" Notifications
**Triggers when:** All dogs in class are scored
**Notifies:** Top 4 placed entries only
**Filter:** Only if placed dog is favorited

```typescript
private async onClassComplete(classId: number, entries: Entry[]): Promise<void> {
  const placedEntries = entries
    .filter(e => e.placement && e.placement <= 4)
    .sort((a, b) => a.placement - b.placement);

  // Only notify favorited dogs
  const favoritedPlacedEntries = placedEntries.filter(e => this.isFavorited(e));

  for (const entry of favoritedPlacedEntries) {
    await notifyResultsPosted(entry, entry.placement, qualified);
  }
}
```

---

## User Experience Flow

### For Exhibitors

**1. Login**
- Enter exhibitor passcode (e.g., `e4b6c`)
- Navigate to Home page

**2. Favorite Their Dogs**
- See all entries for the show
- Tap heart icon on their dogs (or friends' dogs)
- Favorites saved to `localStorage` under `dog_favorites_{licenseKey}`

**3. Install App (If Not Installed)**
- See banner at top of Home page: "Get notified when your 3 dogs are up next!"
- Tap "Install" button
- **Android Chrome:** Native install dialog appears → Tap "Install"
- **iOS Safari:** Manual instructions shown → Share → Add to Home Screen
- **Desktop:** Install icon in address bar or prompt

**4. Receive Notifications**
- **Phone locked, app closed:** Push notification appears
  ```
  myK9Q - Your Turn!

  Bella (#205) - Get Ready!
  Max (#204) just entered the ring.
  You're 2 dogs away.

  [View Entry] [Got It!]
  ```
- **Vibration:** Buzz-buzz pattern
- **Sound:** Notification tone (if enabled)
- **Tap notification:** Opens app directly to that entry

**5. Configure Settings**
- Navigate to Settings → Notifications
- See installation status:
  - ✅ **App Installed** (green badge): "Push notifications are enabled and will work in the background"
  - ⚠️ **App Not Installed** (orange badge): "Install the app to receive notifications when the app is closed" + [Install App] button
- Adjust "Notify When Dogs Ahead": 1-5 dogs (default: 2)
- Toggle individual notification types on/off

---

## Settings UI

### Notifications Section

```
┌─────────────────────────────────────────────┐
│ Notifications                                │
│ Manage alerts and reminders            [8] │
└─────────────────────────────────────────────┘

[ ] Enable Notifications

  ┌─────────────────────────────────────────┐ ✅
  │ ✓ App Installed                         │
  │ Push notifications are enabled and will │
  │ work in the background                  │
  └─────────────────────────────────────────┘

  [ ] Sound
  [ ] Badge Counter

  Notify Me About:
    [ ] Class Starting Soon
    [ ] Your Turn to Compete
        Notify When Dogs Ahead: [2 dogs ahead ▼]
    [ ] Results Posted
        When entire class is complete with placements
    [ ] Sync Errors
```

---

## Implementation Details

### Files Created

1. **`src/hooks/usePWAInstall.ts`** (200 lines)
   - PWA detection and installation management
   - Platform-specific instructions
   - Dismiss state with expiry

2. **`src/components/ui/InstallPrompt.tsx`** (230 lines)
   - Banner and card UI modes
   - Contextual messaging based on favorites count
   - iOS-specific instructions component

3. **`src/components/ui/InstallPrompt.css`** (300 lines)
   - Responsive styling for banner and card
   - Animations (slideDown, fadeInScale)
   - Dark mode support

### Files Modified

1. **`src/services/notificationIntegration.ts`**
   - Added `favoriteDogs: Set<number>` private property
   - Added `licenseKey: string` private property
   - Added `loadLicenseKeyFromAuth()` method
   - Added `loadFavoriteDogs()` method
   - Added `isFavorited(entry)` method
   - Updated `onNextEntryUp()` to filter by favorites
   - Updated `onClassComplete()` to filter by favorites
   - Added localStorage event listener for favorites changes

2. **`src/pages/Home/Home.tsx`**
   - Added `InstallPrompt` import
   - Added conditional rendering: Shows banner if exhibitor + has favorites + notifications enabled
   - Changed `role` from `_role` to `role` (unused variable)

3. **`src/pages/Settings/Settings.tsx`**
   - Added `usePWAInstall` hook import
   - Added installation status indicator with visual feedback (green/orange)
   - Added "Install App" button when not installed but can prompt
   - Added platform-specific instructions when can't prompt (iOS)

4. **`src/components/ui/index.ts`**
   - Exported `InstallPrompt` and `IOSInstallInstructions` components
   - Exported `InstallPromptProps` type

---

## Testing Guide

### Manual Testing Steps

**1. Test PWA Installation (Android Chrome)**
- Open app in Chrome on Android
- Navigate to Home page
- Favorite a dog (tap heart icon)
- Verify banner appears: "Get notified when your 1 dog is up next!"
- Tap "Install" button
- Verify native install dialog appears
- Tap "Install"
- Verify app icon appears on home screen
- Open Settings → Notifications
- Verify status shows "✓ App Installed" (green)

**2. Test PWA Installation (iOS Safari)**
- Open app in Safari on iPhone
- Navigate to Home page
- Favorite a dog
- Verify banner does NOT appear (iOS doesn't support prompt)
- Open Settings → Notifications
- Verify status shows "⚠ App Not Installed" (orange)
- Verify iOS instructions appear:
  - "Tap the Share button..."
  - "Scroll down and tap 'Add to Home Screen'..."
  - "Tap 'Add' in the top right"
- Follow instructions manually
- After installation, verify status changes to "✓ App Installed"

**3. Test Favorites-Based Filtering**
- Favorite dogs #100, #105, #110
- Have judge score dogs in order
- When judge scores #103 and #104 enters ring:
  - ✅ Should notify #105 (favorited, 2 dogs ahead with default setting)
  - ❌ Should NOT notify #106, #107, etc. (not favorited)
- When judge scores #108 and #109 enters ring:
  - ✅ Should notify #110 (favorited, setting dependent)
  - ❌ Should NOT notify #111, #112, etc. (not favorited)

**4. Test Class Completion Notifications**
- Favorite dogs #100, #105, #110
- Have judge score entire class
- When last dog is scored:
  - If #100 placed 1st → ✅ Send notification
  - If #105 placed 3rd → ✅ Send notification
  - If #110 did not place (5th) → ❌ No notification
  - If #107 placed 2nd (not favorited) → ❌ No notification

**5. Test Lead Dogs Configuration**
- Go to Settings → Notifications
- Change "Notify When Dogs Ahead" to "3 dogs ahead"
- Favorite dog #110
- Have judge score dogs
- When #107 enters ring (3 dogs before #110):
  - ✅ Should notify #110 "You're 3 dogs away"
- When #108 enters ring (2 dogs before #110):
  - ❌ Should NOT notify (already notified)

**6. Test Dismiss Behavior**
- Clear all favorites
- Favorite a dog (banner should appear)
- Tap "X" to dismiss
- Verify banner disappears
- Refresh page → Verify banner does NOT reappear
- Check `localStorage` → Verify `pwa_install_dismissed` key exists
- Wait 7 days (or manually delete key) → Verify banner reappears

**7. Test No Favorites Scenario**
- Remove all favorites
- Verify install banner does NOT appear on Home page
- Go to Settings → Notifications
- Verify installation status still shows (encourages installation for future use)

---

## Browser Support

| Platform | Browser | Install Prompt | Background Notifications | Notes |
|----------|---------|----------------|-------------------------|-------|
| **Android** | Chrome | ✅ Native | ✅ Yes | Best experience |
| **Android** | Firefox | ⚠️ Limited | ✅ Yes | Manual install only |
| **Android** | Samsung Internet | ✅ Native | ✅ Yes | Works well |
| **iOS** | Safari | ❌ Manual | ✅ Yes (PWA only) | Requires "Add to Home Screen" |
| **iOS** | Chrome | ❌ Not supported | ❌ No | Use Safari instead |
| **Desktop** | Chrome | ✅ Native | ✅ Yes | Icon in address bar |
| **Desktop** | Edge | ✅ Native | ✅ Yes | Icon in address bar |
| **Desktop** | Firefox | ⚠️ Limited | ⚠️ Limited | Experimental support |
| **Desktop** | Safari (Mac) | ⚠️ Limited | ⚠️ Limited | macOS 16.4+ only |

**Legend:**
- ✅ Fully supported
- ⚠️ Partial support or requires manual steps
- ❌ Not supported

---

## Configuration

### User-Configurable Settings

**In `settingsStore.ts`:**
```typescript
enableNotifications: boolean;           // Master switch
notificationSound: boolean;             // Play sound with notifications
showBadges: boolean;                    // Badge counter on app icon
notifyClassStarting: boolean;           // 5 min before class starts
notifyYourTurn: boolean;                // When your turn is approaching
notifyYourTurnLeadDogs: 1|2|3|4|5;     // How many dogs ahead (NEW)
notifyResults: boolean;                 // When class complete with placements
notifySyncErrors: boolean;              // When sync fails
```

**Default Values:**
```typescript
enableNotifications: true,
notificationSound: true,
showBadges: true,
notifyClassStarting: true,
notifyYourTurn: true,
notifyYourTurnLeadDogs: 2,  // Notify when 2 dogs ahead
notifyResults: true,
notifySyncErrors: true,
```

---

## Performance Considerations

### localStorage Access
- **Favorites:** Read once on initialization, then listen for changes
- **Auth:** Read once on initialization
- **Dismiss State:** Read once on mount, write on dismiss

**Impact:** Minimal, all operations are synchronous and fast.

### Memory Footprint
- `favoriteDogs: Set<number>` → ~10-100 entries typical → <1KB
- No significant memory impact

### Network Impact
- **Zero** - All notification filtering happens client-side
- No additional API calls needed

---

## Troubleshooting

### "Install App" button doesn't appear
**Possible causes:**
1. App is already installed → Check Settings for "✓ App Installed"
2. User dismissed prompt recently → Wait 7 days or clear `pwa_install_dismissed` from localStorage
3. Browser doesn't support PWA → Use Chrome/Edge instead
4. Using iOS → iOS doesn't support prompt, manual instructions shown instead

### Notifications not working after install
**Check:**
1. Settings → Notifications → Enable Notifications is ON
2. Browser notifications permission granted (check browser settings)
3. At least one dog is favorited
4. Notification type is enabled (e.g., "Your Turn to Compete" toggle is ON)

### Getting notifications for unfavorited dogs
**This should not happen.** If it does:
1. Check browser console for `📱 Loaded X favorited dogs` log
2. Verify `dog_favorites_{licenseKey}` in localStorage contains correct armband numbers
3. Check that notifications show "FAVORITED, sending notification" in console, not "NOT favorited, skipping"

### iOS: Notifications only work when app is open
**This is expected behavior.**
- iOS Safari requires app to be installed via "Add to Home Screen"
- Browser tab notifications do NOT work in background on iOS
- Solution: Follow manual installation instructions in Settings

---

## Future Enhancements

### Possible Improvements

1. **Individual Dog Notification Settings**
   - Allow disabling notifications per dog
   - "Notify for Bella but not Max"

2. **Smart Notification Timing**
   - Calculate actual time based on class speed
   - "Bella is ~10 minutes away" instead of "2 dogs away"

3. **Multiple Shows**
   - Support favorites across multiple shows
   - Sync favorites to server for multi-device support

4. **Notification History**
   - Show log of sent notifications
   - "You were notified 5 minutes ago for Bella"

5. **Custom Notification Messages**
   - User-defined templates
   - "Good luck Bella! 🐕" instead of generic message

---

## Conclusion

This implementation successfully solves the shared-authentication problem by:
- ✅ Using existing favorites system (no DB changes)
- ✅ Giving users full control over notifications
- ✅ Supporting both own dogs and friends' dogs
- ✅ Providing excellent UX with contextual install prompts
- ✅ Working across all major platforms (with platform-specific instructions)
- ✅ Zero additional network overhead
- ✅ Minimal performance impact

**Total Implementation:**
- **3 new files** (hook, component, styles)
- **4 modified files** (integration, Home, Settings, exports)
- **~800 lines of code** (including comments and styles)
- **0 TypeScript errors**
- **0 database changes**
- **0 authentication changes**

---

## Related Documentation

- [NOTIFICATION_FEEDBACK_CHANGES.md](NOTIFICATION_FEEDBACK_CHANGES.md) - User feedback implementation details
- [NOTIFICATION_TRIGGERS_GUIDE.md](NOTIFICATION_TRIGGERS_GUIDE.md) - How notifications are triggered
- [src/services/notificationService.ts](src/services/notificationService.ts) - Core notification service
- [src/hooks/usePWAInstall.ts](src/hooks/usePWAInstall.ts) - PWA installation hook
