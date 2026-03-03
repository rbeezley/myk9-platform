import { supabase } from '@/services/database/supabaseClient';
import type { ChecklistItemRow, PipelineStage } from '../types';

// Cast needed: trial_checklist_state not yet in app's local Database type (src/types/supabase.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const checklistService = {
  async getByTrial(trialId: string): Promise<ChecklistItemRow[]> {
    const { data, error } = await db
      .from('trial_checklist_state')
      .select('id, trial_id, stage, item_key, item_type, label, completed, completed_at, completed_by, auto_completed, sort_order, created_at, updated_at')
      .eq('trial_id', trialId)
      .order('stage')
      .order('sort_order');

    if (error) throw error;
    return (data ?? []) as ChecklistItemRow[];
  },

  async upsert(item: {
    trial_id: string;
    stage: PipelineStage;
    item_key: string;
    item_type: 'canned' | 'custom';
    label?: string;
    completed: boolean;
    completed_by?: string;
    auto_completed?: boolean;
    sort_order?: number;
  }): Promise<ChecklistItemRow> {
    const { data, error } = await db
      .from('trial_checklist_state')
      .upsert(
        {
          trial_id: item.trial_id,
          stage: item.stage,
          item_key: item.item_key,
          item_type: item.item_type,
          label: item.label ?? null,
          completed: item.completed,
          completed_at: item.completed ? new Date().toISOString() : null,
          completed_by: item.completed ? (item.completed_by ?? null) : null,
          auto_completed: item.auto_completed ?? false,
          sort_order: item.sort_order ?? 0,
        },
        { onConflict: 'trial_id,item_key' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as ChecklistItemRow;
  },

  async deleteCustomItem(trialId: string, itemKey: string): Promise<void> {
    const { error } = await db
      .from('trial_checklist_state')
      .delete()
      .eq('trial_id', trialId)
      .eq('item_key', itemKey)
      .eq('item_type', 'custom');

    if (error) throw error;
  },

  async toggleItem(
    trialId: string,
    itemKey: string,
    completed: boolean,
    userId: string
  ): Promise<ChecklistItemRow> {
    const { data, error } = await db
      .from('trial_checklist_state')
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? userId : null,
        auto_completed: false,
      })
      .eq('trial_id', trialId)
      .eq('item_key', itemKey)
      .select()
      .single();

    if (error) throw error;
    return data as ChecklistItemRow;
  },
};
