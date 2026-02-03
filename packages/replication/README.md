# @myk9/replication

Offline-first replication system for the myK9 Platform.

## Overview

`@myk9/replication` provides a complete offline-first data synchronization infrastructure for syncing data between Supabase (PostgreSQL) and IndexedDB (client-side). It enables both myK9Show and myK9Q to work seamlessly offline while maintaining data consistency when reconnected.

### Key Features

- ✅ **Offline-First**: Full CRUD operations work offline
- ✅ **Automatic Sync**: Bidirectional sync with Supabase
- ✅ **Conflict Resolution**: Multiple strategies (LWW, field-level, authoritative)
- ✅ **Real-time Updates**: Supabase real-time subscription integration
- ✅ **Performance**: Optimized queries, caching, and batching
- ✅ **Type-Safe**: Full TypeScript support with generics
- ✅ **Observable**: Event-driven architecture for UI updates

## Installation

This package is part of the myK9 Platform monorepo:

```bash
pnpm install
```

## Quick Start

### 1. Create a Replicated Table

Extend `ReplicatedTable` to create your own domain-specific table:

```typescript
import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { supabase } from './supabaseClient';

interface Dog {
  id: string;
  name: string;
  breed: string;
  handler_name?: string;
  updated_at?: string;
}

class ReplicatedDogsTable extends ReplicatedTable<Dog> {
  constructor() {
    super({
      storeName: 'dogs',
      tableName: 'dogs',
      supabase,
      // Optional: customize behavior
      syncIntervalMs: 30000, // 30 seconds
      batchSize: 100,
    });
  }

  // Optional: Add domain-specific methods
  async findByBreed(breed: string): Promise<Dog[]> {
    const allDogs = await this.getAll();
    return allDogs.filter(dog => dog.breed === breed);
  }
}

export const replicatedDogsTable = new ReplicatedDogsTable();
```

### 2. Initialize Replication

```typescript
import { replicatedDogsTable } from './tables/ReplicatedDogsTable';

// Initialize with initial sync
await replicatedDogsTable.init();

// Start listening for changes
await replicatedDogsTable.subscribe();
```

### 3. Perform Operations

```typescript
// Create (works offline)
const newDog = await replicatedDogsTable.create({
  name: 'Buddy',
  breed: 'Golden Retriever',
  handler_name: 'John Doe',
});

// Read
const dog = await replicatedDogsTable.get('dog-id');
const allDogs = await replicatedDogsTable.getAll();

// Update
await replicatedDogsTable.update('dog-id', {
  handler_name: 'Jane Doe',
});

// Delete
await replicatedDogsTable.delete('dog-id');

// Query with filter
const goldens = await replicatedDogsTable.query({
  where: { breed: 'Golden Retriever' },
  orderBy: 'name',
  limit: 10,
});
```

### 4. Listen for Changes

```typescript
// Subscribe to changes
replicatedDogsTable.on('sync:success', (result: SyncResult) => {
  console.log(`Synced ${result.pulledCount} items from server`);
});

replicatedDogsTable.on('data:changed', (dogs: Dog[]) => {
  console.log('Data updated:', dogs.length);
  // Update UI
});

// Unsubscribe
replicatedDogsTable.off('sync:success', handler);
```

## Core Concepts

### Offline-First Architecture

```
┌──────────────┐
│   UI Layer   │
└──────┬───────┘
       │
┌──────▼───────┐      ┌──────────────┐
│ Replicated   │◄─────┤   Events     │
│    Table     │      │  Observable  │
└──┬────────┬──┘      └──────────────┘
   │        │
   │        └──────────┐
   │                   │
┌──▼──────────┐  ┌────▼─────────┐
│  IndexedDB  │  │   Supabase   │
│   (Local)   │  │   (Remote)   │
└─────────────┘  └──────────────┘
```

1. **All operations** go to IndexedDB first (fast, offline-capable)
2. **Changes tracked** in pending mutations queue
3. **Automatic sync** when online to Supabase
4. **Pull changes** from Supabase and merge into local
5. **Conflict resolution** when both sides changed

### Data Flow

