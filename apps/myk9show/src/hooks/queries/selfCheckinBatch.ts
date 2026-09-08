import { resolveCheckinCascade } from '@myk9/secretary';
import { supabase } from '@/services/database/supabaseClient';
import { replicatedClassesTable } from '@/services/replication';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';

type Pending = {
  id: string;
  resolve: (enabled: boolean) => void;
  reject: (error: unknown) => void;
};

/** Coalesce queries started together; React Query remains the only settled cache. */
export function createSelfCheckinBatchLoader() {
  let pending: Pending[] = [];
  return (id: string): Promise<boolean> =>
    new Promise((resolve, reject) => {
      pending.push({ id, resolve, reject });
      if (pending.length !== 1) return;
      queueMicrotask(() => {
        const batch = pending;
        pending = [];
        const localValues = readLocalSelfCheckinValues(batch.map(item => item.id));
        for (const group of chunk(batch, ID_CHUNK_SIZE)) {
          void resolveBatch(group, localValues);
        }
      });
    });
}

async function resolveBatch(
  pending: Pending[],
  localValuesPromise: Promise<Map<string, boolean>>
): Promise<void> {
  try {
    const localValues = await localValuesPromise;
    const unresolved = pending.filter(item => !localValues.has(item.id));

    for (const item of pending) {
      const localValue = localValues.get(item.id);
      if (localValue !== undefined) item.resolve(localValue);
    }

    // Class replication resolves the same show → trial → class cascade while
    // syncing. Use it when available so My Shows does not fan out a live read
    // for every unscored class on an exhibitor's first render. The online path
    // remains the fallback for a cold or partially enriched replica.
    if (unresolved.length === 0) return;

    const ids = [...new Set(unresolved.map(item => item.id))];
    const { data: classes, error } = await supabase
      .from('classes')
      .select('id, trial_id, trials!inner(show_id)')
      .in('id', ids);
    if (error) throw error;
    const rows = classes ?? [];
    const trialIds = [...new Set(rows.map(row => row.trial_id))];
    const showIds = [...new Set(rows.map(row => row.trials.show_id))];
    if (!rows.length) throw new Error('Could not find the class self-check-in settings.');
    const [shows, trials, overrides] = await Promise.all([
      supabase
        .from('show_visibility_settings')
        .select('show_id, self_checkin_enabled')
        .in('show_id', showIds),
      supabase
        .from('trial_visibility_overrides')
        .select('trial_id, self_checkin_enabled')
        .in('trial_id', trialIds),
      supabase
        .from('class_visibility_overrides')
        .select('class_id, self_checkin_enabled')
        .in('class_id', ids),
    ]);
    const settingsError = shows.error ?? trials.error ?? overrides.error;
    if (settingsError) throw settingsError;
    const byClass = new Map(rows.map(row => [row.id, row]));
    const byShow = new Map((shows.data ?? []).map(row => [row.show_id, row.self_checkin_enabled]));
    const byTrial = new Map(
      (trials.data ?? []).map(row => [row.trial_id, row.self_checkin_enabled])
    );
    const byOverride = new Map(
      (overrides.data ?? []).map(row => [row.class_id, row.self_checkin_enabled])
    );
    for (const item of unresolved) {
      const row = byClass.get(item.id);
      if (!row) {
        item.reject(new Error('Could not find the class self-check-in settings.'));
        continue;
      }
      item.resolve(
        resolveCheckinCascade(
          byShow.get(row.trials.show_id) ?? null,
          byTrial.get(row.trial_id) ?? null,
          byOverride.get(row.id) ?? null
        )
      );
    }
  } catch (error) {
    for (const item of pending) item.reject(error);
  }
}

async function readLocalSelfCheckinValues(ids: string[]): Promise<Map<string, boolean>> {
  try {
    const requested = new Set(ids);
    const classes = await replicatedClassesTable.getAll();
    return new Map(
      classes
        .filter(cls => requested.has(cls.id) && cls.selfCheckinEnabled !== undefined)
        .map(cls => [cls.id, cls.selfCheckinEnabled as boolean])
    );
  } catch {
    // A storage failure should not turn a usable online path into a hard
    // failure. The caller will resolve all IDs through the bounded fallback.
    return new Map();
  }
}
