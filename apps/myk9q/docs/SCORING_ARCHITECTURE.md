# Scoring Architecture Guide

This document explains the scoring system architecture in myK9Q, covering the complete flow from check-in to final placements.

## Quick Reference

| Operation | Latency | Offline? | Background? |
|-----------|---------|----------|-------------|
| Optimistic UI update | <50ms | Yes | No |
| Database write | 100-150ms | Queued | Yes |
| Immediate sync | 50-100ms | N/A | Yes |
| Class completion check | 100-300ms | N/A | Yes |
| Placement calculation | 100-200ms | N/A | Yes |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Scoresheet UI                                  │
│              (AKCScentWork, AKCFastCAT, UKCRally, etc.)                 │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        useScoresheetCore Hook                            │
│                    (Common scoresheet logic)                             │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      useOptimisticScoring Hook                           │
│              (Instant UI + background server sync)                       │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
           ┌───────────────────────┴───────────────────────┐
           │                                               │
           ▼                                               ▼
┌─────────────────────┐                       ┌─────────────────────┐
│   Online Path       │                       │   Offline Path      │
│                     │                       │                     │
│  submitScore()      │                       │  offlineQueueStore  │
│       ↓             │                       │       ↓             │
│  Database write     │                       │  IndexedDB queue    │
│       ↓             │                       │       ↓             │
│  Immediate sync     │                       │  Auto-sync when     │
│       ↓             │                       │  back online        │
│  Background tasks   │                       │                     │
└─────────────────────┘                       └─────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/services/entry/scoreSubmission.ts` | Core score submission logic |
| `src/services/entry/entryStatusManagement.ts` | Check-in and status updates |
| `src/services/entry/classCompletionService.ts` | Class completion tracking |
| `src/hooks/useOptimisticScoring.ts` | Optimistic update pattern |
| `src/hooks/useOfflineQueueProcessor.ts` | Offline queue processing |
| `src/stores/offlineQueueStore.ts` | Offline queue state |
| `src/services/placementService.ts` | Final placement calculation |

---

## Entry Lifecycle

### Status Progression

```
no-status → checked-in → in-ring → completed
    ↑                        ↓
    └────── reset ───────────┘
```

### Entry Status Types

```typescript
type EntryStatus =
  | 'no-status'      // Not checked in
  | 'checked-in'     // Checked in at registration
  | 'at-gate'        // Called to gate
  | 'come-to-gate'   // Being called to gate
  | 'conflict'       // Scheduling conflict
  | 'pulled'         // Withdrawn from class
  | 'in-ring'        // Currently competing
  | 'completed';     // Finished scoring
```

### Result Status (Database)

```typescript
// entries.result_status enum
'pending'           // Not yet scored
'qualified'         // Passed (Q)
'not_qualified'     // Failed (NQ)
'excused'           // Excused (EX)
'located'           // Located - Scent Work specific (LE)
'did_not_finish'    // DNF
'absent'            // Did not appear
'withdrawn'         // Withdrawn
'manual_complete'   // Manually completed (no score)
```

---

## Score Submission Flow

### High-Level Process

```
1. Judge enters score in scoresheet
        ↓
2. Validation (scoresheet-level)
        ↓
3. Optimistic update (instant UI feedback)
        ↓
4. Submit to server (async, background)
        ↓
5. Update entries table (single atomic write)
        ↓
6. Trigger immediate sync (cache update)
        ↓
7. Background: Check class completion
        ↓
8. Background: Calculate placements (if class complete)
```

### ScoreData Interface

```typescript
interface ScoreData {
  resultText: string;              // 'Qualified', 'Not Qualified', etc.
  searchTime?: string;             // "1:45.23"
  faultCount?: number;             // 0-99
  points?: number;                 // For sports scoring
  nonQualifyingReason?: string;    // "Time", "Not Located", etc.

  // AKC Scent Work specific
  areaTimes?: string[];            // ["45", "52", "38"]
  element?: string;                // "Interior", "Exterior", etc.
  level?: string;                  // "Novice", "Advanced", etc.
  healthCheckPassed?: boolean;

