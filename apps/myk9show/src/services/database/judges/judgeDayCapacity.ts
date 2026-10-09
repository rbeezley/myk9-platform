import { supabase } from '../supabaseClient';

interface JudgeDayCapacityArguments {
  p_show_id: string;
  p_judge_id: string;
  p_date: string;
  p_capacity: number | null;
}

// Migration 20261007184317. The generated signature types p_capacity as
// `number`, but NULL clears the limit, so this callable keeps its own typing;
// never patch the generated schema by hand.
type CapacityRpc = (
  name: 'set_judge_day_capacity',
  args: JudgeDayCapacityArguments
) => PromiseLike<{ data: number | null; error: { message: string } | null }>;

export async function setJudgeDayCapacity(
  showId: string,
  judgeId: string,
  date: string,
  capacity: number | null
): Promise<void> {
  const rpc = supabase.rpc.bind(supabase) as unknown as CapacityRpc;
  const { data, error } = await rpc('set_judge_day_capacity', {
    p_show_id: showId,
    p_judge_id: judgeId,
    p_date: date,
    p_capacity: capacity,
  });
  if (error) throw new Error(error.message);
  if (data === null || data < 1) throw new Error('No judge-day assignments were updated.');
}
