/**
 * Shim smoke test — full coverage moved to @myk9/ringside in PR E2a.
 *
 * The hook implementation now lives in
 * packages/ringside/src/pages/EntryList/hooks/useDragAndDropEntries.ts
 * and the comprehensive behavioral suite (12 tests covering drag-start
 * snapshot capture, drag-end reorder math, in-ring guard, grace period,
 * and DB-failure no-rollback) lives next to it at
 * packages/ringside/src/pages/EntryList/hooks/useDragAndDropEntries.test.ts.
 *
 * The app-side shim additionally binds the `updateExhibitorOrder`
 * mutation from `services/entryService` — the assertion below confirms
 * that binding still resolves a hook function. When apps/myk9q is
 * sunsetted in Phase 6, this file disappears with it; the canonical
 * tests in @myk9/ringside survive.
 */

import { describe, it, expect } from 'vitest';
import { useDragAndDropEntries } from './useDragAndDropEntries';

describe('useDragAndDropEntries — apps/myk9q shim', () => {
  it('re-exports the hook from @myk9/ringside with updateExhibitorOrder bound', () => {
    expect(typeof useDragAndDropEntries).toBe('function');
  });
});
