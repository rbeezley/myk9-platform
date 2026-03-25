/**
 * UserTable Component - Premium data table for user management
 *
 * Features:
 * - DataTable-powered sorting with visual indicators
 * - Multi-select with external state (controlled by parent)
 * - Three-dot menus following standard patterns
 * - Advanced hover states with standard easing
 * - Responsive design with mobile adaptation
 * - Loading skeletons matching table structure
 * - Empty states with Premium messaging
 * - Column density controls
 * - Search result highlighting
 * - Accessibility compliant (WCAG 2.1 AA)
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { DeleteConfirmationDialog } from '@/components/base/DeleteConfirmationDialog';
import { useUserStore } from '@/store/userStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { usePermanentDeleteUserMutation } from '@/hooks/queries/useUsersQuery';
import { AdminDeleteUserDialog } from '../AdminDeleteUserDialog';
import '@/styles/myk9-table.css';

import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mail, Phone, MapPin, Calendar, Building2 } from 'lucide-react';

import { User } from '@/types/user-types';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { formatRelativeTime } from '@/lib/timeUtils';
import { DENSITY_CONFIG, APPLE_FONT_STYLE, ROLE_CONFIG } from './types';
import type { UserTableProps } from './types';
import { Pagination } from './Pagination';
import { RowActions } from './RowActions';
import {
  getUserInitials,
  getUserFullName,
  getUserStatus,
  getStatusConfig,
  getDeletedStatusConfig,
  getAvatarGradient,
  highlightSearchTerm,
} from './utils';

// ---------------------------------------------------------------------------
// Local helpers (previously in UserTableRow)
// ---------------------------------------------------------------------------

function formatLastLogin(dateString: string | null | undefined): string {
  if (!dateString) return 'Never';
  return formatRelativeTime(new Date(dateString));
}

function isStaleLogin(dateString: string | null | undefined, thresholdDays = 180): boolean {
  if (!dateString) return false;
  const diffMs = Date.now() - new Date(dateString).getTime();
  return diffMs > thresholdDays * 86400000;
}

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
  onDeleteUser: (user: User) => void
): ColumnDef<AdminUser, unknown>[] {
  const density = DENSITY_CONFIG[densityMode];

  const isUserSelected = (userId: string) => selectedUsers.some(item => item.id === userId);
  const allSelected = users.length > 0 && users.every(u => isUserSelected(u.id));
  const someSelected = selectedUsers.length > 0 && !allSelected;

  return [
    // ── Select checkbox ──────────────────────────────────────────────────
    {
      id: '_select',
      enableSorting: false,
      header: () => (
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => {
            if (el) el.indeterminate = someSelected && !allSelected;
          }}
          onChange={e => onSelectAll(e.target.checked)}
          className="h-4 w-4 rounded border-gray-400 accent-blue-500 cursor-pointer"
        />
      ),
      cell: ({ row }) => {
        const user = row.original;
        return (
          <span onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isUserSelected(user.id)}
              onChange={e => onSelectUser(user, e.target.checked)}
              className="h-4 w-4 rounded border-gray-400 accent-blue-500 cursor-pointer"
            />
          </span>
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
        const avatarGradient = getAvatarGradient(initials);
        const fullName = getUserFullName(user);
        const status = getUserStatus(user);
        const statusConfig = user.deletedAt ? getDeletedStatusConfig() : getStatusConfig(status);

        return (
          <div className={`flex items-center ${density.spacing}`}>
            <div className="relative">
              <Avatar
                className={`${density.avatarSize} ring-2 ring-white/50 ring-offset-2 ring-offset-background shadow-sm`}
              >
                <AvatarFallback
                  className={`${density.fontSize} font-[650] bg-gradient-to-br ${avatarGradient} text-white shadow-inner`}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              {statusConfig && (
                <div
                  className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-background bg-gradient-to-br flex items-center justify-center"
                  style={{ backgroundColor: statusConfig.background }}
                >
                  <statusConfig.icon
                    className="h-2.5 w-2.5"
                    style={{ color: statusConfig.color }}
                  />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div
                className={`font-[590] text-foreground truncate ${density.fontSize} leading-tight`}
              >
                {!user.firstName && !user.lastName ? (
                  <span className="italic text-muted-foreground">&mdash; &mdash;</span>
                ) : (
                  highlightSearchTerm(fullName, searchTerm)
                )}
              </div>
              {user.membershipId && (
                <div className="text-xs text-muted-foreground font-[500] mt-1 tracking-wide">
                  ID: {highlightSearchTerm(user.membershipId, searchTerm)}
                </div>
              )}
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
        return (
          <div className="space-y-2">
            {user.email && (
              <div className={`flex items-center ${density.spacing} text-sm`}>
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 flex items-center justify-center border border-blue-500/20">
                  <Mail className="h-3 w-3 text-blue-600" />
                </div>
                <span className="truncate font-[500] text-foreground">
                  {highlightSearchTerm(user.email, searchTerm)}
                </span>
              </div>
            )}
            {user.phone && (
              <div className={`flex items-center ${density.spacing} text-sm text-muted-foreground`}>
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-green-500/10 to-green-500/5 flex items-center justify-center border border-green-500/20">
                  <Phone className="h-3 w-3 text-green-600" />
                </div>
                <span className="font-[500]">{highlightSearchTerm(user.phone, searchTerm)}</span>
              </div>
            )}
            {(user.city || user.state) && (
              <div className={`flex items-center ${density.spacing} text-sm text-muted-foreground`}>
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5 flex items-center justify-center border border-orange-500/20">
                  <MapPin className="h-3 w-3 text-orange-600" />
                </div>
                <span className="font-[500]">
                  {highlightSearchTerm(
                    [user.city, user.state].filter(Boolean).join(', '),
                    searchTerm
                  )}
                </span>
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
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {user.roles?.map(role => {
                const roleConfig = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG];
                return (
                  <Badge
                    key={role}
                    variant="outline"
                    className="text-xs font-[590] px-3 py-1 rounded-full border-0 transition-all duration-200"
                    style={{
                      backgroundColor: roleConfig?.background || 'rgba(142, 142, 147, 0.1)',
                      color: roleConfig?.color || '#8E8E93',
                    }}
                  >
                    {roleConfig?.icon && <roleConfig.icon className="h-3 w-3 mr-1" />}
                    {roleConfig?.label || role}
                  </Badge>
                );
              }) || (
                <Badge
                  variant="outline"
                  className="text-xs font-[590] px-3 py-1 rounded-full border border-border/60 text-muted-foreground"
                >
                  No Role
                </Badge>
              )}
            </div>

            {user.clubAffiliations && user.clubAffiliations.length > 0 && (
              <div className={`flex items-center ${density.spacing} text-xs text-muted-foreground`}>
                <div className="h-5 w-5 rounded-md bg-gradient-to-br from-purple-500/10 to-purple-500/5 flex items-center justify-center border border-purple-500/20">
                  <Building2 className="h-3 w-3 text-purple-600" />
                </div>
                <span className="truncate font-[500]">
                  {user.clubAffiliations.length === 1
                    ? highlightSearchTerm(user.clubAffiliations[0], searchTerm)
                    : `${user.clubAffiliations.length} clubs`}
                </span>
              </div>
            )}
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
          <div className={`flex items-center ${density.spacing} text-sm text-muted-foreground`}>
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-gray-500/10 to-gray-500/5 flex items-center justify-center border border-gray-500/20">
              <Calendar className="h-3 w-3 text-gray-600" />
            </div>
            <span className="font-[500]" style={stale ? { color: '#EF4444' } : undefined}>
              {formatLastLogin(user.lastSignInAt)}
            </span>
          </div>
        );
      },
    },

    // ── Status ───────────────────────────────────────────────────────────
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      accessorFn: (row: AdminUser) => row.status ?? 'active',
      cell: ({ row }) => {
        const user = row.original;
        const status = getUserStatus(user);
        const statusConfig = user.deletedAt ? getDeletedStatusConfig() : getStatusConfig(status);
        return (
          <Badge
            variant="outline"
            className="text-xs font-[590] px-3 py-1 rounded-full border-0 flex items-center gap-1.5 transition-all duration-200"
            style={{
              backgroundColor: statusConfig.background,
              color: statusConfig.color,
            }}
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
      header: () => (
        <span className="font-[650] text-sm text-muted-foreground uppercase tracking-[0.04em]">
          Actions
        </span>
      ),
      cell: ({ row }) => {
        const user = row.original;
        return (
          <span onClick={e => e.stopPropagation()}>
            <RowActions
              user={user}
              onView={onViewUser}
              onEdit={onEditUser}
              onDelete={onDeleteUser}
            />
          </span>
        );
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// UserTableEmptyState (inlined — UserTableEmptyState.tsx deleted)
// ---------------------------------------------------------------------------

function UserTableEmptyState({ searchTerm }: { searchTerm: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-border/50 bg-muted/20"
      style={APPLE_FONT_STYLE}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full blur-3xl" />
        <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-muted to-muted/50 border border-border/30 flex items-center justify-center mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 text-muted-foreground/70"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        </div>
      </div>

      <h3 className="text-xl font-[650] text-foreground mb-3 tracking-tight">
        {searchTerm ? 'No Matching Users' : 'No Users Found'}
      </h3>

      <p className="text-muted-foreground mb-6 max-w-md font-[500] leading-relaxed">
        {searchTerm
          ? `No users match "${searchTerm}". Try adjusting your search terms or filters.`
          : 'There are no users to display. Users will appear here once they are added to the system.'}
      </p>

      {searchTerm && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <span className="font-[500]">
            Searched for:{' '}
            <span className="font-[590] text-foreground">&quot;{searchTerm}&quot;</span>
          </span>
        </div>
      )}
    </div>
  );
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
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  searchTerm = '',
  densityMode = 'comfortable',
}) => {
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { deleteUser } = useUserStore();
  const { isAdmin } = useAuthContext();
  const permanentDeleteMutation = usePermanentDeleteUserMutation();
  const navigate = useNavigate();

  // Handle row actions
  const handleViewUser = (user: User) => navigate(`/users/${user.id}`);
  const handleEditUser = (user: User) => onUserClick(user);
  const handleDeleteUser = (user: User) => setDeleteTarget(user);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      toast.success(`${deleteTarget.firstName} ${deleteTarget.lastName} has been deleted`);
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await permanentDeleteMutation.mutateAsync({ id: deleteTarget.id });
      toast.success(
        `${deleteTarget.firstName} ${deleteTarget.lastName} has been permanently deleted`
      );
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to permanently delete user');
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
        handleDeleteUser
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedUsers, onSelectUser, onSelectAll, users, searchTerm, densityMode]
  );

  // Empty state (before DataTable so we keep the bespoke design)
  if (!isLoading && !users.length) {
    return (
      <div className="space-y-6" style={APPLE_FONT_STYLE}>
        <UserTableEmptyState searchTerm={searchTerm} />
      </div>
    );
  }

  return (
    <div className="space-y-6" style={APPLE_FONT_STYLE}>
      {/* Table — use large pageSize so DataTable never shows its own pagination */}
      <div className="myk9-table-container">
        <DataTable
          columns={columns}
          data={users}
          pageSize={9999}
          loading={isLoading}
          onRowClick={user => onUserClick(user)}
          className="myk9-table"
          emptyState={<UserTableEmptyState searchTerm={searchTerm} />}
        />
      </div>

      {/* External pagination — controlled by parent */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalUsers={users.length}
        searchTerm={searchTerm}
        onPageChange={onPageChange}
        {...(onPageSizeChange ? { onPageSizeChange } : {})}
      />

      {isAdmin ? (
        <AdminDeleteUserDialog
          open={!!deleteTarget}
          onOpenChange={open => {
            if (!open) setDeleteTarget(null);
          }}
          onSoftDelete={confirmDelete}
          onPermanentDelete={confirmPermanentDelete}
          entityName={deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ''}
          isDeleting={isDeleting}
        />
      ) : (
        <DeleteConfirmationDialog
          open={!!deleteTarget}
          onOpenChange={open => {
            if (!open) setDeleteTarget(null);
          }}
          onConfirm={confirmDelete}
          entityName={deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ''}
          entityType="User"
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
};
