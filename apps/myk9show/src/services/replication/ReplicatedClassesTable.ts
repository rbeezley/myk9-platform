/**
 * ReplicatedClassesTable - Offline-first class data replication for myK9Show
 *
 * Manages class data with offline support using @myk9/replication.
 * Classes are competition categories within a trial.
 */

import {
  ReplicatedTable,
  syncReplicatedTable,
  parseUpdatedAtMs,
  REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
  type SyncReplicatedTableAdapter,
  type SyncResult,
} from '@myk9/replication';
import { logger } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import {
  resolveVisibilityForClassRows,
  type ResolvedClassVisibility,
} from './resolveClassVisibility';
import { resolveHideCountsForClassRows } from './resolveClassHideCounts';
import { CLASS_AUTHENTICATED_COLUMN_SELECT } from '@/services/database/classes/reads';
import type { Database } from '@/types/supabase';

/**
 * Database row type from Supabase schema
 */
type ClassRow = Database['public']['Tables']['classes']['Row'];

/**
 * App-level Class type with camelCase fields and sync metadata
 */
export interface ReplicatedClass {
  id: string;
  trialId?: string | undefined;
  templateId?: string | undefined;
  name: string;
  description?: string | undefined;
  entryFee?: number | undefined;
  jumpHeights?: string[] | undefined;
  maxEntries?: number | undefined;
  allowsWaitlist?: boolean | undefined;
  maxDogsPerHandler?: number | undefined;
  level?: string | undefined;
  breedRestrictions?: string[] | undefined;
  ageMin?: number | undefined;
  ageMax?: number | undefined;
  heightMin?: number | undefined;
  heightMax?: number | undefined;
  handlerAgeMin?: number | undefined;
  handlerAgeMax?: number | undefined;
  startTime?: string | undefined;
  revisedExpectedStart?: string | null | undefined;
  estimatedDuration?: number | undefined;

  // Scent Work specific fields (camelCase)
  element?: string | undefined;
  section?: string | undefined;
  areaCount?: number | undefined;
  timeLimitSeconds?: number | undefined;
  timeLimitArea2Seconds?: number | undefined;
  timeLimitArea3Seconds?: number | undefined;
  judgeName?: string | undefined;
  judgeId?: string | undefined;
  judgeFirstName?: string | undefined;
  judgeLastName?: string | undefined;
  classStatus?: string | undefined;
  /**
   * Resolved visibility-cascade values, denormalized at sync time so the
   * at-show surface works offline (Phase 1h). `visibilityPreset` is displayed
   * in the ClassDetailsPopover; `selfCheckinEnabled` is ALSO consumed by the
   * ringside SortableEntryCard self-check-in gate (`classInfo.selfCheckin`) — so
   * this is enforcement-relevant, not purely cosmetic. It is eventually
   * consistent: refreshed whenever the class row syncs, but a settings-only edit
   * (no class-row change) won't reflect until the next full sync. Acceptable
   * because /at-show is staff-only (STAFF_ROLES), and staff bypass the
   * self-check-in gate via `canCheckInDogs`; the exhibitor-facing self-check-in
   * enforcement stays on the live online hook. Replicating the raw cascade
   * tables (real-time offline) is the deferred alternative.
   */
  selfCheckinEnabled?: boolean | undefined;
  visibilityPreset?: string | undefined;
  totalEntriesCount?: number | undefined;
  /** Count of checked-in entries; drives judge check-in progress offline. */
  checkedInCount?: number | undefined;
  /** Count of judged entries; drives the judge dashboard's live progress overlay. */
  scoredCount?: number | undefined;
  classOrder?: number | undefined;
  /** Secretary-controlled display order within a trial (per-column Kanban reorder). */
  displayOrder?: number | undefined;
  isCompleted?: boolean | undefined;

