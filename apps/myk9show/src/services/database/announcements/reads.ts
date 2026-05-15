// Read-side operations for Show Announcements.

import { supabase } from '../supabaseClient';
import type { DbShowAnnouncement, ShowAnnouncement } from '@/types/announcement-types';

/**
 * Fetch active announcements for a show, with read status for current user.
 * Two queries joined client-side (avoids Supabase filtered LEFT JOIN limitation).
 */
export async function getAnnouncementsByShow(showId: string): Promise<ShowAnnouncement[]> {
  const now = new Date().toISOString();

  const { data: announcements, error: annError } = await supabase
    .from('show_announcements')
    .select('*')
    .eq('show_id', showId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (annError) throw annError;
  if (!announcements) return [];

  const announcementIds = (announcements as DbShowAnnouncement[]).map(a => a.id);
  if (announcementIds.length === 0) return [];

  const { data: reads } = await supabase
    .from('show_announcement_reads')
    .select('announcement_id')
    .in('announcement_id', announcementIds);

  const readSet = new Set((reads ?? []).map(r => r.announcement_id));

  return (announcements as DbShowAnnouncement[]).map(a => ({
    ...a,
    is_read: readSet.has(a.id),
  }));
}
