/**
 * The counts behind the delete dialog, read from the server (`delete_preview`,
 * migration 20261001233700).
 *
 * WHY THE SERVER AND NOT THE REPLICA. A delete needs the server anyway (every
 * soft_delete_* is an RPC), so there is no offline delete to preview. The
 * replica cannot answer the question honestly: entries replicate per show and
 * only for shows this device has opened, a cold or half-synced cache reads as
 * "0 entries", and RLS hides entries the delete still tombstones. A wrong
 * "nothing goes with it" is worse than "we can't tell yet", so a device that
 * cannot reach the RPC reports unknown and Delete stays off.
 */
import { supabase } from '@/services/database/supabaseClient';
import type { DeleteObjectKind, DeletePreview } from './deleteTypes';

const FIELDS = [
  'trials',
  'classes',
  'entries',
  'shows',
  'dogs',
  'paid',
  'scored',
  'blocking',
] as const satisfies readonly (keyof DeletePreview)[];

export const EMPTY_PREVIEW: DeletePreview = {
  trials: 0,
  classes: 0,
  entries: 0,
  shows: 0,
  dogs: 0,
  paid: 0,
  scored: 0,
  blocking: 0,
};

/**
 * Parse the RPC's jsonb. A missing or non-numeric `blocking` is a malformed
 * reply, not "nothing blocks": it throws, and the dialog reads unknown.
 */
export function parseDeletePreview(raw: unknown): DeletePreview {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('delete_preview returned no counts');
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.blocking !== 'number') {
    throw new Error('delete_preview returned no blocking count');
  }
  const preview = { ...EMPTY_PREVIEW };
  for (const field of FIELDS) {
    const value = record[field];
    preview[field] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
  return preview;
}

export async function fetchDeletePreview(
  kind: DeleteObjectKind,
  id: string
): Promise<DeletePreview> {
  const { data, error } = await supabase.rpc('delete_preview', { p_scope: kind, p_id: id });
  if (error) throw error;
  return parseDeletePreview(data);
}

/** One preview per item, summed for a bulk dialog. */
export function sumPreviews(previews: readonly DeletePreview[]): DeletePreview {
  return previews.reduce<DeletePreview>(
    (total, preview) => {
      const next = { ...total };
      for (const field of FIELDS) next[field] = total[field] + preview[field];
      return next;
    },
    { ...EMPTY_PREVIEW }
  );
}
