# @myk9/core

Core utilities, types, and constants for the myK9 Platform monorepo.

## Overview

`@myk9/core` provides foundational utilities and shared types used across both myK9Show and myK9Q applications. It serves as the base layer for common functionality like logging, networking, time/date formatting, error handling, and search operations.

## Installation

This package is part of the myK9 Platform monorepo and is installed automatically when you install dependencies:

```bash
pnpm install
```

## Usage

Import utilities directly from the package:

```typescript
import { logger, formatTimeForDisplay, withRetry } from '@myk9/core';

// Logging
logger.info('Starting operation');

// Time formatting
const displayTime = formatTimeForDisplay(125); // "2:05"

// Network retry
const data = await withRetry(() => fetchData(), {
  maxRetries: 3,
  backoffMs: 1000
});
```

## Features

### 🔍 Logging

Consistent logging across the platform with configurable log levels:

```typescript
import { logger, setLogLevel, debug, info, warn, error } from '@myk9/core';

// Configure log level
setLogLevel('debug');

// Use logger
logger.info('User logged in', { userId: '123' });
logger.error('Failed to sync', new Error('Network timeout'));

// Or use standalone functions
info('Operation started');
error('Operation failed', { reason: 'timeout' });
```

### 🌐 Network Utilities

Robust network operations with timeout and retry logic:

```typescript
import { withTimeout, withRetry, isRetryableError } from '@myk9/core';

// Add timeout to operation
const result = await withTimeout(
  () => fetch('/api/data'),
  5000 // 5 second timeout
);

// Retry with exponential backoff
const data = await withRetry(
  () => apiCall(),
  {
    maxRetries: 3,
    backoffMs: 1000,
    maxBackoffMs: 10000
  }
);

// Check if error is retryable
if (isRetryableError(error)) {
  // Retry logic
}
```

**Constants:**
- `DEFAULT_TIMEOUT_MS`: 30000 (30s)
- `DEFAULT_MAX_RETRIES`: 3
- `DEFAULT_BACKOFF_BASE_MS`: 1000 (1s)
- `MAX_BACKOFF_MS`: 30000 (30s)
- `BACKOFF_JITTER`: 0.2 (20%)

**Presets:**
```typescript
import { TIMEOUT_PRESETS, RETRY_PRESETS } from '@myk9/core';

// Use predefined timeouts
withTimeout(operation, TIMEOUT_PRESETS.QUICK); // 5s
withTimeout(operation, TIMEOUT_PRESETS.STANDARD); // 30s
withTimeout(operation, TIMEOUT_PRESETS.LONG); // 60s

// Use predefined retry strategies
withRetry(operation, RETRY_PRESETS.AGGRESSIVE); // 5 retries, 500ms backoff
withRetry(operation, RETRY_PRESETS.STANDARD); // 3 retries, 1000ms backoff
withRetry(operation, RETRY_PRESETS.CONSERVATIVE); // 2 retries, 2000ms backoff
```

### ⏱️ Time Formatting

Consistent time formatting for scoring and display:

```typescript
import {
  formatMilliseconds,
  formatSecondsToMMSS,
  formatSecondsToTime,
  convertTimeToSeconds,
  parseTimeToMs,
  formatTimeLimitSeconds
} from '@myk9/core';

// Format milliseconds to display time
formatMilliseconds(125450); // "2:05.45"

// Format seconds to MM:SS
formatSecondsToMMSS(125); // "2:05"

// Convert time string to seconds
convertTimeToSeconds("2:05"); // 125

// Parse time to milliseconds
parseTimeToMs("2:05.45"); // 125450

// Format time limit for display
formatTimeLimitSeconds(180); // "3:00"
```

### 📅 Date Formatting

Consistent date formatting and utilities:

```typescript
import {
  formatDateDisplay,
  formatDateMMDDYYYY,
  toYYYYMMDD,
  getTodayLocal,
  dateDifferenceInDays,
  formatTrialDate
} from '@myk9/core';

// Format date for display
formatDateDisplay("2024-01-15"); // "Mon, Jan 15, 2024"

// Format as MM/DD/YYYY
formatDateMMDDYYYY("2024-01-15"); // "01/15/2024"

// Convert to YYYY-MM-DD
toYYYYMMDD(new Date()); // "2024-01-15"

// Get today's date
const today = getTodayLocal(); // "2024-01-15"

// Calculate date difference
dateDifferenceInDays("2024-01-01", "2024-01-15"); // 14

// Format trial date
formatTrialDate("2024-01-15"); // "Monday, January 15"
```

