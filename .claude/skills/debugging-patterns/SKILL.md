---
name: debugging-patterns
description: 'Common bug pattern lookup tables for React, Zustand, Supabase, and TypeScript. Use alongside superpowers:systematic-debugging during Phase 1 (Root Cause Investigation) and Phase 2 (Pattern Analysis) to quickly identify bug categories from symptoms — concurrency, state management, async, database/RLS, build, and UI bugs.'
---

# Common Bug Patterns Reference

Supplementary reference for `superpowers:systematic-debugging`. Use during Phase 1 (Root Cause Investigation) and Phase 2 (Pattern Analysis) to identify what category of bug you're dealing with.

## When to Use

During systematic debugging, after reproducing the issue but before forming a hypothesis. Scan the relevant category below to see if the symptoms match a known pattern — this accelerates root cause identification.

## Concurrency & Timing Bugs

These are the hardest to reproduce. If a bug is intermittent, check here first.

| Pattern               | Symptoms                                                                                        | Investigation Approach                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Race condition**    | Intermittent failures, works in debugger but fails in production, timing-dependent              | Add logging with timestamps at both competing paths. Look for shared mutable state accessed without synchronization. In React: look for state updates in `useEffect` cleanup racing against new renders |
| **Deadlock**          | Process/request hangs indefinitely, no error thrown, CPU idle                                   | Check for circular lock/await dependencies. In JS: look for circular `await` chains or Promise chains that never resolve. In DB: `SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock'`        |
| **Stale closure**     | React component shows old data, callback uses outdated value, "it works if I add a dependency"  | Check `useEffect`/`useCallback`/`useMemo` dependency arrays. Variable captured at creation time, not read time. Fix: add to deps array or use ref                                                       |
| **Event ordering**    | "Works on second try", initialization code runs after consumer, subscription misses first event | Trace event emission vs listener registration order. Zustand: store action fires before component subscribes. Supabase realtime: subscription not ready when first change happens                       |
| **Render cycle race** | UI flickers, shows loading then data then loading again, multiple rapid re-renders              | Multiple state updates trigger multiple renders. Look for `setState` calls that should be batched or derived state that should be computed                                                              |

## State Management Bugs

Common in React + Zustand + React Query codebases.

| Pattern                          | Symptoms                                                                               | Investigation Approach                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stale cache**                  | Old data shows after mutation, refresh fixes it                                        | Check React Query invalidation — is `queryClient.invalidateQueries` called with the right key after mutation? Check if optimistic update and server response disagree |
| **Hydration mismatch**           | Server-rendered content flashes/changes on mount, console warning about hydration      | Component renders differently on server vs client. Look for `window`, `localStorage`, or date/time usage in initial render                                            |
| **Zombie subscription**          | Memory leak, updates to unmounted component, "Can't perform state update on unmounted" | Missing cleanup in `useEffect` return. Supabase realtime channel not unsubscribed. Zustand `subscribe()` without `unsubscribe()` in cleanup                           |
| **Optimistic update divergence** | UI shows one thing, database has another, refresh "fixes" it                           | Optimistic Zustand update succeeded but async DB write failed silently. Check error handling in store actions                                                         |
| **Derived state desync**         | Filter shows wrong count, computed value doesn't match source data                     | State derived in component instead of computed from source. Fix: compute in selector or store, not in render                                                          |

## Async & Promise Bugs

| Pattern                         | Symptoms                                                                              | Investigation Approach                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Unhandled rejection**         | Silent failure, operation appears to succeed but doesn't                              | Search for `await` calls missing `.catch()` or not wrapped in try/catch. Supabase calls: check if `.error` is being inspected |
| **Missing await**               | Function returns before async work completes, test passes but behavior wrong          | Search for async function calls without `await`. Common: `supabase.from(...).insert(...)` without awaiting                    |
| **Promise.all partial failure** | Some items processed, others silently dropped                                         | One promise in `Promise.all` rejects, entire batch fails. Use `Promise.allSettled` and check each result                      |
| **Infinite re-fetch**           | Network tab shows repeated identical requests, React Query `isFetching` never settles | Query key changes every render (object reference not stable). `queryFn` creates new reference each call. Check deps           |

## Database & RLS Bugs

Specific to Supabase/Postgres.

| Pattern                            | Symptoms                                                             | Investigation Approach                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RLS blocks legitimate access**   | Query returns empty array (not error), user can't see their own data | Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'X'`. Verify `auth.uid()` matches the policy column. Test with `service_role` key to confirm data exists |
| **Missing foreign key index**      | Slow joins, timeouts on list pages with related data                 | Check `EXPLAIN ANALYZE` for sequential scans on join columns. See `supabase-postgres-best-practices` skill                                                                |
| **Transaction isolation surprise** | Concurrent users see stale data, lost updates                        | Two users read same row, both update, last write wins. Use `SELECT ... FOR UPDATE` or optimistic locking with version column                                              |
| **Migration ordering**             | `relation "X" does not exist`, works locally but fails in CI         | Migration references table/column created in a later migration. Check migration filenames sort order                                                                      |

## TypeScript & Build Bugs

| Pattern                  | Symptoms                                                                | Investigation Approach                                                                                           |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Type narrowing lost**  | `as any` needed to make it compile, property access on union type fails | Callback or async boundary resets narrowing. Extract to variable before the boundary, or use type guard function |
| **Circular import**      | `undefined` at runtime for something that exists, works after reorder   | Module A imports B imports A. Check with: `madge --circular src/` or trace the import chain manually             |
| **Barrel export order**  | Intermittent `undefined` import, works in some files but not others     | `index.ts` re-export order matters when circular deps exist. Import directly from source file, not barrel        |
| **Stale build artifact** | "Fixed" code still shows old behavior, `pnpm build` fixes it            | Turborepo cache served old output. Run `pnpm clean && pnpm build` to verify                                      |

## Browser & UI Bugs

| Pattern                      | Symptoms                                                 | Investigation Approach                                                                                                    |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Z-index stacking context** | Modal appears behind overlay, dropdown clipped by parent | Parent with `transform`, `opacity < 1`, or `will-change` creates new stacking context. Use devtools "Layers" panel        |
| **Focus trap escape**        | Tab key leaves modal, focus goes to background elements  | Check if focus trap library is installed and wrapping the modal. Base UI dialogs handle this — verify `modal={true}` prop |
| **Layout shift**             | Content jumps after images/fonts load, CLS score high    | Missing `width`/`height` on images, font-display swap causing reflow. Add dimensions or use `aspect-ratio`                |
| **Touch target too small**   | Works on desktop, hard to tap on mobile                  | Interactive element smaller than 44x44px. Check with devtools device mode                                                 |
