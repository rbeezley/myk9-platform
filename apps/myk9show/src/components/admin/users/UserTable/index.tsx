import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { type ColumnDef, type SortingState } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { useUserStore } from '@/store/userStore';
import { usePermanentDeleteUserMutation } from '@/hooks/queries/useUsersQuery';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { AdminDeleteUserDialog } from '../AdminDeleteUserDialog';
import '@/styles/myk9-table.css';

import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mail, Phone } from 'lucide-react';

import { User } from '@/types/user-types';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { formatRelativeTime } from '@/lib/timeUtils';
import { DENSITY_CONFIG, ROLE_CONFIG, UNKNOWN_ROLE_CHIP } from './types';
import type { UserTableProps } from './types';
import { Pagination } from './Pagination';
import { RowActions } from './RowActions';
import {
  getUserInitials,
  getUserFullName,
  getUserStatus,
  getStatusConfig,
  getDeletedStatusConfig,
  highlightSearchTerm,
} from './utils';

// ---------------------------------------------------------------------------
// Local helpers (previously in UserTableRow)
// ---------------------------------------------------------------------------

function formatLastLogin(dateString: string | null | undefined): string {
  if (!dateString) return 'Never';
  return formatRelativeTime(new Date(dateString));
}

const STALE_LOGIN_DAYS = 180;

function isStaleLogin(dateString: string | null | undefined, thresholdDays = STALE_LOGIN_DAYS) {
  if (!dateString) return false;
  const diffMs = Date.now() - new Date(dateString).getTime();
  return diffMs > thresholdDays * 86400000;
}

const CHIP_CLASS = 'text-xs font-medium px-3 py-1 rounded-full border-0';

// ---------------------------------------------------------------------------
// Column factory — accepts closure values so cells can use them
// ---------------------------------------------------------------------------

