import { createDatabaseError, supabase } from '@/services/database/supabaseClient';

export function sourceIdFromShowMapNodeId(nodeId: string, expectedType: string): string | null {
  const prefix = `${expectedType}:`;
  if (!nodeId.startsWith(prefix)) return null;
  const sourceId = nodeId.slice(prefix.length);
  return sourceId.length > 0 ? sourceId : null;
}

export async function markShowMapEntryCheckedIn(entryId: string): Promise<void> {
  // Secretary/staff Show Map path mirrors CheckInReportPage: staff can update
  // check_in_status directly, while exhibitor self-check-in uses the RPC path.
  const { error } = await supabase
    .from('entries')
    .update({ check_in_status: 'checked-in' } as Record<string, unknown>)
    .eq('id', entryId);

  if (error) {
    throw createDatabaseError(error, 'entries', 'show_map_mark_checked_in');
  }
}

export async function scratchShowMapEntry(
  entryId: string,
  reason: string | undefined
): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .update({
      entry_status: 'scratched',
      check_in_status: 'pulled',
      withdrawal_reason: reason?.trim() || 'Marked no-show from Show Map',
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', entryId);

  if (error) {
    throw createDatabaseError(error, 'entries', 'show_map_scratch_entry');
  }
}
