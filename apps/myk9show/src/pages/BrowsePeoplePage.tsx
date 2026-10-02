import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Users } from 'lucide-react';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { ListEmptyState, ListViewToggle } from '@/components/list-toolkit';
import { ErrorState } from '@/components/common/ErrorState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useViewPreference } from '@/hooks/useViewPreference';
import { defaultListView } from '@/utils/defaultListView';
import { useRBAC } from '@/hooks/useRBAC';
import { PERMISSIONS } from '@/services/auth/rbacService';
import { useBrowsePeopleData } from '@/hooks/useBrowsePeopleData';
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

const PEOPLE_NOUN = ['person', 'people'] as const;

const BrowsePeoplePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useViewPreference('people', defaultListView(true));
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
    handleRetry,
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

  const breadcrumbs = useMemo(() => [{ label: 'People', href: '/people' }], []);

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
    if (filteredPeople.length === 0) {
      return (
        <ListEmptyState
          icon={Users}
          noun={PEOPLE_NOUN}
          filtered={hasActiveFilters}
          onShowAll={clearAllFilters}
          description="Add people to your directory to manage contacts, judges, and exhibitors."
          action={
            canCreatePeople
              ? { label: 'Add Person', onClick: openCreatePersonDialog, icon: Plus }
              : null
          }
        />
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

  const addPersonButton = canCreatePeople ? (
    <Button onClick={openCreatePersonDialog}>
      <Plus className="h-4 w-4 mr-2" />
      Add Person
    </Button>
  ) : null;

  return (
    <PageShell>
      {/* Error state: only when there is nothing to show. A failed background refresh keeps the
          cached rows and says so inline (below). */}
      {error && !isLoading && people.length === 0 && (
        <ErrorState message="We couldn't load people." onRetry={handleRetry} />
      )}

      {/* Loading state */}
      {isLoading && people.length === 0 && (
        <BrowsePeopleSkeleton viewMode={viewMode === 'cards' ? 'grid' : 'table'} />
      )}

      {/* Normal content */}
      {(!isLoading || people.length > 0) && !(error && people.length === 0) && (
        <>
          <PageHeader
            breadcrumbs={breadcrumbs}
            title="People"
            actions={addPersonButton}
            showTitle
          />

          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
            >
              <span>We couldn&apos;t refresh people. Showing what we have.</span>
              <Button variant="outline" className="h-11" onClick={handleRetry}>
                Try again
              </Button>
            </div>
          )}

          <PeopleListToolbar
            people={people}
            matchCount={filteredPeople.length}
            filters={filters}
            onFiltersChange={setFilters}
            onClearAll={clearAllFilters}
            hasActiveFilters={hasActiveFilters}
            resultLineExtra={<ListViewToggle active={viewMode} onChange={setViewMode} />}
          />

          {/* People Cards */}
          {renderContent()}
        </>
      )}

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
    </PageShell>
  );
};

export default BrowsePeoplePage;