function buildColumns(
  selectedUsers: UserTableProps['selectedUsers'],
  onSelectUser: UserTableProps['onSelectUser'],
  onSelectAll: UserTableProps['onSelectAll'],
  users: AdminUser[],
  searchTerm: string,
  densityMode: NonNullable<UserTableProps['densityMode']>,
  onViewUser: (user: User) => void,
  onEditUser: (user: User) => void,
  onDeleteUser: (user: User) => void,
  onManageRolesUser?: (user: User) => void
): ColumnDef<AdminUser, unknown>[] {
  const density = DENSITY_CONFIG[densityMode];

  const isUserSelected = (userId: string) => selectedUsers.some(item => item.id === userId);
  const allSelected = users.length > 0 && users.every(u => isUserSelected(u.id));
  const someSelected = selectedUsers.length > 0 && !allSelected;

  return [
    // ── Select checkbox ──────────────────────────────────────────────────
    // `interactive` keeps the row a real table row: without it DataTable makes
    // every <tr> a role="button", which flattens row/column semantics for a
    // screen reader and swallows the checkbox inside the row's own label.
    {
      id: '_select',
      enableSorting: false,
      meta: { interactive: true },
      header: () => (
        // The padding, not the box, carries the touch target: 20px visual,
        // 44px hit area.
        <label className="inline-flex items-center justify-center p-3 -m-3 cursor-pointer">
          <input
            type="checkbox"
            aria-label="Select all users on this page"
            checked={allSelected}
            ref={el => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={e => onSelectAll(e.target.checked)}
            className="h-5 w-5 rounded border-input accent-primary cursor-pointer"
          />
        </label>
      ),
      cell: ({ row }) => {
        const user = row.original;
        return (
          <label
            className="inline-flex items-center justify-center p-3 -m-3 cursor-pointer"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              aria-label={`Select ${getUserFullName(user)}`}
              checked={isUserSelected(user.id)}
              onChange={e => onSelectUser(user, e.target.checked)}
              className="h-5 w-5 rounded border-input accent-primary cursor-pointer"
            />
          </label>
        );
      },
    },

    // ── User (name + avatar) ─────────────────────────────────────────────
    {
      id: 'name',
      header: 'User',
      accessorFn: (row: AdminUser) =>
        `${row.firstName || ''} ${row.lastName || ''}`.trim().toLowerCase(),
      cell: ({ row }) => {
        const user = row.original;
        const initials = getUserInitials(user);
        const fullName = getUserFullName(user);
        const status = getUserStatus(user);
        const statusConfig = user.deletedAt ? getDeletedStatusConfig() : getStatusConfig(status);

        return (
          <div className={`flex items-center ${density.spacing}`}>
            <div className="relative">
              <Avatar className={`${density.avatarSize} ring-1 ring-border`}>
                <AvatarFallback className={`${density.fontSize} font-semibold bg-muted text-foreground`}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${statusConfig.dotClass}`}
                aria-hidden="true"
              />
            </div>

            <div className="min-w-0 flex-1 max-w-[220px]">
              <div className={`font-semibold text-foreground truncate ${density.fontSize}`}>
                {!user.firstName && !user.lastName ? (
                  <span className="italic text-muted-foreground">No name on file</span>
                ) : (
                  highlightSearchTerm(fullName, searchTerm)
                )}
              </div>
            </div>
          </div>
        );
      },
    },

    // ── Contact ──────────────────────────────────────────────────────────
    {
      id: 'email',
      header: 'Contact',
      accessorFn: (row: AdminUser) => row.email?.toLowerCase() ?? '',
      cell: ({ row }) => {
        const user = row.original;
        if (!user.email && !user.phone) {
          return <span className="text-sm text-muted-foreground">No contact details</span>;
        }
        return (
          <div className="space-y-1.5 max-w-[280px]">
            {user.email && (
              <div className={`flex items-center ${density.spacing} text-sm min-w-0`}>
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate text-foreground">
                  {highlightSearchTerm(user.email, searchTerm)}
                </span>
              </div>
            )}
            {user.phone && (
              <div className={`flex items-center ${density.spacing} text-sm text-muted-foreground`}>
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{highlightSearchTerm(user.phone, searchTerm)}</span>
              </div>
            )}
          </div>
        );
      },
    },

    // ── Roles ────────────────────────────────────────────────────────────
    {
      id: 'role',
      header: 'Roles',
      accessorFn: (row: AdminUser) => row.roles?.[0] ?? '',
      cell: ({ row }) => {
        const user = row.original;
        const roles = user.roles ?? [];
        if (roles.length === 0) {
          return (
            <Badge variant="outline" className={`${CHIP_CLASS} border border-border text-muted-foreground`}>
              No role
            </Badge>
          );
        }
        return (
          <div className="flex flex-wrap gap-2">
            {roles.map(role => {
              const roleConfig = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG];
              return (
                <Badge
                  key={role}
                  variant="outline"
                  className={`${CHIP_CLASS} ${roleConfig?.chipClass ?? UNKNOWN_ROLE_CHIP}`}
                >
                  {roleConfig?.icon && <roleConfig.icon className="h-3 w-3 mr-1" />}
                  {roleConfig?.label || role}
                </Badge>
              );
            })}
          </div>
        );
      },
    },

    // ── Last Login ───────────────────────────────────────────────────────
    {
      id: 'lastLogin',
      header: 'Last Login',
      accessorFn: (row: AdminUser) => row.lastSignInAt ?? '',
      cell: ({ row }) => {
        const user = row.original;
        const stale = isStaleLogin(user.lastSignInAt);
        return (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatLastLogin(user.lastSignInAt)}
            {stale && (
              // Colour alone can't carry this — the word does the work.
              <span className="ml-2 text-destructive">(inactive)</span>
            )}
          </span>
        );
      },
    },

    // ── Status ───────────────────────────────────────────────────────────
    {
      id: 'status',
      header: 'Status',
      accessorFn: (row: AdminUser) => row.status ?? 'active',
      cell: ({ row }) => {
        const user = row.original;
        const status = getUserStatus(user);
        const statusConfig = user.deletedAt ? getDeletedStatusConfig() : getStatusConfig(status);
        return (
          <Badge
            variant="outline"
            className={`${CHIP_CLASS} ${statusConfig.chipClass} inline-flex items-center gap-1.5`}
          >
            <statusConfig.icon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        );
      },
    },

    // ── Actions ──────────────────────────────────────────────────────────
    {
      id: '_actions',
      enableSorting: false,
      meta: { interactive: true },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const user = row.original;
        return (
          <span onClick={e => e.stopPropagation()}>
            <RowActions
              user={user}
              onView={onViewUser}
              onEdit={onEditUser}
              onDelete={onDeleteUser}
              {...(onManageRolesUser ? { onManageRoles: onManageRolesUser } : {})}
            />
          </span>
        );
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const UserTable: React.FC<UserTableProps> = ({
  users,
  isLoading,
  selectedUsers,
  onSelectUser,
  onSelectAll,
  onUserClick,
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
  const { deleteUser } = useUserStore();
  const permanentDeleteMutation = usePermanentDeleteUserMutation();
  const navigate = useNavigate();

  // Handle row actions
  const handleViewUser = useCallback((user: User) => navigate(`/people/${user.id}`), [navigate]);
  const handleEditUser = useCallback((user: User) => onUserClick(user), [onUserClick]);
  const handleDeleteUser = useCallback((user: User) => setDeleteTarget(user), []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      toast.success(`${getUserFullName(deleteTarget)} was removed. Restore from Deleted Items.`);
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
        handleViewUser,
        handleEditUser,
        handleDeleteUser,
        onManageRoles
      ),
    [
      selectedUsers,
      onSelectUser,
      onSelectAll,
      users,
      searchTerm,
      densityMode,
      handleViewUser,
      handleEditUser,
      handleDeleteUser,
      onManageRoles,
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
        <div className="myk9-table-container min-w-[760px]">
          {/* pageSize is deliberately huge: the page already sliced these rows,
              so the table must render all of them and never paginate again. */}
          <DataTable
            tableId="adminUsers"
            columns={columns}
            data={users}
            pageSize={9999}
            loading={isLoading}
            onRowClick={user => onUserClick(user)}
            className="myk9-table"
            manualSorting
            sorting={sorting}
            onSortingChange={handleSortingChange}
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
        {...(deleteTarget ? { personId: deleteTarget.id } : {})}
      />
    </div>
  );
};
