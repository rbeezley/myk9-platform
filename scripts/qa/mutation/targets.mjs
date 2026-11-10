// The single source of truth for what each mutation target mutates and which
// tests judge it (MYK9-1829). stryker.config.mjs reads `mutate` and `testFiles`;
// vitest.mutation.config.ts reads `testFiles` as its `include`; the runner reads
// the names. Before this, the lists were written twice and drifted: the
// replication-conflict target listed 3 of the 13 tests that import its files.
//
// The lists are explicit on purpose. A scan at config load could pull a slow or
// unrelated test in and move the score with no diff to read. Instead
// targets.test.ts scans the disk and fails when a test that imports a mutated
// file is missing here, so adding one is a visible edit to this file.
//
// All paths are relative to the repository root.

const UI_REASON =
  "renders a component or page (jsdom) that only displays the helper's output; its assertions are on markup, so a mutant here is judged by the pure tests, and each mutant would pay a page render";
/**
 * Tests that import a mutated file but must stay out of their target, by path,
 * each with the reason. The scan in targets.test.ts still finds them; this is the
 * only way to silence it, so every exclusion is a visible line to review.
 * @type {Record<string, Record<string, string>>}
 */
export const EXCLUDED_TESTS = {
  cart: {
    'apps/myk9show/supabase/functions/_shared/platformFeeAgreement.test.ts':
      'calls the helper while Vitest collects the file (describe time), outside any test; a mutant that makes that call throw fails collection, which the Stryker Vitest runner reports as Survived with zero tests (reproduced: cartStore.helpers.ts L83, 0 tests completed) and trips the self-check',
    'apps/myk9show/src/components/cart/CartSummary.feeSplit.test.tsx': UI_REASON,
    'apps/myk9show/src/components/shows/RegistrationWorkflow/EntriesPanel/EntriesPanel.test.tsx':
      UI_REASON,
    'apps/myk9show/src/features/payments/ClubFeeTransparencyNote.test.tsx': UI_REASON,
    'apps/myk9show/src/features/payments/PlatformFeeSplitLines.test.tsx': UI_REASON,
    'apps/myk9show/src/pages/__tests__/FeesPage.signedOut.test.tsx': UI_REASON,
    'apps/myk9show/src/pages/__tests__/FeesPage.test.tsx': UI_REASON,
  },
  duration: {
    'packages/core/src/helpers/__tests__/class-display-status.test.ts':
      'imports parseDuration only through the whole @myk9/core barrel (../../index) to test an unrelated function; it asserts nothing about parseDuration',
  },
};

export const MUTATION_TARGET_DEFS = {
  cart: {
    mutate: ['apps/myk9show/src/store/cartStore.helpers.ts'],
    testFiles: [
      'apps/myk9show/src/features/payments/platformFeeSplit.test.ts',
      'apps/myk9show/src/store/cartStore.helpers.test.ts',
    ],
  },
  // The rules a judge's score passes through on its way to being saved
  // (MYK9-1805): the scoresheet form's validation and saved payload, and the
  // parser that turns a typed time into the saved time.
  scoresheet: {
    mutate: ['packages/scoring-ui/src/hooks/useScoresheetScoring.ts'],
    testFiles: [
      'packages/scoring-ui/src/hooks/useScoresheetScoring.test.ts',
      'packages/scoring-ui/src/hooks/useScoresheetScoring.savedScore.test.ts',
    ],
  },
  duration: {
    mutate: ['packages/core/src/utils/parseDuration.ts'],
    testFiles: ['packages/core/src/utils/parseDuration.test.ts'],
  },
  placement: {
    mutate: ['apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.ts'],
    testFiles: ['apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.test.ts'],
  },
  'replication-conflict': {
    mutate: [
      'packages/replication/src/conflict/ConflictResolver.ts',
      'packages/replication/src/conflict/detectDirtyRowConflict.ts',
      'packages/replication/src/core/ReplicatedTableConflict.ts',
    ],
    testFiles: [
      'packages/replication/src/conflict/ConflictManager.test.ts',
      'packages/replication/src/conflict/ConflictResolver.merge.test.ts',
      'packages/replication/src/conflict/ConflictResolver.test.ts',
      'packages/replication/src/conflict/detectDirtyRowConflict.fieldGroups.test.ts',
      'packages/replication/src/conflict/detectDirtyRowConflict.remoteComparison.test.ts',
      'packages/replication/src/conflict/detectDirtyRowConflict.test.ts',
      'packages/replication/src/conflict/serverOwnedFields.test.ts',
      'packages/replication/src/core/ReplicatedTable.keepLocalPolicy.test.ts',
      'packages/replication/src/core/ReplicatedTable.ownerPreserved.test.ts',
      'packages/replication/src/core/ReplicatedTableConflict.test.ts',
      'packages/replication/src/MutationManager.convergedOutcome.test.ts',
      'packages/replication/src/mutation-row-sync.ackRebase.test.ts',
      'packages/replication/src/mutation-row-sync.pullBeforeAck.test.ts',
    ],
  },
};

export const MUTATION_TARGET_NAMES = Object.keys(MUTATION_TARGET_DEFS);
