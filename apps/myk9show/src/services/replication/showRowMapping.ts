/**
 * The shows row -> ReplicatedShow mapping, split out of ReplicatedShowsTable.ts
 * to keep that file under the 500-line limit (MYK9-979). Re-exported there.
 */
import type { ShowExperienceSnapshot } from '@/features/experience/experienceSnapshot';
import type { Database } from '@/types/supabase';
import type { ReplicatedShow } from './ReplicatedShowsTable';

type ShowRow = Database['public']['Tables']['shows']['Row'];

/**
 * Convert database row to app Show type
 */
export function rowToShow(row: ShowRow): ReplicatedShow {
  const publishedFields = row as Record<string, unknown>;

  return {
    id: String(row.id),
    name: row.name,
    organization: row.organization,
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location ?? undefined,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    venueName: row.venue_name ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    status: row.status ?? undefined,
    deletedAt: row.deleted_at ?? null,
    entryOpenDate: row.entry_open_date ?? undefined,
    entryCloseDate: row.entry_close_date ?? undefined,
    preEntryFee: row.pre_entry_fee ?? undefined,
    dayOfShowFee: row.day_of_show_fee ?? undefined,
    juniorHandlerFee: row.junior_handler_fee,
    startingArmbandNumber: row.starting_armband_number ?? 100,
    clubId: row.club_id ?? undefined,
    maxEntriesPerDog: row.max_entries_per_dog ?? undefined,
    maxTotalEntries: row.max_total_entries ?? undefined,
    defaultJudgeDayCapacity: row.default_judge_day_capacity ?? 125,
    allowsNonOwnerHandlers: row.allow_non_owner_handlers ?? undefined,
    isNationals: row.is_nationals ?? undefined,
    acceptCheckPayments: row.accept_check_payments ?? undefined,
    acceptCashPayments: row.accept_cash_payments ?? undefined,
    onlineEntriesEnabled: row.online_entries_enabled ?? undefined,
    serverVersion: row.version,
    logoUrl: row.logo_url ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    accentColor: row.accent_color ?? undefined,
    style: ((row as Record<string, unknown>).style as string | undefined) ?? undefined,
    experienceIsPublished:
      (publishedFields.experience_is_published as boolean | null | undefined) ?? undefined,
    experiencePublishedAt:
      (publishedFields.experience_published_at as string | null | undefined) ?? null,
    experiencePublishedStyle:
      (publishedFields.experience_published_style as string | null | undefined) ?? null,
    experiencePublishedContent:
      (publishedFields.experience_published_content as ShowExperienceSnapshot | null | undefined) ??
      null,
  };
}
