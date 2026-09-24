import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  ChevronDown,
  Plus,
  UserPlus,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { getDogBreedLabel, getDogDisplayName, Dog, User } from '@/types/dog-types';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { getPrimaryRole } from '@/context/authContextHelpers';
import { useRegistrationContext } from '@/hooks/useRegistrationContext';
import { useDebounce } from '@myk9/scoring-ui';
import { searchAllDogs, SEARCH_ALL_DOGS_LIMIT } from '@/services/database/dogs';
import { mapDatabaseDogsArray } from '@/services/mappers/dogMappers';
import { DogSearchInterface } from './DogSearchInterface';
import { CreateExhibitorDialog } from './CreateExhibitorDialog';
import { AddDogPanel } from '@/components/panels/edit';
import { QuickCreateFlow } from './QuickCreateFlow';
import { FixedSizeList as List } from 'react-window';
import { logger } from '@/services/LoggingService';
import {
  addDogSelection,
  addVisibleDogSelections,
  DOG_TABLE_GRID,
  filterAccessibleDogs,
  getDogEligibilityStatus,
  getRegistrationNumberLabel,
  getRegistrationShownInRow,
  removeDogSelection,
  removeVisibleDogSelections,
} from './DogSelectionStepEnhanced.helpers';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { DogRow } from './DogTableRow';

type SortColumn = 'callName' | 'breed' | 'owner' | 'regNumber';

