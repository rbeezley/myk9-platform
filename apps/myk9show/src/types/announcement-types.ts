import type { User } from '@supabase/supabase-js';
import type { UserWithRoles } from './auth-types';

/** Database row shape for show_announcements */
export interface DbShowAnnouncement {
  id: string;
  show_id: string;
  author_id: string;
  author_role: AnnouncementAuthorRole;
  author_name: string | null;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** UI-facing announcement with computed read status */
export interface ShowAnnouncement extends DbShowAnnouncement {
  is_read: boolean;
}

/** Priority levels matching DB CHECK constraint */
export type AnnouncementPriority = 'normal' | 'high' | 'urgent';

/** Author roles matching DB CHECK constraint and UserRole enum values */
export type AnnouncementAuthorRole = 'secretary' | 'judge' | 'club_admin';

/** Roles allowed to create/manage announcements */
export const ANNOUNCEMENT_OFFICIAL_ROLES: readonly AnnouncementAuthorRole[] = [
  'secretary',
  'judge',
  'club_admin',
] as const;

export interface AnnouncementAuthor {
  id: string;
  role: AnnouncementAuthorRole;
  name: string;
  isOfficial: boolean;
}

export function getAnnouncementAuthor(
  user: User | null | undefined,
  userWithRoles: UserWithRoles | null | undefined,
  fallbackName = 'Unknown'
): AnnouncementAuthor {
  const role = (userWithRoles?.roles ?? []).find(candidate =>
    (ANNOUNCEMENT_OFFICIAL_ROLES as readonly string[]).includes(candidate)
  ) as AnnouncementAuthorRole | undefined;

  return {
    id: userWithRoles?.id ?? user?.id ?? '',
    role: role ?? 'secretary',
    name:
      (userWithRoles?.user_metadata?.full_name as string | undefined) ??
      userWithRoles?.email ??
      user?.email ??
      fallbackName,
    isOfficial: Boolean(role),
  };
}

/** Input for creating an announcement */
export interface CreateAnnouncementInput {
  show_id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  expires_at?: string | null;
}

/** Input for updating an announcement */
export interface UpdateAnnouncementInput {
  title?: string;
  content?: string;
  priority?: AnnouncementPriority;
  expires_at?: string | null;
  is_active?: boolean;
}