  /**
   * Class-status override marker (migration 20260712180000). `'derived'` = the
   * server derivation owns `status`; `'manual'` = a secretary Mark Complete/Started
   * pinned it, and the server derivation must not overwrite it. Written in the same
   * offline-first replicated payload as the manual status change.
   */
  statusSource?: string | undefined;
  /**
   * Server-stamped when a late expected entry reopens a closed class. Drives the
   * show-map class-level attention reason. Written back via toSupabaseRow ONLY when
   * a mutation explicitly sets it — a secretary Mark Complete clears it (null); it
   * is otherwise stripped so unrelated edits never echo the stale server value (see
   * SERVER_OWNED_CLASS_COLUMNS). Also cleared server-side on legitimate completion.
   */
  reopenedAfterCloseoutAt?: string | null | undefined;

  // Pipeline workflow flags (secretary review/publish flow)
  isScoringFinalized?: boolean | undefined;
  isResultsReviewed?: boolean | undefined;
  resultsReleasedAt?: string | null | undefined;
  results_released_at?: string | null | undefined;
  resultsReleasedBy?: string | null | undefined;
  results_released_by?: string | null | undefined;

  // Scoring rule fields (from sport template, baked in at class creation)
  timerMode?: string | undefined;
  hidesKnown?: boolean | undefined;
  distractionCount?: number | undefined;
  /**
   * `classes.num_hides` — the scent-work hide count. Undefined means "not pinned
   * by the rule" (the judge sets it at the ring); it is NOT a synonym for 1, the
   * column's DB default, which is why toSupabaseRow writes an explicit null.
   * Secret from competitors — see CLASS_HIDE_SECRET_COLUMNS. Replication runs as
   * `authenticated`, so carrying it here does not widen who can read it.
   */
  hideCount?: number | undefined;

  // Scent Work specific fields (snake_case for Compatibility with older hooks)
  trial_id?: string | undefined;
  area_count?: number | undefined;
  time_limit_seconds?: number | undefined;
  time_limit_area2_seconds?: number | undefined;
  time_limit_area3_seconds?: number | undefined;

  // Timing fields (used for class completion tracking)
  actual_start_time?: string | undefined;
  actual_end_time?: string | undefined;
  deletedAt?: string | undefined;

  // Sync metadata
  _version?: number | undefined;
  _lastModified?: Date | undefined;
  _lastModifiedBy?: string | undefined;
  _syncStatus?: 'synced' | 'pending' | 'error' | 'conflict' | undefined;
  _localOnly?: boolean | undefined;
}

/**
 * Convert database row to app Class type.
 * Exported for unit tests of the DB→domain field mapping.
 */
