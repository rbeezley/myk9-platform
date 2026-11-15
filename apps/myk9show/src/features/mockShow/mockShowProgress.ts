import { supabase } from '@/lib/supabase';

/**
 * Ticks and minutes for the mock show sheet.
 *
 * Kept in the tester's own `user_preferences` row (RLS: auth_user_id = auth.uid()),
 * category `data`, one flat key per task (`mockTask3`). The category merge in
 * `merge_user_preferences` replaces a key whole, so each task is its own key and
 * two devices saving different tasks never overwrite each other. No new table.
 */
export interface MockTaskProgress {
  done: boolean;
  minutes: number | null;
}

export type MockShowProgress = Record<number, MockTaskProgress>;

const APP_ID = 'myk9show';
export const EMPTY_TASK_PROGRESS: MockTaskProgress = { done: false, minutes: null };

export const taskKey = (number: number) => `mockTask${number}`;

function readTask(value: unknown): MockTaskProgress {
  if (!value || typeof value !== 'object') return EMPTY_TASK_PROGRESS;
  const { done, minutes } = value as Record<string, unknown>;
  return {
    done: done === true,
    minutes:
      typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0 ? minutes : null,
  };
}

export async function loadMockShowProgress(userId: string): Promise<MockShowProgress> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .eq('app', APP_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const prefs = (data?.preferences ?? {}) as { data?: Record<string, unknown> };
  const progress: MockShowProgress = {};
  for (const key of Object.keys(prefs.data ?? {})) {
    const match = /^mockTask(\d+)$/.exec(key);
    if (match) progress[Number(match[1])] = readTask(prefs.data?.[key]);
  }
  return progress;
}

export async function saveMockTaskProgress(
  userId: string,
  number: number,
  progress: MockTaskProgress
): Promise<void> {
  const { error } = await supabase.rpc('merge_user_preferences', {
    p_user_id: userId,
    p_app: APP_ID,
    p_category: 'data',
    p_patch: { [taskKey(number)]: { done: progress.done, minutes: progress.minutes } },
  });
  if (error) throw new Error(error.message);
}
