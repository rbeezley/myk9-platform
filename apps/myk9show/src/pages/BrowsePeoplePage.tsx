import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { ListControls } from '@/components/common/ListControls';
import type { FilterDefinition as ChipFilterDefinition } from '@/components/common/FilterChips';
import { ErrorState } from '@/components/common/ErrorState';
import { useViewPreference } from '@/hooks/useViewPreference';
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

const BrowsePeoplePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useViewPreference('people', 'cards');
  const [showCreatePersonDialog, setShowCreatePersonDialog] = useState(
    () => searchParams.get('add') === 'true'
  );

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

  const breadcrumbItems = useMemo(() => [{ label: 'People' }], []);

  const openCreatePersonDialog = useCallback(() => {
    setShowCreatePersonDialog(true);
    const params = new URLSearchParams(searchParams);
    params.set('add', 'true');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeCreatePersonDialog = useCallback(() => {
    setShowCreatePersonDialog(false);
    if (!searchParams.has('add')) return;
    const params = new URLSearchParams(searchParams);
    params.delete('add');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

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
      closeCreatePersonDialog();
      // Seed the cache synchronously so PersonDetailPage finds the new user
      // immediately. Without this, navigation races the cache refresh and
      // PersonDetailPage's not-found guard ping-pongs back to /people.
      queryClient.setQueryData(queryKeys.users.all, (old: User[] | undefined) => {
        if (!old) return [newUser];
        if (old.some(u => u.id === newUser.id)) return old;
        return [...old, newUser];
      });
      queryClient.setQueryData(queryKeys.users.detail(newUser.id), newUser);
      // Background revalidation — fire-and-forget.
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      navigate(`/people/${newUser.id}`, { replace: true });
    },
    [addUser, closeCreatePersonDialog, navigate, queryClient]
  );

  // FilterChips definitions
  const chipFilters: ChipFilterDefinition[] = useMemo(
    () => [
      {
        key: 'role',
        label: 'Role',
        options: availableRoles.map(role => ({
          label: role.charAt(0).toUpperCase() + role.slice(1),
          value: role,
        })),
      },
    ],
    [availableRoles]
  );

  const chipFilterValues = useMemo(() => {
    const values: Record<string, string> = {};
    if (filters.role !== 'all') values.role = filters.role;
    return values;
  }, [filters.role]);

  const handleChipFilterChange = useCallback(
    (key: string, value: string | null) => {
      setFilters(prev => ({ ...prev, [key]: value || 'all' }));
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
              <Button onClick={openCreatePersonDialog}>
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
      case 'cards':
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
          {isLoading && people.length === 0 && (
            <BrowsePeopleSkeleton viewMode={viewMode === 'cards' ? 'grid' : 'table'} />
          )}

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
                  <Button onClick={openCreatePersonDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Person
                  </Button>
                )}
              </div>

              <ListControls
                search={filters.search}
                onSearchChange={value => setFilters(prev => ({ ...prev, search: value }))}
                searchPlaceholder="Search people by name or email..."
                filters={chipFilters}
                filterValues={chipFilterValues}
                onFilterChange={handleChipFilterChange}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                resultsShowing={filteredPeople.length}
                resultsTotal={people.length}
                filtered={hasActiveFilters}
                entityName={people.length !== 1 ? 'people' : 'person'}
              />

              {/* People Cards */}
              {renderContent()}
            </>
          )}
        </div>
      </div>

      {/* Create User Dialog */}
      <UserEditPanel
        open={showCreatePersonDialog}
        onClose={closeCreatePersonDialog}
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
