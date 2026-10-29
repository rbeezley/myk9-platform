/**
 * MYK9-1473: dogs tied on score and time for a ribbon are placed by a coin flip the secretary
 * records. ONLINE ONLY, like the results check: the tie list and the flip are server RPCs
 * (`get_class_ties`, `set_class_tie_order`, show managers only). The entries replica does not carry
 * the tie marker, so reading it offline is not possible; recording a flip is a write the server
 * must judge against the scores as they are now.
 *
 * No React here, so the Results tab and its tests share it.
 */
import { supabase } from '@/services/database/supabaseClient';

export interface ClassTieEntry {
  entryId: string;
  armband: number | null;
  dogName: string;
  /** Faults at an ordinary show, points at nationals (the tie is on whichever the class ranks by). */
  totalFaults: number | null;
  pointsEarned: number | null;
  timeSeconds: number | null;
}

/** One group of dogs sharing a score and time, all tied for `rank`. */
export interface ClassTieGroup {
  rank: number;
  /** Nationals rank by points then time; every other show by faults then time. */
  byPoints: boolean;
  entries: ClassTieEntry[];
}

/** The class's unresolved ribbon ties, in finishing order. Empty when every flip is recorded. */
export async function readClassTies(classId: string): Promise<ClassTieGroup[]> {
  const { data, error } = await supabase.rpc('get_class_ties', { p_class_id: classId });
  if (error) throw error;
  const groups: ClassTieGroup[] = [];
  for (const row of data ?? []) {
    const rank = row.group_rank ?? row.final_placement ?? 0;
    let group = groups.find(candidate => candidate.rank === rank);
    if (!group) {
      group = { rank, byPoints: row.ranks_by_points === true, entries: [] };
      groups.push(group);
    }
    group.entries.push({
      entryId: row.entry_id,
      armband: row.armband_number,
      dogName: row.dog_call_name ?? 'Dog',
      totalFaults: row.total_faults,
      pointsEarned: row.points_earned,
      timeSeconds: row.search_time_seconds,
    });
  }
  return groups;
}

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
