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
import { 
import { logger } from '@/services/LoggingService';
  Users, 
  Search, 
  Filter, 
  Plus, 
  UserCheck,
  Shield,
  CheckSquare,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
// Hooks and services
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { User } from '@/types/user-types';
import type { UserRole as UserRoleType } from '@/types/user-types';

// Components
import { UserTable } from '@/components/admin/users/UserTable';
import { UserFilters } from '@/components/admin/users/UserFilters';
import { CreateUserDialog } from '@/components/admin/users/CreateUserDialog';
import { BulkActionsBar } from '@/components/admin/users/BulkActionsBar';
import { UserEditPanel } from '@/components/panels/edit/UserEditPanel';
import { useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';

// Types for filtering and management
export interface UserFilter {
  search: string;
  role: UserRoleType | 'all';
  status: 'active' | 'inactive' | 'suspended' | 'all';
  clubAffiliation: string;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

export interface SelectedUser {
  id: string;
  user: User;
}

const UserManagementPage: React.FC = () => {
  // State management
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<UserFilter>({
    search: '',
    role: 'all',
    status: 'all',
    clubAffiliation: '',
    dateRange: { start: null, end: null }
  });
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUserEditPanel, setShowUserEditPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);

  // Data fetching with error handling
  const { data: users = [], isLoading, error } = useUsersQuery();
  const updateUserMutation = useUpdateUserMutation();
  
  // Debug logging
  logger.debug('UserManagementPage render - isLoading:', 'admin', { data: isLoading, 'users.length:', users.length, 'error:', error });

  // Filter and search logic
  const filteredUsers = useMemo(() => {
    let filtered = users;

    // Apply search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(user => 
        user.firstName?.toLowerCase().includes(search) ||
        user.lastName?.toLowerCase().includes(search) ||
        user.email?.toLowerCase().includes(search)
      );
    }

    // Apply role filter
    if (filters.role !== 'all') {
      filtered = filtered.filter(user => 
        user.roles?.includes(filters.role as UserRoleType)
      );
    }

    // Apply status filter (mock implementation - would need real status field)
    if (filters.status !== 'all') {
      // In a real implementation, this would filter by an actual status field
      // For now, we'll mock it based on user data completeness
      filtered = filtered.filter(user => {
        switch (filters.status) {
          case 'active':
            return user.email && user.firstName && user.lastName;
          case 'inactive':
            return !user.email;
          case 'suspended':
            return false; // Mock - no suspended users for now
          default:
            return true;
        }
      });
    }

    // Apply club affiliation filter
    if (filters.clubAffiliation) {
      // Mock club affiliation filter - would need actual field
      filtered = filtered.filter(user =>
        user.firstName?.toLowerCase().includes(filters.clubAffiliation.toLowerCase()) ||
        user.lastName?.toLowerCase().includes(filters.clubAffiliation.toLowerCase())
      );
    }

    return filtered;
  }, [users, searchTerm, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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
      const newSelections = paginatedUsers.map(user => ({ id: user.id, user }));
      setSelectedUsers(newSelections);
    } else {
      setSelectedUsers([]);
    }
  };

  const clearSelection = () => {
    setSelectedUsers([]);
  };

  // User action handlers - go directly to edit panel
  const handleUserClick = (user: User) => {
    setSelectedUser(user);
    setShowUserEditPanel(true);
  };

  const handleCreateUser = () => {
    setShowCreateDialog(true);
  };

  // Handle edit panel save
  const handleEditPanelSave = async (userData: Partial<User>) => {
    if (!selectedUser) return;
    
    try {
      const updatedUser = await updateUserMutation.mutateAsync({
        id: selectedUser.id,
        updates: userData
      });
      setSelectedUser(updatedUser);
      setShowUserEditPanel(false);
    } catch (error) {
      logger.error('Failed to update user:', 'pages', {}, error as Error);
      throw error; // Let the edit panel handle the error
    }
  };

  // Statistics calculations
  const roleStats = useMemo(() => {
    const stats: Record<string, number> = {};
    users.forEach(user => {
      user.roles?.forEach(role => {
        stats[role] = (stats[role] || 0) + 1;
      });
    });
    return stats;
  }, [users]);

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
                There was an error loading the user data. This may be due to missing RBAC database tables.
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
      <div className="container mx-auto px-8 pt-24 pb-12 max-w-8xl">
        {/* Header - Matching Admin Dashboard exactly */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-12"
             style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
          <div>
            <h1 className="text-4xl tracking-tight mb-3" 
                style={{ fontWeight: 700, lineHeight: '1.15', letterSpacing: '-0.01em' }}>
              User Management
            </h1>
            <p className="text-lg text-muted-foreground" style={{ fontWeight: 500, lineHeight: '1.4' }}>
              Comprehensive user administration, role management, and permission control
            </p>
          </div>
          <div className="flex items-center gap-3 mt-6 md:mt-0">
            <Button variant="outline" 
                    className="border-primary/20 text-primary 
                               transition-all duration-300 shadow-sm rounded-xl px-6 py-2.5"
                    style={{ 
                      fontWeight: 500,
                      transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                    }}>
              <Users className="h-4 w-4 mr-2" />
              Export Users
            </Button>
            <Button onClick={handleCreateUser}
                    className="bg-gradient-to-r from-primary to-secondary text-primary-foreground 
 
                               transition-all duration-300 shadow-sm px-6 py-2.5 rounded-xl"
                    style={{ 
                      fontWeight: 500,
                      transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                    }}>
              <Plus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </div>
        </div>

        {/* User Management Statistics - Matching Admin Dashboard exactly */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8"
               style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
            <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl" style={{ fontWeight: 590, lineHeight: '1.25' }}>
                User Statistics
              </h2>
              <p className="text-sm text-muted-foreground mt-1" style={{ fontWeight: 500 }}>
                Current user metrics and role distribution
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Users Card */}
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                            border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                            transition-all duration-300 
                            min-h-[140px]"
                 style={{ 
                   fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                   transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                               opacity-0 transition-opacity duration-300" />
              <div className="relative h-full flex flex-col justify-between">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2" 
                       style={{ fontWeight: 590, letterSpacing: '0.02em' }}>
                      Total Users
                    </p>
                  </div>
                  <div className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm 
                                  transition-all duration-300">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-2xl font-bold mb-1 transition-colors duration-300"
                     style={{ fontWeight: 650, lineHeight: '1.25' }}>
                    {users.length.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
                    {filteredUsers.length !== users.length ? `${filteredUsers.length} filtered` : 'Platform users'}
                  </p>
                </div>
              </div>
            </div>

            {/* Active Users Card */}
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                            border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                            transition-all duration-300 
                            min-h-[140px]"
                 style={{ 
                   fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                   transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent 
                               opacity-0 transition-opacity duration-300" />
              <div className="relative h-full flex flex-col justify-between">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2" 
                       style={{ fontWeight: 590, letterSpacing: '0.02em' }}>
                      Active Users
                    </p>
                  </div>
                  <div className="p-2.5 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 rounded-xl shadow-sm 
                                  transition-all duration-300">
                    <UserCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-2xl font-bold mb-1 transition-colors duration-300"
                     style={{ fontWeight: 650, lineHeight: '1.25' }}>
                    {users.filter(u => u.email && u.firstName).length}
                  </p>
                  <p className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
                    {((users.filter(u => u.email && u.firstName).length / (users.length || 1)) * 100).toFixed(1)}% of total
                  </p>
                </div>
              </div>
            </div>

            {/* Roles Assigned Card */}
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                            border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                            transition-all duration-300 
                            min-h-[140px]"
                 style={{ 
                   fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                   transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent 
                               opacity-0 transition-opacity duration-300" />
              <div className="relative h-full flex flex-col justify-between">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2" 
                       style={{ fontWeight: 590, letterSpacing: '0.02em' }}>
                      Roles Assigned
                    </p>
                  </div>
                  <div className="p-2.5 bg-gradient-to-br from-purple-500/20 to-purple-500/10 rounded-xl shadow-sm 
                                  transition-all duration-300">
                    <Shield className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-2xl font-bold mb-1 group-hover:text-purple-600 transition-colors duration-300"
                     style={{ fontWeight: 650, lineHeight: '1.25' }}>
                    {Object.values(roleStats).reduce((sum, count) => sum + count, 0)}
                  </p>
                  <p className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
                    Across {Object.keys(roleStats).length} role types
                  </p>
                </div>
              </div>
            </div>

            {/* Selected Users Card */}
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                            border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                            transition-all duration-300 
                            min-h-[140px]"
                 style={{ 
                   fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                   transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent 
                               opacity-0 transition-opacity duration-300" />
              <div className="relative h-full flex flex-col justify-between">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2" 
                       style={{ fontWeight: 590, letterSpacing: '0.02em' }}>
                      Selected
                    </p>
                  </div>
                  <div className="p-2.5 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl shadow-sm 
                                  transition-all duration-300">
                    <CheckSquare className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-2xl font-bold mb-1 group-hover:text-blue-600 transition-colors duration-300"
                     style={{ fontWeight: 650, lineHeight: '1.25' }}>
                    {selectedUsers.length}
                  </p>
                  <p className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
                    {selectedUsers.length > 0 ? 'Users selected for bulk actions' : 'No users selected'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* User Search and Management - Matching Admin Dashboard section style */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8"
               style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
            <div className="p-3 bg-gradient-to-br from-slate-500/20 to-slate-500/10 rounded-xl shadow-sm">
              <Search className="h-6 w-6 text-slate-600" />
            </div>
            <div>
              <h2 className="text-2xl" style={{ fontWeight: 590, lineHeight: '1.25' }}>
                User Search & Filters
              </h2>
              <p className="text-sm text-muted-foreground mt-1" style={{ fontWeight: 500 }}>
                Advanced filtering and search capabilities for user management
              </p>
            </div>
          </div>
          
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-300 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1"
                style={{ 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                  transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                }}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative pb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search users by name, email, or membership ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoComplete="off"
                    name="user-search"
                    className="pl-12 h-12 bg-background/50 border-border/50 rounded-xl text-base
                               focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20
                               transition-all duration-300"
                    style={{ fontWeight: 500 }}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant={showFilters ? "default" : "outline"}
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
                    {(filters.role !== 'all' || filters.status !== 'all' || filters.clubAffiliation) && (
                      <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full">
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
            </CardHeader>

            {showFilters && (
              <CardContent className="relative pt-6 border-t border-border/30">
                <UserFilters 
                  filters={filters} 
                  onFiltersChange={setFilters}
                  roleStats={roleStats}
                />
              </CardContent>
            )}
          </Card>
        </div>

        {/* Bulk Actions Bar */}
        {selectedUsers.length > 0 && (
          <div className="mb-8">
            <BulkActionsBar 
              selectedUsers={selectedUsers}
              onClearSelection={clearSelection}
              onBulkComplete={() => {
                clearSelection();
                // Refresh data would happen via React Query invalidation
              }}
              onUsersDeleted={(deletedUserIds) => {
                // Clear selection and refresh data
                clearSelection();
                // React Query will automatically refetch data
                logger.debug('Users deleted:', 'admin', { data: deletedUserIds });
              }}
            />
          </div>
        )}

        {/* User Management Table - Matching Admin Dashboard section style */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8"
               style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
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
          
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-300 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1"
                style={{ 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                  transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                }}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative pb-6">
              <CardTitle className="flex items-center justify-between group-hover:text-primary transition-colors duration-300 text-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg shadow-sm">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  Users ({filteredUsers.length})
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
                  <span>Page {currentPage} of {totalPages}</span>
                </div>
              </CardTitle>
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
              />
            </CardContent>
          </Card>
        </div>

        {/* Create User Dialog */}
        <CreateUserDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onUserCreated={(newUser) => {
            setShowCreateDialog(false);
            // React Query will handle cache updates
            // Optionally open the new user in edit panel
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
            userName={`${selectedUser.firstName || ''} ${selectedUser.lastName || ''}`.trim() || 'Unknown User'}
            initialUserData={selectedUser}
            onSave={handleEditPanelSave}
          />
        )}

      </div>
    </div>
  );
};

export default UserManagementPage;