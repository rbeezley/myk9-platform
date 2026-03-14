/**
 * UserTable Component - Premium premium data table for user management
 *
 * Features:
 * - Premium visual design with smooth animations
 * - Premium user avatars with gradient fallbacks
 * - Sophisticated sorting with visual indicators
 * - Multi-select with enhanced checkboxes
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
import { Table, TableBody } from '@/components/ui/table';
import { DeleteConfirmationDialog } from '@/components/base/DeleteConfirmationDialog';
import { useUserStore } from '@/store/userStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { usePermanentDeleteUserMutation } from '@/hooks/queries/useUsersQuery';
import { AdminDeleteUserDialog } from '../AdminDeleteUserDialog';
import '@/styles/myk9-table.css';

import { User } from '@/types/user-types';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { DENSITY_CONFIG, APPLE_FONT_STYLE } from './types';
import type { UserTableProps, SortField, SortDirection } from './types';
import { UserTableSkeleton } from './UserTableSkeleton';
import { UserTableEmptyState } from './UserTableEmptyState';
import { UserTableHeader } from './UserTableHeader';
import { UserTableRowComponent } from './UserTableRow';
import { Pagination } from './Pagination';

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
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { deleteUser } = useUserStore();
  const { isAdmin } = useAuthContext();
  const permanentDeleteMutation = usePermanentDeleteUserMutation();

  // Sort users
  const sortedUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;

      switch (sortField) {
        case 'name':
          aValue = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
          bValue = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
          break;
        case 'email':
          aValue = a.email?.toLowerCase() || '';
          bValue = b.email?.toLowerCase() || '';
          break;
        case 'role':
          aValue = a.roles?.[0] || '';
          bValue = b.roles?.[0] || '';
          break;
        case 'created':
          aValue = a.createdAt || new Date(0);
          bValue = b.createdAt || new Date(0);
          break;
        case 'lastLogin':
          aValue = (a as AdminUser).lastSignInAt || '';
          bValue = (b as AdminUser).lastSignInAt || '';
          break;
        default:
          aValue = '';
          bValue = '';
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [users, sortField, sortDirection]);

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Check if user is selected
  const isUserSelected = (userId: string) => {
    return selectedUsers.some(item => item.id === userId);
  };

  // Check if all visible users are selected
  const allSelected = users.length > 0 && users.every(user => isUserSelected(user.id));
  const someSelected = selectedUsers.length > 0 && !allSelected;

  // Handle row actions
  const navigate = useNavigate();

  const handleViewUser = (user: User) => {
    navigate(`/users/${user.id}`);
  };

  const handleEditUser = (user: User) => {
    onUserClick(user); // Opens the details dialog in edit mode
  };

  const handleDeleteUser = (user: User) => {
    setDeleteTarget(user);
  };

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

  // Loading state
  if (isLoading) {
    return <UserTableSkeleton densityMode={densityMode} />;
  }

  // Empty state
  if (!users.length) {
    return <UserTableEmptyState searchTerm={searchTerm} />;
  }

  const density = DENSITY_CONFIG[densityMode];

  return (
    <div className="space-y-6" style={APPLE_FONT_STYLE}>
      {/* Enhanced Table Container */}
      <div className="myk9-table-container">
        {/* Table Wrapper */}
        <div className="overflow-x-auto">
          <Table className="myk9-table">
            <UserTableHeader
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              allSelected={allSelected}
              someSelected={someSelected}
              onSelectAll={onSelectAll}
            />
            <TableBody className="myk9-table-body">
              {sortedUsers.map(user => (
                <UserTableRowComponent
                  key={user.id}
                  user={user}
                  isSelected={isUserSelected(user.id)}
                  density={density}
                  searchTerm={searchTerm}
                  onSelectUser={onSelectUser}
                  onUserClick={onUserClick}
                  onViewUser={handleViewUser}
                  onEditUser={handleEditUser}
                  onDeleteUser={handleDeleteUser}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Enhanced Pagination */}
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
