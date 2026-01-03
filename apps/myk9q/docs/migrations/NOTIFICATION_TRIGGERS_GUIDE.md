# Notification Triggers Guide

This guide explains **how and when notifications are triggered** in the myK9Q app based on user settings.

## Overview

The notification system has three layers:

1. **Notification Handlers** ([src/services/notificationHandlers.ts](src/services/notificationHandlers.ts)) - Send specific notification types
2. **Notification Integration** ([src/services/notificationIntegration.ts](src/services/notificationIntegration.ts)) - Monitors app events and triggers handlers
3. **Settings** ([src/pages/Settings/Settings.tsx](src/pages/Settings/Settings.tsx)) - User controls what they want to be notified about

## How Notifications Are Triggered

### Automatic Event Monitoring

The `notificationIntegration` service automatically monitors Zustand store changes and triggers notifications based on user settings.

**Initialization** ([src/App.tsx](src/App.tsx)):
```typescript
// App.tsx - App initialization
useEffect(() => {
  // ... other initialization
  notificationIntegration.initialize();

  return () => {
    notificationIntegration.destroy();
  };
}, []);
```

### 1. Results Posted Notifications

**Setting**: "Results Posted" toggle in Settings > Notifications

**Trigger**: When an entry's `isScored` field changes from `false` to `true`

**How It Works**:
```typescript
// Automatically detected by notificationIntegration
useEntryStore.subscribe((state, prevState) => {
  // Compare previous and current entries
  const prevEntry = prevState.entries.find(e => e.id === entry.id);

  if (prevEntry && !prevEntry.isScored && entry.isScored) {
    // Entry was just scored!
    notifyResultsPosted(entry, entry.placement, qualified);
  }
});
```

**When Does This Happen?**:
- Judge/steward completes a scoresheet and saves results
- `markAsScored(entryId, resultText)` is called in entryStore
- Scoresheet components call this when "Save" button is clicked

**Example Flow**:
1. Judge scores dog on UKC Rally scoresheet
2. Judge clicks "Save & Next"
3. Scoresheet calls `updateEntry(entryId, { isScored: true, resultText: "Q 95" })`
4. notificationIntegration detects the change
5. Checks if `settings.notifyResults === true`
6. Sends notification: "Bella - Results Posted! 1st Place, Qualified"

### 2. Your Turn Notifications

**Setting**: "Your Turn to Compete" toggle in Settings > Notifications

**Trigger**: When the dog before you is marked as "in ring" or finishes

**How It Works**:
```typescript
// Automatically detected by notificationIntegration
useEntryStore.subscribe((state, prevState) => {
  const prevEntry = prevState.entries.find(e => e.id === entry.id);

  if (prevEntry && !prevEntry.inRing && entry.inRing) {
    // Dog is now in ring!
    // Find the next dog in line
    const unscoredEntries = state.currentClassEntries.filter(e => !e.isScored);
    const currentIndex = unscoredEntries.findIndex(e => e.id === entry.id);

    if (currentIndex >= 0 && currentIndex < unscoredEntries.length - 1) {
      const nextEntry = unscoredEntries[currentIndex + 1];
      notifyYourTurn(nextEntry, entry);
    }
  }
});
```

**When Does This Happen?**:
- Steward marks a dog as "in ring" from entry list
- `markInRing(entryId, true)` is called in entryStore
- Entry list components call this when dog enters the ring

