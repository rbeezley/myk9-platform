import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { type SortingState } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/store/userStore';
import {
  usePermanentDeleteUserMutation,
  useUpdateUserMutation,
} from '@/hooks/queries/useUsersQuery';
import { restoreUser } from '@/services/database/users';
import { queryKeys } from '@/lib/queryClient';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { useAuthContext } from '@/hooks/useAuthContext';
import AccountStatusDialog from '@/components/users/AccountStatusDialog';
import { AdminDeleteUserDialog } from '../AdminDeleteUserDialog';
import '@/styles/myk9-table.css';

import { User } from '@/types/user-types';
import type { UserTableProps } from './types';
import { Pagination } from './Pagination';
import { buildColumns } from './columns';
import { getUserFullName } from './utils';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const UserTable: React.FC<UserTableProps> = ({
  users,
  isLoading,
  selectedUsers,
  onSelectUser,
  onSelectAll,
  onViewUser,
  onEditUser,
  onManageRoles,
  currentPage,
  totalPages,
  totalFilteredUsers,
  onPageChange,
  pageSize,
  onPageSizeChange,
  searchTerm = '',
  densityMode = 'comfortable',
  sort = null,
  onSortChange,
}) => {
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const { deleteUser } = useUserStore();
  const { user: currentUser, hasPermission } = useAuthContext();
  const permanentDeleteMutation = usePermanentDeleteUserMutation();
  const updateUserMutation = useUpdateUserMutation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Handle row actions
  const handleDeleteUser = useCallback((user: User) => setDeleteTarget(user), []);
  const handleChangeStatusUser = useCallback((user: User) => setStatusTarget(user), []);

  const confirmStatusChange = useCallback(async () => {
    if (!statusTarget) return;
    const nextStatus = statusTarget.status === 'suspended' ? 'active' : 'suspended';
    try {
      await updateUserMutation.mutateAsync({
        id: statusTarget.id,
        updates: { status: nextStatus },
      });
      toast.success(
        `${getUserFullName(statusTarget)} was ${nextStatus === 'suspended' ? 'suspended' : 'reinstated'}`
      );
      setStatusTarget(null);
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Failed to update account status'));
    }
  }, [statusTarget, updateUserMutation]);

  const handleRestoreUser = useCallback(
    async (user: User) => {
      if (restoringId) return;
      setRestoringId(user.id);
      try {
        // Same service the Deleted Items page calls — one restore path, so the
        // two surfaces can't drift (docs/plan-ia-admin-person-detail.md, Phase A).
        const { error } = await restoreUser(user.id);
        if (error) throw error;
        // The admin list is keyed under users.all, so this refreshes both the
        // with-removed and without-removed variants.
        await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
        toast.success(`${getUserFullName(user)} was restored`);
      } catch (err) {
        toast.error(getUserFriendlyError(err, 'Failed to restore user'));
      } finally {
        setRestoringId(null);
      }
    },
    [restoringId, queryClient]
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      toast.success(`${getUserFullName(deleteTarget)} was removed`, {
        description: 'They can be restored from this list or from Deleted Items.',
        action: {
          label: 'Deleted Items',
          onClick: () => navigate('/admin/deleted-items'),
        },
      });
      setDeleteTarget(null);
    } catch (err) {
      // Surface the actionable guard message (e.g. "owns dogs") if the DB blocked
      // it — e.g. when the dialog's owned-dogs pre-check was bypassed.
      toast.error(getUserFriendlyError(err, 'Failed to delete user'));
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await permanentDeleteMutation.mutateAsync({ id: deleteTarget.id });
      toast.success(`${getUserFullName(deleteTarget)} was permanently deleted`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getUserFriendlyError(err, 'Failed to permanently delete user'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Build columns — stable reference unless closure values change
  const columns = useMemo(
    () =>
      buildColumns(
        selectedUsers,
        onSelectUser,
        onSelectAll,
        users,
        searchTerm,
        densityMode,
        onViewUser,
        onEditUser,
        handleDeleteUser,
        handleRestoreUser,
        onManageRoles,
        hasPermission('admin:manage') ? handleChangeStatusUser : undefined,
        // Roster rows are people rows, so the self-row guard needs the
        // caller's PEOPLE id (databaseUserId). The auth uuid alone never
        // matched: get_admin_user_list returns no auth_user_id, so every
        // row's user_id is undefined and the guard silently never fired.
        currentUser?.databaseUserId ?? currentUser?.id
      ),
    [
      selectedUsers,
      onSelectUser,
      onSelectAll,
      users,
      searchTerm,
      densityMode,
      onViewUser,
      onEditUser,
      handleDeleteUser,
      handleRestoreUser,
      onManageRoles,
      handleChangeStatusUser,
      currentUser?.databaseUserId,
      currentUser?.id,
      hasPermission,
    ]
  );

  // Sorting state is mirrored from the page, which sorts the whole filtered set.
  const sorting: SortingState = useMemo(
    () => (sort ? [{ id: sort.id, desc: sort.desc }] : []),
    [sort]
  );

  const handleSortingChange = useCallback(
    (next: SortingState) => {
      if (!onSortChange) return;
      const first = next[0];
      onSortChange(first ? { id: first.id, desc: first.desc } : null);
    },
    [onSortChange]
  );

  return (
    <div className="space-y-6">
      <div
        className="max-w-full overflow-x-auto rounded-xl"
        aria-label="Users table scroll area"
        role="region"
        tabIndex={0}
      >
        {/* lg, not sm: at 640-1023px the responsive column set fits naturally,
            and a 760px floor there forced a permanent ~50px sideways scroll. */}
        <div className="myk9-table-container min-w-0 lg:min-w-[760px]">
          {/* pageSize is deliberately huge: the page already sliced these rows,
              so the table must render all of them and never paginate again.
              That slicing is also why search and export are turned off here —
              both built-ins operate on the rows the table was handed, so they
              would silently cover only the current page while the toolbar above
              searches, and the header button exports, the whole filtered set.
              Columns and density stay: they are genuinely per-table. */}
          <DataTable
            tableId="adminUsers"
            columns={columns}
            data={users}
            pageSize={9999}
            loading={isLoading}
            // Every row opens its record, removed or not. A removed person's
            // page states that they are removed and offers Restore (MYK9-153);
            // before that existed the row had nowhere to go and was inert.
            onRowClick={user => onViewUser(user)}
            className="myk9-table"
            manualSorting
            sorting={sorting}
            onSortingChange={handleSortingChange}
            showSearch={false}
            showExport={false}
          />
        </div>
      </div>

      {/* External pagination — controlled by parent */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalUsers={totalFilteredUsers}
        onPageChange={onPageChange}
        {...(onPageSizeChange ? { onPageSizeChange } : {})}
      />

      <AdminDeleteUserDialog
        open={!!deleteTarget}
        onOpenChange={open => {
          if (!open) setDeleteTarget(null);
        }}
        onSoftDelete={confirmDelete}
        onPermanentDelete={confirmPermanentDelete}
        entityName={deleteTarget ? getUserFullName(deleteTarget) : ''}
        isDeleting={isDeleting}
        alreadyRemoved={Boolean(deleteTarget?.deletedAt)}
        {...(deleteTarget ? { personId: deleteTarget.id } : {})}
      />

      {statusTarget && (
        <AccountStatusDialog
          open
          onOpenChange={open => {
            if (!open) setStatusTarget(null);
          }}
          userName={getUserFullName(statusTarget)}
          status={statusTarget.status ?? 'active'}
          onConfirm={confirmStatusChange}
          isUpdating={updateUserMutation.isPending}
        />
      )}
    </div>
  );
};
