/**
 * Supabase queries for user_milestones table.
 *
 */

import { supabase } from '../supabaseClient';

export interface UserMilestone {
  user_id: string;
  milestone_key: string;
  achieved_at: string;
  tip_dismissed: boolean;
}

/** Fetch all milestones for the current user. */
export async function getUserMilestones() {
  const { data, error } = await supabase
    .from('user_milestones')
    .select('*')
    .order('achieved_at', { ascending: false });

  if (error) return { data: null, error: error as Error };
  return { data: data as UserMilestone[], error: null };
}

/** Mark a milestone as achieved (upsert). */
export async function achieveMilestone(milestoneKey: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };

  const { data, error } = await supabase
    .from('user_milestones')
    .upsert(
      {
        user_id: user.id,
        milestone_key: milestoneKey,
        achieved_at: new Date().toISOString(),
        tip_dismissed: false,
      },
      { onConflict: 'user_id,milestone_key' }
    )
    .select()
    .single();

  if (error) return { data: null, error: error as Error };
  return { data: data as UserMilestone, error: null };
}

/** Dismiss a tip banner for a milestone. */
export async function dismissMilestoneTip(milestoneKey: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };

  const { error } = await supabase
    .from('user_milestones')
    .update({ tip_dismissed: true })
    .eq('user_id', user.id)
    .eq('milestone_key', milestoneKey);

  if (error) return { data: null, error: error as Error };
  return { data: null, error: null };
}
