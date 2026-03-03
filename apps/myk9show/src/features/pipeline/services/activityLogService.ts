import { supabase } from '@/services/database/supabaseClient';
import type { ActivityLogEntry, ActivityLogFilters, ActivityActionType } from '../types';

// Cast needed: activity_log not yet in app's local Database type (src/types/supabase.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const PAGE_SIZE = 20;

export const activityLogService = {
  async getByTrial(
    trialId: string,
    filters?: ActivityLogFilters,
    page = 0
  ): Promise<{ entries: ActivityLogEntry[]; hasMore: boolean }> {
    let query = db
      .from('activity_log')
      .select('id, trial_id, action_type, description, actor_id, actor_name, metadata, created_at')
      .eq('trial_id', trialId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filters?.actionType) {
      query = query.eq('action_type', filters.actionType);
    }
    if (filters?.actorId) {
      query = query.eq('actor_id', filters.actorId);
    }
    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    const { data, error } = await query;
    if (error) throw error;

    const entries = (data ?? []) as ActivityLogEntry[];
    return { entries, hasMore: entries.length === PAGE_SIZE };
  },

  async log(entry: {
    trial_id: string;
    action_type: ActivityActionType;
    description: string;
    actor_id?: string;
    actor_name?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await db.from('activity_log').insert({
      trial_id: entry.trial_id,
      action_type: entry.action_type,
      description: entry.description,
      actor_id: entry.actor_id ?? null,
      actor_name: entry.actor_name ?? null,
      metadata: entry.metadata ?? {},
    });

    if (error) throw error;
  },
};
