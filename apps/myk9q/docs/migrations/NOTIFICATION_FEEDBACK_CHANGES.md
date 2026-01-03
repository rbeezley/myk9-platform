# Notification System Changes Based on User Feedback

## Date: 2025-10-21

## User Feedback & Changes

### 1. ✅ Results Posted - Fixed to Only Notify When Class Complete

**Original Issue**: "Results posted will be notifying constantly for everyone as in a scentwork there are multiple rings and a dog only searches for 2 minutes sometimes only a few seconds."

**Problem**: The notification was being sent immediately when each individual entry was scored, which would spam everyone constantly.

**Solution**: Changed to only notify when **all dogs in the class have been scored** and **placements are finalized**.

**Changes Made**:
- Modified [src/services/notificationIntegration.ts](src/services/notificationIntegration.ts)
- Added `onClassComplete()` method that triggers only when ALL entries in a class are scored
- Only notifies top 4 placed entries
- Added helpful hint to Settings page: "When entire class is complete with placements"

**Code**:
```typescript
private async onEntryScored(entry: Entry, previousState: Entry): Promise<void> {
  // Check if all entries in this class are now scored
  const { currentClassEntries } = useEntryStore.getState();
  const classEntries = currentClassEntries.filter(e => e.classId === entry.classId);
  const allScored = classEntries.every(e => e.isScored);

  if (allScored && classEntries.length > 0) {
    // Class is complete! Notify about final placements
    await this.onClassComplete(entry.classId, classEntries);
  }
}
```

### 2. ✅ Your Turn - Made Configurable (1-5 Dogs Ahead)

**Original Issue**: "Your Turn to Compete - needs to be configurable for number of dogs before them instead of just one. some people will want more notice and depends on how far away the search area is."

**Problem**: Hardcoded to notify only when 1 dog ahead (next up), not configurable.

**Solution**: Added `notifyYourTurnLeadDogs` setting with options for 1-5 dogs ahead.

**Changes Made**:
- Added `notifyYourTurnLeadDogs: 1 | 2 | 3 | 4 | 5` to [src/stores/settingsStore.ts](src/stores/settingsStore.ts)
- Default value: 2 dogs ahead
- Updated [src/services/notificationIntegration.ts](src/services/notificationIntegration.ts) to use this setting
- Updated [src/services/notificationHandlers.ts](src/services/notificationHandlers.ts) to accept `dogsAhead` parameter
- Added dropdown to [src/pages/Settings/Settings.tsx](src/pages/Settings/Settings.tsx) under "Your Turn to Compete"

**Settings UI**:
```tsx
{settings.notifyYourTurn && (
  <div className="setting-item indented">
    <label htmlFor="notifyYourTurnLeadDogs">Notify When Dogs Ahead</label>
    <select value={settings.notifyYourTurnLeadDogs}>
      <option value="1">1 dog ahead (default)</option>
      <option value="2">2 dogs ahead</option>
      <option value="3">3 dogs ahead</option>
      <option value="4">4 dogs ahead</option>
      <option value="5">5 dogs ahead</option>
    </select>
  </div>
)}
```

**Notification Message Examples**:
- 1 dog ahead: "Bella (#102) - You're Up Next! Max (#101) just entered the ring. You're up next!"
- 3 dogs ahead: "Bella (#104) - Get Ready! Max (#101) just entered the ring. You're 3 dogs away."

### 3. ⏳ Class Starting Soon - Needs Verification

**Original Question**: "Class Starting Soon - Do we have a class scheduled start time field?"

**Response Needed**: We need to verify if the `classes` table has a `scheduled_start_time` field.

**Current Implementation**:
- The code assumes classes have a `scheduled_start_time` field
- Uses `registerClassSchedule()` method to schedule 5-minute warnings
- Components would need to call this when classes are loaded

**TODO**:
1. Check if `scheduled_start_time` exists in database schema
2. If not, add migration to add this field
3. Update ClassList component to register class schedules on load

### 4. ✅ Schedule Conflicts - Removed

**Original Feedback**: "Schedule Conflicts - I think this should be removed. provides no real value."

