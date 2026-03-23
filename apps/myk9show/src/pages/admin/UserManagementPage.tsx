/**
 * User Management Page - Comprehensive admin interface for managing users
 *
 * Features:
 * - Advanced search and filtering
 * - User profile management with RBAC
 * - Bulk operations
 * - User creation and management
 * - Audit logging integration
 */

import React, { useState, useMemo } from 'react';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { Filter, Plus, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Hooks and services
import { useAdminUsersQuery, useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';
import { User } from '@/types/user-types';
// Components
import { UserTable } from '@/components/admin/users/UserTable';
import { UserFilters } from '@/components/admin/users/UserFilters';
import { CreateUserDialog } from '@/components/admin/users/CreateUserDialog';
import { BulkActionsBar } from '@/components/admin/users/BulkActionsBar';
import { UserEditPanel } from '@/components/panels/edit/UserEditPanel';
// Extracted modules
import type { UserFilter, SelectedUser } from './UserManagementPage.types';
import { DEFAULT_USER_FILTER } from './UserManagementPage.types';
import { filterUsers, calculateRoleStats, exportUsersCSV } from './UserManagementPage.helpers';
import { UserManagementStats } from './UserManagementStats';
// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

// Re-export types so external consumers keep working
export type { UserFilter, SelectedUser } from './UserManagementPage.types';

const UserManagementPage: React.FC = () => {
  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<UserFilter>(DEFAULT_USER_FILTER);
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUserEditPanel, setShowUserEditPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Data fetching with error handling
  const { data: users = [], isLoading, error, refetch } = useAdminUsersQuery(filters.showDeleted);
  const updateUserMutation = useUpdateUserMutation();

  // Debug logging
  logger.debug('UserManagementPage render:', 'admin', {
    isLoading,
    userCount: users.length,
    error,
  });

  // Filter, search, and pagination
  const filteredUsers = useMemo(
    () => filterUsers(users, searchTerm, filters),
    [users, searchTerm, filters]
  );
  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const roleStats = useMemo(() => calculateRoleStats(users), [users]);

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    filters.role !== 'all' ||
    filters.status !== 'all' ||
    !!filters.clubAffiliation;

  // Selection handlers
  const handleSelectUser = (user: User, selected: boolean) => {
    if (selected) {
      setSelectedUsers(prev => [...prev, { id: user.id, user }]);
    } else {
      setSelectedUsers(prev => prev.filter(item => item.id !== user.id));
    }
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedUsers(paginatedUsers.map(user => ({ id: user.id, user })));
    } else {
      setSelectedUsers([]);
    }
  };

  const clearSelection = () => setSelectedUsers([]);

  // User action handlers
  const handleUserClick = (user: User) => {
    setSelectedUser(user);
    setShowUserEditPanel(true);
  };

  const handleEditPanelSave = async (userData: Partial<User>) => {
    if (!selectedUser) return;
    try {
      const updatedUser = await updateUserMutation.mutateAsync({
        id: selectedUser.id,
        updates: userData,
      });
      setSelectedUser(updatedUser);
      setShowUserEditPanel(false);
      notifications.success('User updated successfully');
    } catch (err) {
      logger.error('Failed to update user:', 'pages', {}, err as Error);
      notifications.error('Failed to update user');
      throw err;
    }
  };

  // Breadcrumbs
  const breadcrumbs = useMemo(
    () => [
      { label: 'Admin', href: '/admin' },
      { label: 'Users', href: '/admin/users' },
    ],
    []
  );

  // Action buttons
  const actionButtons = useMemo(
    () => (
      <>
        <Button variant="outline" onClick={() => exportUsersCSV(filteredUsers)}>
          <Download className="h-4 w-4 mr-2" />
          Export Users
        </Button>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </>
    ),
    [filteredUsers]
  );

  return (
    <PageShell>
      {/* Error state */}
      {error && !isLoading && (
        <ErrorState message="Failed to load users." onRetry={() => refetch()} />
      )}

      {/* Normal content */}
      {!error && (
        <>
          <PageHeader breadcrumbs={breadcrumbs} title="User Management" actions={actionButtons} />

          {/* Statistics */}
          <UserManagementStats
            users={users}
            filteredUsers={filteredUsers}
            roleStats={roleStats}
            selectedUsers={selectedUsers}
          />

          {/* Bulk Actions Bar */}
          {selectedUsers.length > 0 && (
            <BulkActionsBar
              selectedUsers={selectedUsers}
              onClearSelection={clearSelection}
              onBulkComplete={() => clearSelection()}
              onUsersDeleted={deletedUserIds => {
                clearSelection();
                logger.debug('Users deleted:', 'admin', { data: deletedUserIds });
              }}
            />
          )}

          {/* Search & Filters toolbar */}
          <div className="bg-card/30 border border-border/40 rounded-2xl p-4 space-y-3 backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1 w-full sm:max-w-md">
                <SearchBar
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search by name, email, or ID..."
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="h-10 px-4 rounded-xl"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                  {(filters.role !== 'all' ||
                    filters.status !== 'all' ||
                    !!filters.clubAffiliation) && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full"
                    >
                      !
                    </Badge>
                  )}
                </Button>
                {selectedUsers.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearSelection}
                    className="h-10 px-4 rounded-xl"
                  >
                    Clear Selection ({selectedUsers.length})
                  </Button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="pt-3 border-t border-border/30">
                <UserFilters filters={filters} onFiltersChange={setFilters} roleStats={roleStats} />
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border/20">
              <span className="text-sm text-muted-foreground">
                {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
                {hasActiveFilters && ' (filtered)'}
              </span>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages || 1}
              </span>
            </div>
          </div>

          {/* Empty state for zero-result filters */}
          {filteredUsers.length === 0 && !isLoading && hasActiveFilters && (
            <EmptyState
              icon={Search}
              title="No users match your filters"
              description="Try adjusting your search or filter criteria."
              action={{
                label: 'Clear Filters',
                onClick: () => {
                  setSearchTerm('');
                  setFilters(DEFAULT_USER_FILTER);
                },
              }}
            />
          )}

          {/* User Table */}
          {(filteredUsers.length > 0 || isLoading) && (
            <UserTable
              users={paginatedUsers}
              isLoading={isLoading}
              selectedUsers={selectedUsers}
              onSelectUser={handleSelectUser}
              onSelectAll={handleSelectAll}
              onUserClick={handleUserClick}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={size => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
          )}
        </>
      )}

      {/* Create User Dialog */}
      <CreateUserDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onUserCreated={newUser => {
          setShowCreateDialog(false);
          setSelectedUser(newUser);
          setShowUserEditPanel(true);
        }}
      />

      {/* User Edit Panel */}
      {selectedUser && (
        <UserEditPanel
          open={showUserEditPanel}
          onClose={() => setShowUserEditPanel(false)}
          userId={selectedUser.id}
          userName={
            `${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() ||
            'Unknown User'
          }
          initialUserData={selectedUser}
          onSave={handleEditPanelSave}
        />
      )}
    </PageShell>
  );
};

export default UserManagementPage;
