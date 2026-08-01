/**
 * User Management - the site admin's roster of every person on the platform.
 *
 * Search, filter, and sort the roster; open a person to edit them, assign roles,
 * or remove them; act on many at once with the bulk bar. Deletes here are
 * reversible from Admin > Deleted Items.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { Filter, Plus, Download, Search, Users, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Hooks and services
import { useAdminUsersQuery, useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';
import { User } from '@/types/user-types';
import { getUserFriendlyError } from '@/utils/errorMessages';
// Components
import { UserTable } from '@/components/admin/users/UserTable';
import { UserFilters } from '@/components/admin/users/UserFilters';
import { CreateUserDialog } from '@/components/admin/users/CreateUserDialog';
import { BulkActionsBar } from '@/components/admin/users/BulkActionsBar';
import { UserEditPanel } from '@/components/panels/edit/UserEditPanel';
import { ManageUserRolesDialog } from '@/components/admin/permissions/ManageUserRolesDialog';
// Extracted modules
import type { UserFilter, UserSort, SelectedUser } from './UserManagementPage.types';
import {
  DEFAULT_USER_FILTER,
  countActiveUserFilters,
  hasActiveUserFilters,
} from './UserManagementPage.types';
import {
  filterUsers,
  sortUsers,
  calculateRoleStats,
  exportUsersCSV,
} from './UserManagementPage.helpers';
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
  const [sort, setSort] = useState<UserSort | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUserEditPanel, setShowUserEditPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [roleAssignTarget, setRoleAssignTarget] = useState<User | null>(null);
  // Support diagnostics deep-link here with ?userId= so the admin lands on the
  // affordance that fixes the ticket, not just a page that describes it.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkUserId = searchParams.get('userId');

  // Data fetching with error handling
  const { data: users = [], isLoading, error, refetch } = useAdminUsersQuery(filters.showDeleted);
  const updateUserMutation = useUpdateUserMutation();

  // Filter, sort, then paginate — in that order, so a sort covers every match
  // rather than reordering the 25 rows that happen to be on screen.
  const filteredUsers = useMemo(
    () => filterUsers(users, searchTerm, filters),
    [users, searchTerm, filters]
  );
  const sortedUsers = useMemo(() => sortUsers(filteredUsers, sort), [filteredUsers, sort]);
  const totalPages = Math.ceil(sortedUsers.length / pageSize);
  // Clamp the active page so it never exceeds the available pages (e.g. after
  // a search narrows results while the user is on a later page).
  const clampedPage = Math.min(currentPage, Math.max(1, totalPages));
  const paginatedUsers = sortedUsers.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);
  const roleStats = useMemo(() => calculateRoleStats(users), [users]);

  const hasActiveFilters = hasActiveUserFilters(filters, searchTerm);
  const activeFilterCount = countActiveUserFilters(filters);

  // Only selections the current filters still show can be acted on. Derived
  // rather than reconciled in an effect, so narrowing a filter can never leave
  // the bulk bar pointed at people who are off-screen, and widening it back
  // restores the selection instead of having silently discarded it.
  const visibleSelection = useMemo(() => {
    if (selectedUsers.length === 0) return selectedUsers;
    const visibleIds = new Set(filteredUsers.map(user => user.id));
    return selectedUsers.filter(item => visibleIds.has(item.id));
  }, [selectedUsers, filteredUsers]);

  // Selection handlers
  const handleSelectUser = useCallback((user: User, selected: boolean) => {
    setSelectedUsers(prev =>
      selected
        ? prev.some(item => item.id === user.id)
          ? prev
          : [...prev, { id: user.id, user }]
        : prev.filter(item => item.id !== user.id)
    );
  }, []);

  // Select-all covers the current page, and merges with (rather than replaces)
  // selections made on other pages.
  const handleSelectAll = useCallback(
    (selected: boolean) => {
      const pageIds = new Set(paginatedUsers.map(user => user.id));
      setSelectedUsers(prev => {
        const withoutPage = prev.filter(item => !pageIds.has(item.id));
        return selected
          ? [...withoutPage, ...paginatedUsers.map(user => ({ id: user.id, user }))]
          : withoutPage;
      });
    },
    [paginatedUsers]
  );

  const clearSelection = useCallback(() => setSelectedUsers([]), []);
  const removeDeletedUsers = useCallback((deletedUserIds: string[]) => {
    if (deletedUserIds.length === 0) return;
    setSelectedUsers(prev => prev.filter(item => !deletedUserIds.includes(item.id)));
  }, []);

  // User action handlers
  const handleUserClick = useCallback((user: User) => {
    setSelectedUser(user);
    setShowUserEditPanel(true);
  }, []);

  const handleManageRoles = useCallback((user: User) => {
    setRoleAssignTarget(user);
  }, []);

  // Unknown ids are a quiet no-op: the admin still gets the roster, and the
  // support ticket may simply name someone who was since deleted.
  const deepLinkUser = useMemo(
    () =>
      deepLinkUserId
        ? (users.find(user => user.id === deepLinkUserId || user.user_id === deepLinkUserId) ??
          null)
        : null,
    [deepLinkUserId, users]
  );

  // Row-click selection wins over the deep link; the deep link only fills in
  // when nothing has been explicitly selected.
  const roleDialogTarget = roleAssignTarget ?? deepLinkUser;

  // Closing clears whichever source opened the dialog. When the deep link was
  // the source, strip ?userId= from the URL so the dialog cannot be resurrected
  // by a refetch, a filter change, or any other re-render — there is nothing
  // left in the URL to reopen it from.
  const closeRoleDialog = useCallback(() => {
    setRoleAssignTarget(null);
    if (deepLinkUserId) {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.delete('userId');
          return next;
        },
        { replace: true }
      );
    }
  }, [deepLinkUserId, setSearchParams]);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilters(DEFAULT_USER_FILTER);
  }, []);

  const handleSortChange = useCallback((next: UserSort | null) => {
    setSort(next);
    setCurrentPage(1);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

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
      notifications.error(getUserFriendlyError(err, 'Failed to update user'));
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

  const actionButtons = (
    <>
      <Button variant="outline" asChild>
        <Link to="/admin/role-requests">
          <ShieldCheck className="h-4 w-4 mr-2" />
          Role Requests
        </Link>
      </Button>
      <Button variant="outline" onClick={() => exportUsersCSV(sortedUsers)}>
        <Download className="h-4 w-4 mr-2" />
        Export Users
      </Button>
      <Button onClick={() => setShowCreateDialog(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create User
      </Button>
    </>
  );

  const showEmptyState = !isLoading && sortedUsers.length === 0;

  return (
    <PageShell>
      {/* Error state */}
      {error && !isLoading && (
        <ErrorState
          message="Failed to load users."
          description={getUserFriendlyError(error, 'Check your connection and try again.')}
          onRetry={() => refetch()}
        />
      )}

      {/* Normal content */}
      {!error && (
        <>
          <PageHeader
            breadcrumbs={breadcrumbs}
            title="User Management"
            showTitle
            actions={actionButtons}
          />

          {/* Statistics */}
          <UserManagementStats users={users} filteredUsers={sortedUsers} roleStats={roleStats} />

          {/* Bulk Actions Bar */}
          {visibleSelection.length > 0 && (
            <BulkActionsBar
              selectedUsers={visibleSelection}
              onClearSelection={clearSelection}
              onBulkComplete={deletedUserIds => {
                removeDeletedUsers(deletedUserIds ?? []);
              }}
              onUsersDeleted={deletedUserIds => {
                removeDeletedUsers(deletedUserIds);
              }}
            />
          )}

          {/* Search & Filters toolbar */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1 w-full sm:max-w-md">
                <SearchBar
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search by name, email, or phone..."
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  onClick={() => setShowFilters(!showFilters)}
                  aria-expanded={showFilters}
                  aria-controls="user-filters-panel"
                  className="h-11 px-4 rounded-xl"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-6 min-w-6 px-1.5 flex items-center justify-center rounded-full"
                    >
                      <span className="sr-only">Active filters: </span>
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
                {visibleSelection.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={clearSelection}
                    className="h-11 px-4 rounded-xl"
                  >
                    Clear Selection ({visibleSelection.length})
                  </Button>
                )}
              </div>
            </div>

            {showFilters && (
              <div id="user-filters-panel" className="pt-3 border-t border-border">
                <UserFilters filters={filters} onFiltersChange={setFilters} roleStats={roleStats} />
              </div>
            )}

            <p
              className="pt-2 border-t border-border text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {`Showing ${sortedUsers.length} of ${users.length} user${users.length !== 1 ? 's' : ''}`}
              {hasActiveFilters && ' (filtered)'}
            </p>
          </div>

          {/* Empty states — zero users at all, or zero matches for the filters */}
          {showEmptyState &&
            (hasActiveFilters ? (
              <EmptyState
                icon={Search}
                title="No users match your filters"
                description="Try a different search term, or clear the filters to see everyone."
                action={{ label: 'Clear filters', onClick: clearFilters }}
                variant="filter"
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No users yet"
                description="Nobody has an account on the platform yet."
                action={{
                  label: 'Create the first user',
                  onClick: () => setShowCreateDialog(true),
                }}
              />
            ))}

          {/* User Table */}
          {!showEmptyState && (
            <UserTable
              users={paginatedUsers}
              isLoading={isLoading}
              selectedUsers={visibleSelection}
              onSelectUser={handleSelectUser}
              onSelectAll={handleSelectAll}
              onUserClick={handleUserClick}
              onManageRoles={handleManageRoles}
              currentPage={clampedPage}
              totalPages={totalPages}
              totalFilteredUsers={sortedUsers.length}
              onPageChange={setCurrentPage}
              searchTerm={searchTerm}
              sort={sort}
              onSortChange={handleSortChange}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
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

      {/* Manage Roles Dialog */}
      {roleDialogTarget && (
        <ManageUserRolesDialog
          open={!!roleDialogTarget}
          onOpenChange={open => {
            if (!open) closeRoleDialog();
          }}
          user={roleDialogTarget}
          onSaved={refetch}
        />
      )}
    </PageShell>
  );
};

export default UserManagementPage;