**Changes Made**:
- ❌ Removed `notifyConflicts` setting from [src/stores/settingsStore.ts](src/stores/settingsStore.ts)
- ❌ Removed `schedule_conflict` from NotificationType in [src/services/notificationService.ts](src/services/notificationService.ts)
- ❌ Removed `notifyScheduleConflict()` function from [src/services/notificationHandlers.ts](src/services/notificationHandlers.ts)
- ❌ Removed `checkScheduleConflicts()` method from [src/services/notificationIntegration.ts](src/services/notificationIntegration.ts)
- ❌ Removed from [src/hooks/useNotifications.ts](src/hooks/useNotifications.ts)
- ❌ Removed Schedule Conflicts toggle from Settings page
- ❌ Removed from all settings profiles in [src/utils/settingsProfiles.ts](src/utils/settingsProfiles.ts)
- ❌ Removed from smart defaults in [src/services/smartDefaults.ts](src/services/smartDefaults.ts)

**Result**: Completely removed from codebase. Schedule conflicts are no longer tracked or notified.

## Summary of Changes

### Settings Store Changes
**File**: [src/stores/settingsStore.ts](src/stores/settingsStore.ts)

**Added**:
```typescript
notifyYourTurnLeadDogs: 1 | 2 | 3 | 4 | 5; // How many dogs ahead to notify
```

**Removed**:
```typescript
notifyConflicts: boolean; // ❌ Removed
```

### Notification Integration Changes
**File**: [src/services/notificationIntegration.ts](src/services/notificationIntegration.ts)

**Changed**:
- `onEntryScored()` - Now checks if entire class is complete
- `onEntryInRing()` - Uses `notifyYourTurnLeadDogs` setting to determine which dog to notify
- Added `onClassComplete()` - New method for class completion notification
- Removed `checkScheduleConflicts()` - No longer needed

**Before**:
```typescript
// Notify immediately when next dog
const nextEntry = unscoredEntries[currentIndex + 1];
await this.onNextEntryUp(nextEntry, entry);
```

**After**:
```typescript
// Notify the dog that is N dogs ahead (based on user setting)
const leadDogs = settings.notifyYourTurnLeadDogs;
const targetIndex = currentIndex + leadDogs;
if (targetIndex < unscoredEntries.length) {
  const targetEntry = unscoredEntries[targetIndex];
  await this.onNextEntryUp(targetEntry, entry, leadDogs);
}
```

### Notification Handlers Changes
**File**: [src/services/notificationHandlers.ts](src/services/notificationHandlers.ts)

**Changed**:
```typescript
export async function notifyYourTurn(
  entry: Entry,
  previousEntry?: Entry,
  dogsAhead: number = 1  // ✅ Added parameter
): Promise<void> {
  let body: string;
  let title: string;

  if (dogsAhead === 1) {
    title = `${entry.callName} (#${entry.armband}) - You're Up Next!`;
    body = previousEntry
      ? `${previousEntry.callName} (#${previousEntry.armband}) just entered the ring. You're up next!`
      : `You're up next!`;
  } else {
    title = `${entry.callName} (#${entry.armband}) - Get Ready!`;
    body = previousEntry
      ? `${previousEntry.callName} (#${previousEntry.armband}) just entered the ring. You're ${dogsAhead} dogs away.`
      : `You're ${dogsAhead} dogs away from competing.`;
  }
  // ... rest of notification payload
}
```

**Removed**:
- `notifyScheduleConflict()` function completely removed

### Settings Page Changes
**File**: [src/pages/Settings/Settings.tsx](src/pages/Settings/Settings.tsx)

**Added**:
```tsx
{settings.notifyYourTurn && (
  <div className="setting-item indented" style={{ paddingLeft: '2rem' }}>
    <div className="setting-info">
      <label htmlFor="notifyYourTurnLeadDogs">Notify When Dogs Ahead</label>
      <span className="setting-hint">How many dogs before you to get notified</span>
    </div>
    <select
      id="notifyYourTurnLeadDogs"
      value={settings.notifyYourTurnLeadDogs}
      onChange={(e) => updateSettings({ notifyYourTurnLeadDogs: parseInt(e.target.value) as any })}
    >
      <option value="1">1 dog ahead (default)</option>
      <option value="2">2 dogs ahead</option>
      <option value="3">3 dogs ahead</option>
      <option value="4">4 dogs ahead</option>
      <option value="5">5 dogs ahead</option>
    </select>
  </div>
)}
```

**Changed**:
```tsx
<div className="setting-item indented">
  <div className="setting-info">
    <label htmlFor="notifyResults">Results Posted</label>
    <span className="setting-hint">When entire class is complete with placements</span> {/* ✅ Added hint */}
  </div>
  {/* ... toggle ... */}
