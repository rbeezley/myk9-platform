import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Search, PawPrint } from 'lucide-react';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import { useBrowseDogsData } from '@/hooks/useBrowseDogsData';
import { DogsGridView, DogsTableView } from '@/components/dogs/browse';
import { BrowseDogsSkeleton } from '@/components/common/SkeletonLoaders';
import { AddDogPanel } from '@/components/panels/edit';
import type { Dog as DogType } from '@/types/dog-types';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { UserRole } from '@/types/auth-types';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { FilterChips } from '@/components/common/FilterChips';
import type { FilterDefinition as ChipFilterDefinition } from '@/components/common/FilterChips';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ResultsCount } from '@/components/common/ResultsCount';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';

import '@/styles/myk9-show-details.css';

const BrowseDogsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useViewPreference('dogs', 'cards');
  const [showCreateDogPanel, setShowCreateDogPanel] = useState(
    () => searchParams.get('add') === 'true'
  );

  const { getUserRoles } = useAuthContext();
  const currentUserPersonId = useCurrentUserPersonId();
  const { hasPermission, isLoading: rbacLoading } = useRBAC();

  // Exhibitor-only users see their own roster; secretaries/admins see all dogs.
  const isExhibitorOnly = getPrimaryRole(getUserRoles()) === UserRole.EXHIBITOR;

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
        label: 'Gender',
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
        <Button onClick={() => setShowCreateDogPanel(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {isExhibitorOnly ? 'Add Dog' : 'New Dog'}
        </Button>
      ) : undefined,
    [canCreateDogs, isExhibitorOnly]
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
                  onClick: () => setShowCreateDogPanel(true),
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
        return <DogsTableView dogs={filteredDogs} />;
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

          {/* Filter toolbar */}
          <div className="bg-card/30 border border-border/40 rounded-2xl p-4 space-y-3 backdrop-blur-sm">
            <SearchBar
              value={filters.search}
              onChange={value => setFilters(prev => ({ ...prev, search: value }))}
              placeholder={
                isExhibitorOnly
                  ? 'Search your dogs by name or breed...'
                  : 'Search dogs by name, breed, or owner...'
              }
            />

            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                filters={chipFilters}
                values={chipFilterValues}
                onChange={handleChipFilterChange}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-border/20">
              <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />

              <ResultsCount
                showing={filteredDogs.length}
                total={dogs.length}
                filtered={hasActiveFilters}
                entityName={dogs.length === 1 ? 'dog' : 'dogs'}
              />
            </div>
          </div>

          {/* Dog Cards / Table */}
          {renderContent()}
        </>
      )}

      {/* Create Dog Panel */}
      <AddDogPanel
        open={showCreateDogPanel}
        onClose={() => setShowCreateDogPanel(false)}
        onDogCreated={handleDogCreated}
        userRole={getPrimaryRole(getUserRoles())}
        currentUserPersonId={currentUserPersonId || undefined}
      />
    </PageShell>
  );
};

export default BrowseDogsPage;
