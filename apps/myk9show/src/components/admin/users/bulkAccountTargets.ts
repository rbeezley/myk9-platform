/**
 * Who each bulk account action applies to, out of the current selection. The
 * floating bar shows an action only when it has at least one target, and labels
 * it with the count when that is fewer than the whole selection.
 *
 * Pure, so the rules — never suspend yourself, never invite someone who has
 * already signed in, restore only removed people — are testable without React.
 */

import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';

export interface AccountTargets {
  suspend: SelectedUser[];
  reinstate: SelectedUser[];
  invite: SelectedUser[];
  restore: SelectedUser[];
  /** The admin selected their own active account; Suspend leaves it out. */
  selfSkipped: boolean;
}

export function isSelf(item: SelectedUser, currentUserId: string | null | undefined): boolean {
  // Roster rows are people rows; the caller's people id is `databaseUserId`. The
  // auth uuid is checked too, matching the row menu's guard.
  return !!currentUserId && (item.id === currentUserId || item.user.user_id === currentUserId);
}

export function accountTargets(
  selected: SelectedUser[],
  currentUserId: string | null | undefined
): AccountTargets {
  const live = selected.filter(item => !item.user.deletedAt);
  const active = live.filter(item => item.user.status !== 'suspended');
  return {
    suspend: active.filter(item => !isSelf(item, currentUserId)),
    reinstate: live.filter(item => item.user.status === 'suspended'),
    // Only people who have never signed in: for anyone else an invitation is a
    // surprise email, not a recovery.
    invite: live.filter(
      item => !!item.user.email && !(item.user as Partial<AdminUser>).lastSignInAt
    ),
    restore: selected.filter(item => !!item.user.deletedAt),
    selfSkipped: active.some(item => isSelf(item, currentUserId)),
  };
}

/** Unique, non-empty addresses in selection order. */
export function selectedEmails(selected: SelectedUser[]): string[] {
  return [...new Set(selected.map(item => item.user.email?.trim() ?? '').filter(Boolean))];
}