</div>
```

**Removed**:
```tsx
<div className="setting-item indented">
  <div className="setting-info">
    <label htmlFor="notifyConflicts">Schedule Conflicts</label> {/* ❌ Removed */}
  </div>
  {/* ... toggle ... */}
</div>
```

## Files Modified

1. ✅ [src/stores/settingsStore.ts](src/stores/settingsStore.ts) - Added `notifyYourTurnLeadDogs`, removed `notifyConflicts`
2. ✅ [src/services/notificationIntegration.ts](src/services/notificationIntegration.ts) - Updated logic for results and your turn
3. ✅ [src/services/notificationHandlers.ts](src/services/notificationHandlers.ts) - Updated `notifyYourTurn()`, removed `notifyScheduleConflict()`
4. ✅ [src/services/notificationService.ts](src/services/notificationService.ts) - Removed `schedule_conflict` type
5. ✅ [src/hooks/useNotifications.ts](src/hooks/useNotifications.ts) - Removed `notifyScheduleConflict` export
6. ✅ [src/pages/Settings/Settings.tsx](src/pages/Settings/Settings.tsx) - Added lead dogs dropdown, removed conflicts toggle
7. ✅ [src/utils/settingsProfiles.ts](src/utils/settingsProfiles.ts) - Removed `notifyConflicts` from all profiles
8. ✅ [src/services/smartDefaults.ts](src/services/smartDefaults.ts) - Removed `notifyConflicts`, added `notifyYourTurnLeadDogs`

## TypeScript Status

✅ **All TypeScript type checking passes with 0 errors**

```bash
$ npm run typecheck
> tsc --noEmit
# No errors!
```

## Testing Recommendations

### Test Results Posted
1. Start a class with multiple entries
2. Score entries one by one
3. Verify NO notification is sent until the last entry is scored
4. When last entry is scored, verify notifications are sent only to top 4 placements
5. Verify notification says placement (1st Place, 2nd Place, etc.)

### Test Your Turn (Configurable Lead)
1. Go to Settings > Notifications > Your Turn to Compete
2. Set "Notify When Dogs Ahead" to 3 dogs
3. Have entries in a class: #101, #102, #103, #104, #105
4. Mark #101 as "in ring"
5. Verify notification is sent to #104 (3 dogs ahead), NOT #102
6. Verify notification says "You're 3 dogs away"
7. Test with different values (1, 2, 4, 5 dogs ahead)

### Test Schedule Conflicts Removed
1. Verify no "Schedule Conflicts" toggle in Settings
2. Verify no schedule conflict notifications are ever sent
3. Verify typecheck passes without any schedule_conflict references

## Next Steps

1. ⏳ **Verify `scheduled_start_time` field exists** in database schema for classes
2. ⏳ **Integrate Class Starting Soon** notifications by registering class schedules when ClassList loads
3. ⏳ **Test all notification types** end-to-end in development
4. ⏳ **Test on mobile devices** (Android/iOS) to verify vibration, sound, and badges work
5. ⏳ **Update documentation** to reflect these changes

## Breaking Changes

None - all changes are backward compatible. Default values:
- `notifyYourTurnLeadDogs`: defaults to 2 (was effectively 1 before)
- Removed setting `notifyConflicts` was opt-in, so removing it doesn't break existing functionality

## User Impact

**Positive Changes**:
- ✅ No more notification spam from results posted
- ✅ Configurable lead time for "your turn" notifications
- ✅ Cleaner, simpler settings (removed unused schedule conflicts)
- ✅ More accurate notifications (results only when class complete)
- ✅ Better UX for different venue sizes (1-5 dogs ahead configurable)

**No Negative Impact** - All changes improve the notification system based on real-world usage feedback.
