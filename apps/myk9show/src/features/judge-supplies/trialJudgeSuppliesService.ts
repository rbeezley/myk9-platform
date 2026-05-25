import { supabase } from '@/services/database/supabaseClient';
import { getSupplyTemplate } from './templates';
import type { JudgeKey, RegistryId, TrialJudgeSupplyRow } from './types';

const SELECT_COLUMNS =
  'id, trial_id, person_id, judge_name, item_label, included, note, sort_order, is_custom, created_at, updated_at';

export const trialJudgeSuppliesService = {
  /** All rows for one trial, sorted for grouping by judge. */
  async listForTrial(trialId: string): Promise<TrialJudgeSupplyRow[]> {
    const { data, error } = await supabase
      .from('trial_judge_supplies')
      .select(SELECT_COLUMNS)
      .eq('trial_id', trialId)
      .order('judge_name')
      .order('sort_order');

    if (error) throw error;
    return (data ?? []) as TrialJudgeSupplyRow[];
  },

  /** All rows for every trial in a show. Single round-trip for the print artifact. */
  async listForShow(showId: string): Promise<TrialJudgeSupplyRow[]> {
    const { data: trials, error: trialsError } = await supabase
      .from('trials')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) throw trialsError;
    const trialIds: string[] = (trials ?? []).map((t: { id: string }) => t.id);
    if (trialIds.length === 0) return [];

    const { data, error } = await supabase
      .from('trial_judge_supplies')
      .select(SELECT_COLUMNS)
      .in('trial_id', trialIds)
      .order('trial_id')
      .order('judge_name')
      .order('sort_order');

    if (error) throw error;
    return (data ?? []) as TrialJudgeSupplyRow[];
  },

  /**
   * Idempotently seed the registry default template for a (trial, judge) pair.
   * Safe to call repeatedly; uses partial unique indexes to dedupe via
   * onConflict ignoreDuplicates. Returns the seeded rows (or existing rows
   * if already seeded).
   */
  async ensureSeededForJudge(args: {
    trial_id: string;
    person_id: string | null;
    judge_name: string;
    registry_id: RegistryId | null;
  }): Promise<TrialJudgeSupplyRow[]> {
    const { trial_id, person_id, judge_name, registry_id } = args;

    const existing = await this.listForJudge(trial_id, { person_id, judge_name });
    if (existing.length > 0) return existing;

    const template = getSupplyTemplate(registry_id);
    const rowsToInsert = template.map(item => ({
      trial_id,
      person_id,
      judge_name,
      item_label: item.label,
      sort_order: item.sort,
      included: true,
      is_custom: false,
    }));

    const { error } = await supabase
      .from('trial_judge_supplies')
      .insert(rowsToInsert);

    // 23505 = unique_violation. Concurrent seed race — re-fetch.
    if (error && (error as { code?: string }).code !== '23505') throw error;

    return this.listForJudge(trial_id, { person_id, judge_name });
  },

  /** Rows for a single (trial, judge) pair. */
  async listForJudge(trialId: string, judge: JudgeKey): Promise<TrialJudgeSupplyRow[]> {
    let query = supabase
      .from('trial_judge_supplies')
      .select(SELECT_COLUMNS)
      .eq('trial_id', trialId);

    query = judge.person_id !== null
      ? query.eq('person_id', judge.person_id)
      : query.is('person_id', null).eq('judge_name', judge.judge_name);

    const { data, error } = await query.order('sort_order');
    if (error) throw error;
    return (data ?? []) as TrialJudgeSupplyRow[];
  },

  /** Partial update on a single row (included, note, sort_order). Template rows can be toggled but not deleted. */
  async updateRow(
    id: string,
    patch: Partial<Pick<TrialJudgeSupplyRow, 'included' | 'note' | 'sort_order' | 'item_label'>>
  ): Promise<TrialJudgeSupplyRow> {
    const { data, error } = await supabase
      .from('trial_judge_supplies')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw error;
    return data as TrialJudgeSupplyRow;
  },

  /** Add a custom row for a judge. is_custom = true; the row is deletable. */
  async addCustomRow(args: {
    trial_id: string;
    person_id: string | null;
    judge_name: string;
    item_label: string;
    sort_order: number;
    note?: string | null;
  }): Promise<TrialJudgeSupplyRow> {
    const { data, error } = await supabase
      .from('trial_judge_supplies')
      .insert({
        trial_id: args.trial_id,
        person_id: args.person_id,
        judge_name: args.judge_name,
        item_label: args.item_label,
        sort_order: args.sort_order,
        note: args.note ?? null,
        included: true,
        is_custom: true,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw error;
    return data as TrialJudgeSupplyRow;
  },

  /** Delete a custom row. Caller must verify is_custom = true; DB does not enforce. */
  async deleteCustomRow(id: string): Promise<void> {
    const { error } = await supabase
      .from('trial_judge_supplies')
      .delete()
      .eq('id', id)
      .eq('is_custom', true);

    if (error) throw error;
  },
};
