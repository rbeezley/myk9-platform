/**
 * Show Settings Mutation Hooks
 *
 * React Query mutations for upserting visibility and check-in settings.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { markUnreachableIfTransportFailure, timeoutSignal } from '@/lib/serverReachability';
import type { TablesInsert } from '@/types/supabase';
import type { VisibilityPreset, VisibilityTiming } from '@myk9/secretary';
import { settingsQueryKeys, type ShowSettings } from '../queries/useShowSettingsDatabase';

interface SettingsRequestResult {
  error: unknown;
  status?: number;
}

/**
 * MYK9-864: a request that never reached Supabase also switches the controls to
 * "Needs a connection". The timeout turns a dead uplink, which otherwise hangs
 * until the browser gives up, into a prompt transport failure (postgrest `status: 0`).
 * It can also cut off a slow write the server did commit: the secretary then sees
 * the error and the old value, and a retry is harmless (upserts are idempotent).
 * Refetching on failure is deliberately not done: the read would fail over the
 * same dead link and swap the settings card for its error state. supabase-js
 * refreshes an expired token before this signal applies, so that is unbounded.
 */
const SETTINGS_REQUEST_TIMEOUT_MS = 10_000;
const settingsRequestSignal = () => timeoutSignal(SETTINGS_REQUEST_TIMEOUT_MS);

function throwIfRequestFailed(result: SettingsRequestResult): void {
  if (!result.error) return;
  markUnreachableIfTransportFailure(result);
  throw result.error;
}

async function runSettingsWrite(builder: {
  abortSignal: (signal: AbortSignal) => PromiseLike<SettingsRequestResult>;
}): Promise<void> {
  throwIfRequestFailed(await builder.abortSignal(settingsRequestSignal()));
}

interface ShowVisibilityUpdate {
  showId: string;
  /** null = custom timings that match no named preset (stored honestly, not coerced) */
  preset: VisibilityPreset | null;
  placementTiming: VisibilityTiming;
  qualificationTiming: VisibilityTiming;
  timeTiming: VisibilityTiming;
  faultsTiming: VisibilityTiming;
}

interface ShowCheckinUpdate {
  showId: string;
  enabled: boolean;
}

interface ShowResultsPrivacyUpdate {
  showId: string;
  /** MYK9-969: the club's show-wide private switch. */
  resultsPrivate: boolean;
}

/**
 * Write ONE show-level column this writer owns (self check-in, results
 * privacy) and nothing else.
 *
 * A single upsert on `show_id`: an existing row has only these columns
 * updated, and a missing row is created with the table's column DEFAULTs for
 * everything else (the "standard" preset's timings, pinned by migration
 * 20261004152300). There is deliberately no read-then-write and no timing
 * value on the client: either one let a concurrent preset save be overwritten
 * by a stale or default snapshot (MYK9-969 review, rounds 2 and 3), which could
 * release qualifications the club had withheld. `updated_at` is stamped by the
 * server trigger.
 */
async function upsertShowSettingsColumns(
  showId: string,
  columns: Omit<TablesInsert<'show_visibility_settings'>, 'show_id' | 'updated_by'>,
  userId: string | null
): Promise<void> {
  const payload: TablesInsert<'show_visibility_settings'> = {
    show_id: showId,
    ...columns,
    updated_by: userId,
  };
  await runSettingsWrite(
    supabase.from('show_visibility_settings').upsert(payload, { onConflict: 'show_id' })
  );
}

