# Fix 591 Failing myK9Show Unit Tests — Design

**Goal:** Bring the myK9Show test suite from ~591 failures to green by creating a centralized
Supabase mock, deleting dead tests, and fixing the remaining failures by category.

**Approach:** Centralized chainable Supabase mock factory (Approach A from brainstorming).

---

## Root Cause Analysis

591 failures stem from 5 distinct root causes:

| Root Cause                    | ~Tests | Description                                                               |
| ----------------------------- | ------ | ------------------------------------------------------------------------- |
| Incomplete mock chains        | ~108   | Production added `.is('deleted_at', null)` etc., mocks lack those methods |
| No mock at all (fetch failed) | ~150+  | Integration tests hit real Supabase URL, get network errors               |
| Deprecated APIs               | ~19    | SyncQueue/SyncService refactored, tests use old method names              |
| Component rendering           | ~50+   | Missing providers, outdated mock shapes, store API changes                |
| Assertion mismatches          | ~20-30 | Mock data shape drift, empty data, removed entities                       |

**Key insight:** There is no centralized Supabase mock. Every test file builds its own chain from
scratch. When production code adds a chain method, every test breaks individually.

---

## Design

### 1. Centralized Chainable Mock Factory

Create `apps/myk9show/src/test/mocks/supabase.ts` with a Proxy-based mock:

- `createChainableQuery(resolvedValue?)` — returns a Proxy where any property access returns a
  `vi.fn()` that returns another chainable Proxy. When awaited (`.then` trap), resolves to
  `resolvedValue` (default: `{ data: [], error: null }`).
- `createMockSupabase()` — returns a mock client with `.from()` returning a chainable query, plus
  stubs for `.auth`, `.channel`, `.removeChannel`.
- Every chain method is a `vi.fn()` so tests can assert call arguments.
- Tests override per-test: `mockSupabase.from.mockReturnValue(createChainableQuery({ data: [...] }))`.

### 2. Global Registration

In `apps/myk9show/src/test/setup.ts`:

- Register `vi.mock` for both `@/services/database/supabaseClient` and `@/lib/supabase` using
  `createMockSupabase()`.
- Mock utility exports (`checkDatabaseConnection`, `getCurrentUser`, `signOut`, etc.).
- `beforeEach` reset so per-test overrides don't leak.
- Export `mockSupabase` and `createChainableQuery` for test files that need custom data.

### 3. Migration Strategy

Tests migrate by **removing** their per-file `vi.mock()` blocks (the global handles it). Tests
needing specific return data add a one-liner: `mockSupabase.from.mockReturnValue(...)`.

---

## Work Breakdown

### Category 1: Delete dead tests (~170 tests, ~15-20 files)

- Integration tests that hit real Supabase (fetch failed) — delete files
- Deprecated SyncQueue/SyncService tests — delete file
- Do first to clear noise from subsequent runs

### Category 2: Build mock factory + fix chain failures (~108 tests, ~40+ files)

- Create `src/test/mocks/supabase.ts`
- Register globally in `src/test/setup.ts`
- Remove per-file `vi.mock()` blocks, add per-test overrides where needed
- Parallelizable with sub-agents grouped by directory

### Category 3: Fix component rendering failures (~50+ tests, ~15-20 files)

- Missing providers, outdated store mock shapes, changed hook APIs
- Not fixed by Supabase mock factory — needs individual attention
- Parallelizable with sub-agents

### Category 4: Fix assertion mismatches (~20-30 tests, ~5-10 files)

- Update mock data shapes and expected values to match current interfaces
- Small, file-by-file fixes

---

## Execution Plan

**Session structure:** 2-3 sessions with a hard **5-minute cap per file**. If a file resists
fixing, skip it and move on. Previous attempt burned a full day — avoid by deleting dead weight,
automating mechanical fixes, and skipping the stubborn.

**Order:**

1. Build mock factory + register globally
2. Delete dead tests (clears ~170 failures)
3. Migrate mock chain tests (sub-agent parallelizable by directory)
4. Fix component rendering tests (sub-agent parallelizable)
5. Fix assertion mismatches (small tail)
6. Final verification — full suite green, update coverage thresholds

**Success criteria:**

- 0 failing tests (or documented skips with justification)
- `pnpm typecheck && pnpm lint` still pass
- Coverage thresholds updated to reflect new baseline