  // Nationals specific
  correctCount?: number;
  incorrectCount?: number;
  finishCallErrors?: number;

  // FastCAT specific
  mph?: number;

  // Rally/Obedience specific
  score?: number;
  deductions?: number;
}
```

### Submission Service

```typescript
// src/services/entry/scoreSubmission.ts
export async function submitScore(
  entryId: number,
  scoreData: ScoreData,
  pairedClassId?: number,    // For combined Novice A & B
  classId?: number           // Performance optimization
): Promise<boolean>
```

**Key behaviors:**
1. Prepares data via `prepareScoreUpdateData()`
2. Converts `resultText` → `result_status` enum
3. Converts time strings to seconds
4. Single atomic database update
5. Triggers immediate sync
6. Fires background class completion check

---

## Optimistic Updates

### Why Optimistic?

Field conditions are challenging:
- Poor/intermittent connectivity
- Multiple judges scoring simultaneously
- Users expect instant feedback

### How It Works

```typescript
// src/hooks/useOptimisticScoring.ts

const handleSave = async () => {
  await submitScoreOptimistically({
    entryId: 123,
    scoreData: { resultText: 'Qualified', searchTime: '1:45' },
    classId: 456,
    armband: 42,
    className: 'Interior Novice',
    onSuccess: () => navigate('/entries'),
    onError: (error) => showError(error),
  });
};
```

### Flow

```
Score save requested
        ↓
Step 1: Update local state IMMEDIATELY (<50ms)
  - Mark as scored in entryStore
  - Add to scoring session
  - UI shows score instantly ✓
        ↓
Step 2: Submit to server (async, background)
  - If online: Call submitScore()
  - If offline: Queue for sync
        ↓
Step 3: Handle result
  - Success: Real-time subscription confirms
  - Offline: Allow navigation (queued)
  - Error: Show error indicator
```

---

## Autosave Behavior

### Configuration

```typescript
// src/services/scoresheetAutoSave.ts

interface AutoSaveConfig {
  interval: number;              // Default: 10 seconds
  enabled: boolean;              // Default: true
  maxDraftsPerEntry: number;     // Default: 3
  cloudBackup: boolean;          // Default: false
}
```

### Features

1. **Draft Management**
   - Saves incomplete scoresheets to localStorage
   - Keeps up to 3 most recent drafts per entry
   - Automatically cleans up old drafts

2. **Recovery Mechanism**
   - Detects page crashes/unload
   - Saves recovery data on `beforeunload` event
   - Recovers data on app restart (within 1 hour)

3. **Conflict Detection**
   - Tracks device ID for each draft
   - Detects multi-device edits
   - Provides merge options

### Usage in Scoresheets

```typescript
const { startAutoSave, stopAutoSave } = scoresheetAutoSaveService;

useEffect(() => {
  startAutoSave(draftId, () => ({
    resultText: qualifying,
    searchTime,
    faultCount,
  }), entryId, trialId);

  return () => stopAutoSave(draftId);
}, [draftId, qualifying, searchTime, faultCount]);
```

### Storage Keys

- `scoresheet_draft_[draftId]`: Active draft
- `scoresheet_recovery_[draftId]`: Crash recovery
- `myK9Q_device_id`: Device identifier

---

## Offline Queue

### Queue Structure

```typescript
// src/stores/offlineQueueStore.ts

interface QueuedScore {
  id: string;                    // UUID
  entryId: number;
  armband: number;
  classId: number;
  className: string;
  scoreData: ScoreData;
  timestamp: string;             // ISO timestamp
  retryCount: number;            // 0-3
  maxRetries: number;            // Default: 3
  lastError?: string;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
}
```

### Queue Lifecycle

```
User submits score while offline
        ↓
Add to IndexedDB queue (status: 'pending')
        ↓
UI shows "Queued for sync" indicator
        ↓
Device comes back online
        ↓
useOfflineQueueProcessor detects online event
        ↓
Process queue sequentially:
  ├─ Mark item as 'syncing'
  ├─ Call submitScore()
  ├─ Success: Mark 'completed', remove from queue
  └─ Failure:
      ├─ Retry <= 3: Wait and retry (exponential backoff)
      └─ Retry > 3: Move to failedItems