interface TrialOverrideUpdate {
  trialId: string;
  showId: string; // for cache invalidation
  preset?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

interface ClassOverrideUpdate {
  classId: string;
  trialId: string; // for cache invalidation
  showId: string; // for cache invalidation
  preset?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

/**
 * Which facet of an override row a reset should clear.
 * - `'visibility'` nulls only the preset + timing columns (preserves check-in).
 * - `'checkin'` nulls only `self_checkin_enabled` (preserves visibility).
 * - `'all'` nulls everything — the historical behavior, and the default so existing
 *   callers are unchanged.
 *
 * Independence relies on OMITTING the other facet's columns from the upsert payload,
 * not setting them to null: PostgREST upsert only writes the columns present, so on
 * conflict the omitted columns keep their stored value.
 */
export type ResetFacet = 'visibility' | 'checkin' | 'all';

interface OverrideReset {
  entityId: string;
  showId: string;
  level: 'trial' | 'class';
  facet?: ResetFacet;
}

const VISIBILITY_NULL_COLUMNS = {
  preset: null,
  placement_timing: null,
  qualification_timing: null,
  time_timing: null,
  faults_timing: null,
} as const;

interface ResetPayloadBaseParams {
  entityId: string;
  facet: ResetFacet;
  userId: string | null;
  timestamp: string;
}

/**
 * Build the upsert payload for a reset. Pure so the column set per facet can be
 * pinned by an assertion-first test — an accidental `self_checkin_enabled: null`
 * in a visibility reset would silently re-couple the two facets.
 */
export function buildResetPayload(
  params: ResetPayloadBaseParams & { level: 'trial' }
): TablesInsert<'trial_visibility_overrides'>;
export function buildResetPayload(
  params: ResetPayloadBaseParams & { level: 'class' }
): TablesInsert<'class_visibility_overrides'>;
export function buildResetPayload(
  params: ResetPayloadBaseParams & { level: 'trial' | 'class' }
): TablesInsert<'trial_visibility_overrides'> | TablesInsert<'class_visibility_overrides'>;
export function buildResetPayload(
  params: ResetPayloadBaseParams & { level: 'trial' | 'class' }
): TablesInsert<'trial_visibility_overrides'> | TablesInsert<'class_visibility_overrides'> {
  const { level, entityId, facet, userId, timestamp } = params;
  const shared: Omit<TablesInsert<'trial_visibility_overrides'>, 'trial_id'> = {
    updated_by: userId,
    updated_at: timestamp,
  };
  if (facet === 'all' || facet === 'visibility') {
    Object.assign(shared, VISIBILITY_NULL_COLUMNS);
  }
  if (facet === 'all' || facet === 'checkin') {
    shared.self_checkin_enabled = null;
  }
  if (level === 'trial') {
    return { trial_id: entityId, ...shared };
  }
  return { class_id: entityId, ...shared };
}

export function useUpdateShowVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ShowVisibilityUpdate) => {
      await runSettingsWrite(
        supabase.from('show_visibility_settings').upsert({
          show_id: update.showId,
          preset: update.preset,
          placement_timing: update.placementTiming,
          qualification_timing: update.qualificationTiming,
          time_timing: update.timeTiming,
          faults_timing: update.faultsTiming,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
      );
    },
    onMutate: async variables => {
      // Optimistic update: cancel outgoing refetches and snapshot cache
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
      const previous = queryClient.getQueryData(settingsQueryKeys.show(variables.showId));
      // Optimistically update the cache with new values
      queryClient.setQueryData(
        settingsQueryKeys.show(variables.showId),
        (old: ShowSettings | undefined) => {
          if (!old) return old;
          return {
            ...old,
            visibility: {
              placement: variables.placementTiming,
              qualification: variables.qualificationTiming,
              time: variables.timeTiming,
              faults: variables.faultsTiming,
              // null (custom) maps to undefined so VisibilitySettings.preset stays
              // optional-not-null and readers render it as "Custom".
              preset: variables.preset ?? undefined,
              inheritedFrom: 'show' as const,
            },
            hasExplicitSettings: true,
          };
        }
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.show(variables.showId), context.previous);
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
    },
  });
}

export function useUpdateShowCheckin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ShowCheckinUpdate) => {
      await upsertShowSettingsColumns(
        update.showId,
        { self_checkin_enabled: update.enabled },
        user?.id ?? null
      );
    },
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
      const previous = queryClient.getQueryData(settingsQueryKeys.show(variables.showId));
      queryClient.setQueryData(
        settingsQueryKeys.show(variables.showId),
        (old: ShowSettings | undefined) => {
          if (!old) return old;
          return { ...old, selfCheckinEnabled: variables.enabled };
        }
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.show(variables.showId), context.previous);
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
    },
  });
}

/** MYK9-969: the club's show-wide "keep results private" switch. */
export function useUpdateShowResultsPrivacy() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ShowResultsPrivacyUpdate) => {
      await upsertShowSettingsColumns(
        update.showId,
        { results_private: update.resultsPrivate },
        user?.id ?? null
      );
    },
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
      const previous = queryClient.getQueryData(settingsQueryKeys.show(variables.showId));
      queryClient.setQueryData(
        settingsQueryKeys.show(variables.showId),
        (old: ShowSettings | undefined) =>
          old ? { ...old, resultsPrivate: variables.resultsPrivate } : old
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.show(variables.showId), context.previous);
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
    },
  });
}

