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
import { Users, Search, Filter, Plus, Download, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
// Hooks and services
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { User } from '@/types/user-types';
// Components
import { UserTable } from '@/components/admin/users/UserTable';
import { UserFilters } from '@/components/admin/users/UserFilters';
import { CreateUserDialog } from '@/components/admin/users/CreateUserDialog';
import { BulkActionsBar } from '@/components/admin/users/BulkActionsBar';
import { UserEditPanel } from '@/components/panels/edit/UserEditPanel';
import { useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';
// Extracted modules
import type { UserFilter, SelectedUser } from './UserManagementPage.types';
import { DEFAULT_USER_FILTER } from './UserManagementPage.types';
import { filterUsers, calculateRoleStats, exportUsersCSV } from './UserManagementPage.helpers';
import { UserManagementStats } from './UserManagementStats';

// Re-export types so external consumers keep working
export type { UserFilter, SelectedUser } from './UserManagementPage.types';

/** Shared style constant */
const SF_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';
const EASE_TIMING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

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
  const { data: users = [], isLoading, error } = useUsersQuery();
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

  if (error) {
    logger.warn('User Management Error (handled gracefully):', 'admin', {}, error as Error);
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <X className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Users</h3>
              <p className="text-muted-foreground mb-4">
                There was an error loading the user data. This may be due to missing RBAC database
                tables.
              </p>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-8 pt-8 pb-12 max-w-8xl">
        {/* Header */}
        <div
          className="flex flex-col md:flex-row md:items-center md:justify-between mb-12"
          style={{ fontFamily: SF_FONT_FAMILY }}
        >
          <div>
            <h1
              className="text-4xl tracking-tight mb-3"
              style={{ fontWeight: 700, lineHeight: '1.15', letterSpacing: '-0.01em' }}
            >
              User Management
            </h1>
            <p
              className="text-lg text-muted-foreground"
              style={{ fontWeight: 500, lineHeight: '1.4' }}
            >
              Comprehensive user administration, role management, and permission control
            </p>
          </div>
          <div className="flex items-center gap-3 mt-6 md:mt-0">
            <Button
              variant="outline"
              className="border-primary/20 text-primary transition-all duration-300 shadow-sm rounded-xl px-6 py-2.5"
              style={{ fontWeight: 500, transitionTimingFunction: EASE_TIMING }}
              onClick={() => exportUsersCSV(filteredUsers)}
            >
              <Download className="h-4 w-4 mr-2" />
              Export Users
            </Button>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="px-6 py-2.5"
              style={{ fontWeight: 500, transitionTimingFunction: EASE_TIMING }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </div>
        </div>

        {/* Statistics */}
        <UserManagementStats
          users={users}
          filteredUsers={filteredUsers}
          roleStats={roleStats}
          selectedUsers={selectedUsers}
        />

        {/* Bulk Actions Bar */}
        {selectedUsers.length > 0 && (
          <div className="mb-8">
            <BulkActionsBar
              selectedUsers={selectedUsers}
              onClearSelection={clearSelection}
              onBulkComplete={() => clearSelection()}
              onUsersDeleted={deletedUserIds => {
                clearSelection();
                logger.debug('Users deleted:', 'admin', { data: deletedUserIds });
              }}
            />
          </div>
        )}

        {/* User Directory Table */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8" style={{ fontFamily: SF_FONT_FAMILY }}>
            <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 rounded-xl shadow-sm">
              <Users className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-2xl" style={{ fontWeight: 590, lineHeight: '1.25' }}>
                User Directory
              </h2>
              <p className="text-sm text-muted-foreground mt-1" style={{ fontWeight: 500 }}>
                Complete user listing with role management and bulk actions
              </p>
            </div>
          </div>

          <Card
            className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl
                           transition-all duration-300 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1"
            style={{ fontFamily: SF_FONT_FAMILY, transitionTimingFunction: EASE_TIMING }}
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            />
            <CardHeader className="relative pb-4">
              <div className="flex flex-col gap-4">
                <CardTitle className="flex items-center justify-between group-hover:text-primary transition-colors duration-300 text-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg shadow-sm">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    Users ({filteredUsers.length})
                  </div>
                  <div
                    className="flex items-center gap-3 text-sm text-muted-foreground"
                    style={{ fontWeight: 500 }}
                  >
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>
                </CardTitle>

                {/* Search & Filters */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, or ID..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      autoComplete="off"
                      name="user-search"
                      className="pl-10 pr-9 h-10 bg-background/50 border-border/50 rounded-xl text-sm
                                 focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20
                                 transition-all duration-300"
                      style={{ fontWeight: 500 }}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full
                                   bg-muted hover:bg-muted-foreground/20 flex items-center justify-center
                                   transition-colors duration-200"
                        aria-label="Clear search"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={showFilters ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowFilters(!showFilters)}
                      className={`h-10 px-4 rounded-xl transition-all duration-300 ${
                        showFilters
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-background/50 border-border/50 hover:bg-muted/50'
                      }`}
                      style={{ fontWeight: 590 }}
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Filters
                      {(filters.role !== 'all' ||
                        filters.status !== 'all' ||
                        filters.clubAffiliation) && (
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
                        className="h-10 px-4 rounded-xl bg-background/50 border-border/50
                                   hover:bg-muted/50 transition-all duration-300"
                        style={{ fontWeight: 590 }}
                      >
                        Clear Selection ({selectedUsers.length})
                      </Button>
                    )}
                  </div>
                </div>

                {showFilters && (
                  <div className="pt-3 border-t border-border/30">
                    <UserFilters
                      filters={filters}
                      onFiltersChange={setFilters}
                      roleStats={roleStats}
                    />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="relative">
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
            </CardContent>
          </Card>
        </div>

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
      </div>
    </div>
  );
};

export default UserManagementPage;
