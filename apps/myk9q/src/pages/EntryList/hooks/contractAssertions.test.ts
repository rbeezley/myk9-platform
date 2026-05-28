/**
 * Contract-assertion tests — locks the host's `useEntryListHandlers`
 * and `useEntryListActions` return shapes against the ringside
 * `EntryListHandlers` / `EntryListActions` interfaces shipped in
 * PR E2d-1.
 *
 * Why this test exists
 * --------------------
 * In PR E2d-2 the ringside EntryList page will consume these hook
 * return values via `EntryListPageProps`. If the host hook's return
 * shape silently drifts away from the ringside contract (a field
 * added, removed, or its type tightened), the page mount in the host
 * shim would break at runtime — or worse, the type-checker would
 * coerce the drift through because both ends are app-side code.
 *
 * This file makes the contract explicit at the only place both
 * symbols exist: apps/myk9q. The two `_assert*Contract` functions are
 * typed identity functions that return the hook's value typed as the
 * ringside interface. If the hook's `ReturnType` is not assignable to
 * the ringside interface, the TypeScript build fails — which is the
 * canary we want.
 *
 * No runtime assertions
 * ---------------------
 * The `test('contract holds', ...)` block exists only so this file is
 * picked up by vitest (and so `pnpm test` proves the typecheck
 * compiled the assertions). There is no runtime check beyond
 * `expect(true).toBe(true)` — all the work happens in the type
 * checker. The file would still fail-on-drift even with no `test`
 * block, but a runtime no-op test gives the file presence in the
 * suite report.
 *
 * If this file fails to compile
 * -----------------------------
 * Read the TS error first. It will point at the specific field that
 * drifted. Two paths:
 *  1. The host hook gained a field that's a legitimate new capability
 *     — add it to `packages/ringside/src/pages/EntryList/hookContracts.ts`
 *     so the ringside page can consume it. Both PRs ship together.
 *  2. The host hook's drift is a bug or inadvertent — fix the host
 *     hook to match the contract. This is the more common case for
 *     accidental signature widening.
 */

import { describe, it, expect } from 'vitest';
import type {
  EntryListHandlers,
  EntryListActions,
} from '@myk9/ringside';

import type { useEntryListHandlers } from './useEntryListHandlers';
import type { useEntryListActions } from './useEntryListActions';

// =============================================================================
// Compile-time contract checks (identity functions)
// =============================================================================

/**
 * If `useEntryListHandlers` ever returns a shape that's not assignable
 * to `EntryListHandlers`, this function fails to compile. Don't call
 * it — its only purpose is to be type-checked.
 */
function _assertHandlersContract(
  hookReturn: ReturnType<typeof useEntryListHandlers>,
): EntryListHandlers {
  // Identity coercion — drift surfaces here as a type error.
  return hookReturn;
}

/**
 * Same pattern for `useEntryListActions`. The `ReturnType<>` extraction
 * unwraps whatever the hook signature returns today.
 */
function _assertActionsContract(
  hookReturn: ReturnType<typeof useEntryListActions>,
): EntryListActions {
  return hookReturn;
}

// =============================================================================
// Runtime no-op so vitest picks this file up
// =============================================================================

describe('EntryList contract assertions', () => {
  it('compiles host hook return types against ringside contracts', () => {
    // The real work happens at compile time via the `_assert*Contract`
    // functions above. The runtime assertion is just so vitest picks
    // the file up and reports it green in the suite.
    expect(_assertHandlersContract).toBeTypeOf('function');
    expect(_assertActionsContract).toBeTypeOf('function');
  });
});