**Example Flow**:
1. Run order: #101 Bella → #102 Max → #103 Luna
2. Bella (#101) is marked "in ring"
3. notificationIntegration detects the change
4. Finds Max (#102) as the next entry
5. Checks if `settings.notifyYourTurn === true`
6. Sends notification to Max's handler: "Max - You're Up! Bella (#101) just finished. You're up next!"

### 3. Class Starting Soon Notifications

**Setting**: "Class Starting Soon" toggle in Settings > Notifications

**Trigger**: 5 minutes before a class's scheduled start time

**How It Works**:
```typescript
// Manual registration required
notificationIntegration.registerClassSchedule(
  classId,
  'Scent Work',
  'Novice A',
  '2025-10-21T14:00:00'
);

// Automatically schedules notification for 5 minutes before
// Internal logic:
const startTime = new Date('2025-10-21T14:00:00');
const warningTime = new Date(startTime.getTime() - 5 * 60 * 1000);
setTimeout(() => {
  notifyClassStarting(classData, 5);
}, timeUntilWarning);
```

**When Does This Happen?**:
- Classes are loaded with scheduled start times
- Class list page registers classes on mount
- Background timer checks every minute for upcoming classes

**Example Flow**:
1. Class "Scent Work Novice A" is scheduled for 2:00 PM
2. Class list loads at 1:50 PM
3. notificationIntegration schedules notification for 1:55 PM
4. At 1:55 PM, checks if `settings.notifyClassStarting === true`
5. Sends notification: "Scent Work Novice A starting in 5 minutes!"

**Integration Points**:
```typescript
// ClassList.tsx - Register classes when loaded
useEffect(() => {
  classes.forEach(classData => {
    if (classData.scheduled_start_time) {
      notificationIntegration.registerClassSchedule(
        classData.id,
        classData.element,
        classData.level,
        classData.scheduled_start_time
      );
    }
  });
}, [classes]);
```

### 4. Schedule Conflict Notifications

**Setting**: "Schedule Conflicts" toggle in Settings > Notifications

**Trigger**: When entries are loaded and conflicts are detected

**How It Works**:
```typescript
// Manual call when entries are loaded
await notificationIntegration.checkScheduleConflicts(entries);

// Checks for same handler with overlapping classes
// Groups entries by handler
// Looks for time conflicts
```

**When Does This Happen?**:
- Entry list loads entries for a class
- Home page loads all entries
- User adds a new entry

**Example Flow**:
1. Handler "John Smith" has entries in two classes at same trial
2. Both classes scheduled at 2:00 PM
3. Entry list calls `checkScheduleConflicts(entries)`
4. Detects conflict: Same handler, same time
5. Checks if `settings.notifyConflicts === true`
6. Sends notification: "Schedule Conflict! Bella and Max both run at 2:00 PM"

**Integration Points**:
```typescript
// EntryList.tsx - Check conflicts when entries load
useEffect(() => {
  if (entries.length > 0) {
    notificationIntegration.checkScheduleConflicts(entries);
  }
}, [entries]);
```

### 5. Sync Error Notifications

**Setting**: "Sync Errors" toggle in Settings > Notifications

**Trigger**: When network/database operations fail

**How It Works**:
```typescript
// Manual call from error handlers
try {
  await saveResultToDatabase(result);
} catch (error) {
  await notificationIntegration.notifySyncError(
    'Failed to save results',
    'save_results',
    true  // retryable
  );
}
```

**When Does This Happen?**:
- Database save fails
- Network request fails
- Offline queue processing fails
- Real-time subscription errors

**Example Flow**:
1. Judge saves scoresheet results
2. Network request to Supabase fails (offline)
3. Error handler calls `notifySyncError(...)`
4. Checks if `settings.notifySyncErrors === true`
5. Sends notification: "Sync Error: Failed to save results. Tap to retry."

**Integration Points**:
```typescript
// entryService.ts - Sync error handling
try {
  const { error } = await supabase
    .from('results')
    .insert(resultData);

  if (error) throw error;
} catch (error) {
  console.error('Save failed:', error);

  // Notify user about sync error
  await notificationIntegration.notifySyncError(
    error.message,
    'save_result',
    true  // Can retry
  );

  // Queue for offline sync
  offlineQueueStore.enqueue('save_result', resultData);
}
```

## Manual Notification Triggers

For testing or special scenarios, you can manually trigger notifications:

```typescript
import { notificationIntegration } from '@/services/notificationIntegration';

// Manually notify about an entry's turn
await notificationIntegration.manuallyNotifyYourTurn(entryId);

// Manually notify about results
await notificationIntegration.manuallyNotifyResults(entryId);

// Manually notify about sync error
await notificationIntegration.notifySyncError(
  'Connection lost',
  'sync_entries',
  true  // retryable
);
```

## Integration Checklist

To fully integrate notifications, each component should:

### Entry List Components
- ✅ **Monitor entry changes** - Automatic via store subscription
- ⏳ **Register for "your turn" events** - Need to call when entry goes "in ring"
- ⏳ **Check schedule conflicts** - Need to call when entries load

```typescript
// EntryList.tsx
useEffect(() => {
  // Check for conflicts when entries load
  if (entries.length > 0) {
    notificationIntegration.checkScheduleConflicts(entries);
  }
}, [entries]);

// When marking entry as "in ring"
const handleMarkInRing = (entryId: number) => {
  markInRing(entryId, true);
  // notificationIntegration automatically handles "your turn" notification
};
```

### Class List Components
- ⏳ **Register class schedules** - Need to call when classes load

```typescript
// ClassList.tsx
useEffect(() => {
  classes.forEach(classData => {
    if (classData.scheduled_start_time) {
      notificationIntegration.registerClassSchedule(
        classData.id,
        classData.element,
        classData.level,
        classData.scheduled_start_time
      );
    }
  });
}, [classes]);
```

### Scoresheet Components
- ✅ **Results posted** - Automatic via store subscription when `isScored` changes
- ⏳ **Sync errors** - Need to add error handling

```typescript
// UKCRallyScoresheet.tsx
const handleSave = async () => {
  try {
    await saveResultToDatabase(result);
    updateEntry(entryId, { isScored: true, resultText });
    // notificationIntegration automatically sends "results posted" notification
  } catch (error) {
    // Add this:
    await notificationIntegration.notifySyncError(
      error.message,
      'save_scoresheet',
      true
    );
  }
};
```

### Offline Queue
- ⏳ **Sync errors** - Need to add notification when queue processing fails

```typescript
// offlineQueueStore.ts
const processQueue = async () => {
  for (const item of queue) {
    try {
      await processQueueItem(item);
    } catch (error) {
      // Add this:
      await notificationIntegration.notifySyncError(
        `Failed to sync ${item.operation}`,
        item.operation,
        true
      );
    }
  }
};
```

## Settings Integration

All notification toggles are already in place in [src/pages/Settings/Settings.tsx](src/pages/Settings/Settings.tsx):

```typescript
// User toggles
settings.enableNotifications      // Master toggle
settings.notifyClassStarting      // Class starting soon
settings.notifyYourTurn           // Your turn to compete
settings.notifyResults            // Results posted
settings.notifyConflicts          // Schedule conflicts
settings.notifySyncErrors         // Sync errors
```

The notification handlers automatically check these settings before sending notifications:

```typescript
// Inside notificationService.send()
if (!this.isNotificationTypeEnabled(payload.type)) {
  console.log(`Notification type ${payload.type} disabled in settings`);
  return null;
}
```

## Testing Notifications

### Test in Development

1. **Enable Notifications**:
   - Go to Settings > Notifications
   - Enable "Notifications"
   - Enable specific notification types
   - Grant browser notification permission

2. **Test Results Posted**:
   ```typescript
   // In browser console
   import { useEntryStore } from './stores/entryStore';

   // Mark entry as scored
   useEntryStore.getState().markAsScored(123, 'Q 95');
   ```

3. **Test Your Turn**:
   ```typescript
   // Mark entry as in ring (triggers next entry notification)
   useEntryStore.getState().markInRing(123, true);
   ```

4. **Test Class Starting**:
   ```typescript
   import { notificationIntegration } from './services/notificationIntegration';

   // Register class starting in 5 minutes
   const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
   notificationIntegration.registerClassSchedule(
     999,
     'Scent Work',
     'Novice A',
     fiveMinutesFromNow.toISOString()
   );
   ```

5. **Test Manual Triggers**:
   ```typescript
   import { notificationIntegration } from './services/notificationIntegration';

   // Test "your turn"
   await notificationIntegration.manuallyNotifyYourTurn(123);

   // Test "results"
   await notificationIntegration.manuallyNotifyResults(123);

   // Test "sync error"
   await notificationIntegration.notifySyncError(
     'Test error message',
     'test_operation',
     true
   );
   ```

### Test Notification Settings

1. **Disable Specific Type**:
   - Go to Settings > Notifications
   - Turn off "Results Posted"
   - Score an entry → No notification should appear

2. **Test DND Mode**:
   - Enable DND for 1 hour
   - Try triggering notifications → Should be blocked
   - Check notification queue status

3. **Test Quiet Hours**:
   - Set quiet hours (e.g., 10 PM - 8 AM)
   - Change system time to within quiet hours
   - Try triggering notifications → Should be blocked

## Common Issues & Solutions

### Notifications Not Appearing

1. **Check Permission**:
   ```typescript
   console.log(Notification.permission);
   // Should be "granted"
   ```

2. **Check Settings**:
   ```typescript
   import { useSettingsStore } from './stores/settingsStore';
   console.log(useSettingsStore.getState().settings);
   // enableNotifications should be true
   // Specific type (notifyResults, etc.) should be true
   ```

3. **Check Integration Initialized**:
   ```typescript
   // Should see this in console on app start:
   // "📱 Initializing notification integration..."
   // "📱 Notification integration initialized"
   ```

4. **Check DND/Quiet Hours**:
   ```typescript
   import { notificationService } from './services/notificationService';
   console.log(notificationService.isDNDActive());
   console.log(notificationService.isQuietHours());
   ```

### Notifications Sent Too Often

- Check if you're calling handlers multiple times
- Verify store subscription logic doesn't have infinite loops
- Use `React.StrictMode` detection to avoid double-mounting issues

### Class Start Notifications Not Working

- Verify `scheduled_start_time` is in ISO 8601 format
- Check that class registration happens when classes load
- Verify system time is correct
- Check console for scheduled warning messages

## Next Steps

To complete notification integration:

1. ⏳ **Add class schedule registration** in ClassList.tsx
2. ⏳ **Add schedule conflict checking** in EntryList.tsx
3. ⏳ **Add sync error notifications** in entryService.ts
4. ⏳ **Add sync error notifications** in offlineQueueStore.ts
5. ⏳ **Test all notification types** end-to-end
6. ⏳ **Test on mobile devices** (Android/iOS)

## Summary

**Automatic Triggers** (Already Working):
- ✅ Results Posted - Triggers when `entry.isScored` changes to `true`
- ✅ Your Turn - Triggers when previous entry marked `inRing`

**Manual Integration Needed**:
- ⏳ Class Starting - Need to register class schedules
- ⏳ Schedule Conflicts - Need to call when entries load
- ⏳ Sync Errors - Need to add to error handlers

**All notification handlers respect user settings** and will only send notifications if:
1. Master toggle (`enableNotifications`) is ON
2. Specific type toggle (e.g., `notifyResults`) is ON
3. Not blocked by DND or quiet hours (unless urgent)
4. Browser notification permission is granted