#### Create/Update/Delete Flow
```
User Action
   ↓
ReplicatedTable.create/update/delete()
   ↓
1. Write to IndexedDB (instant)
   ↓
2. Add to pending mutations queue
   ↓
3. Trigger sync (debounced)
   ↓
4. Push mutations to Supabase
   ↓
5. Mark as synced
   ↓
6. Emit 'data:changed' event
```

#### Sync Flow
```
Trigger Sync (periodic or manual)
   ↓
1. Push pending local mutations
   ↓
2. Pull changes from Supabase
   ↓
3. Conflict detection
   ↓
4. Apply conflict resolution
   ↓
5. Merge into IndexedDB
   ↓
6. Emit 'sync:success' event
```

## API Reference

### ReplicatedTable<T>

Base class for creating replicated tables.

#### Constructor Options

```typescript
interface ReplicatedTableOptions<T> {
  storeName: string;           // IndexedDB store name
  tableName: string;            // Supabase table name
  supabase: SupabaseClient;     // Supabase client
  syncIntervalMs?: number;      // Sync interval (default: 30000)
  batchSize?: number;           // Batch size (default: 100)
  conflictStrategy?: ConflictStrategy; // Conflict resolution
  logger?: Logger;              // Custom logger
}
```

#### CRUD Methods

```typescript
// Create
create(data: Partial<T>): Promise<T>

// Read
get(id: string): Promise<T | undefined>
getAll(options?: QueryOptions): Promise<T[]>
query(options: QueryOptions): Promise<T[]>

// Update
update(id: string, changes: Partial<T>): Promise<T>
upsert(data: Partial<T>): Promise<T>

// Delete
delete(id: string): Promise<void>
```

#### Lifecycle Methods

```typescript
// Initialize table and perform initial sync
init(): Promise<void>

// Subscribe to real-time updates
subscribe(): Promise<void>

// Unsubscribe from updates
unsubscribe(): Promise<void>

// Trigger manual sync
sync(options?: SyncOptions): Promise<SyncResult>

// Clear local data
clear(): Promise<void>

// Destroy instance
destroy(): Promise<void>
```

#### Event System

```typescript
// Listen for events
on(event: string, handler: Function): void

// Remove listener
off(event: string, handler: Function): void

// Available events:
- 'data:changed': (data: T[]) => void
- 'sync:start': () => void
- 'sync:success': (result: SyncResult) => void
- 'sync:error': (error: Error) => void
- 'conflict:detected': (conflict: Conflict<T>) => void
```

### Conflict Resolution

The package provides multiple conflict resolution strategies:

#### Last-Write-Wins (LWW)

```typescript
import { ConflictResolver } from '@myk9/replication';

const resolver = new ConflictResolver();

// Resolve using timestamps
const result = resolver.resolveLWW(localEntity, remoteEntity);
// Returns the entity with the latest updated_at timestamp
```

#### Field-Level Merge

```typescript
// Merge specific fields with authority
const result = resolver.resolveFieldLevel(
  localEntity,
  remoteEntity,
  {
    // Field authorities: 'local', 'remote', 'latest'
    name: 'local',        // Local always wins
    score: 'remote',      // Remote always wins
    notes: 'latest',      // Latest timestamp wins
  }
);
```

#### Server Authoritative

```typescript
// Remote always wins
const result = resolver.resolveServerAuthoritative(local, remote);
```

#### Client Authoritative

```typescript
// Local always wins
const result = resolver.resolveClientAuthoritative(local, remote);
```

#### Custom Strategy

```typescript
class CustomDogsTable extends ReplicatedTable<Dog> {
  protected async resolveConflict(
    local: Dog,
    remote: Dog
  ): Promise<Dog> {
    // Custom logic: Handler name from local, rest from remote
    return {
      ...remote,
      handler_name: local.handler_name,
    };
  }
}
```

### DatabaseManager

Manages IndexedDB connections and stores.

```typescript
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';

// Initialize database
await databaseManager.init();

// Get transaction
const tx = await databaseManager.transaction(['dogs'], 'readwrite');

// Access store
const store = tx.objectStore('dogs');

// Close database
await databaseManager.close();
```

### Constants

