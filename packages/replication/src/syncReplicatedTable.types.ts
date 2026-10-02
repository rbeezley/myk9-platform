export interface SyncScope {
  /**
   * Domain-specific scope for this sync, such as a myK9Q license key or a
   * myK9Show Show ID. The adapter decides how to apply it.
   */
  value?: string;
}

export interface RemoteFetchContext<TLocal extends { id: string }> {
  scope: SyncScope;
  since: number;
  localRows: TLocal[];
  forceFullSync: boolean;
}

export interface RemoteRowCountContext {
  scope: SyncScope;
}

export interface SyncReplicatedTableAdapter<TRemote, TLocal extends { id: string }> {
  fetchRemoteRows(context: RemoteFetchContext<TLocal>): Promise<TRemote[]>;
  /**
   * Fetch exactly these rows, through the same client, source and column list
   * as `fetchRemoteRows`. Used after a stale OCC rejection of a full-row UPDATE
   * to reconcile that one row (`refetchDirtyRowsById`, MYK9-771). Omit it and
   * such a write keeps its current behavior: it backs off until a download or
   * the user reconciles it.
   */
  fetchRowsById?(ids: string[]): Promise<TRemote[]>;
  /**
   * Return the server-side row count visible to this sync scope. This count is
   * persisted separately from the local cache count so quota eviction cannot
   * make a partial replica appear complete.
   */
  getRemoteRowCount?: (context: RemoteRowCountContext) => Promise<number | undefined>;
  /**
   * Which fetched rows belong to the population counted by getRemoteRowCount.
   * Defaults to all rows. Adapters fetching tombstones alongside live rows but
   * counting only live rows must exclude tombstones here, or a capped fetch
   * could appear complete and authorize deletion of unfetched live rows.
   */
  countsTowardRemoteCoverage?: (remote: TRemote) => boolean;
  /**
   * Ids of this scope's server rows the device deleted and has a DELETE queued
   * for. Read after the row count and added back to the local side of the
   * coverage check, so a pending delete never reads as a missing row (MYK9-762).
   */
  getPendingDeleteIds?: (context: RemoteRowCountContext) => Promise<ReadonlySet<string>>;
  getRemoteId(remote: TRemote): string;
  toLocalRow(remote: TRemote): TLocal;

  /**
   * Server-side `updated_at` for a fetched remote row, as epoch milliseconds
   * (or null/undefined when the row carries no usable timestamp). When provided,
   * the engine advances the incremental watermark to the maximum value actually
   * observed from the server — never the client's wall clock — which eliminates
   * the clock-skew and round-trip-race classes of silently dropped rows. Omit to
   * keep the legacy client-clock (`Date.now()`) watermark behavior.
   *
   * Returning a non-finite number / null for a row means "do not advance the
   * watermark past this row"; the row is still cached as data, only excluded
   * from the watermark max so a bad timestamp can't poison it.
   */
  getRemoteUpdatedAt?(remote: TRemote): number | null | undefined;

  filterLocalRows?: (rows: TLocal[], scope: SyncScope) => TLocal[];
  resolveConflict?: (local: TLocal, remote: TLocal) => TLocal;

  /**
   * Opt into merging server-authoritative fields into a dirty row. Omit this to
   * preserve dirty local rows exactly until their pending mutation succeeds.
   */
  mergeDirtyRow?: (local: TLocal, remote: TLocal) => TLocal;

  /**
   * Rebuild the full Supabase UPDATE payload from a (reconciled) local row.
   * Typically `row => this.toSupabaseRow(row)`. Used after a non-conflicting dirty
   * sync-down reconciliation so a QUEUED full-row direct UPDATE can be refreshed to
   * the merged payload — otherwise advancing its OCC token would let the stale
   * full-row write clobber server-changed untouched fields. Adapters whose UPDATEs
   * always route through a delta RPC don't need this (the RPC delta never clobbers).
   */
  rebuildUpdatePayload?: (local: TLocal) => Record<string, unknown>;

  shouldSkipRemoteRow?: (remote: TRemote, context: { local: TLocal | null }) => boolean;
  shouldCleanupStaleRows?: boolean;
  /**
   * Remove clean local rows the server no longer has, but ONLY after a FULL
   * fetch (an incremental fetch returns changed rows only, so its ids prove
   * nothing about the rest). Also forces a full sync whenever this device holds
   * more server-backed rows than the server counts, so a server-side hard
   * delete leaves the device on its next sync rather than the 24h self-heal.
   *
   * Only for adapters whose full fetch returns every row `filterLocalRows`
   * keeps for the scope; rows outside the scope are never removed (MYK9-762).
   * MYK9-775 (judge_assignments).
   */
  cleanupStaleRowsOnFullSync?: boolean;
  /**
   * Independent proof that the scope really holds zero server rows, from a
   * source NOT subject to the RLS the fetch and `getRemoteRowCount` read
   * through. The count and the fetch share one policy, so a transient RLS gap
   * reads as a complete empty fetch (0 of 0). Stale cleanup therefore never
   * runs on a zero-row fetch over a scope that still holds server-backed rows
   * unless this returns true. Omit it (or return false / throw) and the cleanup
   * is skipped: stale rows linger until a non-empty full sync (MYK9-880).
   */
  verifyScopeEmpty?: (context: RemoteRowCountContext) => Promise<boolean>;
  afterSuccessfulSync?: (context: {
    scope: SyncScope;
    serverIds: Set<string>;
    localRows: TLocal[];
    staleCleanupCompleted: boolean;
  }) => Promise<void> | void;
}
