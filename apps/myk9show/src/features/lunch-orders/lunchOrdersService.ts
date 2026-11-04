import { supabase } from '@/services/database/supabaseClient';
import { cleanLunchText, LUNCH_NAME_MAX, type LunchOrderRow, type LunchRole } from './lunchOrders';

// Lunch orders are pre-show PLANNING data (a hospitality person plans headcount ahead of the
// day), not show-day scoring, so this is online-only PostgREST + React Query rather than a
// replicated table. Same pattern as trialJudgeSuppliesService.

const SELECT_COLUMNS = 'id, trial_id, person_id, name, role, lunch_order, dietary_note';

export interface SaveLunchOrderInput {
  trialId: string;
  savedId: string | null;
  personId: string | null;
  name: string;
  role: LunchRole;
  lunchOrder: string;
  dietaryNote: string;
}

export const lunchOrdersService = {
  async listForTrial(trialId: string): Promise<LunchOrderRow[]> {
    const { data, error } = await supabase
      .from('trial_lunch_orders')
      .select(SELECT_COLUMNS)
      .eq('trial_id', trialId)
      .order('name');
    if (error) throw error;
    return (data ?? []) as LunchOrderRow[];
  },

  /** Writes the one row for this person on this day: update when it exists, insert otherwise. */
  async save(input: SaveLunchOrderInput): Promise<void> {
    const fields = {
      lunch_order: cleanLunchText(input.lunchOrder),
      dietary_note: cleanLunchText(input.dietaryNote),
    };

    if (input.savedId) {
      const { error } = await supabase
        .from('trial_lunch_orders')
        .update(fields)
        .eq('id', input.savedId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('trial_lunch_orders').insert({
      trial_id: input.trialId,
      person_id: input.personId,
      name: input.name.trim().slice(0, LUNCH_NAME_MAX),
      role: input.role,
      ...fields,
    });
    if (!error) return;

    // 23505 = unique_violation: another device saved this person first. Update that row instead.
    if ((error as { code?: string }).code === '23505' && input.personId) {
      const retry = await supabase
        .from('trial_lunch_orders')
        .update(fields)
        .eq('trial_id', input.trialId)
        .eq('person_id', input.personId);
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('trial_lunch_orders').delete().eq('id', id);
    if (error) throw error;
  },
};
