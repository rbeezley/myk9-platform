/**
 * Shared types for the EntryList page in @myk9/ringside.
 *
 * Moved from apps/myk9q/src/pages/EntryList/CombinedEntryList.types.ts in
 * PR E2a — pure helpers + hooks extraction. Host app re-exports this barrel
 * via apps/myk9q/src/pages/EntryList/CombinedEntryList.types.ts as a shim
 * so existing in-app imports stay green.
 *
 * PR E2b extends this with `ClassInfo`, `EntryListData`, and
 * `EntryListDataDependencies` — the return shape and DI surface for the
 * `useEntryListData` hook moved in the same PR. The DI shape follows the
 * direct-arg precedent established by `StatusDependencies` in PR E1d
 * (apps/myk9q never mounted RingsideProvider; every shipped hook injects
 * its deps as a parameter rather than via context).
 */

import type { UserRole } from '../../auth/passcodes';
import type { Entry } from '../../stores/entryStore';

export type SortOrder = 'run' | 'armband' | 'placement' | 'section-armband';

export type PrintDialogType =
  | 'check-in'
  | 'results-a'
  | 'results-b'
  | 'scoresheet-a'
  | 'scoresheet-b'
  | null;

export interface PrintDialogState {
  type: PrintDialogType;
}

export interface ResetConfirmState {
  show: boolean;
  entry: Entry | null;
}

export interface OrgData {
  organization: string;
  activity_type: string;
}

// =============================================================================
// useEntryListData — data shape (PR E2b)
// =============================================================================

/**
 * Class header metadata returned alongside the entries array. The host
 * builds this from its replicated classes/trials tables (or Supabase
 * fallback) — ringside just renders it.
 */
export interface ClassInfo {
  className: string;
  element: string;
  level: string;
  section?: string;
  trialId?: number;
  trialDate?: string;
  trialNumber?: string;
  judgeName?: string;
  judgeNameB?: string;
  actualClassId?: number;
  actualClassIdA?: number;
  actualClassIdB?: number;
  selfCheckin?: boolean;
  classStatus?: string;
  totalEntries?: number;
  completedEntries?: number;
  timeLimit?: string;
  timeLimit2?: string;
  timeLimit3?: string;
  areas?: number;
  visibilityPreset?: 'open' | 'standard' | 'review';
}

/** The pair `useEntryListData` returns and React Query caches. */
export interface EntryListData {
  entries: Entry[];
  classInfo: ClassInfo | null;
}

// =============================================================================
// useEntryListData — DI surface (PR E2b)
// =============================================================================

/**
 * Capabilities the host must supply to `useEntryListData`.
 *
 * Empirically scoped — follows the established direct-arg DI pattern
 * (`StatusDependencies` from PR E1d). Each method is what the hook
 * actually CALLS, not the underlying machinery (entryService, supabase,
 * replication manager). The host implements each one however it wants;
 * in apps/myk9q the bindings live in the shim at
 * `src/pages/EntryList/hooks/useEntryListData.ts`.
 *
 * Design note — why not a `RingsideServices` context slot?
 * --------------------------------------------------------
 * `RingsideProvider` was shipped in PR E0.5 but as of PR E2b, apps/myk9q
 * has never mounted it (zero callsites). E1d explicitly bypassed the
 * provider for the same reason — direct-arg DI is the actual codebase
 * pattern. Adding a services slot to a never-mounted context would be
 * the speculative widening that `RingsideContextValue`'s design note
 * warns against (see `context/types.ts`). If a future PR mounts the
 * provider for real, this interface can be re-exposed as the shape of a
 * `services.entryListData` slot — the call sites won't change.
 */
export interface EntryListDataDependencies {
  /**
   * Currently authenticated role + show context, as a value snapshot.
   * Matches `RingsideAuth`'s shape for the fields this hook reads, so a
   * future provider-mount refactor is a straight rewire.
   */
  auth: {
    role: UserRole | null;
    showContext: { licenseKey: string } | null;
  };
  /**
   * Fetch entries + classInfo for a single class. Host strategy (cache
   * first, Supabase fallback, etc.) is opaque to ringside.
   *
   * `userRole` is passed explicitly rather than read off `auth` because
   * the hook applies a `'exhibitor'` default when `auth.role` is `null`;
   * passing the resolved role keeps that defaulting visible at the call
   * site.
   */
  fetchSingleClass: (
    classId: string,
    licenseKey: string,
    userRole: UserRole,
  ) => Promise<EntryListData>;
  /**
   * Fetch entries + classInfo for a combined-class (A + B) view. Same
   * contract as `fetchSingleClass` but for two class ids.
   */
  fetchCombinedClasses: (
    classIdA: string,
    classIdB: string,
    licenseKey: string,
    userRole: UserRole,
  ) => Promise<EntryListData>;
  /**
   * Force-sync the entries and classes replicated tables. Resolves when
   * sync completes. Rejection is expected when offline — the hook
   * swallows it and falls back to cached data (offline-first contract).
   *
   * Implementation note for hosts: this is exactly the "two
   * `manager.syncTable(...)` calls in `Promise.all`" pattern from
   * apps/myk9q; surfaced as a single method so ringside doesn't reach
   * for a `ReplicationManager` instance directly.
   */
  forceSyncEntriesAndClasses: (licenseKey: string) => Promise<void>;
  /**
   * Subscribe to changes in the entries + classes replicated tables.
   * The host is responsible for filtering out the immediate "initial"
   * callback that some pub-sub implementations fire on subscribe — `cb`
   * should only be invoked on actual data changes after the
   * subscription is established.
   *
   * Returns an unsubscribe function. The hook calls it during effect
   * cleanup. The function may be a sync stub while the host async-loads
   * its replication manager; the hook tolerates a no-op return.
   */
  subscribeToReplicationChanges: (cb: () => void) => () => void;
}