### 🔍 Search & Filter

Powerful search and filtering utilities:

```typescript
import {
  matchesSearch,
  createSearchFilter,
  filterBySearchTerm,
  normalizeSearchTerm,
  createDebouncedSearch
} from '@myk9/core';

// Check if object matches search
const dog = { name: "Buddy", breed: "Golden Retriever" };
matchesSearch(dog, "golden", ['name', 'breed']); // true

// Create reusable filter
const filter = createSearchFilter(['name', 'breed']);
const results = dogs.filter(filter('retriever'));

// Filter array by search term
const filtered = filterBySearchTerm(dogs, 'buddy', ['name']);

// Normalize search term
normalizeSearchTerm("  Golden  Retriever  "); // "golden retriever"

// Create debounced search (300ms default)
const debouncedSearch = createDebouncedSearch(
  (term) => performSearch(term),
  300
);
debouncedSearch('query');
```

### ❌ Error Handling

Consistent error handling utilities:

```typescript
import { ensureError, isErrorLike, getErrorMessage } from '@myk9/core';

// Ensure value is Error instance
try {
  throw "Something went wrong";
} catch (e) {
  const error = ensureError(e); // Error instance
  logger.error(error.message);
}

// Check if value is error-like
if (isErrorLike(value)) {
  console.log(value.message);
}

// Get error message from any value
const message = getErrorMessage(unknownError); // string
```

### 📦 Entity Types

Type definitions for data entities with common traits:

```typescript
import type {
  BaseEntity,
  SyncableEntity,
  ShowScoped,
  TrialScoped,
  ClassScoped,
  SoftDeletable,
  Auditable,
  EntityWithTraits
} from '@myk9/core';

// Base entity with ID and timestamps
interface Dog extends BaseEntity {
  name: string;
  breed: string;
}

// Syncable entity with sync metadata
interface Entry extends SyncableEntity {
  dogId: string;
  classId: string;
  // Includes: _synced_at, _last_modified_at, _sync_version
}

// Show-scoped entity
interface Trial extends ShowScoped {
  date: string;
  // Includes: license_key, show_id
}

// Soft-deletable entity
interface Class extends SoftDeletable {
  name: string;
  // Includes: deleted_at, deleted_by
}

// Auditable entity
interface Score extends Auditable {
  time: number;
  // Includes: created_at, updated_at, created_by, updated_by
}

// Combine multiple traits
interface Entry extends EntityWithTraits<ShowScoped & TrialScoped & ClassScoped> {
  dogId: string;
  armband: string;
}
```

### 📊 Class Status

Constants and utilities for class status management:

```typescript
import {
  CLASS_STATUS,
  CLASS_STATUS_DISPLAY,
  getNextClassStatus,
  getClassStatusDisplay,
  getClassStatusBadgeClasses,
  normalizeClassStatus
} from '@myk9/core';

// Status constants
CLASS_STATUS.PENDING        // "pending"
CLASS_STATUS.IN_PROGRESS    // "in_progress"
CLASS_STATUS.COMPLETED      // "completed"
CLASS_STATUS.CANCELLED      // "cancelled"

// Get display name
getClassStatusDisplay("in_progress"); // "In Progress"

// Get next status
getNextClassStatus("pending"); // "in_progress"

// Get badge CSS classes
getClassStatusBadgeClasses("completed"); // "bg-green-100 text-green-800"

// Normalize legacy status
normalizeClassStatus("started"); // "in_progress"
```

## Package Structure

```
packages/core/
├── src/
│   ├── constants/
│   │   └── class-status.ts      # Class status constants
│   ├── types/
│   │   └── entities.ts           # Entity type definitions
│   ├── utils/
│   │   ├── logger.ts             # Logging utilities
│   │   ├── network.ts            # Network utilities
│   │   ├── timeFormatting.ts    # Time formatting
│   │   ├── dateFormatting.ts    # Date formatting
│   │   ├── errors.ts             # Error handling
│   │   └── search.ts             # Search & filter
│   └── index.ts                  # Public API
├── package.json
└── README.md
```

## API Reference

