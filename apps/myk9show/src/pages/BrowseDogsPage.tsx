import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Search, PawPrint } from 'lucide-react';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useRBAC } from '@/hooks/useRBAC';
import { useBrowseDogsData, type DogFilters } from '@/hooks/useBrowseDogsData';
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
import { ListPagination } from '@/components/common/ListPagination';

/**
 * One pagination contract per dataset, not one per view mode (MYK9-218). The
 * table paginates at 25 through `DataTable`'s own default; the card view used
 * to render the whole roster, so a secretary who preferred cards silently lost
 * the ceiling the table gave them and an exhibitor on a phone mounted a card
 * per dog to look at three.
 */
const CARD_PAGE_SIZE = 25;

const BrowseDogsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { getUserRoles, userWithRoles } = useAuthContext();
  // Exhibitor-only users see their own roster; secretaries/admins see all dogs.
  const isExhibitorOnly = getPrimaryRole(getUserRoles()) === UserRole.EXHIBITOR;
  const [viewMode, setViewMode] = useViewPreference('dogs', isExhibitorOnly ? 'cards' : 'table');
  const [showCreateDogPanel, setShowCreateDogPanel] = useState(
    () => searchParams.get('add') === 'true'
  );
  const [cardPage, setCardPage] = useState(1);

  const currentUserPersonId = useCurrentUserPersonId();
  const { hasPermission, isLoading: rbacLoading, refresh: refreshRbac } = useRBAC();

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

  // `useRoleBasedDogs` returns [] until `userWithRoles` resolves, while
  // `isLoading` tracks only the dogs query. Without this the page reaches
  // "No dogs yet" with a full roster in IndexedDB — and on a cold offline boot
  // roles settle at [] permanently (see the MYK9-200 note in CLAUDE.md), so
  // that false empty state is terminal rather than a flash.
  const identityResolved = Boolean(userWithRoles);
  const isResolvingIdentity = !identityResolved && (rbacLoading || isLoading);

  // The unresolved-identity state is caused by RBAC, not by the dogs query, so
  // its retry has to re-run the RBAC lookup as well — refetching the dog store
  // alone would land the user back on the same screen.
  const retryIdentity = useCallback(() => {
    void refreshRbac();
    handleRetry();
  }, [refreshRbac, handleRetry]);

  const canCreateDogs = !rbacLoading && hasPermission('dog:create');
  // Bulk selection/actions gated the same coarse way as the rest of this page
  // (management-capable roles, not exhibitor-only roster view). No per-action
  // RBAC — see design.md decision D1.
  const canBulkManageDogs = !rbacLoading && !isExhibitorOnly && hasPermission('dog:update');
  // Delete is a stricter gate than update — secretaries have `dog:update` but not
  // `dog:delete`. Without this the bulk Delete action would offer an operation the
  // `soft_delete_dog` RPC rejects per-dog (Codex finding).
  const canDeleteDogs = !rbacLoading && !isExhibitorOnly && hasPermission('dog:delete');

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

  // Every filter change goes through here so the card view cannot be left
  // stranded on a page number the narrowed result set no longer has. Resetting
  // on the event rather than in an effect keeps the page a plain function of
  // what the user did.
  const applyFilters = useCallback(
    (update: (prev: DogFilters) => DogFilters) => {
      setCardPage(1);
      setFilters(update);
    },
    [setFilters]
  );

  const handleChipFilterChange = useCallback(
    (key: string, value: string | null) => {
      applyFilters(prev => ({ ...prev, [key]: value || 'all' }));
    },
    [applyFilters]
  );

  const handleSearchChange = useCallback(
    (value: string) => applyFilters(prev => ({ ...prev, search: value })),
    [applyFilters]
  );

  const handleClearAllFilters = useCallback(() => {
    setCardPage(1);
    clearAllFilters();
  }, [clearAllFilters]);

  // Clamped rather than trusted: the roster can shrink underneath a page
  // number from a background sync as well as from a filter, and an out-of-range
  // page would render an empty grid over a non-empty result set.
  const cardTotalPages = Math.max(1, Math.ceil(filteredDogs.length / CARD_PAGE_SIZE));
  const safeCardPage = Math.min(Math.max(1, cardPage), cardTotalPages);
  const pagedDogs = useMemo(
    () => filteredDogs.slice((safeCardPage - 1) * CARD_PAGE_SIZE, safeCardPage * CARD_PAGE_SIZE),
    [filteredDogs, safeCardPage]
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

  const renderCards = () => (
    <>
      <DogsGridView dogs={pagedDogs} />
      {/* `totalItems` is the whole filtered set, never `pagedDogs.length` —
          the control has to describe the set being paged, not the page. */}
      <ListPagination
        label="Dog list pagination"
        currentPage={safeCardPage}
        totalPages={cardTotalPages}
        pageSize={CARD_PAGE_SIZE}
        totalItems={filteredDogs.length}
        onPageChange={setCardPage}
      />
    </>
  );

  const renderContent = () => {
    // Identity never resolved (the offline-cold case). Saying "No dogs yet"
    // here would assert something we cannot know, and its "Add your first dog"
    // CTA would be wrong. Stay calm and offer the retry instead — offline is
    // normal, not an error.
    if (!identityResolved) {
      return (
        <EmptyState
          icon={PawPrint}
          title="We couldn't confirm your account"
          description="Your dogs are safe. Reconnect or try again to load them."
          action={{ label: 'Try again', onClick: retryIdentity }}
        />
      );
    }

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
              : null
          }
        />
      );
    }

    if (filteredDogs.length === 0 && hasActiveFilters) {
      return (
        <EmptyState
          icon={Search}
          title="No dogs match your filters"
          description="Try a different search, or clear the filters to see every dog again."
          action={{ label: 'Clear Filters', onClick: handleClearAllFilters }}
          variant="filter"
        />
      );
    }

    // My Dogs is card-only for exhibitors (design.md D3) — the table view and
    // its toggle are a secretary/admin affordance only.
    if (isExhibitorOnly) {
      return renderCards();
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
        return renderCards();
    }
  };

  return (
    <PageShell>
      {(isLoading || isResolvingIdentity) && dogs.length === 0 && (
        <BrowseDogsSkeleton viewMode={isExhibitorOnly || viewMode === 'cards' ? 'grid' : 'table'} />
      )}

      {hasError && !isLoading && (
        <ErrorState message="We couldn't load your dogs." onRetry={handleRetry} />
      )}

      {!isLoading && !isResolvingIdentity && !hasError && (
        <>
          <PageHeader
            breadcrumbs={breadcrumbs}
            title={pageTitle}
            actions={actionButtons}
            showTitle
          />

          <ListControls
            search={filters.search}
            onSearchChange={handleSearchChange}
            searchPlaceholder={
              isExhibitorOnly
                ? 'Search your dogs by name or breed...'
                : 'Search dogs by name, breed, or owner...'
            }
            filters={chipFilters}
            filterValues={chipFilterValues}
            onFilterChange={handleChipFilterChange}
            {...(isExhibitorOnly ? {} : { viewMode, onViewModeChange: setViewMode })}
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
              canDelete={canDeleteDogs}
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
