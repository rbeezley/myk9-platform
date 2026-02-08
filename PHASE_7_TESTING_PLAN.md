# Phase 7: Testing & Validation

**Status:** In Progress (Tier 1 ✅ + Tier 2 Partial ✅)
**Started:** 2026-02-07
**Last Updated:** 2026-02-07

---

## Overview

Phase 7 focuses on comprehensive testing of critical services and infrastructure to ensure production readiness for the myK9 Platform monorepo. Testing is organized into tiers based on priority and deployment requirements.

---

## ✅ Tier 1: COMPLETE

**Target:** Must Test Before Production (Critical services to 80-85% coverage)
**Status:** 100% Complete
**Time Spent:** ~6 hours (under 7-9hr estimate)

| # | Service | Location | Coverage | Target | Status | Date |
|---|---------|----------|----------|--------|--------|------|
| 1 | subscriptionCleanup | `apps/myk9q/src/services/subscription/` | 100% | 80% | ✅ | 2026-02-07 |
| 2 | announcementService | `apps/myk9q/src/services/announcements/` | 88.26% | 80% | ✅ | 2026-02-07 |
| 3 | entryStatusManagement | `apps/myk9q/src/services/entry/` | 95.55% | 85% | ✅ | 2026-02-07 |

**Total Tests Added:** 113+ tests across 3 critical services

---

## ✅ Tier 2 (Option 1): COMPLETE - Replication Infrastructure

**Target:** Important But Can Deploy (Infrastructure to 60%+ coverage)
**Status:** 100% Complete
**Time Spent:** ~6 hours
**Actual Coverage:** ~95% (exceeded 60% target)

### Core Infrastructure Tests

**Location:** `apps/myk9q/src/services/replication/__tests__/`

| File | Tests | Coverage | Status | Date |
|------|-------|----------|--------|------|
| DatabaseManager.test.ts | - | - | ✅ | 2026-02-07 |
| MutationManager.test.ts | - | - | ✅ | 2026-02-07 |
| ReplicationManager.test.ts | - | - | ✅ | 2026-02-07 |
| SyncOrchestrator.test.ts | - | - | ✅ | 2026-02-07 |

### Replicated Table Classes Tests

**Location:** `apps/myk9show/src/services/replication/__tests__/`

| File | Tests | Coverage | Focus Areas | Status | Date |
|------|-------|----------|-------------|--------|------|
| ReplicatedClassesTable.test.ts | 46 | 72.91% | Query building, scent work fields, trial association | ✅ | 2026-02-07 |
| ReplicatedEntriesTable.test.ts | 55 | 100% | CRUD, status transitions, filtering, workflows | ✅ | 2026-02-07 |
| ReplicatedDogsTable.test.ts | 39 | 100% | Search, filtering, conflict resolution, images | ✅ | 2026-02-07 |
| ReplicatedShowsTable.test.ts | 69 | 98.66% | Lifecycle, date filtering, metadata management | ✅ | 2026-02-07 |
| ReplicatedTrialsTable.test.ts | 63 | 100% | Entry limits, scheduling, show association | ✅ | 2026-02-07 |
| ReplicatedClubsTable.test.ts | 68 | 100% | Profile management, search, soft-delete filtering | ✅ | 2026-02-07 |

**Batch Summary:**
- **Batch 2:** Classes, Entries, Dogs (140 tests, 90.97% avg coverage)
- **Batch 3:** Shows, Trials, Clubs (200 tests, 99.55% avg coverage)

**Total Tests Added:** 340+ tests across 10 files
**Total Lines:** 7,146+ lines of test code

### Key Testing Patterns Established

```typescript
// Mocking Patterns
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),  // For database functions
  },
}));

// Cache Testing Pattern
const mockEntriesTable = {
  get: vi.fn().mockResolvedValue({ /* entry data */ }),
  set: vi.fn().mockResolvedValue(undefined),
};

// Timer Testing Pattern
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const promise = asyncFunction();
await vi.runAllTimersAsync();
await promise;
```

---

## ⏳ Tier 2 (Option 2): REMAINING - Zustand Stores

**Target:** Important But Can Deploy (Client state to 50% coverage)
**Status:** Not Started
**Estimated Time:** 4-6 hours
**Current Coverage:** 1.8%

### Stores to Test

**Location:** `packages/scoring/src/stores/` (shared) and app-specific stores

