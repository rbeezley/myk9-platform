/**
 * Helpers for the floating bar's read-only "Copy emails" action. The bulk
 * ACCOUNT actions (Suspend, Reinstate, Send invitation, Restore) that used to
 * live alongside these were cut from this change (MYK9-835); see
 * docs/plan-list-toolkit.md.
 */

import type { SelectedUser } from '@/pages/admin/UserManagementPage';

/** Unique, non-empty addresses in selection order. */
export function selectedEmails(selected: SelectedUser[]): string[] {
  return [...new Set(selected.map(item => item.user.email?.trim() ?? '').filter(Boolean))];
}