const SortableHeader: React.FC<{
  column: SortColumn;
  label: string;
  sortColumn: SortColumn | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
}> = ({ column, label, sortColumn, sortDirection, onSort }) => {
  const isActive = sortColumn === column;
  return (
    <button
      type="button"
      className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
      onClick={() => onSort(column)}
    >
      {label}
      {isActive ? (
        sortDirection === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
};

interface DogSelectionStepProps {
  selectedDogs: string[];
  onSelectionChange: (dogIds: string[]) => void;
  offlineFirst?: boolean;
  /**
   * The show's sanctioning registry, already resolved through
   * `@/features/registries` by the caller (never a raw column read).
   * Null/undefined = not known yet; the copy then says "registration number".
   */
  showRegistryId?: string | null | undefined;
}

function getEmptyStateMessage(
  searchQuery: string,
  activeQuickFilter: string,
  advancedSearch: boolean,
  registrationNumberLabel: string
): string {
  if (searchQuery.trim()) return 'No dogs match your search. Try a different name or breed.';
  if (advancedSearch) {
    switch (activeQuickFilter) {
      case 'registered':
        return 'No registered dogs match this filter. Clear the filter or search by name, breed, or registration number.';
      case 'unregistered':
        return 'No unregistered dogs match this filter. Clear the filter or search by name, breed, or registration number.';
      case 'recent':
        return 'No recently active dogs match this filter. Clear the filter or search by name, breed, or registration number.';
      default:
        return `Search by name, breed, or ${registrationNumberLabel} to find a dog to register.`;
    }
  }
  switch (activeQuickFilter) {
    case 'registered':
      return 'None of your dogs are entered in this show yet. Clear the filter to see all your dogs.';
    case 'unregistered':
      return 'All your dogs are already entered in this show.';
    case 'recent':
      return 'No recently active dogs found. Clear the filter to see all your dogs.';
    default:
      return "You don't have any dogs yet. Add a dog from your profile to get started.";
  }
}

export const DogSelectionStepEnhanced: React.FC<DogSelectionStepProps> = ({
  selectedDogs,
  onSelectionChange,
  offlineFirst = false,
  showRegistryId,
}) => {
  const registrationNumberLabel = getRegistrationNumberLabel(showRegistryId);
  const { dogs, isLoading: dogsLoading } = useDogStoreCompat();
  const { roles, canBulkOperations, canCreateExhibitor, getMaxDogsPerRegistration } =
    useRegistrationPermissions();
  const { workflowConfig } = useRegistrationContext();

  const [filteredDogs, setFilteredDogs] = useState<{ query: string; dogs: Dog[] }>({
    query: '',
    dogs: [],
  });
  const [showQuickCreateFlow, setShowQuickCreateFlow] = useState(false);
  const [showExhibitorDialog, setShowExhibitorDialog] = useState(false);
  const [showDogDialog, setShowDogDialog] = useState(false);
  const [createdExhibitorId, setCreatedExhibitorId] = useState<string | undefined>(undefined);
  const [createdExhibitorMutationIds, setCreatedExhibitorMutationIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const debouncedSearchQuery = useDebounce(normalizedSearchQuery, 300);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        // Third click clears sort
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // No ownership narrowing here: the roster this reads is already scoped
  // server-side for the viewer's role (MYK9-537). See the helper's comment.
  const accessibleDogs = useMemo(() => filterAccessibleDogs(dogs), [dogs]);

  const canCreateNew = workflowConfig?.features?.createNew && canCreateExhibitor;

  // Server-side dog search for roles that can view all dogs (secretary, admin).
  // The locally replicated roster is capped at what one query returned, so a
  // secretary entering a mail-in registration needs to search the full system.
  // The debounced normalized term is the network query identity. Local rows
  // still clear immediately from `normalizedSearchQuery` below, while React
  // Query avoids issuing a request for every keystroke.
  const serverSearchEnabled =
    workflowConfig.features.advancedSearch && debouncedSearchQuery.length >= 2;
  const serverSearchQuery = useQuery({
    queryKey: ['registration-dogs', 'search-all', debouncedSearchQuery],
    queryFn: ({ signal }) => searchAllDogs(debouncedSearchQuery, SEARCH_ALL_DOGS_LIMIT, signal),
    enabled: serverSearchEnabled,
    retry: false,
    staleTime: 0,
  });

  // A production QueryClient may provide placeholderData from the previous
  // key. It is never valid for the current applied search, so discard it until
  // the debounced key and the result are both current.
  const serverSearchIsCurrent =
    serverSearchEnabled && debouncedSearchQuery === normalizedSearchQuery;
  const serverSearchHasCurrentData = serverSearchIsCurrent && !serverSearchQuery.isPlaceholderData;
  const serverSearchResult = serverSearchHasCurrentData ? serverSearchQuery.data : undefined;
  const serverSearchError = serverSearchHasCurrentData ? serverSearchResult?.error : undefined;
  const currentQueryError = serverSearchHasCurrentData ? serverSearchQuery.error : undefined;
  const serverDogs = useMemo(
    () =>
      serverSearchError || currentQueryError
        ? []
        : mapDatabaseDogsArray(serverSearchResult?.data ?? []),
    [currentQueryError, serverSearchError, serverSearchResult]
  );
  const isServerSearching =
    workflowConfig.features.advancedSearch &&
    (normalizedSearchQuery !== debouncedSearchQuery || serverSearchQuery.isFetching);
  // MYK9-90: true when the system-wide search FAILED, as opposed to succeeding
  // with no matches. `searchAllDogs` resolves with `{ data: [], error }` rather
  // than rejecting, so the failure is invisible unless `error` is read here —
  // and a secretary who cannot tell "backend is down" from "no such dog" will
  // create a duplicate dog record.
  const serverSearchFailed =
    serverSearchIsCurrent && Boolean(serverSearchError || currentQueryError);
  const serverHitLimit =
    serverSearchError || currentQueryError ? false : (serverSearchResult?.hitLimit ?? false);

  // Combined dog set passed to DogSearchInterface: locally-accessible dogs
  // (owned / club-scoped) plus any server-search results, de-duplicated by id.
  const searchableDogs = useMemo(() => {
    if (!workflowConfig.features.advancedSearch) return accessibleDogs;
    if (serverDogs.length === 0) return accessibleDogs;
    const seen = new Set(accessibleDogs.map(d => d.id));
    const extras = serverDogs.filter(d => !seen.has(d.id));
    return [...accessibleDogs, ...extras];
  }, [accessibleDogs, serverDogs, workflowConfig.features.advancedSearch]);

  const unsortedDogs = useMemo(
    () =>
      workflowConfig.features.advancedSearch && filteredDogs.query === normalizedSearchQuery
        ? filteredDogs.dogs
        : workflowConfig.features.advancedSearch
          ? []
          : accessibleDogs,
    [accessibleDogs, filteredDogs, normalizedSearchQuery, workflowConfig.features.advancedSearch]
  );

  const handleDogsFiltered = useCallback(
    (dogs: Dog[]) => setFilteredDogs({ query: normalizedSearchQuery, dogs }),
    [normalizedSearchQuery]
  );

  const visibleDogs = useMemo(() => {
    if (!sortColumn) return unsortedDogs;
    const sorted = [...unsortedDogs].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      switch (sortColumn) {
        case 'callName':
          aVal = getDogDisplayName(a).toLowerCase();
          bVal = getDogDisplayName(b).toLowerCase();
          break;
        case 'breed':
          aVal = getDogBreedLabel(a).toLowerCase();
          bVal = getDogBreedLabel(b).toLowerCase();
          break;
        case 'owner':
          aVal = (a.ownerName || a.owner?.name || '').toLowerCase();
          bVal = (b.ownerName || b.owner?.name || '').toLowerCase();
          break;
        case 'regNumber':
          // The number the row SHOWS, so the sort matches what she reads (MYK9-619).
          aVal = (
            getRegistrationShownInRow(a, showRegistryId)?.registrationNumber || ''
          ).toLowerCase();
          bVal = (
            getRegistrationShownInRow(b, showRegistryId)?.registrationNumber || ''
          ).toLowerCase();
          break;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [unsortedDogs, sortColumn, sortDirection, showRegistryId]);

  const handleQuickCreateFlowCompleted = (exhibitor: User, newDogs: Dog[]) => {
    logger.debug('Quick create flow completed:', 'shows', { data: { exhibitor, dogs: newDogs } });
    const newDogIds = newDogs.map(dog => dog.id);
    onSelectionChange([...selectedDogs, ...newDogIds]);
  };

  const handleExhibitorCreated = (
    exhibitor: User,
    metadata?: { pendingMutationIds?: string[] | undefined }
  ) => {
    logger.debug('Exhibitor created:', 'shows', { data: exhibitor });
    setCreatedExhibitorId(exhibitor.id);
    setCreatedExhibitorMutationIds(metadata?.pendingMutationIds ?? []);
    setShowDogDialog(true);
  };

  const handleDogCreated = (dog: Dog) => {
    logger.debug('Dog created:', 'shows', { data: dog });
    onSelectionChange([...selectedDogs, dog.id]);
  };

  const handleDogToggle = (dogId: string) => {
    const maxDogs = getMaxDogsPerRegistration();
    if (selectedDogs.includes(dogId)) {
      onSelectionChange(removeDogSelection(selectedDogs, dogId));
    } else {
      onSelectionChange(addDogSelection(selectedDogs, dogId, maxDogs));
    }
  };

  const handleBulkSelect = (action: 'all' | 'none' | 'eligible') => {
    if (!canBulkOperations) return;
    switch (action) {
      case 'all': {
        const maxDogs = getMaxDogsPerRegistration();
        const eligibleIds = visibleDogs
          .filter(dog => getDogEligibilityStatus(dog).eligible)
          .map(dog => dog.id);
        onSelectionChange(addVisibleDogSelections(selectedDogs, eligibleIds, maxDogs));
        break;
      }
      case 'none':
        onSelectionChange([]);
        break;
      case 'eligible': {
        const eligibleOnly = visibleDogs
          .filter(dog => getDogEligibilityStatus(dog).eligible)
          .map(dog => dog.id);
        onSelectionChange(
          addVisibleDogSelections(selectedDogs, eligibleOnly, getMaxDogsPerRegistration())
        );
        break;
      }
    }
  };

  const handleSelectAllToggle = () => {
    const eligible = visibleDogs.filter(d => getDogEligibilityStatus(d).eligible);
    const allSelected = eligible.length > 0 && eligible.every(d => selectedDogs.includes(d.id));
    const eligibleIds = eligible.map(d => d.id);
    if (allSelected) {
      onSelectionChange(removeVisibleDogSelections(selectedDogs, eligibleIds));
    } else {
      const maxDogs = getMaxDogsPerRegistration();
      onSelectionChange(addVisibleDogSelections(selectedDogs, eligibleIds, maxDogs));
    }
  };

  const eligibleVisible = visibleDogs.filter(d => getDogEligibilityStatus(d).eligible);
  const allEligibleSelected =
    eligibleVisible.length > 0 && eligibleVisible.every(d => selectedDogs.includes(d.id));

  // INTENT: the creation dialogs are siblings of the dog list, never children
  // of it. The list re-enters `dogsLoading` on its own schedule — a new
  // useDogsQuery cache key from the RBAC poll, or createMutation.isPending
  // folded into useDogStoreCompat's isLoading — and an early `return` above
  // these would unmount an Add Dog wizard the user is halfway through,
  // silently resetting it to the first tab with an empty form.
  //
  // Rendering them in every branch is NOT enough: three different top-level
  // trees reconcile as different elements, which remounts the dialogs anyway.
  // They must hold a STABLE position in a STABLE parent, so this component
  // returns one fragment whose second child is always these dialogs and whose
  // first child is the swappable body. Do not reintroduce an early `return`.
  const creationDialogs = (
    <>
      <QuickCreateFlow
        open={showQuickCreateFlow}
        onOpenChange={setShowQuickCreateFlow}
        onFlowCompleted={handleQuickCreateFlowCompleted}
        searchQuery={searchQuery}
        mode="batch"
        offlineFirst={offlineFirst}
      />
      <CreateExhibitorDialog
        open={showExhibitorDialog}
        onOpenChange={setShowExhibitorDialog}
        onExhibitorCreated={handleExhibitorCreated}
        searchQuery={searchQuery}
        offlineFirst={offlineFirst}
      />
      <AddDogPanel
        open={showDogDialog}
        userRole={getPrimaryRole(roles)}
        onClose={() => setShowDogDialog(false)}
        onDogCreated={handleDogCreated}
        variant="dialog"
        offlineFirst={offlineFirst}
        currentUserPersonId={createdExhibitorId}
        offlineDependsOn={createdExhibitorMutationIds}
      />
    </>
  );

  const renderBody = () => {
    if (dogsLoading) {
      return (
        <div role="status" aria-label="Loading dogs" className="space-y-4 py-2">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      );
    }

    // Only bail to the "no dogs" state for roles that can't search the full
    // system. Secretaries/admins keep the search interface so they can find
    // and register mail-in dogs they don't own.
    if (accessibleDogs.length === 0 && !workflowConfig.features.advancedSearch) {
      return (
        <div className="space-y-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Select Dogs to Register</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No dogs are available for registration yet.
            </p>
          </div>
          <div className="text-center py-8 space-y-4">
            <p className="text-muted-foreground">No dogs found.</p>
            <p className="text-sm text-muted-foreground">
              Search for an existing dog or create a new exhibitor and dog.
            </p>
            {canCreateNew && (
              <div className="space-y-3">
                <Alert>
                  <UserPlus className="h-4 w-4" />
                  <AlertDescription>
                    As a secretary, you can create new exhibitors and dogs for registration.
                  </AlertDescription>
                </Alert>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={() => setShowQuickCreateFlow(true)}
                    className="flex items-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    Create Exhibitor & Dog(s)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowExhibitorDialog(true)}
                    className="flex items-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    Create Exhibitor Only
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Select Dogs to Register</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Search and filter to find dogs, then select which ones to register.
            {` (Max: ${getMaxDogsPerRegistration()} dogs)`}
          </p>
        </div>

        {/* Unified search + list card */}
        <Card>
          <CardContent className="p-0">
            {/* Search section */}
            {workflowConfig.features.advancedSearch && (
              <div className="p-4 pb-0">
                <DogSearchInterface
                  dogs={searchableDogs}
                  searchQuery={searchQuery}
                  onDogsFiltered={handleDogsFiltered}
                  onSearchQueryChange={setSearchQuery}
                  onActiveFilterChange={setActiveQuickFilter}
                  showQuickFilters={true}
                  showAdvancedFilters={true}
                  placeholder={`Search all dogs by name, breed, or ${registrationNumberLabel}...`}
                />
              </div>
            )}

            {/* Actions bar + count */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border">
              <div className="flex flex-wrap gap-2">
                {canBulkOperations && visibleDogs.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Users className="h-4 w-4 mr-2" />
                        Bulk Select
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleBulkSelect('eligible')}>
                        Select All Eligible
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkSelect('all')}>
                        Select All Visible
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleBulkSelect('none')}>
                        Clear Selection
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {canCreateNew && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Create New
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setShowQuickCreateFlow(true)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Exhibitor & Dog(s)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowExhibitorDialog(true)}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Exhibitor Only
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowDogDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Dog Only
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {visibleDogs.length} dog{visibleDogs.length !== 1 ? 's' : ''}
                {serverHitLimit && (
                  <span className="ml-2 text-xs text-warning ">
                    (showing top {SEARCH_ALL_DOGS_LIMIT} — refine your search for more)
                  </span>
                )}
                {selectedDogs.length > 0 && (
                  <span className="ml-2 font-medium text-primary">
                    &bull; {selectedDogs.length} selected
                  </span>
                )}
              </div>
            </div>

            {/* System-wide search failed. Rendered OUTSIDE the results/empty
              ternary on purpose: locally-owned dogs can still match while the
              server search is broken, and in that case the list looks healthy
              but is silently incomplete. A secretary who reads "no dogs found"
              during an outage will create a duplicate dog record. */}
            {serverSearchFailed && (
              <div
                role="alert"
                className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Dog search is unavailable right now.</p>
                  <p>
                    These results cover only dogs already loaded on this device — the system-wide
                    search could not be reached, so a dog that exists may not appear. Try again
                    before creating a new dog record.
                  </p>
                </div>
              </div>
            )}

            {/* Dense secretary data table — scroll horizontally on small screens
              instead of crushing the six columns. The min-width keeps the grid
              template legible; the outer container scrolls. Only the populated
              table gets the min-width wrapper — the empty/searching state stays
              full-width so phones don't get a phantom horizontal scrollbar. */}
            {visibleDogs.length > 0 ? (
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  {/* Table header */}
                  <div
                    style={DOG_TABLE_GRID}
                    className="grid items-center gap-x-3 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border select-none"
                  >
                    <Checkbox
                      checked={allEligibleSelected}
                      onCheckedChange={handleSelectAllToggle}
                      className="shrink-0"
                    />
                    <SortableHeader
                      column="callName"
                      label="Call Name"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      column="breed"
                      label="Breed"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      column="owner"
                      label="Owner"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <span>Org</span>
                    <SortableHeader
                      column="regNumber"
                      label="Reg #"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </div>

                  {/* Dog list */}
                  <List
                    height={Math.min(visibleDogs.length * 44, 440)}
                    width="100%"
                    itemCount={visibleDogs.length}
                    itemSize={44}
                    itemData={{
                      dogs: visibleDogs,
                      selectedDogs,
                      onToggle: handleDogToggle,
                      getDogEligibilityStatus,
                      showRegistryId,
                    }}
                  >
                    {DogRow}
                  </List>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                {isServerSearching ? (
                  <p className="text-muted-foreground">Searching…</p>
                ) : serverSearchFailed ? (
                  // Must NOT claim "no dogs found" — that is the exact conflation
                  // the alert above exists to prevent.
                  <p className="text-muted-foreground">
                    Search could not be completed. See the message above.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    {getEmptyStateMessage(
                      searchQuery,
                      activeQuickFilter,
                      workflowConfig.features.advancedSearch,
                      registrationNumberLabel
                    )}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selection summary */}
        {selectedDogs.length > 0 && (
          <div className="p-3 bg-primary/10 rounded-lg">
            <p className="text-sm font-medium">
              {selectedDogs.length} dog{selectedDogs.length > 1 ? 's' : ''} selected
              {selectedDogs.length >= getMaxDogsPerRegistration() && (
                <span className="ml-2 text-yellow-600">(Maximum reached)</span>
              )}
            </p>
          </div>
        )}
      </div>
    );
  };

  // Stable shape: body swaps at child 0, the dialogs never move from child 1.
  return (
    <>
      {renderBody()}
      {creationDialogs}
    </>
  );
};
