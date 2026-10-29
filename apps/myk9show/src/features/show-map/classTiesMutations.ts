/**
 * MYK9-1473: dogs tied on score and time for a ribbon are placed by a coin flip the secretary
 * records. ONLINE ONLY, like the results check: the flip is a server RPC (`set_class_tie_order`,
 * show managers only) that must judge it against the scores as they are now. The tie groups
 * themselves are replicated data (`deriveClassTies`, coinFlipRows.ts).
 *
 * No React here, so the Results tab and its tests share it.
 */
import { supabase } from '@/services/database/supabaseClient';

/**
 * Records the flip for each group, one `set_class_tie_order` call per group, in the order given.
 * The server re-ranks the class after every call, and a group it refuses (MK016) stops the rest:
 * the caller re-reads the ties afterwards either way.
 */
export async function recordCoinFlips(input: {
  classId: string;
  /** Each group's entry ids, the dog that won the flip first. */
  orders: readonly (readonly string[])[];
}): Promise<void> {
  for (const order of input.orders) {
    const { error } = await supabase.rpc('set_class_tie_order', {
      p_class_id: input.classId,
      p_entry_ids: [...order],
    });
    if (error) throw error;
  }
}
