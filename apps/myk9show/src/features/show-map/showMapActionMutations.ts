import { createDatabaseError, supabase } from '@/services/database/supabaseClient';

export function sourceIdFromShowMapNodeId(nodeId: string, expectedType: string): string | null {
  const prefix = `${expectedType}:`;
  if (!nodeId.startsWith(prefix)) return null;
  const sourceId = nodeId.slice(prefix.length);
  return sourceId.length > 0 ? sourceId : null;
}

export async function markShowMapEntryCheckedIn(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .update({ check_in_status: 'checked-in' } as Record<string, unknown>)
    .eq('id', entryId);

  if (error) {
    throw createDatabaseError(error, 'entries', 'show_map_mark_checked_in');
  }
}
