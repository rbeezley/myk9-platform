/**
 * Shim smoke test — full coverage moved to @myk9/ringside in PR E2a.
 *
 * The hook implementation now lives in
 * packages/ringside/src/pages/EntryList/hooks/useResetScore.ts and the
 * comprehensive behavioral suite (8 tests covering menu state, confirm
 * dialog, optimistic update field-by-field, and silent-failure
 * offline-first contract) lives next to it at
 * packages/ringside/src/pages/EntryList/hooks/useResetScore.test.ts.
 *
 * This file is intentionally minimal — it verifies the app-side shim
 * re-exports the hook so an accidental shim deletion or rename fails
 * loudly here rather than silently breaking the EntryList page at
 * runtime. When apps/myk9q is sunsetted in Phase 6, this file disappears
 * with it; the canonical tests in @myk9/ringside survive.
 */

import { describe, it, expect } from 'vitest';
import { useResetScore } from './useResetScore';

describe('useResetScore — apps/myk9q shim', () => {
  it('re-exports the hook from @myk9/ringside', () => {
    expect(typeof useResetScore).toBe('function');
  });
});
