import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, X } from 'lucide-react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { FilterBar } from '@/components/common/FilterBar';
import type { FilterDefinition, FilterBarState } from '@/components/common/FilterBar';
import { ErrorState } from '@/components/common/ErrorState';
import { ViewToggle } from '@/components/common/ViewToggle';
import { useRBAC } from '@/hooks/useRBAC';
import { PERMISSIONS } from '@/services/auth/rbacService';
import { useBrowsePeopleData } from '@/hooks/useBrowsePeopleData';
import '@/styles/myk9-show-details.css';
import { PeopleGridView, PeopleTableView } from '@/components/users/browse';
import { BrowsePeopleSkeleton } from '@/components/common/SkeletonLoaders';
import { UserEditPanel } from '@/components/panels/edit';
import { useUserStore, PersonInput } from '@/store/userStore';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { User } from '@/types/user-types';

type ViewMode = 'grid' | 'table';

const VIEW_MODES = [
  { key: 'grid', label: 'Grid', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
] as const;

const BrowsePeoplePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const rawView = searchParams.get('view');
  const initialViewMode: ViewMode = rawView === 'grid' || rawView === 'table' ? rawView : 'grid';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [showCreatePersonDialog, setShowCreatePersonDialog] = useState(false);

  const { hasPermission, isLoading: rbacLoading } = useRBAC();
  const { addUser } = useUserStore();
  const queryClient = useQueryClient();

  const {
    people,
    filteredPeople,
    isLoading,
    error,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    availableRoles,
  } = useBrowsePeopleData();

  const canCreatePeople = !rbacLoading && hasPermission(PERMISSIONS.PEOPLE_CREATE);

  // Update URL when view mode changes
  const handleViewModeChange = useCallback(
    (newViewMode: string) => {
      if (newViewMode !== 'grid' && newViewMode !== 'table') return;
      if (newViewMode === viewMode) return;
      setViewMode(newViewMode);
      const params = new URLSearchParams(searchParams);
      if (newViewMode === 'grid') {
        params.delete('view');
      } else {
        params.set('view', newViewMode);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, viewMode]
  );

  const breadcrumbItems = useMemo(() => [{ label: 'People' }], []);

  // Stable reference avoids re-firing the dialog's form-reset effect on each render.
  const newPersonInitialData = useMemo(
    () => ({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      streetAddress: '',
      city: '',
      state: '',
      zipCode: '',
      profileImage: '',
      judgeQualifications: [],
      roles: [],
    }),
    []
  );

  // Handle user creation
  const handleCreateUser = useCallback(
    async (userData: Partial<User>) => {
      const streetValue = userData.address || userData.streetAddress || '';
      const newPersonInput: PersonInput = {
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        email: userData.email || '',
        phone: userData.phone || '',
        address: {
          street: streetValue,
          city: userData.city || '',
          state: userData.state || '',
          zipCode: userData.zipCode || '',
        },
        roles: (userData.roles as string[]) || [],
      };

      const newUser = await addUser(newPersonInput);
      setShowCreatePersonDialog(false);
      // Seed the cache synchronously so PersonDetailPage finds the new user
      // immediately. Without this, navigation races the cache refresh and
      // PersonDetailPage's not-found guard ping-pongs back to /people.
      queryClient.setQueryData(queryKeys.users.all, (old: User[] | undefined) =>
        old ? [...old, newUser] : [newUser]
      );
      queryClient.setQueryData(queryKeys.users.detail(newUser.id), newUser);
      // Background revalidation — fire-and-forget.
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      navigate(`/users/${newUser.id}`, { replace: true });
    },
    [addUser, navigate, queryClient]
  );

  // FilterBar definitions
  const filterDefs: FilterDefinition[] = useMemo(
    () => [
      {
        key: 'role',
        label: 'Role',
        type: 'select' as const,
        options: availableRoles.map(role => ({
          label: role.charAt(0).toUpperCase() + role.slice(1),
          value: role,
        })),
      },
    ],
    [availableRoles]
  );

  const filterBarState: FilterBarState = useMemo(() => {
    const filterState: Record<string, string | string[] | boolean> = {};
    if (filters.role !== 'all') filterState.role = filters.role;
    return { filters: filterState, sortKey: null, sortDirection: 'asc' };
  }, [filters.role]);

  const handleFilterBarChange = useCallback(
    (newState: FilterBarState) => {
      setFilters(prev => ({
        ...prev,
        role: (newState.filters.role as string) || 'all',
      }));
    },
    [setFilters]
  );

  // Render view content
  const renderContent = () => {
    if (filteredPeople.length === 0 && !hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No people yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Get started by adding people to your directory to manage contacts, judges, and
              exhibitors.
            </p>
            {canCreatePeople && (
              <Button onClick={() => setShowCreatePersonDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Person
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    if (filteredPeople.length === 0 && hasActiveFilters) {
      return (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No people match your filters</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              Try adjusting your search or filter criteria.
            </p>
            <Button variant="outline" onClick={clearAllFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      );
    }

    switch (viewMode) {
      case 'table':
        return <PeopleTableView people={filteredPeople} />;
      case 'grid':
      default:
        return <PeopleGridView people={filteredPeople} />;
    }
  };

  return (
    <div className="bg-background">
      <div className="container mx-auto px-6 py-6 max-w-7xl">
        <div className="space-y-8">
          {/* Error state */}
          {error && !isLoading && <ErrorState message="We couldn't load people." />}

          {/* Loading state */}
          {isLoading && people.length === 0 && <BrowsePeopleSkeleton viewMode={viewMode} />}

          {/* Normal content */}
          {(!isLoading || people.length > 0) && (
            <>
              <h1 className="sr-only">People</h1>
              <div className="flex items-center justify-between">
                <Breadcrumb
                  items={breadcrumbItems}
                  showHomeIcon={true}
                  className="text-sm text-muted-foreground"
                />

                {canCreatePeople && (
                  <Button onClick={() => setShowCreatePersonDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Person
                  </Button>
                )}
              </div>

              {/* Search & Filters */}
              <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search people by name or email..."
                      value={filters.search}
                      onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                      className="pl-9 h-10 bg-background border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg transition-all duration-200"
                    />
                  </div>
                  <FilterBar
                    filterDefs={filterDefs}
                    state={filterBarState}
                    onStateChange={handleFilterBarChange}
                    className="mt-3"
                  />
                </CardContent>
              </Card>

              {/* View Mode Toggle + Result Count */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">View:</span>
                  <ViewToggle
                    modes={VIEW_MODES}
                    active={viewMode}
                    onChange={handleViewModeChange}
                  />
                </div>

                <span className="text-sm text-muted-foreground">
                  {filteredPeople.length} of {people.length}{' '}
                  {people.length !== 1 ? 'people' : 'person'}
                  {hasActiveFilters && ' (filtered)'}
                </span>
              </div>

              {/* People Cards */}
              {renderContent()}
            </>
          )}
        </div>
      </div>

      {/* Create User Dialog */}
      <UserEditPanel
        open={showCreatePersonDialog}
        onClose={() => setShowCreatePersonDialog(false)}
        userId=""
        userName="New User"
        initialUserData={newPersonInitialData}
        onSave={handleCreateUser}
        enableAutoSave={false}
        showAdvancedFields={true}
      />
    </div>
  );
};

export default BrowsePeoplePage;
