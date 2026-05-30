/**
 * ReplicatedClassesTable - Offline-first class data replication for myK9Show
 *
 * Manages class data with offline support using @myk9/replication.
 * Classes are competition categories within a trial.
 */

import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { logger } from '@myk9/core';
import { resolveCheckinCascade } from '@myk9/secretary';
import { supabase } from '@/services/database/supabaseClient';
import { getSyncErrorMessage, isAbortSyncError } from './syncErrorUtils';
import type { Database } from '@/types/supabase';

// The *_visibility_settings / *_visibility_overrides tables aren't in the
// generated Supabase types (migration 007), so reads use an untyped client —
// same pattern as useSelfCheckinEnabled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables absent from codegen
const untypedSupabase = supabase as any;

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
   * Resolved visibility-cascade values for the at-show ClassDetailsPopover,
   * denormalized at sync time so they work offline (Phase 1h). Display-only;
   * the authoritative self-check-in gate remains the live online hook. A
   * settings-only edit (no class-row change) refreshes on the next full sync.
   */
  selfCheckinEnabled?: boolean | undefined;
  visibilityPreset?: string | undefined;
  totalEntriesCount?: number | undefined;
  classOrder?: number | undefined;
  /** Secretary-controlled display order within a trial (per-column Kanban reorder). */
  displayOrder?: number | undefined;
  isCompleted?: boolean | undefined;

  // Pipeline workflow flags (secretary review/publish flow)
  isScoringFinalized?: boolean | undefined;
  isResultsReviewed?: boolean | undefined;

  // Scoring rule fields (from sport template, baked in at class creation)
  timerMode?: string | undefined;
  hidesKnown?: boolean | undefined;
  distractionCount?: number | undefined;

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
 * Convert database row to app Class type
 */
