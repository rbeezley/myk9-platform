/**
 * Supabase queries for user_milestones table.
 *
 * Note: user_milestones is defined in migration 051 but not yet in the
 * generated Supabase types. We use the schema-free `.from()` escape hatch
 * and cast results to our own interface.
 */

import { supabase } from '../supabaseClient';

export interface UserMilestone {
  user_id: string;
  milestone_key: string;
  achieved_at: string;
  tip_dismissed: boolean;
}

// Schema-free client for tables not yet in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Fetch all milestones for the current user. */
export async function getUserMilestones() {
  const { data, error } = await db
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

  const { data, error } = await db
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

  const { error } = await db
    .from('user_milestones')
    .update({ tip_dismissed: true })
    .eq('user_id', user.id)
    .eq('milestone_key', milestoneKey);

  if (error) return { data: null, error: error as Error };
  return { data: null, error: null };
}