```typescript
import {
  // Database
  DB_NAME,                  // 'myk9-replication'
  DB_VERSION,               // 1
  TOTAL_REPLICATED_TABLES,  // 16

  // TTL
  DEFAULT_TTL_MS,           // 24 hours
  ENTRY_TTL_MS,             // 7 days
  RESULT_TTL_MS,            // 30 days

  // Sync
  SYNC_INTERVAL_MS,         // 30 seconds
  MAX_SYNC_RETRIES,         // 3

  // Batch
  DEFAULT_CHUNK_SIZE,       // 100
  MAX_CHUNK_SIZE,           // 500
} from '@myk9/replication';
```

## Advanced Usage

### Custom Sync Options

```typescript
// Sync with custom options
await table.sync({
  forcePull: true,          // Force pull even if no changes
  forcePush: true,          // Force push all local changes
  batchSize: 50,            // Custom batch size
  filter: { show_id: '123' }, // Filter what to sync
});
```

### Querying with Filters

```typescript
// Complex query
const results = await table.query({
  where: {
    breed: 'Golden Retriever',
    handler_name: { $like: 'John%' }
  },
  orderBy: 'name',
  order: 'asc',
  limit: 20,
  offset: 0,
});
```

### Performance Monitoring

```typescript
table.on('sync:success', (result: SyncResult) => {
  console.log('Performance:', {
    duration: result.durationMs,
    pulled: result.pulledCount,
    pushed: result.pushedCount,
    conflicts: result.conflictsCount,
  });
});
```

### Prefetching Data

```typescript
// Prefetch related data before needed
await table.prefetch({
  show_id: currentShowId,
  trial_id: currentTrialId,
});
```

### Transaction Tracking

```typescript
import {
  trackTransaction,
  getActiveTransactionCount,
  waitForActiveTransactions
} from '@myk9/replication';

// Track transaction
const txEnd = trackTransaction();
try {
  // Perform operations
} finally {
  txEnd();
}

// Wait for all transactions to complete
await waitForActiveTransactions();
```

## Type Definitions

### Core Types

```typescript
// Replicated row with sync metadata
interface ReplicatedRow<T> extends T {
  _synced_at?: number;
  _last_modified_at?: number;
  _sync_version?: number;
}

// Sync result
interface SyncResult {
  success: boolean;
  pulledCount: number;
  pushedCount: number;
  conflictsCount: number;
  durationMs: number;
  errors?: Error[];
}

// Pending mutation
interface PendingMutation<T = any> {
  id: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  data: T;
  timestamp: number;
  retries: number;
  status: 'pending' | 'syncing' | 'error';
}

// Conflict
interface Conflict<T> {
  table: string;
  id: string;
  local: T;
  remote: T;
  timestamp: number;
}
```

### Conflict Resolution Types

```typescript
type ConflictStrategy =
  | 'last-write-wins'
  | 'server-authoritative'
  | 'client-authoritative'
  | 'field-level'
  | 'manual';

interface ConflictResolutionResult<T> {
  resolvedEntity: T;
  strategy: ConflictStrategy;
  hadConflict: boolean;
  automatic: boolean;
}

type FieldAuthority = 'local' | 'remote' | 'latest';
```

## Architecture

### Package Structure

```
packages/replication/
├── src/
│   ├── conflict/
│   │   ├── ConflictManager.ts      # Conflict detection & tracking
│   │   └── ConflictResolver.ts     # Conflict resolution strategies
│   ├── core/
│   │   ├── DatabaseManager.ts      # IndexedDB management
│   │   ├── ReplicatedTable.ts      # Base replicated table
│   │   ├── ReplicatedTableBatch.ts # Batch operations
│   │   └── ReplicatedTableCache.ts # Caching layer
│   ├── constants.ts                # Configuration constants
│   ├── dependencies.ts             # DI interfaces
│   ├── types.ts                    # Type definitions
│   └── index.ts                    # Public API
├── package.json
└── README.md
```

### Dependency Injection

The package uses dependency injection for flexibility:

```typescript
import { noopLogger, noopDiagnostics } from '@myk9/replication';

// Custom logger
const customLogger = {
  log: (msg: string) => console.log(`[REPLICATION] ${msg}`),
  error: (msg: string, error?: Error) => console.error(msg, error),
};

// Pass to table
const table = new ReplicatedDogsTable({
  // ... other options
  logger: customLogger,
});
```