export function useUpdateTrialOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: TrialOverrideUpdate) => {
      const payload: TablesInsert<'trial_visibility_overrides'> = {
        trial_id: update.trialId,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (update.preset !== undefined) payload.preset = update.preset;
      if (update.placementTiming !== undefined) payload.placement_timing = update.placementTiming;
      if (update.qualificationTiming !== undefined)
        payload.qualification_timing = update.qualificationTiming;
      if (update.timeTiming !== undefined) payload.time_timing = update.timeTiming;
      if (update.faultsTiming !== undefined) payload.faults_timing = update.faultsTiming;
      if (update.selfCheckinEnabled !== undefined)
        payload.self_checkin_enabled = update.selfCheckinEnabled;
      await runSettingsWrite(supabase.from('trial_visibility_overrides').upsert(payload));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.trialOverride(variables.trialId),
      });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
    },
  });
}

export function useUpdateClassOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ClassOverrideUpdate) => {
      const payload: TablesInsert<'class_visibility_overrides'> = {
        class_id: update.classId,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (update.preset !== undefined) payload.preset = update.preset;
      if (update.placementTiming !== undefined) payload.placement_timing = update.placementTiming;
      if (update.qualificationTiming !== undefined)
        payload.qualification_timing = update.qualificationTiming;
      if (update.timeTiming !== undefined) payload.time_timing = update.timeTiming;
      if (update.faultsTiming !== undefined) payload.faults_timing = update.faultsTiming;
      if (update.selfCheckinEnabled !== undefined)
        payload.self_checkin_enabled = update.selfCheckinEnabled;
      await runSettingsWrite(supabase.from('class_visibility_overrides').upsert(payload));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverride(variables.classId),
      });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
    },
  });
}

interface BulkClassOverrideUpdate {
  classIds: string[];
  showId: string;
  preset?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

export function useBulkUpdateClassOverrides() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: BulkClassOverrideUpdate) => {
      if (update.classIds.length === 0) return;
      const sharedFields: Omit<TablesInsert<'class_visibility_overrides'>, 'class_id'> = {
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (update.preset !== undefined) sharedFields.preset = update.preset;
      if (update.placementTiming !== undefined)
        sharedFields.placement_timing = update.placementTiming;
      if (update.qualificationTiming !== undefined)
        sharedFields.qualification_timing = update.qualificationTiming;
      if (update.timeTiming !== undefined) sharedFields.time_timing = update.timeTiming;
      if (update.faultsTiming !== undefined) sharedFields.faults_timing = update.faultsTiming;
      if (update.selfCheckinEnabled !== undefined)
        sharedFields.self_checkin_enabled = update.selfCheckinEnabled;

      const rows: TablesInsert<'class_visibility_overrides'>[] = update.classIds.map(classId => ({
        class_id: classId,
        ...sharedFields,
      }));
      await runSettingsWrite(supabase.from('class_visibility_overrides').upsert(rows));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
    },
    // No hook-level error toast: both callers (ResultsBulkBar, SelfCheckinBulkBar)
    // show their own, more specific one, and two stacked toasts repeated each other.
  });
}

/**
 * Reset an override row by setting its nullable columns to NULL (not DELETE).
 * Spec: "No DELETE — rows are upserted, not removed (reset = set columns to NULL)."
 * Works for both trial and class overrides. `facet` (default `'all'`) scopes the
 * reset so a visibility reset preserves an existing check-in override and vice versa.
 */
export function useResetOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (reset: OverrideReset) => {
      const facet = reset.facet ?? 'all';
      const userId = user?.id ?? null;
      const timestamp = new Date().toISOString();
      if (reset.level === 'trial') {
        const payload = buildResetPayload({
          level: 'trial',
          entityId: reset.entityId,
          facet,
          userId,
          timestamp,
        });
        await runSettingsWrite(supabase.from('trial_visibility_overrides').upsert(payload));
        return;
      }
      const payload = buildResetPayload({
        level: 'class',
        entityId: reset.entityId,
        facet,
        userId,
        timestamp,
      });
      await runSettingsWrite(supabase.from('class_visibility_overrides').upsert(payload));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.trialOverride(variables.entityId),
      });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverride(variables.entityId),
      });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
    },
  });
}
