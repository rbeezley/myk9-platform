/**
 * Shim smoke test — full coverage moved to @myk9/ringside in PR E2b.
 *
 * The hook implementation now lives in
 * packages/ringside/src/pages/EntryList/hooks/useEntryListData.ts and the
 * comprehensive behavioral suite (12 tests covering disabled state,
 * single/combined fetch paths, refresh + force-sync ordering, concurrent
 * guard, role defaults, offline fallback, and subscription lifecycle)
 * lives next to it at
 * packages/ringside/src/pages/EntryList/hooks/useEntryListData.test.tsx.
 *
 * The app-side shim additionally binds the host dependencies (useAuth,
 * ensureReplicationManager, the four fetcher functions from
 * useEntryListDataHelpers) — the assertion below confirms that binding
 * still resolves a hook function. When apps/myk9q is sunsetted in
 * Phase 6, this file disappears with it; the canonical tests in
 * @myk9/ringside survive.
 */

import { describe, it, expect } from 'vitest';
import { useEntryListData } from './useEntryListData';

describe('useEntryListData — apps/myk9q shim', () => {
  it('re-exports the hook from @myk9/ringside with dependencies bound', () => {
    expect(typeof useEntryListData).toBe('function');
  });
});
