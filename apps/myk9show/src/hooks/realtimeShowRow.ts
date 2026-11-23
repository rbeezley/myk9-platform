import { rowToShow } from '@/services/replication/showRowMapping';
import { mergeShowData } from '@/store/showStore';
import type { StoreShow } from '@/types/show-types';
import type { Database } from '@/types/supabase';

type ShowRow = Database['public']['Tables']['shows']['Row'];

/**
 * Maps a raw `postgres_changes` shows row (snake_case) to the store's camelCase Show, keeping the
 * fields the row does not carry (club name, assigned judges, stats) from the show already in the
 * store. Realtime rows never hold the joined club fields, so a blank branding value falls back to
 * what the club hydration already put on the card.
 */
export function realtimeRowToStoreShow(row: ShowRow, existing: StoreShow | undefined): StoreShow {
  const merged = mergeShowData(rowToShow(row), existing);
  if (!existing) return merged;
  return {
    ...merged,
    assignedJudges: existing.assignedJudges,
    logoUrl: merged.logoUrl || existing.logoUrl,
    coverImageUrl: merged.coverImageUrl || existing.coverImageUrl,
    accentColor: merged.accentColor || existing.accentColor,
  };
}