function rowToClass(row: ClassRow): ReplicatedClass {
  // Cast to Record for accessing fields not in the Supabase schema type
  const dbRow = row as ClassRow & Record<string, unknown>;
  return {
    id: String(row.id),
    trialId: row.trial_id ?? undefined,
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
    totalEntriesCount: (dbRow.total_entries_count as number | undefined) ?? undefined,
    classOrder: (dbRow.class_order as number | undefined) ?? undefined,
    displayOrder: (dbRow.display_order as number | undefined) ?? undefined,
    isCompleted: (dbRow.is_completed as boolean | undefined) ?? false,

    // Pipeline workflow flags
    isScoringFinalized: row.is_scoring_finalized ?? false,
    isResultsReviewed: row.is_results_reviewed ?? false,

    // Scoring rule fields
    timerMode: (dbRow.timer_mode as string | undefined) ?? undefined,
    hidesKnown: (dbRow.hides_known as boolean | undefined) ?? undefined,
    distractionCount: (dbRow.distraction_count as number | undefined) ?? undefined,

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

export interface ResolvedClassVisibility {
  selfCheckinEnabled: boolean;
  visibilityPreset: string;
}

/**
 * Resolve the visibility cascade (effective preset + self-check-in) for a batch
 * of classes in ONE trial, for offline denormalization onto `ReplicatedClass`
 * (Phase 1h ClassDetailsPopover). Reuses `resolveCheckinCascade` — the same
 * resolver the online hooks use — so there's one definition of the cascade.
 * Preset cascade is last-non-null wins (class → trial → show → 'open').
 * Falls back to enabled/'open' when a level is missing. Exported for tests.
 */
export async function resolveClassVisibilityForTrial(
  trialId: string,
  classIds: string[]
): Promise<Map<string, ResolvedClassVisibility>> {
  const result = new Map<string, ResolvedClassVisibility>();
  if (classIds.length === 0) return result;

  // The show-level row is the cascade base; derive the show id from the trial.
  const { data: trialRow } = await supabase
    .from('trials')
    .select('show_id')
    .eq('id', trialId)
    .maybeSingle();
  const showId = (trialRow as { show_id: string } | null)?.show_id;

  const [showRes, trialRes, classRes] = await Promise.all([
    showId
      ? untypedSupabase
          .from('show_visibility_settings')
          .select('preset, self_checkin_enabled')
          .eq('show_id', showId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    untypedSupabase
      .from('trial_visibility_overrides')
      .select('preset, self_checkin_enabled')
      .eq('trial_id', trialId)
      .maybeSingle(),
    untypedSupabase
      .from('class_visibility_overrides')
      .select('class_id, preset, self_checkin_enabled')
      .in('class_id', classIds),
  ]);

  type VisRow = { preset: string | null; self_checkin_enabled: boolean | null };
  const show = showRes.data as VisRow | null;
  const trial = trialRes.data as VisRow | null;
  const classRows = (classRes.data ?? []) as Array<VisRow & { class_id: string }>;
  const classById = new Map(classRows.map(r => [r.class_id, r]));

  for (const classId of classIds) {
    const cls = classById.get(classId);
    result.set(classId, {
      visibilityPreset: cls?.preset ?? trial?.preset ?? show?.preset ?? 'open',
      selfCheckinEnabled: resolveCheckinCascade(
        show?.self_checkin_enabled ?? null,
        trial?.self_checkin_enabled ?? null,
        cls?.self_checkin_enabled ?? null
      ),
    });
  }
  return result;
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
      estimated_duration: cls.estimatedDuration ?? null,
      element: cls.element ?? null,
      section: cls.section ?? null,
      num_areas: cls.areaCount ?? null,
      time_limit_seconds: cls.timeLimitSeconds ?? null,
      timer_mode: cls.timerMode ?? null,
      hides_known: cls.hidesKnown ?? null,
      distraction_count: cls.distractionCount ?? null,
      status: this.mapClassStatusToDb(cls.classStatus),
      // Only write these when explicitly set — omitting avoids stale local state
      // silently reverting a finalized class during an unrelated mutation
      ...(cls.isScoringFinalized !== undefined && { is_scoring_finalized: cls.isScoringFinalized }),
      ...(cls.isResultsReviewed !== undefined && { is_results_reviewed: cls.isResultsReviewed }),
      ...(cls.displayOrder !== undefined && { display_order: cls.displayOrder }),
      actual_start_time: cls.actual_start_time ?? null,
      actual_end_time: cls.actual_end_time ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  async sync(licenseKey: string): Promise<SyncResult> {
    const startTime = Date.now();
    let rowsSynced = 0;
    let conflictsResolved = 0;

    try {
      const metadata = await this.getSyncMetadata();
      const allCached = await this.getAll();
      const isCacheEmpty = allCached.length === 0;
      const lastSync = isCacheEmpty ? 0 : metadata?.lastIncrementalSyncAt || 0;

      logger.log(`[${this.getTableName()}] Starting sync`);

      // Filter by trial_id if provided as license key
      let query = supabase
        .from('classes')
        .select(
          '*, judge_assignments!judge_assignments_class_id_fkey(person_id, people!inner(first_name, last_name))'
        )
        .gt('updated_at', new Date(lastSync).toISOString())
        .order('updated_at', { ascending: true });

      if (licenseKey) {
        query = query.eq('trial_id', licenseKey);
      }

      const { data: remoteClasses, error } = await query;

      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      if (!remoteClasses || remoteClasses.length === 0) {
        await this.updateSyncMetadata({
          lastIncrementalSyncAt: Date.now(),
          syncStatus: 'idle',
        });

        return {
          tableName: this.getTableName(),
          success: true,
          operation: 'incremental-sync',
          rowsAffected: 0,
          conflictsResolved: 0,
          duration: Date.now() - startTime,
        };
      }

      // Phase 1h: resolve visibility-cascade values for the changed classes so
      // the at-show ClassDetailsPopover has them offline. One trial per sync
      // when licenseKey is the trial id; skipped for an unscoped sync. Best-
      // effort — a failure here must not break class replication.
      let visibilityByClassId = new Map<string, ResolvedClassVisibility>();
      if (licenseKey) {
        try {
          visibilityByClassId = await resolveClassVisibilityForTrial(
            licenseKey,
            remoteClasses.map(r => String(r.id))
          );
        } catch {
          logger.warn(
            `[${this.getTableName()}] Visibility resolve failed; popover values may be stale`,
            'replication'
          );
        }
      }

      for (const remoteRow of remoteClasses) {
        const classId = String(remoteRow.id);
        const visibility = visibilityByClassId.get(classId);
        const remoteClass: ReplicatedClass = {
          ...rowToClass(remoteRow),
          ...(visibility
            ? {
                selfCheckinEnabled: visibility.selfCheckinEnabled,
                visibilityPreset: visibility.visibilityPreset,
              }
            : {}),
        };
        const localClass = await this.get(classId);

        if (localClass) {
          const resolved = this.resolveConflict(localClass, remoteClass);
          await this.set(classId, resolved);
          conflictsResolved++;
        } else {
          await this.set(classId, remoteClass);
        }

        rowsSynced++;
      }

      await this.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
      });

      return {
        tableName: this.getTableName(),
        success: true,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = getSyncErrorMessage(error);
      if (!isAbortSyncError(error)) {
        logger.error(`[${this.getTableName()}] Sync failed:`, error);
      }

      return {
        tableName: this.getTableName(),
        success: false,
        operation: 'incremental-sync',
        rowsAffected: rowsSynced,
        conflictsResolved,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  protected resolveConflict(_local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass {
    return remote;
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
    const mutationId = await this.queueMutation(
      'UPDATE',
      classId,
      this.toSupabaseRow(updatedClass)
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
