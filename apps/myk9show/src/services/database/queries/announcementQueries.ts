import { supabase } from '../supabaseClient';
import type {
  DbShowAnnouncement,
  ShowAnnouncement,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  AnnouncementAuthorRole,
} from '@/types/announcement-types';

/**
 * Fetch active announcements for a show, with read status for current user.
 * Two queries joined client-side (avoids Supabase filtered LEFT JOIN limitation).
 */
export async function fetchShowAnnouncements(showId: string): Promise<ShowAnnouncement[]> {
  const now = new Date().toISOString();

  // Query 1: active, non-expired announcements
  const { data: announcements, error: annError } = await supabase
    .from('show_announcements')
    .select('*')
    .eq('show_id', showId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (annError) throw annError;
  if (!announcements) return [];

  // Query 2: read IDs for current user
  const announcementIds = (announcements as DbShowAnnouncement[]).map(a => a.id);
  if (announcementIds.length === 0) return [];

  const { data: reads } = await supabase
    .from('show_announcement_reads')
    .select('announcement_id')
    .in('announcement_id', announcementIds);

  const readSet = new Set((reads ?? []).map((r: { announcement_id: string }) => r.announcement_id));

  return (announcements as DbShowAnnouncement[]).map(a => ({
    ...a,
    is_read: readSet.has(a.id),
  }));
}

/**
 * Create an announcement. Returns the created row.
 */
export async function createAnnouncement(
  input: CreateAnnouncementInput,
  authorId: string,
  authorRole: AnnouncementAuthorRole,
  authorName: string
): Promise<DbShowAnnouncement> {
  const { data, error } = await supabase
    .from('show_announcements')
    .insert({
      show_id: input.show_id,
      author_id: authorId,
      author_role: authorRole,
      author_name: authorName,
      title: input.title,
      content: input.content,
      priority: input.priority,
      expires_at: input.expires_at ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DbShowAnnouncement;
}

/**
 * Update an announcement. Returns the updated row.
 */
export async function updateAnnouncement(
  id: string,
  updates: UpdateAnnouncementInput
): Promise<DbShowAnnouncement> {
  const { data, error } = await supabase
    .from('show_announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as DbShowAnnouncement;
}

/**
 * Delete an announcement (hard delete).
 */
export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('show_announcements').delete().eq('id', id);

  if (error) throw error;
}

/**
 * Mark a single announcement as read for the current user.
 */
export async function markAnnouncementRead(announcementId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('show_announcement_reads')
    .upsert(
      { announcement_id: announcementId, user_id: userId },
      { onConflict: 'announcement_id,user_id' }
    );

  if (error) throw error;
}

/**
 * Mark all unread announcements in a show as read for the current user.
 */
export async function markAllAnnouncementsRead(
  announcementIds: string[],
  userId: string
): Promise<void> {
  if (announcementIds.length === 0) return;

  const rows = announcementIds.map(id => ({
    announcement_id: id,
    user_id: userId,
  }));

  const { error } = await supabase
    .from('show_announcement_reads')
    .upsert(rows, { onConflict: 'announcement_id,user_id' });

  if (error) throw error;
}
