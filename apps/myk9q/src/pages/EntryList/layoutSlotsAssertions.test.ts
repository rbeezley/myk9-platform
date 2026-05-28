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
 * Type-only — does not affect coverage
 * ------------------------------------
 * The assertion uses `import type` for every host primitive so the
 * module sources are erased at compile time and never load at test
 * runtime. The v8 coverage tool only instruments files that are
 * actually loaded during test execution — using value imports here
 * would drag the host primitives' (mostly uncovered) module bodies
 * into apps/myk9q's coverage denominator, tanking the global %.
 * Phase 0 extraction is already squeezing coverage; this assertion
 * must not make it worse.
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

import type {
  HamburgerMenu,
  CompactOfflineIndicator,
  SyncIndicator,
  RefreshIndicator,
  FilterTriggerButton,
  ErrorState,
  PullToRefresh,
  FilterPanel,
} from '../../components/ui';
import type { DogCard } from '../../components/DogCard';
import type { ClassDetailsPopover } from '../../components/dialogs/ClassDetailsPopover';

// =============================================================================
// Compile-time contract check (pure type-level — no runtime imports)
// =============================================================================

/**
 * Shape built from the host's primitive types. If any host primitive's
 * Props doesn't conform to the matching slot Props in
 * `EntryListLayoutSlots`, the conditional below resolves to `never` and
 * the `_verify` assignment fails to compile.
 */
type _HostLayoutSlots = {
  HamburgerMenu: typeof HamburgerMenu;
  CompactOfflineIndicator: typeof CompactOfflineIndicator;
  SyncIndicator: typeof SyncIndicator;
  RefreshIndicator: typeof RefreshIndicator;
  FilterTriggerButton: typeof FilterTriggerButton;
  FilterPanel: typeof FilterPanel;
  DogCard: typeof DogCard;
  PullToRefresh: typeof PullToRefresh;
  ErrorState: typeof ErrorState;
  ClassDetailsPopover: typeof ClassDetailsPopover;
};

/**
 * `true` when the host shape extends the ringside contract; `never`
 * otherwise. The next line forces the check to surface as a build
 * error if drift occurs.
 */
type _Assert = _HostLayoutSlots extends EntryListLayoutSlots ? true : never;

/**
 * Burn the assertion into a runtime constant so `pnpm typecheck` and
 * `pnpm test` both have to materialize the type. The value is a
 * literal `true` — no host modules are loaded, no v8 instrumentation
 * touches the primitive sources.
 */
const _verify: _Assert = true;

// =============================================================================
// Runtime no-op so vitest picks this file up
// =============================================================================

describe('EntryListLayoutSlots contract assertions', () => {
  it('compiles host UI primitives against ringside slot contracts', () => {
    expect(_verify).toBe(true);
  });
});
