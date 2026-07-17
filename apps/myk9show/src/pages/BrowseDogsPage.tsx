import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Search, PawPrint } from 'lucide-react';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import { useBrowseDogsData } from '@/hooks/useBrowseDogsData';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { DogsGridView, DogsTableView } from '@/components/dogs/browse';
import { DogsBulkActionsBar } from '@/components/dogs/browse/DogsBulkActionsBar';
import { BrowseDogsSkeleton } from '@/components/common/SkeletonLoaders';
import { AddDogPanel } from '@/components/panels/edit';
import type { Dog as DogType } from '@/types/dog-types';
import { useViewPreference } from '@/hooks/useViewPreference';
import { UserRole } from '@/types/auth-types';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { ListControls } from '@/components/common/ListControls';
import type { FilterDefinition as ChipFilterDefinition } from '@/components/common/FilterChips';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

import '@/styles/myk9-show-details.css';

const BrowseDogsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { getUserRoles } = useAuthContext();
  // Exhibitor-only users see their own roster; secretaries/admins see all dogs.
  const isExhibitorOnly = getPrimaryRole(getUserRoles()) === UserRole.EXHIBITOR;
  const [viewMode, setViewMode] = useViewPreference('dogs', isExhibitorOnly ? 'cards' : 'table');
  const [showCreateDogPanel, setShowCreateDogPanel] = useState(
    () => searchParams.get('add') === 'true'
  );

  const currentUserPersonId = useCurrentUserPersonId();
  const { hasPermission, isLoading: rbacLoading } = useRBAC();

  const {
    dogs,
    filteredDogs,
    isLoading,
    hasError,
    handleRetry,
    filters,
    setFilters,
    hasActiveFilters,
    clearAllFilters,
    availableBreeds,
  } = useBrowseDogsData();

  const canCreateDogs = !rbacLoading && hasPermission('dog:create');
  // Bulk selection/actions gated the same coarse way as the rest of this page
  // (management-capable roles, not exhibitor-only roster view). No per-action
  // RBAC — see design.md decision D1.
  const canBulkManageDogs = !rbacLoading && !isExhibitorOnly && hasPermission('dog:update');

  const dogSelection = useBulkSelection({
    items: filteredDogs,
    getItemId: (dog: DogType) => dog.id,
    pruneToItems: true,
  });

  // FilterChips definitions
  const chipFilters: ChipFilterDefinition[] = useMemo(
    () => [
      {
        key: 'breed',
        label: 'Breed',
        options: availableBreeds.map(b => ({ label: b, value: b })),
      },
      {
        key: 'sex',
        label: 'Sex',
        options: [
          { label: 'Male', value: 'male' },
          { label: 'Female', value: 'female' },
        ],
      },
    ],
    [availableBreeds]
  );

  // Bridge chip filter values from existing filters state
  const chipFilterValues = useMemo(() => {
    const values: Record<string, string> = {};
    if (filters.breed !== 'all') values.breed = filters.breed;
    if (filters.sex !== 'all') values.sex = filters.sex;
    return values;
  }, [filters.breed, filters.sex]);

  const handleChipFilterChange = useCallback(
    (key: string, value: string | null) => {
      setFilters(prev => ({ ...prev, [key]: value || 'all' }));
    },
    [setFilters]
  );

  const pageTitle = isExhibitorOnly ? 'My Dogs' : 'Dogs';
  const breadcrumbs = useMemo(() => [{ label: pageTitle, href: '/dogs' }], [pageTitle]);

  const openCreateDogPanel = useCallback(() => {
    setShowCreateDogPanel(true);
    const params = new URLSearchParams(searchParams);
    params.set('add', 'true');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeCreateDogPanel = useCallback(() => {
    setShowCreateDogPanel(false);
    if (!searchParams.has('add')) return;
    const params = new URLSearchParams(searchParams);
    params.delete('add');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleDogCreated = useCallback(
    (newDog: DogType) => {
      setShowCreateDogPanel(false);
      navigate(`/dogs/${newDog.id}`, { replace: true, state: { createdDog: newDog } });
    },
    [navigate]
  );

  // Action buttons for PageHeader
  const actionButtons = useMemo(
    () =>
      canCreateDogs ? (
        <Button onClick={openCreateDogPanel}>
          <Plus className="h-4 w-4 mr-2" />
          {isExhibitorOnly ? 'Add Dog' : 'New Dog'}
        </Button>
      ) : undefined,
    [canCreateDogs, isExhibitorOnly, openCreateDogPanel]
  );

  const renderContent = () => {
    if (filteredDogs.length === 0 && !hasActiveFilters) {
      return (
        <EmptyState
          icon={PawPrint}
          title="No dogs yet"
          description={
            isExhibitorOnly
              ? 'Add your first dog to start tracking titles, training, and health records.'
              : 'Add your first dog to track health records, registrations, and competitions.'
          }
          action={
            canCreateDogs
              ? {
                  label: isExhibitorOnly ? 'Add Dog' : 'New Dog',
                  onClick: openCreateDogPanel,
                  icon: Plus,
                }
              : undefined
          }
        />
      );
    }

    if (filteredDogs.length === 0 && hasActiveFilters) {
      return (
        <EmptyState
          icon={Search}
          title="No dogs match your filters"
          description="Try adjusting your search or filter criteria."
          action={{ label: 'Clear Filters', onClick: clearAllFilters }}
        />
      );
    }

    switch (viewMode) {
      case 'table':
        return (
          <DogsTableView
            dogs={filteredDogs}
            selection={canBulkManageDogs ? dogSelection : undefined}
          />
        );
      case 'cards':
      default:
        return <DogsGridView dogs={filteredDogs} />;
    }
  };

  return (
    <PageShell>
      {isLoading && dogs.length === 0 && (
        <BrowseDogsSkeleton viewMode={viewMode === 'cards' ? 'grid' : 'table'} />
      )}

      {hasError && !isLoading && (
        <ErrorState message="We couldn't load your dogs." onRetry={handleRetry} />
      )}

      {!isLoading && !hasError && (
        <>
          <PageHeader breadcrumbs={breadcrumbs} title={pageTitle} actions={actionButtons} />

          <ListControls
            search={filters.search}
            onSearchChange={value => setFilters(prev => ({ ...prev, search: value }))}
            searchPlaceholder={
              isExhibitorOnly
                ? 'Search your dogs by name or breed...'
                : 'Search dogs by name, breed, or owner...'
            }
            filters={chipFilters}
            filterValues={chipFilterValues}
            onFilterChange={handleChipFilterChange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            resultsShowing={filteredDogs.length}
            resultsTotal={dogs.length}
            filtered={hasActiveFilters}
            entityName={dogs.length === 1 ? 'dog' : 'dogs'}
          />

          {/* Dog Cards / Table */}
          {renderContent()}

          {canBulkManageDogs && viewMode === 'table' && dogSelection.selectedCount > 0 && (
            <DogsBulkActionsBar
              selectedDogs={dogSelection.selectedItems}
              onClear={dogSelection.clearSelection}
            />
          )}
        </>
      )}

      {/* Create Dog Panel */}
      <AddDogPanel
        open={showCreateDogPanel}
        onClose={closeCreateDogPanel}
        onDogCreated={handleDogCreated}
        userRole={getPrimaryRole(getUserRoles())}
        currentUserPersonId={currentUserPersonId || undefined}
        // 4.E: from the standalone Dogs page, entering a show is the natural
        // next step after adding a dog. Surfaced as the saved-toast action.
        onEnterShowWithDog={() => navigate('/shows')}
      />
    </PageShell>
  );
};

export default BrowseDogsPage;
