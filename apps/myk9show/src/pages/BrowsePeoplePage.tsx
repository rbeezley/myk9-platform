import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Grid3X3, List, Table2, Plus, X } from 'lucide-react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { FilterBar } from '@/components/common/FilterBar';
import type { FilterDefinition, FilterBarState } from '@/components/common/FilterBar';
import { useRBAC } from '@/hooks/useRBAC';
import { useBrowsePeopleData } from '@/hooks/useBrowsePeopleData';
import '@/styles/myk9-show-details.css';
import { PeopleGridView, PeopleListView, PeopleTableView } from '@/components/users/browse';
import { BrowsePeopleSkeleton } from '@/components/common/SkeletonLoaders';
import { UserEditPanel } from '@/components/panels/edit';
import { useUserStore, PersonInput } from '@/store/userStore';
import type { User } from '@/types/user-types';

type ViewMode = 'grid' | 'list' | 'table';

const BrowsePeoplePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialViewMode = (searchParams.get('view') as ViewMode) || 'grid';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [showCreatePersonDialog, setShowCreatePersonDialog] = useState(false);

  const { hasPermission, isLoading: rbacLoading } = useRBAC();
  const { addUser } = useUserStore();

  const {
    people,
    filteredPeople,
    isLoading,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    availableRoles,
  } = useBrowsePeopleData();

  const canManageUsers = !rbacLoading && hasPermission('user:manage');

  // Update URL when view mode changes
  const handleViewModeChange = useCallback(
    (newViewMode: ViewMode) => {
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
      navigate(`/users/${newUser.id}`, { replace: true });
    },
    [addUser, navigate]
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
            {canManageUsers && (
              <Button onClick={() => setShowCreatePersonDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add User
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
      case 'list':
        return <PeopleListView people={filteredPeople} />;
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

                {canManageUsers && (
                  <Button onClick={() => setShowCreatePersonDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add User
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
                  <div className="flex bg-muted/50 rounded-lg p-1">
                    {(['grid', 'list', 'table'] as const).map(mode => {
                      const Icon = { grid: Grid3X3, list: List, table: Table2 }[mode];
                      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
                      return (
                        <Button
                          key={mode}
                          variant={viewMode === mode ? 'default' : 'ghost'}
                          size="default"
                          onClick={() => handleViewModeChange(mode)}
                          className="h-10 px-3 transition-all duration-200"
                        >
                          <Icon className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">{label}</span>
                        </Button>
                      );
                    })}
                  </div>
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
        initialUserData={{
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
        }}
        onSave={handleCreateUser}
        enableAutoSave={false}
        showAdvancedFields={true}
      />
    </div>
  );
};

export default BrowsePeoplePage;
