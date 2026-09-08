import { resolveCheckinCascade } from '@myk9/secretary';
import { supabase } from '@/services/database/supabaseClient';
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
        for (const group of chunk(batch, ID_CHUNK_SIZE)) {
          void resolveBatch(group);
        }
      });
    });
}

async function resolveBatch(pending: Pending[]): Promise<void> {
  try {
    const ids = [...new Set(pending.map(item => item.id))];
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
    for (const item of pending) {
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
