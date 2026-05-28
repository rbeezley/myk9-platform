/**
 * Contract-assertion test — locks the host's EntryList UI primitives
 * against the ringside `EntryListLayoutSlots` contract shipped in
 * PR E2d-2a.
 *
 * Why this test exists
 * --------------------
 * PR E2d-2a defines `EntryListLayoutSlots` as the shape the host shim
 * (built in E2d-2b) will hand to ringside's EntryList page. The slot
 * bag's per-primitive Props interfaces are the contract; the host's
 * existing primitives must conform. If a host primitive's local Props
 * silently drifts (a field added, removed, or tightened), the shim
 * wiring built in E2d-2b would either break at runtime or coerce the
 * drift through — neither caught by app-only typechecking.
 *
 * Same pattern as `hooks/contractAssertions.test.ts`: a typed-identity
 * function whose only job is to fail at compile time if the bag built
 * from the host's primitives isn't assignable to the ringside contract.
 *
 * If this file fails to compile
 * -----------------------------
 * Read the TS error first. It names the specific slot + field that
 * drifted. Two paths:
 *  1. The host primitive gained a capability that's a legitimate
 *     change — update the matching `*Props` interface in
 *     `packages/ringside/src/pages/EntryList/pageProps.ts` so ringside
 *     can pass the new prop. Ship both changes in the same PR.
 *  2. The host primitive's drift is a bug or inadvertent — fix the
 *     primitive to match the contract. This is the more common case
 *     for accidental prop widening on a primitive used elsewhere.
 *
 * `ComponentType<HostProps>` is assignable to `ComponentType<RingsideProps>`
 * only when `HostProps` accepts AT LEAST what ringside hands it — i.e.,
 * the slot Props can be narrower than the host's. That's the direction
 * we want: ringside picks the minimum surface area, host primitives can
 * expose more without breaking the contract.
 */

import { describe, it, expect } from 'vitest';
import type { EntryListLayoutSlots } from '@myk9/ringside';

import {
  HamburgerMenu,
  CompactOfflineIndicator,
  SyncIndicator,
  RefreshIndicator,
  FilterTriggerButton,
  ErrorState,
  PullToRefresh,
  FilterPanel,
} from '../../components/ui';
import { DogCard } from '../../components/DogCard';
import { ClassDetailsPopover } from '../../components/dialogs/ClassDetailsPopover';

// =============================================================================
// Compile-time contract check (identity function)
// =============================================================================

/**
 * If any of the host primitives drifts from its matching slot Props
 * interface, this function fails to compile. Don't call it — its only
 * purpose is to be type-checked.
 */
function _assertLayoutSlotsContract(): EntryListLayoutSlots {
  return {
    HamburgerMenu,
    CompactOfflineIndicator,
    SyncIndicator,
    RefreshIndicator,
    FilterTriggerButton,
    FilterPanel,
    DogCard,
    PullToRefresh,
    ErrorState,
    ClassDetailsPopover,
  };
}

// =============================================================================
// Runtime no-op so vitest picks this file up
// =============================================================================

describe('EntryListLayoutSlots contract assertions', () => {
  it('compiles host UI primitives against ringside slot contracts', () => {
    expect(_assertLayoutSlotsContract).toBeTypeOf('function');
  });
});