| Store | Location | Current | Target | Priority | Estimated Time |
|-------|----------|---------|--------|----------|----------------|
| scoringStore.ts | `packages/scoring/src/stores/` | Low | 50% | High | 2-3 hours |
| timerStore.ts | `packages/scoring/src/stores/` | Low | 50% | High | 1-2 hours |
| entryStore.ts | `apps/myk9q/src/stores/` | Low | 50% | Medium | 1-2 hours |

### Testing Focus Areas

**scoringStore:**
- Scoring session lifecycle (start, pause, resume, end)
- Score submission and validation
- Sync status management
- Error handling and recovery
- Multi-judge scoring scenarios

**timerStore:**
- Multi-area timer management (scent work)
- Start/stop/reset functionality
- Area-specific time tracking
- Time limit warnings and expiration
- Timer persistence across sessions

**entryStore:**
- Entry list state management
- Filtering and sorting
- In-ring status tracking
- Drag-and-drop order management
- Cache synchronization

---

## Coverage Commands

```bash
# Run all service tests with coverage
cd apps/myk9q
pnpm test -- src/services --coverage --run

# Run specific service tests
pnpm test -- src/services/entry/entryStatusManagement.test.ts --coverage --run

# Run replication tests
cd apps/myk9show
pnpm test -- src/services/replication/__tests__ --coverage --run

# Watch mode for development
pnpm test -- <test-file>.test.ts --watch
```

---

## Commits

### Phase 7 Commits
1. **257d39b** - `test(myk9q): Add comprehensive service tests for announcements and subscriptions`
2. **7284514** - `test(myk9q): Complete Phase 7 Tier 1 testing with replication infrastructure tests`
3. **da46833** - `test(myk9show): Add comprehensive tests for replicated table classes`

---

## Decision Points

### Option A: Skip Zustand Stores → Proceed to Phase 8 (Deployment)
**Rationale:** "Important But Can Deploy" - not blocking production

**Pros:**
- Faster time to deployment
- Critical infrastructure already tested
- Can add store tests post-deployment

**Cons:**
- Client state management less tested
- Potential UI bugs in production
- Technical debt increases

### Option B: Complete Zustand Store Tests → Full Phase 7
**Rationale:** Better test coverage for client state management

**Pros:**
- Comprehensive test coverage
- Better confidence in UI state
- Reduced production bugs
- Complete Phase 7

**Cons:**
- Additional 4-6 hours of work
- Delays deployment timeline

---

## Phase 8 Preview: Deployment & Cleanup

**Estimated Time:** 8-12 hours

### Tasks
1. **Deployment Preparation**
   - Environment configuration review
   - Database migration verification
   - Production build testing
   - Performance benchmarking

2. **Documentation Updates**
   - API documentation
   - Deployment guides
   - Testing documentation
   - Architecture diagrams

3. **Cleanup**
   - Remove deprecated code
   - Clean up TODO comments
   - Archive old migration files
   - Update README files

4. **Production Deployment**
   - Deploy myK9Show
   - Deploy myK9Q
   - Monitor error rates
   - Verify functionality

---

## Metrics Summary

### Test Statistics
- **Total Tests Created:** 453+ tests
- **Total Lines of Test Code:** 11,595+ lines
- **Average Coverage (Tested Components):** ~94%
- **Time Spent:** ~12 hours (under original estimates)

### Coverage by Area
| Area | Tests | Coverage | Status |
|------|-------|----------|--------|
| Critical Services | 113 | 94.6% avg | ✅ Complete |
| Replication Core | - | - | ✅ Complete |
| Replicated Tables | 340 | 95% avg | ✅ Complete |
| Zustand Stores | 0 | 1.8% | ⏳ Pending |

---

## Testing Methodology **[ADDED]**

### Tools & Frameworks

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **Vitest** | Unit tests | `vitest.config.ts` in each app/package |
| **Playwright** | E2E tests | `playwright.config.ts` in app roots |
| **@testing-library/react** | Component testing | Included in test-utils package |
| **vi.mock()** | Mocking dependencies | Vitest's built-in mocking |
| **fake-indexeddb** | IndexedDB mocking | For testing replication layer |

### Test File Structure

```
src/
├── services/
│   ├── myService.ts
│   └── myService.test.ts          # Unit tests co-located
└── __tests__/
    └── myIntegration.test.ts      # Integration tests grouped
```