```

### Retry Logic

```
Attempt 1: Immediate
Attempt 2: Wait 1 second  (2^0 * 1000ms)
Attempt 3: Wait 2 seconds (2^1 * 1000ms)
Attempt 4: Wait 4 seconds (2^2 * 1000ms)
After max retries: Move to failed queue
```

### Processing Hook

```typescript
// src/hooks/useOfflineQueueProcessor.ts

// Setup globally in App.tsx
function App() {
  useOfflineQueueProcessor();  // Monitors online/offline, processes queue
  // ...
}
```

---

## Class Completion Tracking

### Service

```typescript
// src/services/entry/classCompletionService.ts

export async function checkAndUpdateClassCompletion(
  classId: number,
  pairedClassId?: number,        // For combined Novice A & B
  justScoredEntryId?: number,    // Read replica lag workaround
  justResetEntryId?: number      // Read replica lag workaround
): Promise<void>
```

### Algorithm

1. **Count total entries** in class
2. **Count scored entries** (is_scored = true)
3. **Handle read replica lag** (adjust counts for recent changes)
4. **Update class status**:
   - All scored → `'completed'`
   - Some scored → `'in_progress'`
   - None scored → `'no-status'`

### Read Replica Lag Workaround

```typescript
// Problem: Read replicas may lag behind writes by 0-5 seconds
// Solution: Pass hints about recent changes

// Just scored entry not yet in read replica
if (justScoredEntryId && !scoredIdsFromQuery.includes(justScoredEntryId)) {
  scoredCount += 1;
}

// Just reset entry still showing as scored
if (justResetEntryId && scoredIdsFromQuery.includes(justResetEntryId)) {
  scoredCount -= 1;
}
```

### Class Status Values

```typescript
type ClassStatus =
  | 'no-status'     // No scoring started
  | 'setup'         // Class being set up
  | 'briefing'      // Judges briefing
  | 'break'         // Break time
  | 'start_time'    // Starting soon
  | 'in_progress'   // Scoring in progress
  | 'completed';    // All entries scored
```

---

## Placement Calculation

### Trigger

Automatically runs when class completes:
1. `checkAndUpdateClassCompletion()` marks class as 'completed'
2. Calls `recalculateFinalPlacements(classId)`

### Service

```typescript
// src/services/placementService.ts

export async function recalculatePlacementsForClass(
  classIds: number | number[],
  licenseKey: string,
  isNationals: boolean = false
): Promise<void>
```

### Ranking Rules

**Regular Shows:**
1. Qualified > Not Qualified
2. Fewest Faults (if qualified)
3. Fastest Time (lowest seconds)

**Nationals:**
1. Qualified > Not Qualified
2. Highest Points
3. Fastest Time

### Database Function

Uses SQL window functions for single-operation efficiency:
```sql
RANK() OVER (
  PARTITION BY class_id
  ORDER BY is_qualified DESC, total_faults ASC, search_time_seconds ASC
)
```

---

## Conflict Resolution

### Detection

```typescript
// src/services/conflictResolution.ts

export function detectConflict(
  entryId: string,
  localData: ConflictEntryData,
  remoteData: ConflictEntryData,
  type: ConflictType
): Conflict | null
```

**Conflict occurs when:**
- Same entry modified locally and remotely
- Timestamps within 1 minute of each other
- Data differs

### Auto-Resolution Strategies

| Conflict Type | Strategy |
|---------------|----------|
| `entry_data` | Try merge if different fields changed |
| `status` | Use more advanced status (progression-based) |
| `score` | Use most recent timestamp |

### Manual Resolution

When auto-resolution fails, user can:
1. Keep local version
2. Use remote version
3. Merge (if possible)

---

## Scoresheet Implementation

### Base Hook

```typescript
// src/pages/scoresheets/hooks/useScoresheetCore.ts

interface ScoresheetCoreConfig {
  sportType?: 'AKC_SCENT_WORK' | 'AKC_SCENT_WORK_NATIONAL' | 'AKC_FASTCAT';
  isNationals?: boolean;
}

