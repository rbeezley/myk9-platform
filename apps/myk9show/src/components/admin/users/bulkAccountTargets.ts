/**
 * Who each bulk account action (Suspend, Reinstate, Send invitation, Restore)
 * applies to, resolved fresh from the CURRENT roster every time it is asked —
 * never from a snapshot taken when a row was checked.
 *
 * The selection these rules receive is ids only. Every field a rule reads
 * (status, deletedAt, email, lastSignInAt) is looked up in `usersById` at the
 * moment of the call, so calling this again later — a retry, fired from a
 * toast after the roster refetched — automatically sees whatever changed in
 * between: a status flip, a sign-in, or the person leaving the roster
 * entirely. MYK9-835 (Codex P2 on f3968c58b): the previous version closed
 * over a `SelectedUser` snapshot captured at click time, so a retried invite
 * could still email someone who had since signed in.
 */

import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';

export type AccountAction = 'suspend' | 'reinstate' | 'invite' | 'restore';

export interface AccountTargets {
  suspend: string[];
  reinstate: string[];
  invite: string[];
  restore: string[];
  /** The admin selected their own active account; Suspend leaves it out. */
  selfSkipped: boolean;
}

/** A person's display name read from the CURRENT roster, falling back to their id. */
export function nameOf(id: string, usersById: ReadonlyMap<string, AdminUser>): string {
  const user = usersById.get(id);
  if (!user) return id;
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || id;
}

/**
 * Roster rows are people rows; the caller's people id is `databaseUserId`. The
 * auth uuid is checked too, matching the row menu's guard.
 */
export function isSelf(
  id: string,
  user: AdminUser | undefined,
  currentUserId: string | null | undefined
): boolean {
  return !!currentUserId && (id === currentUserId || user?.user_id === currentUserId);
}

/**
 * Whether `id`'s CURRENT roster row still qualifies for `action`. Shared by the
 * initial target lists below and by a retry's `applicableWhen` re-check, so the
 * two can never disagree about what "still eligible" means.
 */
export function isEligible(
  action: AccountAction,
  id: string,
  usersById: ReadonlyMap<string, AdminUser>,
  currentUserId: string | null | undefined
): boolean {
  const user = usersById.get(id);
  if (!user) return false;
  switch (action) {
    case 'suspend':
      return !user.deletedAt && user.status !== 'suspended' && !isSelf(id, user, currentUserId);
    case 'reinstate':
      return !user.deletedAt && user.status === 'suspended';
    case 'invite':
      // Only people who have never signed in: for anyone else an invitation is
      // a surprise email, not a recovery.
      return !user.deletedAt && !!user.email && !user.lastSignInAt;
    case 'restore':
      return !!user.deletedAt;
    default:
      return false;
  }
}

export function accountTargets(
  selectedIds: readonly string[],
  usersById: ReadonlyMap<string, AdminUser>,
  currentUserId: string | null | undefined
): AccountTargets {
  const byAction = (action: AccountAction) =>
    selectedIds.filter(id => isEligible(action, id, usersById, currentUserId));
  const selfSkipped = selectedIds.some(id => {
    const user = usersById.get(id);
    return (
      !!user && !user.deletedAt && user.status !== 'suspended' && isSelf(id, user, currentUserId)
    );
  });
  return {
    suspend: byAction('suspend'),
    reinstate: byAction('reinstate'),
    invite: byAction('invite'),
    restore: byAction('restore'),
    selfSkipped,
  };
}

/** Unique, non-empty addresses in selection order. */
export function selectedEmails(selected: SelectedUser[]): string[] {
  return [...new Set(selected.map(item => item.user.email?.trim() ?? '').filter(Boolean))];
}