### Running Tests

```bash
# All tests with coverage
pnpm test -- --coverage --run

# Watch mode (single file)
pnpm test -- path/to/file.test.ts

# E2E tests
pnpm test:e2e

# Specific test pattern
pnpm test -- -t "should handle error"
```

---

## Testing Standards & Contribution Guidelines **[ADDED]**

### Writing New Tests

**1. File Naming:**
- Unit tests: `*.test.ts` (co-located with source)
- Integration tests: `__tests__/*.test.ts`
- E2E tests: `e2e/*.spec.ts`

**2. Test Structure:**
```typescript
describe('ComponentName', () => {
  // Setup
  beforeEach(() => {
    // Reset state, initialize mocks
  });

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks();
  });

  describe('feature or method name', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange
      const input = createTestData();

      // Act
      const result = methodUnderTest(input);

      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

**3. Coverage Targets:**
- Critical services: 80-85%
- Replication infrastructure: 60%+
- Zustand stores: 50%+
- UI components: 70%+ (aspirational)

**4. What to Test:**
- ✅ Happy path scenarios
- ✅ Error handling
- ✅ Edge cases (empty arrays, null values, etc.)
- ✅ Async operations and race conditions
- ✅ State transitions
- ❌ Third-party library internals
- ❌ Simple getters/setters without logic

**5. Mocking Guidelines:**
- Mock external dependencies (Supabase, IndexedDB)
- Use `vi.fn()` for callbacks
- Reset mocks between tests
- Test with real data structures when possible
- Add `/* eslint-disable @typescript-eslint/no-explicit-any */` for test files using `any` in mocks

---

## CI/CD Integration **[ADDED]**

### Current Status
- ⏳ **Not yet configured** - Tests run locally only
- 🎯 **Planned for Phase 8:** GitHub Actions workflow

### Planned CI Pipeline

```yaml
# .github/workflows/test.yml (planned)
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test -- --coverage --run
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Pre-commit Hooks (Recommended)
```bash
# Install husky for git hooks
pnpm add -D husky lint-staged

# .husky/pre-commit
pnpm typecheck
pnpm lint
pnpm test -- --changed --passWithNoTests
```

---

## Debugging Failed Tests **[ADDED]**

### Common Issues

**1. Async Timing Issues**
```typescript
// ❌ Bad: Race condition
it('should update state', () => {
  asyncFunction();
  expect(state).toBe('updated'); // Fails!
});

// ✅ Good: Wait for promise
it('should update state', async () => {
  await asyncFunction();
  expect(state).toBe('updated');
});
```

**2. Mock Not Reset**
```typescript
// Always reset mocks between tests
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks(); // For vi.spyOn()
});
```

**3. Fake Timers**
```typescript
// When testing setTimeout/setInterval
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// In test
await vi.runAllTimersAsync();
```

**4. IndexedDB State**
```typescript
// Clear IndexedDB between tests
import { IDBFactory } from 'fake-indexeddb';

beforeEach(() => {
  global.indexedDB = new IDBFactory();
});
```

### Debugging Commands

```bash
# Run single test in debug mode
node --inspect-brk ./node_modules/.bin/vitest --no-coverage path/to/test.ts

# Show test names without running
pnpm test -- --reporter=verbose --run --dry-run

# Run tests matching pattern
pnpm test -- -t "should sync" --run

# Show full error diffs
pnpm test -- --reporter=verbose --run
```

### Getting Help

1. Check test output for stack traces
2. Review mock setup in `beforeEach`
3. Verify test isolation (no shared state)
4. Check for async/await issues
5. Search existing tests for similar patterns
6. Ask in team chat with error message

---

## Next Steps

1. **Decide:** Skip Zustand stores or complete them?
2. **If skipping:** Begin Phase 8 (Deployment preparation)
3. **If completing:** Spawn 3 agents for store testing (estimated 4-6 hours)
4. **Post-deployment:** Monitor production, address any issues, plan Phase 9 (future enhancements)

---

## Notes

- All tests follow established patterns from myK9Q test suite
- ESLint rules configured for test files (allow `any` in mocks)
- Vitest used for unit tests, Playwright for E2E
- Tests validate offline-first architecture and conflict resolution
- Server-wins strategy confirmed for all sync operations