const core = useScoresheetCore({ sportType: 'AKC_SCENT_WORK' });
```

### Returned API

```typescript
// Submission
core.submitScore(currentEntry, extraData?);

// Navigation
core.navigateBack();
core.navigateBackWithRingCleanup(currentEntry);

// State
core.isSubmitting;      // Currently submitting
core.isLoadingEntry;    // Loading entry data
core.isSyncing;         // Server sync in progress
core.hasError;          // Last sync failed

// UI
core.CelebrationModal;  // Success celebration component
```

### Scoresheet Types

| Component | Sport | File |
|-----------|-------|------|
| AKCScentWorkScoresheet | AKC Scent Work | `src/pages/scoresheets/AKC/` |
| AKCNationalsScoresheet | AKC Nationals | `src/pages/scoresheets/AKC/` |
| AKCFastCatScoresheet | AKC FastCAT | `src/pages/scoresheets/AKC/` |
| UKCRallyScoresheet | UKC Rally | `src/pages/scoresheets/UKC/` |
| UKCObedienceScoresheet | UKC Obedience | `src/pages/scoresheets/UKC/` |
| UKCNoseworkScoresheet | UKC Nosework | `src/pages/scoresheets/UKC/` |
| ASCAScentDetectionScoresheet | ASCA Scent | `src/pages/scoresheets/ASCA/` |

---

## Real-time Subscriptions

### Subscribe to Entry Updates

```typescript
// src/services/entry/entrySubscriptions.ts

export function subscribeToEntryUpdates(
  classId: number,
  licenseKey: string,
  onUpdate: (payload: RealtimePayload) => void
): () => void  // Returns unsubscribe function
```

### Event Types

```typescript
type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: ReplicatedEntry | null;
  old: ReplicatedEntry | null;
  changedFields?: string[];
};
```

### Multi-Judge Scenario

```
[Judge A scores entry 42]
    └─ submitScore(42, data)
         ├─ Database write
         ├─ Realtime broadcast
         └─ All judges' caches updated

[Judge B sees entry 42 completed in real-time]
    - WebSocket subscription triggers
    - Local IndexedDB cache updated
    - Entry moves to "Completed" tab
    - No page refresh needed
```

---

## Error Handling

### Network Errors

| Scenario | Response |
|----------|----------|
| Offline | Queue score for sync |
| Back online | Auto-process queue |
| Sync failure | Retry with exponential backoff |
| Max retries exceeded | Move to failed list, allow manual retry |

### Database Errors

Logged with full context:
```typescript
console.error('❌ Database error:', {
  error: error.message,
  code: error.code,
  details: error.details,
  hint: error.hint
});
```

### Validation Errors

- **Scoresheet level**: Prevent submission if invalid
- **Service level**: Map results to valid enums
- **Database level**: Check constraints prevent invalid values

---

## Best Practices

### DO

- Use `submitScoreOptimistically()` for all score submissions
- Let background tasks handle completion and placements
- Trust the offline queue for network failures
- Use `triggerImmediateEntrySync()` after mutations

### DON'T

- Block the UI waiting for server response
- Manually calculate placements (use the service)
- Bypass optimistic updates for "critical" scores
- Ignore offline queue failures in the UI

---

## Performance Characteristics

### Data Fetching

| Operation | Cache | Database |
|-----------|-------|----------|
| Single class | 10-20ms | 100-300ms |
| Multiple classes | 20-50ms | 300-500ms |
| By armband | 20-30ms | 200-400ms |

### Score Submission

| Phase | Time | Blocking? |
|-------|------|-----------|
| Optimistic update | <50ms | No |
| Database write | 100-150ms | Background |
| Immediate sync | 50-100ms | Background |
| Class completion | 100-300ms | Background |
| Placements | 100-200ms | Background |
| **Total user time** | **<50ms** | ✓ |

---

## Related Documentation

- [OFFLINE_FIRST_PATTERNS.md](./OFFLINE_FIRST_PATTERNS.md) - Cache-first data access
- [DATABASE_REFERENCE.md](./DATABASE_REFERENCE.md) - Database schema
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) - System overview
