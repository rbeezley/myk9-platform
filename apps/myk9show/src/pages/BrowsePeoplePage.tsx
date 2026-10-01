import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ErrorState } from '@/components/common/ErrorState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { useRBAC } from '@/hooks/useRBAC';
import { PERMISSIONS } from '@/services/auth/rbacService';
import { useBrowsePeopleData } from '@/hooks/useBrowsePeopleData';
import '@/styles/myk9-show-details.css';
import {
  PeopleGridView,
  PeopleTableView,
  PeopleListToolbar,
  PeopleBulkBar,
} from '@/components/users/browse';
import { BrowsePeopleSkeleton } from '@/components/common/SkeletonLoaders';
import { UserEditPanel } from '@/components/panels/edit';
import { useUserStore, PersonInput } from '@/store/userStore';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { User } from '@/types/user-types';

const BrowsePeoplePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useViewPreference('people', 'table');
  const isMobileViewport = useMediaQuery('(max-width: 767px)');
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
  } = useBrowsePeopleData();

  // Selection only applies in the table view (the grid/card view has no
  // checkboxes — see the PR body's "Scoped down" note). `selectionEpoch`
  // remounts the table on Clear: DataTable's own row-selection state is
  // uncontrolled, so a fresh mount is the only way to un-check its boxes.
  const [selectedPeople, setSelectedPeople] = useState<User[]>([]);
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  const visibleSelection = useMemo(
    () => selectedPeople.filter(person => filteredPeople.some(p => p.id === person.id)),
    [selectedPeople, filteredPeople]
  );
  const clearSelection = useCallback(() => {
    setSelectedPeople([]);
    setSelectionEpoch(epoch => epoch + 1);
  }, []);

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
                Add Person
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
        return isMobileViewport ? (
          <PeopleGridView people={filteredPeople} />
        ) : (
          <PeopleTableView
            key={selectionEpoch}
            people={filteredPeople}
            onSelectionChange={setSelectedPeople}
          />
        );
      case 'cards':
      default:
        return <PeopleGridView people={filteredPeople} />;
    }
  };

  return (
    <div className="bg-background">
      <div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6">
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Breadcrumb
                  items={breadcrumbItems}
                  showHomeIcon={true}
                  className="text-sm text-muted-foreground"
                />

                {canCreatePeople && (
                  <Button onClick={openCreatePersonDialog} className="w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Person
                  </Button>
                )}
              </div>
              <h1 className="text-2xl font-semibold text-foreground">People</h1>

              <PeopleListToolbar
                people={people}
                matchCount={filteredPeople.length}
                filters={filters}
                onFiltersChange={setFilters}
                onClearAll={clearAllFilters}
                hasActiveFilters={hasActiveFilters}
                resultLineExtra={
                  <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
                }
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

      {/* Floats at the bottom of the viewport, in view wherever rows were ticked. */}
      <PeopleBulkBar selectedPeople={visibleSelection} onClearSelection={clearSelection} />
    </div>
  );
};

export default BrowsePeoplePage;