## Best Practices

### 1. Always Init Before Use

```typescript
// Initialize once at app startup
await replicatedDogsTable.init();
```

### 2. Subscribe to Changes for UI Updates

```typescript
// React example
useEffect(() => {
  const handler = (dogs: Dog[]) => setDogs(dogs);
  replicatedDogsTable.on('data:changed', handler);
  return () => replicatedDogsTable.off('data:changed', handler);
}, []);
```

### 3. Handle Errors Gracefully

```typescript
table.on('sync:error', (error) => {
  // Log error
  console.error('Sync failed:', error);
  // Show user notification
  showNotification('Sync failed, will retry');
});
```

### 4. Use Appropriate Conflict Strategy

- **LWW**: Good for most cases, simple timestamps
- **Field-Level**: When different fields have different authorities
- **Server Authoritative**: For read-only local data
- **Custom**: For business-specific logic

### 5. Batch Operations

```typescript
// Instead of individual creates
for (const dog of dogs) {
  await table.create(dog); // Slow
}

// Use bulk operations
await table.bulkCreate(dogs); // Fast
```

### 6. Clean Up Subscriptions

```typescript
// Always clean up
await table.unsubscribe();
await table.destroy();
```

## Troubleshooting

### Sync Not Working

1. Check network connection
2. Verify Supabase client is authenticated
3. Check table permissions in Supabase
4. Enable debug logging

```typescript
import { setLogLevel } from '@myk9/core';
setLogLevel('debug');
```

### Conflicts Not Resolving

1. Verify `updated_at` timestamps exist
2. Check conflict strategy configuration
3. Listen for `conflict:detected` events
4. Implement custom resolution if needed

### Performance Issues

1. Reduce sync interval
2. Increase batch size
3. Use query filters to limit data
4. Enable caching
5. Monitor slow queries

### Database Corruption

```typescript
// Clear and reinitialize
await table.clear();
await table.init();
```

## Performance Characteristics

| Operation | Local (IndexedDB) | Remote (Supabase) |
|-----------|-------------------|-------------------|
| Read | <1ms | 50-200ms |
| Write | 1-5ms | 100-500ms |
| Query (100 items) | 5-10ms | 200-800ms |
| Bulk Insert (100) | 10-20ms | 500-2000ms |
| Sync (100 items) | - | 1000-3000ms |

## Migration from Legacy Code

If you have existing replication code, here's how to migrate:

### Before (Legacy)

```typescript
// Direct Supabase calls
const { data } = await supabase
  .from('dogs')
  .select('*')
  .eq('breed', 'Golden Retriever');
```

### After (Replicated)

```typescript
// Works offline, syncs automatically
const dogs = await replicatedDogsTable.query({
  where: { breed: 'Golden Retriever' }
});
```

## Testing

The package includes utilities for testing:

```typescript
// Mock table for tests
class MockDogsTable extends ReplicatedTable<Dog> {
  async init() {
    // No-op in tests
  }
}
```

## Dependencies

- **idb** (runtime): IndexedDB wrapper
- **@supabase/supabase-js** (peer): Supabase client
- **@myk9/core** (dev): Shared utilities

## Used By

- `@myk9/show` - myK9Show application
- `@myk9/q` - myK9Q application (partial usage)

## Contributing

When contributing to `@myk9/replication`:

1. **Test offline scenarios** - Core use case
2. **Handle conflicts gracefully** - Don't lose data
3. **Performance matters** - Cache and batch
4. **Type safety** - Full generic support
5. **Document behavior** - Complex system

## Roadmap

- [ ] Add partial sync (delta sync)
- [ ] Improve conflict resolution UI hooks
- [ ] Add sync progress reporting
- [ ] Support for attachments/blobs
- [ ] Multi-user collaboration awareness

## License

Private - myK9 Platform

## Support

For questions or issues:
- Review this README and source code
- Check CLAUDE.md for patterns
- See examples in app implementations
- Ask in team chat

---

**Version:** 0.0.1
**Last Updated:** 2026-02-03
