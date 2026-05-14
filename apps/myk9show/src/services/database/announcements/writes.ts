// Write-side operations for Show Announcements and per-user read tracking.

import { supabase } from '../supabaseClient';
import type {
  DbShowAnnouncement,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  AnnouncementAuthorRole,
} from '@/types/announcement-types';

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

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('show_announcements').delete().eq('id', id);

  if (error) throw error;
}

/** Mark a single announcement as read for the current user. */
export async function markAnnouncementRead(announcementId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('show_announcement_reads')
    .upsert(
      { announcement_id: announcementId, user_id: userId },
      { onConflict: 'announcement_id,user_id' }
    );

  if (error) throw error;
}

/** Mark all listed announcements as read for the current user. */
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