### Logging
- `logger`: Main logger instance
- `log(message, ...args)`: Log at current level
- `debug(message, ...args)`: Debug level log
- `info(message, ...args)`: Info level log
- `warn(message, ...args)`: Warning level log
- `error(message, ...args)`: Error level log
- `configureLogger(config)`: Configure logger
- `setLogLevel(level)`: Set log level

### Network
- `withTimeout<T>(fn, timeoutMs)`: Add timeout to async operation
- `withRetry<T>(fn, options)`: Retry async operation with backoff
- `isRetryableError(error)`: Check if error is retryable
- `calculateBackoffDelay(attempt, baseMs, maxMs, jitter)`: Calculate backoff delay
- `TimeoutError`: Timeout error class

### Time Formatting
- `formatMilliseconds(ms)`: Format ms to MM:SS.ss
- `formatSecondsToMMSS(seconds)`: Format seconds to MM:SS
- `formatSecondsToTime(seconds)`: Format seconds to readable time
- `convertTimeToSeconds(time)`: Convert time string to seconds
- `formatTimeForDisplay(seconds)`: Format time for display
- `formatTimeLimitSeconds(seconds)`: Format time limit
- `parseTimeToMs(time)`: Parse time to milliseconds
- `formatTimeInputToMMSS(input)`: Format input to MM:SS

### Date Formatting
- `formatDateDisplay(date)`: Format date for display
- `formatDateMMDDYYYY(date)`: Format as MM/DD/YYYY
- `formatDateLocal(date)`: Format date in local format
- `toYYYYMMDD(date)`: Convert to YYYY-MM-DD
- `getTodayLocal()`: Get today's date
- `dateDifferenceInDays(start, end)`: Calculate day difference
- `formatTrialDate(date)`: Format trial date
- `formatTime(date)`: Format time from date
- `isValidDateFormat(date)`: Validate date format

### Error Handling
- `ensureError(value)`: Convert any value to Error
- `isErrorLike(value)`: Check if value is error-like
- `getErrorMessage(value)`: Get error message

### Search & Filter
- `matchesSearch(obj, term, fields)`: Check if object matches search
- `matchesAny(values, term)`: Check if any value matches
- `createSearchFilter(fields)`: Create reusable filter
- `filterBySearchTerm(items, term, fields)`: Filter array
- `normalizeSearchTerm(term)`: Normalize search term
- `createDebouncedSearch(fn, delay)`: Create debounced search

### Types
- `BaseEntity`: Base entity with ID and timestamps
- `SyncableEntity`: Entity with sync metadata
- `LicenseKeyScoped`: Entity scoped to license key
- `ShowScoped`: Entity scoped to show
- `TrialScoped`: Entity scoped to trial
- `ClassScoped`: Entity scoped to class
- `SoftDeletable`: Entity with soft delete
- `Auditable`: Entity with audit fields
- `EntityWithTraits<T>`: Combine multiple traits

## Development

### Building

```bash
pnpm build
```

### Type Checking

```bash
pnpm typecheck
```

### Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch
```

### Cleaning

```bash
pnpm clean
```

## Dependencies

This package has zero runtime dependencies and only requires development dependencies for building and testing:

- `tsup` - Build tool
- `typescript` - Type checking
- `vitest` - Testing
- `rimraf` - Clean utility

## Used By

- `@myk9/show` - myK9Show application
- `@myk9/q` - myK9Q application
- `@myk9/replication` - Replication package
- `@myk9/scoring` - Scoring package
- `@myk9/scoring-ui` - Scoring UI package

## Contributing

When adding new utilities to `@myk9/core`:

1. **Keep it minimal** - Only add truly shared functionality
2. **Zero dependencies** - Avoid runtime dependencies
3. **Pure utilities** - No state, no side effects
4. **Type-safe** - Full TypeScript support
5. **Well-tested** - Add tests for new utilities
6. **Documented** - Update this README with examples

### Adding a New Utility

1. Create the utility file in `src/utils/`
2. Export from `src/index.ts`
3. Add tests in `src/__tests__/`
4. Document in this README
5. Build and test:
   ```bash
   pnpm build && pnpm test
   ```

## License

Private - myK9 Platform

## Support

For questions or issues related to `@myk9/core`, please:
- Check this README
- Review source code in `src/`
- Consult project CLAUDE.md for patterns
- Ask in team chat

---

**Version:** 0.0.1
**Last Updated:** 2026-02-03
