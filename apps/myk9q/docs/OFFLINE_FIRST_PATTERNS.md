# Offline-First Patterns Guide

This document explains when and how to use the offline-first data patterns in myK9Q.

## Quick Reference: When to Use What

| Data Need | Pattern | Why |
|-----------|---------|-----|
| Class entry list | Cache-first | Fast, works offline, class-scoped |
| Combined Novice A&B | Cache-first | Multiple classes supported |
| Trial-level entries | Database direct | Cache is class-scoped only |
| Armband search | Database direct | Not indexed in cache |
| Score submission | Optimistic + Queue | Immediate UI, syncs when online |
| Fresh data required | Force database | Skip cache for accuracy |

---

## Architecture Overview

### Key Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Components                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      entryDataLayer.ts                          │
│              (Unified interface: cache-first + fallback)         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
           ┌───────────────────┴───────────────────┐
           ▼                                       ▼
┌─────────────────────┐               ┌─────────────────────┐
│  Replication Cache  │               │   Supabase Direct   │
│    (IndexedDB)      │               │      (Network)      │
└─────────────────────┘               └─────────────────────┘
```

### File Locations

| File | Purpose |
|------|---------|
| `src/services/entry/entryDataLayer.ts` | Main data access interface |
| `src/services/replication/ReplicationManager.ts` | Cache management facade |
| `src/services/replication/MutationManager.ts` | Offline queue handling |
| `src/hooks/useOfflineQueueProcessor.ts` | Queue processing hook |

---

## Data Access Patterns

### 1. Cache-First Reads (Default)

**Use for:** Class-level entry lists, recently viewed data

```typescript
import { getClassEntries } from '@/services/entry/entryDataLayer';

// Single class - tries cache first, falls back to database
const entries = await getClassEntries(classId, licenseKey);

// Multiple classes (e.g., Novice A & B combined view)
const entries = await getClassEntries([classIdA, classIdB], licenseKey);
```

**What happens:**
1. Checks replication cache (IndexedDB)
2. If cache hit and not expired → returns cached data (~1-50ms)
3. If cache miss → fetches from Supabase (~200-500ms)

### 2. Database Direct (Skip Cache)

**Use for:** Trial-level queries, armband searches, fresh data requirements

```typescript
import { getTrialEntries, getEntriesByArmband } from '@/services/entry/entryDataLayer';

// Trial-level (cache is class-scoped, can't do this)
const entries = await getTrialEntries(trialId, licenseKey);

// Armband search (not indexed in cache)
const entries = await getEntriesByArmband(armband, licenseKey);

// Force skip cache when fresh data required
const entries = await getClassEntries(classId, licenseKey, {
  useReplication: false
});
```

### 3. Optimistic Updates (Writes)

**Use for:** Score submissions, status updates

```typescript
// The submission service handles this automatically:
// 1. Updates local cache immediately (optimistic)
// 2. Queues mutation for server sync
// 3. Syncs when online
// 4. Resolves conflicts if server differs
```

---

## Offline Queue

### How It Works

When offline, mutations are queued in IndexedDB and processed when back online:

```
User Action (e.g., submit score)
        │
        ▼
Update local cache (immediate UI feedback)
        │
        ▼
Queue mutation in IndexedDB
        │
        ▼
Network online? ────────────────┐
   │                            │
   │ NO                         │ YES
   ▼                            ▼
Stay in queue            Sync to server
                               │
                    ┌──────────┴──────────┐
                    │                     │
               Success               Failure
                    │                     │
                    ▼                     ▼
            Remove from queue     Retry with backoff
                              (1s → 2s → 4s, max 3 retries)
```

### Queue Entry Structure

```typescript
interface MutationEntry {
  id: string;                    // UUID
  type: 'UPDATE_STATUS' | 'SUBMIT_SCORE' | 'RESET_SCORE' | 'UPDATE_ENTRY';
  data: unknown;                 // Payload
  timestamp: number;             // When queued
  retries: number;               // Attempt count
  status: 'pending' | 'syncing' | 'failed' | 'success';
  error?: string;                // Last error
}
```

### Monitoring the Queue

```typescript
import { useOfflineQueueStore } from '@/stores/offlineQueueStore';

// In a component
const { pendingCount, failedCount, isSyncing } = useOfflineQueueStore();

// Show UI indicator when items pending
if (pendingCount > 0) {
  return <OfflineQueueBadge count={pendingCount} />;
}
```

---

## Conflict Resolution

When local and server data differ, conflicts are resolved using these strategies:

### Last-Write-Wins (Default)

```typescript
// Compare updated_at timestamps
Local:  { score: 95, updated_at: '2025-11-10T14:23:45.123Z' }
Remote: { score: 90, updated_at: '2025-11-10T14:23:44.999Z' }
Result: Local wins (newer timestamp)
```

### Server-Authoritative

Used for official data (scores, placements):
- Server version **always** wins
- Local changes discarded

### Client-Authoritative

Used for user preferences (check-in status, UI state):
- Local version **always** wins
- Server changes discarded

---

## Cache Configuration

### TTL (Time-To-Live) Settings

| Table | TTL | Rationale |
|-------|-----|-----------|
| Entries | 7 days | Frequently changing during shows |
| Classes | 30 days | Rarely changes mid-show |
| Trials | 30 days | Rarely changes mid-show |
| Shows | 30 days | Static during show |

### Eviction Rules

Cache items are **never** evicted when:
- They have pending mutations (dirty)
- Modified in last 5 minutes
- Accessed in last 30 seconds
- Device is offline

Cache items **can** be evicted when:
- Clean, old, and unaccessed
- Quota exceeded (soft limit: 4.5MB)

---

## Multi-Tenant Isolation

All queries are filtered by `licenseKey` to isolate data per show:

```typescript
// Every data layer function requires licenseKey
getClassEntries(classId, licenseKey);
getTrialEntries(trialId, licenseKey);
getEntriesByArmband(armband, licenseKey);
```

On logout or show switch, all caches are cleared:

```typescript
// Called automatically on logout
import { clearReplicationCaches } from '@/services/replication/initReplication';
await clearReplicationCaches();
```

---

## Best Practices

### DO

- Use `getClassEntries()` for entry lists (cache-first by default)
- Let the data layer handle caching decisions
- Trust optimistic updates for immediate UI feedback
- Monitor offline queue status in UI

### DON'T

- Skip cache without good reason (`useReplication: false`)
- Manually manage IndexedDB - use the data layer
- Assume data is fresh - check timestamps if critical
- Ignore offline queue failures - show user feedback

---

## Debugging

### Check Cache Status

```typescript
import { getReplicationManager } from '@/services/replication';

const manager = getReplicationManager();
const stats = await manager.getCacheStats();
console.log('Cache stats:', stats);
// → { totalRows, totalSizeMB, per-table breakdown }
```

### Monitor Replication Events

```typescript
// In browser console
window.addEventListener('replication:sync-complete', (e) => {
  console.log('Sync complete:', e.detail);
});

window.addEventListener('replication:conflict-resolved', (e) => {
  console.log('Conflict resolved:', e.detail);
});
```

### Force Full Sync

```typescript
import { getReplicationManager } from '@/services/replication';

const manager = getReplicationManager();
await manager.syncAll(); // Full sync all tables
```

---

## Related Documentation

- [REPLICATION_DOCS_INDEX.md](./REPLICATION_DOCS_INDEX.md) - Full replication system docs
- [DATABASE_REFERENCE.md](./DATABASE_REFERENCE.md) - Database schema
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) - System architecture
