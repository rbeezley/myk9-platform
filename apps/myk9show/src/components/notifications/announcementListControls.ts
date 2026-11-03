import type { AnnouncementPriority, ShowAnnouncement } from '@/types/announcement-types';

export type AnnouncementSort = 'newest' | 'oldest' | 'priority' | 'unread';

export const ANNOUNCEMENT_SORT_OPTIONS: ReadonlyArray<{ value: AnnouncementSort; label: string }> =
  [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'priority', label: 'Priority' },
    { value: 'unread', label: 'Unread first' },
  ];

export interface AnnouncementListControls {
  query: string;
  sort: AnnouncementSort;
  unreadOnly: boolean;
}

const PRIORITY_RANK: Record<AnnouncementPriority, number> = { urgent: 2, high: 1, normal: 0 };

function createdAtMs(announcement: ShowAnnouncement): number {
  const ms = new Date(announcement.created_at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function matchesQuery(query: string, ...fields: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some(field => (field ?? '').toLowerCase().includes(needle));
}

/** Filters (unread, search on title and body) then sorts; ties always fall back to newest first. */
export function filterAndSortAnnouncements(
  announcements: ShowAnnouncement[],
  { query, sort, unreadOnly }: AnnouncementListControls
): ShowAnnouncement[] {
  const filtered = announcements.filter(
    announcement =>
      (!unreadOnly || !announcement.is_read) &&
      matchesQuery(query, announcement.title, announcement.content)
  );
  const newestFirst = (a: ShowAnnouncement, b: ShowAnnouncement) => createdAtMs(b) - createdAtMs(a);
  const compare = (a: ShowAnnouncement, b: ShowAnnouncement): number => {
    switch (sort) {
      case 'oldest':
        return -newestFirst(a, b);
      case 'priority':
        return (
          (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) || newestFirst(a, b)
        );
      case 'unread':
        return Number(a.is_read) - Number(b.is_read) || newestFirst(a, b);
      default:
        return newestFirst(a, b);
    }
  };
  return [...filtered].sort(compare);
}
