import { supabase } from '@/services/database/supabaseClient';
import { getSupplyTemplate } from './templates';
import type { JudgeKey, RegistryId, ShowJudgeSupplyRow } from './types';

const SELECT_COLUMNS =
  'id, show_id, person_id, judge_name, item_label, included, note, sort_order, is_custom, created_at, updated_at';

/**
 * MYK9-1728: a judge's supplies are stored once per show and judge. A judge on two trials has
 * one list; there is no per-trial copy and nothing to keep in sync.
 */
export const showJudgeSuppliesService = {
  /** All rows for one show, sorted for grouping by judge. */
  async listForShow(showId: string): Promise<ShowJudgeSupplyRow[]> {
    const { data, error } = await supabase
      .from('show_judge_supplies')
      .select(SELECT_COLUMNS)
      .eq('show_id', showId)
      .order('judge_name')
      .order('sort_order');

    if (error) throw error;
    return (data ?? []) as ShowJudgeSupplyRow[];
  },

  /** Rows for a single (show, judge) pair. */
  async listForJudge(showId: string, judge: JudgeKey): Promise<ShowJudgeSupplyRow[]> {
    let query = supabase.from('show_judge_supplies').select(SELECT_COLUMNS).eq('show_id', showId);

    query =
      judge.person_id !== null
        ? query.eq('person_id', judge.person_id)
        : query.is('person_id', null).eq('judge_name', judge.judge_name);

    const { data, error } = await query.order('sort_order');
    if (error) throw error;
    return (data ?? []) as ShowJudgeSupplyRow[];
  },

  /**
   * Idempotently seed the registry default template for a (show, judge) pair.
   * Safe to call repeatedly: a concurrent seed trips the partial unique indexes (23505) and
   * the rows are re-read. Returns the seeded rows (or the existing rows if already seeded).
   */
  async ensureSeededForJudge(args: {
    show_id: string;
    person_id: string | null;
    judge_name: string;
    registry_id: RegistryId | null;
  }): Promise<ShowJudgeSupplyRow[]> {
    const { show_id, person_id, judge_name, registry_id } = args;

    const existing = await this.listForJudge(show_id, { person_id, judge_name });
    if (existing.length > 0) return existing;

    const template = getSupplyTemplate(registry_id);
    const rowsToInsert = template.map(item => ({
      show_id,
      person_id,
      judge_name,
      item_label: item.label,
      sort_order: item.sort,
      included: true,
      is_custom: false,
    }));

    const { error } = await supabase.from('show_judge_supplies').insert(rowsToInsert);

    // 23505 = unique_violation. Concurrent seed race: re-fetch.
    if (error && (error as { code?: string }).code !== '23505') throw error;

    return this.listForJudge(show_id, { person_id, judge_name });
  },

  /** Partial update on a single row (included, note, sort_order). Template rows can be toggled but not deleted. */
  async updateRow(
    id: string,
    patch: Partial<Pick<ShowJudgeSupplyRow, 'included' | 'note' | 'sort_order' | 'item_label'>>
  ): Promise<ShowJudgeSupplyRow> {
    const { data, error } = await supabase
      .from('show_judge_supplies')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw error;
    return data as ShowJudgeSupplyRow;
  },

  /** Add a custom row for a judge. is_custom = true; the row is deletable. */
  async addCustomRow(args: {
    show_id: string;
    person_id: string | null;
    judge_name: string;
    item_label: string;
    sort_order: number;
    note?: string | null;
  }): Promise<ShowJudgeSupplyRow> {
    const { data, error } = await supabase
      .from('show_judge_supplies')
      .insert({
        show_id: args.show_id,
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
    return data as ShowJudgeSupplyRow;
  },

  /** Delete a custom row. Caller must verify is_custom = true; DB does not enforce. */
  async deleteCustomRow(id: string): Promise<void> {
    const { error } = await supabase
      .from('show_judge_supplies')
      .delete()
      .eq('id', id)
      .eq('is_custom', true);

    if (error) throw error;
  },
};