export function rowToClass(row: ClassRow): ReplicatedClass {
  // Cast to Record for accessing fields not in the Supabase schema type
  const dbRow = row as ClassRow & Record<string, unknown>;
  return {
    id: String(row.id),
    trialId: row.trial_id ?? undefined,
    templateId: (dbRow.template_id as string | undefined) ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    entryFee: row.entry_fee ?? undefined,
    jumpHeights: row.jump_heights ?? undefined,
    maxEntries: row.max_entries ?? undefined,
    allowsWaitlist: row.allow_waitlist ?? undefined,
    maxDogsPerHandler: row.max_dogs_per_handler ?? undefined,
    level: row.level ?? undefined,
    breedRestrictions: row.breed_restrictions ?? undefined,
    ageMin: row.age_min ?? undefined,
    ageMax: row.age_max ?? undefined,
    heightMin: row.height_min ?? undefined,
    heightMax: row.height_max ?? undefined,
    handlerAgeMin: row.handler_age_min ?? undefined,
    handlerAgeMax: row.handler_age_max ?? undefined,
    startTime: row.start_time ?? undefined,
    revisedExpectedStart: (dbRow.revised_expected_start as string | null | undefined) ?? null,
    estimatedDuration: row.estimated_duration ?? undefined,

    // CamelCase fields
    element: (dbRow.element as string | undefined) ?? undefined,
    section: (dbRow.section as string | undefined) ?? undefined,
    areaCount: (dbRow.area_count as number | undefined) ?? undefined,
    timeLimitSeconds: (dbRow.time_limit_seconds as number | undefined) ?? undefined,
    timeLimitArea2Seconds: (dbRow.time_limit_area2_seconds as number | undefined) ?? undefined,
    timeLimitArea3Seconds: (dbRow.time_limit_area3_seconds as number | undefined) ?? undefined,
    judgeName: (() => {
      const ja =
        (dbRow.judge_assignments as Array<{
          person_id: string;
          people: { first_name: string; last_name: string };
        }>) || [];
      const first = ja[0];
      return first ? `${first.people.first_name} ${first.people.last_name}`.trim() : undefined;
    })(),
    judgeId: (() => {
      const ja = (dbRow.judge_assignments as Array<{ person_id: string }>) || [];
      return ja[0]?.person_id;
    })(),
    judgeFirstName: (() => {
      const ja =
        (dbRow.judge_assignments as Array<{
          people: { first_name: string | null };
        }>) || [];
      return ja[0]?.people.first_name ?? undefined;
    })(),
    judgeLastName: (() => {
      const ja =
        (dbRow.judge_assignments as Array<{
          people: { last_name: string | null };
        }>) || [];
      return ja[0]?.people.last_name ?? undefined;
    })(),
    classStatus: (dbRow.class_status as string | undefined) ?? row.status ?? undefined,
    statusSource: (dbRow.status_source as string | undefined) ?? undefined,
    reopenedAfterCloseoutAt:
      (dbRow.reopened_after_closeout_at as string | null | undefined) ?? null,
    totalEntriesCount: (dbRow.total_entries_count as number | undefined) ?? undefined,
    checkedInCount: (dbRow.checked_in_count as number | undefined) ?? undefined,
    scoredCount: (dbRow.scored_count as number | undefined) ?? undefined,
    classOrder: (dbRow.class_order as number | undefined) ?? undefined,
    displayOrder: (dbRow.display_order as number | undefined) ?? undefined,
    isCompleted: (dbRow.is_completed as boolean | undefined) ?? false,

    // Pipeline workflow flags
    isScoringFinalized: row.is_scoring_finalized ?? false,
    isResultsReviewed: row.is_results_reviewed ?? false,
    resultsReleasedAt: row.results_released_at ?? null,
    results_released_at: row.results_released_at ?? null,
    resultsReleasedBy: row.results_released_by ?? null,
    results_released_by: row.results_released_by ?? null,

    // Scoring rule fields
    timerMode: (dbRow.timer_mode as string | undefined) ?? undefined,
    hidesKnown: (dbRow.hides_known as boolean | undefined) ?? undefined,
    distractionCount: (dbRow.distraction_count as number | undefined) ?? undefined,
    hideCount: (dbRow.num_hides as number | null | undefined) ?? undefined,

    // Snake_case fields (compatibility)
    trial_id: row.trial_id ?? undefined,
    area_count: (dbRow.area_count as number | undefined) ?? undefined,
    time_limit_seconds: (dbRow.time_limit_seconds as number | undefined) ?? undefined,
    time_limit_area2_seconds: (dbRow.time_limit_area2_seconds as number | undefined) ?? undefined,
    time_limit_area3_seconds: (dbRow.time_limit_area3_seconds as number | undefined) ?? undefined,

    // Timing fields
    actual_start_time: (dbRow.actual_start_time as string | undefined) ?? undefined,
    actual_end_time: (dbRow.actual_end_time as string | undefined) ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}

/**
 * DB columns whose values are server-owned/derived, paired with the camelCase
 * `ReplicatedClass` key a caller sets to change them. The server derivation owns
 * `status`; a secretary Mark Complete/Started sets `status_source='manual'`; the
 * pipeline owns `is_scoring_finalized`; the server stamps
 * `reopened_after_closeout_at`. `rowToClass` reads all four back as always-defined
 * (NOT NULL / `?? false` / `?? null`), so a full merged row re-emits stale local
 * values on every unrelated `updateClass`, clobbering server-derived state until
 * the next inbound sync heals it. Each is written ONLY when the caller explicitly
 * included its source key in the update (see stripUnsetServerOwnedKeys).
 *
 * `num_hides` joins them for the mirror-image reason: it is baked in at creation
 * from the sport rule, not server-derived, but a row cached before `hideCount`
 * existed reads back as `undefined`, and incremental sync never refetches an
 * unchanged class to heal it. Emitting `num_hides: null` on an unrelated edit
 * would clear a correct hide count — and the write's own `updated_at` bump would
 * then propagate the loss back on the next sync. INSERTs are unaffected (they do
 * not strip), so a newly created class still writes its explicit null instead of
 * silently taking the column's DEFAULT 1.
 */
const SERVER_OWNED_CLASS_COLUMNS: ReadonlyArray<readonly [string, keyof ReplicatedClass]> = [
  ['status', 'classStatus'],
  ['status_source', 'statusSource'],
  ['is_scoring_finalized', 'isScoringFinalized'],
  ['reopened_after_closeout_at', 'reopenedAfterCloseoutAt'],
  ['num_hides', 'hideCount'],
];

const LEGACY_OMITTED_CLASS_KEYS_SERVER_WINS: readonly string[] = SERVER_OWNED_CLASS_COLUMNS.map(
  ([dbKey]) => dbKey
);

/**
 * Remove server-owned DB keys from a queued UPDATE payload unless the mutation's
 * caller explicitly set the corresponding source key. `toSupabaseRow` emits
 * `status` unconditionally (INSERT paths need it) and the others whenever the
 * merged row has a defined value — stripping the unset ones is what makes the
 * write intent-aware, so an unrelated edit never re-asserts server-derived state.
 */
export function stripUnsetServerOwnedKeys(
  payload: Record<string, unknown>,
  updates: Partial<ReplicatedClass>
): Record<string, unknown> {
  const provided = Object.keys(updates);
  const next = { ...payload };
  for (const [dbKey, sourceKey] of SERVER_OWNED_CLASS_COLUMNS) {
    if (!provided.includes(sourceKey)) {
      delete next[dbKey];
    }
  }
  return next;
}

export class ReplicatedClassesTable extends ReplicatedTable<ReplicatedClass> {
  /** Most recent mutation ID from a create/update operation */
  private _lastMutationId: string | null = null;

  constructor() {
    super('classes', undefined, { logger });
  }

  /** Get the mutation ID from the last create/update operation */
  get lastMutationId(): string | null {
    return this._lastMutationId;
  }

  /** Map UI class status to DB CHECK constraint values */
  private mapClassStatusToDb(uiStatus: string | undefined): string {
    switch (uiStatus) {
      case 'Setup':
      case 'setup':
        return 'setup';
      case 'In Progress':
      case 'in_progress':
        return 'in_progress';
      case 'Completed':
      case 'completed':
        return 'completed';
      case 'Cancelled':
      case 'cancelled':
        return 'cancelled';
      case 'Scheduled':
      case 'Upcoming':
      case 'upcoming':
      default:
        return 'upcoming';
    }
  }

  /**
   * Convert app-level Class to Supabase row format (snake_case).
   * Strips sync metadata fields and compatibility snake_case aliases.
   */
  private toSupabaseRow(cls: ReplicatedClass): Record<string, unknown> {
    return {
      id: cls.id,
      trial_id: cls.trialId ?? null,
      name: cls.name,
      description: cls.description ?? null,
      entry_fee: cls.entryFee ?? null,
      jump_heights: cls.jumpHeights ?? null,
      max_entries: cls.maxEntries ?? null,
      allow_waitlist: cls.allowsWaitlist ?? null,
      max_dogs_per_handler: cls.maxDogsPerHandler ?? null,
      level: cls.level ?? null,
      breed_restrictions: cls.breedRestrictions ?? null,
      age_min: cls.ageMin ?? null,
      age_max: cls.ageMax ?? null,
      height_min: cls.heightMin ?? null,
      height_max: cls.heightMax ?? null,
      handler_age_min: cls.handlerAgeMin ?? null,
      handler_age_max: cls.handlerAgeMax ?? null,
      start_time: cls.startTime ?? null,
      revised_expected_start: cls.revisedExpectedStart ?? null,
      estimated_duration: cls.estimatedDuration ?? null,
      element: cls.element ?? null,
      section: cls.section ?? null,
      num_areas: cls.areaCount ?? null,
      time_limit_seconds: cls.timeLimitSeconds ?? null,
      timer_mode: cls.timerMode ?? null,
      hides_known: cls.hidesKnown ?? null,
      distraction_count: cls.distractionCount ?? null,
      num_hides: cls.hideCount ?? null,
      // `status` is emitted unconditionally so INSERT paths always seed a value.
      // For UPDATEs, updateClass strips it (and the other server-owned keys) via
      // stripUnsetServerOwnedKeys unless the mutation explicitly set classStatus.
      status: this.mapClassStatusToDb(cls.classStatus),
      // Only write these when explicitly set — omitting avoids stale local state
      // silently reverting a finalized class during an unrelated mutation.
      // status_source rides the same payload as the manual Mark Complete/Started
      // status change so the override marker syncs offline-first.
      // reopened_after_closeout_at is server-stamped; it is emitted here only so a
      // manual Mark Complete can CLEAR it (set null), and stripped on any UPDATE
      // that didn't explicitly set it (see SERVER_OWNED_CLASS_COLUMNS).
      ...(cls.statusSource !== undefined && { status_source: cls.statusSource }),
      ...(cls.reopenedAfterCloseoutAt !== undefined && {
        reopened_after_closeout_at: cls.reopenedAfterCloseoutAt,
      }),
      ...(cls.isScoringFinalized !== undefined && { is_scoring_finalized: cls.isScoringFinalized }),
      ...(cls.isResultsReviewed !== undefined && { is_results_reviewed: cls.isResultsReviewed }),
      ...(cls.resultsReleasedAt !== undefined && { results_released_at: cls.resultsReleasedAt }),
      ...(cls.resultsReleasedBy !== undefined && { results_released_by: cls.resultsReleasedBy }),
      ...(cls.results_released_at !== undefined && {
        results_released_at: cls.results_released_at,
      }),
      ...(cls.results_released_by !== undefined && {
        results_released_by: cls.results_released_by,
      }),
      ...(cls.displayOrder !== undefined && { display_order: cls.displayOrder }),
      actual_start_time: cls.actual_start_time ?? null,
      actual_end_time: cls.actual_end_time ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  protected override rebuildUpdatePayload(cls: ReplicatedClass): Record<string, unknown> {
    // Resend path after an OCC token advance (reconcileDirtyRow / clearConflict):
    // rebuilds a full row from local `data`, which cannot know the original
    // mutation's `updates`. Strip all server-owned columns here; the mutation queue
    // restores only keys that were deliberately present in the original payload.
    // Therefore a queued manual Mark Complete/Started retains status intent, while
    // an unrelated edit continues to accept the reconciled server values.
    const payload = this.toSupabaseRow(cls);
    for (const [dbKey] of SERVER_OWNED_CLASS_COLUMNS) {
      delete payload[dbKey];
    }
    return payload;
  }

  protected override getLegacyOmittedKeysServerWins(): readonly string[] {
    return LEGACY_OMITTED_CLASS_KEYS_SERVER_WINS;
  }

  async sync(syncScopeId: string): Promise<SyncResult> {
    logger.log(`[${this.getTableName()}] Starting sync`);

    // Carry visibility enrichment fields through fetchRemoteRows → toLocalRow.
    // toLocalRow is synchronous so the async resolveVisibilityForClassRows call
    // must happen inside fetchRemoteRows, which returns an enriched row type.
    type EnrichedClassRow = ClassRow & {
      _selfCheckinEnabled?: boolean | undefined;
      _visibilityPreset?: string | undefined;
    };

    const adapter: SyncReplicatedTableAdapter<EnrichedClassRow, ReplicatedClass> = {
      fetchRemoteRows: async ({ scope, since }) => {
        let query = supabase
          .from('classes')
          // Not `*`: authenticated has no SELECT on num_hides (20260731160000), so a
          // star select now fails 42501 for every user. The count comes back through
          // resolveHideCountsForClassRows below, for officials only.
          .select(
            `${CLASS_AUTHENTICATED_COLUMN_SELECT}, judge_assignments!judge_assignments_class_id_fkey(person_id, people!inner(first_name, last_name))`
          )
          .gt('updated_at', new Date(since).toISOString())
          .order('updated_at', { ascending: true });

        if (scope.value) {
          query = query.eq('trial_id', scope.value);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        const rows = (data ?? []) as unknown as ClassRow[];

        // Phase 1h: resolve visibility-cascade values so the at-show
        // ClassDetailsPopover + SortableEntryCard self-check-in gate work offline.
        // Keyed by the row's own trial_id (not the scope arg) so it runs for
        // scoped and unscoped syncs alike. Best-effort: failure must not break
        // class replication.
        const visibilityByClassId = await resolveVisibilityForClassRows(rows).catch(() => {
          logger.warn(
            `[${this.getTableName()}] Visibility resolve failed; popover values may be stale`,
            'replication'
          );
          return new Map<string, ResolvedClassVisibility>();
        });

        // num_hides is no longer on the class row (20260731160000). Officials get it
        // from the show-scoped RPC and it is merged here, so a judge's device still
        // has the count offline; an exhibitor's map is empty and their IndexedDB
        // never receives it.
        const hideCountByClassId = await resolveHideCountsForClassRows(rows).catch(() => {
          logger.warn(
            `[${this.getTableName()}] Hide-count resolve failed; scoring may fall back to the rule band`,
            'replication'
          );
          return new Map<string, number>();
        });

        return rows.map(row => ({
          ...row,
          num_hides: hideCountByClassId.get(String(row.id)) ?? null,
          _selfCheckinEnabled: visibilityByClassId.get(String(row.id))?.selfCheckinEnabled,
          _visibilityPreset: visibilityByClassId.get(String(row.id))?.visibilityPreset,
        }));
      },
      getRemoteId: remote => String(remote.id),
      getRemoteUpdatedAt: remote => parseUpdatedAtMs(remote.updated_at),
      toLocalRow: remote => ({
        ...rowToClass(remote),
        selfCheckinEnabled: remote._selfCheckinEnabled,
        visibilityPreset: remote._visibilityPreset,
      }),
      rebuildUpdatePayload: cls => this.rebuildUpdatePayload(cls),
      filterLocalRows: (rows, scope) =>
        scope.value ? rows.filter(r => r.trialId === scope.value) : rows,
      resolveConflict: (local, remote) => this.resolveConflict(local, remote),
    };

    const result = await syncReplicatedTable(
      this,
      adapter,
      { value: syncScopeId },
      {
        incrementalBufferMs: REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
      }
    );

    if (!result.success && result.error && !isAbortSyncError(result.error)) {
      logger.error(`[${this.getTableName()}] Sync failed:`, result.error);
      return { ...result, error: getSyncErrorMessage(result.error) };
    }

    return result;
  }

  protected resolveConflict(local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass {
    // Server-authoritative for class config. The Phase 1h visibility fields are
    // enrichment-only (not on the raw row), so any sync path that didn't enrich
    // carries them as undefined — preserve the prior values rather than wiping
    // an already-enriched class.
    return {
      ...remote,
      selfCheckinEnabled: remote.selfCheckinEnabled ?? local.selfCheckinEnabled,
      visibilityPreset: remote.visibilityPreset ?? local.visibilityPreset,
    };
  }

  /**
   * Get classes by trial ID
   */
  async getClassesByTrial(trialId: string): Promise<ReplicatedClass[]> {
    const allClasses = await this.getAll();
    return allClasses.filter(cls => cls.trialId === trialId);
  }

  /**
   * Get class by ID
   */
  async getClassById(classId: string): Promise<ReplicatedClass | null> {
    return this.get(classId);
  }

  /**
   * Update class (marks as dirty for sync)
   * @returns mutation ID if queued, null if no MutationManager
   */
  async updateClass(classId: string, updates: Partial<ReplicatedClass>): Promise<string | null> {
    const currentClass = await this.get(classId);
    if (!currentClass) {
      throw new Error(`Class ${classId} not found`);
    }

    const updatedClass: ReplicatedClass = {
      ...currentClass,
      ...updates,
      _lastModified: new Date(),
      _syncStatus: 'pending',
    };

    await this.set(classId, updatedClass, true);
    // Intent-aware: the merged row always carries defined server-owned values, so
    // strip the ones this mutation didn't explicitly set before queueing — see
    // stripUnsetServerOwnedKeys. Prevents an unrelated edit from re-uploading a
    // stale local status / status_source and clobbering server-derived state.
    const mutationId = await this.queueMutation(
      'UPDATE',
      classId,
      stripUnsetServerOwnedKeys(this.toSupabaseRow(updatedClass), updates)
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Updated class ${classId}`);
    return mutationId;
  }

  /**
   * Create a new class locally (queued for sync)
   * @param classData - Class data (must include id)
   * @param trialMutationId - Optional mutation ID of the parent trial (for dependency tracking)
   * The mutation ID is available via `lastMutationId` for dependency tracking.
   */
  async createClass(
    classData: ReplicatedClass,
    trialMutationId?: string
  ): Promise<ReplicatedClass> {
    const newClass: ReplicatedClass = {
      ...classData,
      _version: 1,
      _lastModified: new Date(),
      _syncStatus: 'pending',
      _localOnly: true,
    };

    await this.set(classData.id, newClass, true);
    const mutationId = await this.queueMutation(
      'INSERT',
      classData.id,
      this.toSupabaseRow(newClass),
      trialMutationId ? [trialMutationId] : undefined
    );
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Created new class ${classData.id}`);
    return newClass;
  }

  /**
   * Re-queue INSERT mutations for local-only classes whose mutations were
   * permanently deleted (e.g. due to a schema mismatch that has since been fixed).
   */
  async repairUnsynced(): Promise<number> {
    const allLocal = await this.getAll();
    let repaired = 0;

    for (const cls of allLocal) {
      if (!cls._localOnly) continue;

      // Re-queue with corrected payload (fixes status mapping, etc.)
      await this.queueMutation('INSERT', cls.id, this.toSupabaseRow(cls));
      repaired++;
    }

    if (repaired > 0) {
      logger.log(`[${this.getTableName()}] Re-queued ${repaired} unsynced class mutations`);
    }
    return repaired;
  }

  /**
   * Delete a class locally and queue DELETE mutation for Supabase sync
   */
  async deleteClass(classId: string): Promise<string | null> {
    await this.delete(classId);
    const mutationId = await this.queueMutation('DELETE', classId, { id: classId });
    this._lastMutationId = mutationId;
    logger.log(`[${this.getTableName()}] Deleted class ${classId}`);
    return mutationId;
  }
}

// Singleton export
export const replicatedClassesTable = new ReplicatedClassesTable();
