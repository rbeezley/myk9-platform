import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { getDogDisplayName, Dog, User } from '@/types/dog-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { UserRole } from '@/types/auth-types';
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

type SortColumn = 'callName' | 'breed' | 'owner' | 'regNumber';

// Shared grid template so header and rows always align
const DOG_TABLE_GRID: React.CSSProperties = {
  gridTemplateColumns: '20px 1.5fr 1.5fr 1.5fr 56px 112px',
};

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
}

interface DogRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    dogs: Dog[];
    selectedDogs: string[];
    onToggle: (dogId: string) => void;
    getDogEligibilityStatus: (dog: Dog) => { eligible: boolean; issues: string[] };
  };
}

function getEmptyStateMessage(
  searchQuery: string,
  activeQuickFilter: string,
  advancedSearch: boolean
): string {
  if (searchQuery.trim()) return 'No dogs match your search. Try a different name or breed.';
  switch (activeQuickFilter) {
    case 'registered':
      return 'None of your dogs are entered in this show yet. Clear the filter to see all your dogs.';
    case 'unregistered':
      return 'All your dogs are already entered in this show.';
    case 'recent':
      return 'No recently active dogs found. Clear the filter to see all your dogs.';
    default:
      return advancedSearch
        ? 'Search by name, breed, or AKC number to find a dog to register.'
        : "You don't have any dogs yet. Add a dog from your profile to get started.";
  }
}

// Compact table row for virtual list
const DogRow: React.FC<DogRowProps> = ({ index, style, data }) => {
  const { dogs, selectedDogs, onToggle, getDogEligibilityStatus } = data;
  const dog = dogs[index];
  const { eligible, issues } = getDogEligibilityStatus(dog);
  const isSelected = selectedDogs.includes(dog.id);
  const breed = dog.registrations?.[0]?.breed || dog.breed || '—';
  const reg = dog.registrations?.[0];
  const ownerDisplay = dog.ownerName || dog.owner?.name || '—';

  const tooltipDetails: { label: string; value: string }[] = [];
  if (reg?.registeredName)
    tooltipDetails.push({ label: 'Registered Name', value: reg.registeredName });
  if (dog.gender) tooltipDetails.push({ label: 'Gender', value: dog.gender });
  if (dog.dateOfBirth)
    tooltipDetails.push({ label: 'Date of Birth', value: formatDateMMDDYYYY(dog.dateOfBirth) });
  if (dog.color) tooltipDetails.push({ label: 'Color', value: dog.color });
  if (dog.microchipNumber || dog.microchip)
    tooltipDetails.push({ label: 'Microchip', value: (dog.microchipNumber || dog.microchip)! });
  const hasTooltip = tooltipDetails.length > 0 || (!eligible && issues.length > 0);

  const row = (
    <div
      style={{ ...style, ...DOG_TABLE_GRID }}
      className={`grid items-center gap-x-3 px-3 border-b border-border cursor-pointer hover:bg-muted/50 transition-colors ${
        isSelected ? 'bg-primary/5' : ''
      } ${!eligible ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={() => eligible && onToggle(dog.id)}
    >
      <Checkbox
        checked={isSelected}
        disabled={!eligible}
        onCheckedChange={() => eligible && onToggle(dog.id)}
        onClick={e => e.stopPropagation()}
        className="shrink-0"
      />
      <span className="min-w-0 truncate text-sm font-medium">{getDogDisplayName(dog)}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{breed}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{ownerDisplay}</span>
      <span>
        {reg ? (
          <Badge variant="outline" className="text-xs">
            {reg.organization.match(/^(\w+)/)?.[1] || reg.organization}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </span>
      <span className="min-w-0 truncate text-sm text-muted-foreground flex items-center gap-1">
        {reg?.registrationNumber ? (
          reg.registrationNumber
        ) : (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span className="text-destructive/70">—</span>
          </>
        )}
      </span>
    </div>
  );

  if (hasTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{row}</TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs p-0">
            <div className="px-3 py-2 space-y-1">
              <p className="text-xs font-semibold text-popover-foreground">
                {getDogDisplayName(dog)}
              </p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {tooltipDetails.map(({ label, value }) => (
                  <React.Fragment key={label}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs text-popover-foreground">{value}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
            {!eligible && issues.length > 0 && (
              <div className="border-t border-border px-3 py-1.5 bg-destructive/10">
                {issues.map((issue, idx) => (
                  <p key={idx} className="text-xs text-destructive">
                    {issue}
                  </p>
                ))}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return row;
};

export const DogSelectionStepEnhanced: React.FC<DogSelectionStepProps> = ({
  selectedDogs,
  onSelectionChange,
}) => {
  const { dogs, isLoading: dogsLoading } = useDogStoreCompat();
  const { user, roles, canBulkOperations, canCreateExhibitor, getMaxDogsPerRegistration } =
    useRegistrationPermissions();
  const { workflowConfig } = useRegistrationContext();

  const [filteredDogs, setFilteredDogs] = useState<Dog[]>([]);
  const [showQuickCreateFlow, setShowQuickCreateFlow] = useState(false);
  const [showExhibitorDialog, setShowExhibitorDialog] = useState(false);
  const [showDogDialog, setShowDogDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [serverDogs, setServerDogs] = useState<Dog[]>([]);
  const [isServerSearching, setIsServerSearching] = useState(false);
  const [serverHitLimit, setServerHitLimit] = useState(false);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

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

  const accessibleDogs = useMemo(() => {
    if (!user) return [];
    const isSiteAdmin = roles.includes(UserRole.SITE_ADMIN);
    return dogs.filter(dog => {
      if (dog.deletedAt) return false;
      if (dog.status && dog.status !== 'active') return false;
      if (isSiteAdmin) return true;
      return dog.ownerId === user.id;
    });
  }, [dogs, user, roles]);

  const canCreateNew = workflowConfig?.features?.createNew && canCreateExhibitor;

  // Server-side dog search for roles that can view all dogs (secretary, admin).
  // The local replication store only holds the logged-in user's dogs, so a
  // secretary entering a mail-in registration needs to search the full system.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!workflowConfig.features.advancedSearch) {
      setServerDogs(prev => (prev.length === 0 ? prev : []));
      setServerHitLimit(false);
      return;
    }
    const query = debouncedSearchQuery.trim();
    if (query.length < 2) {
      setServerDogs(prev => (prev.length === 0 ? prev : []));
      setServerHitLimit(false);
      return;
    }
    let cancelled = false;
    setIsServerSearching(true);
    searchAllDogs(query)
      .then(({ data, hitLimit }) => {
        if (cancelled) return;
        setServerDogs(mapDatabaseDogsArray(data));
        setServerHitLimit(hitLimit);
      })
      .catch(err => {
        if (cancelled) return;
        logger.warn('searchAllDogs failed', 'shows', { data: { error: String(err) } });
        setServerDogs([]);
        setServerHitLimit(false);
      })
      .finally(() => {
        if (!cancelled) setIsServerSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQuery, workflowConfig.features.advancedSearch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Combined dog set passed to DogSearchInterface: locally-accessible dogs
  // (owned / club-scoped) plus any server-search results, de-duplicated by id.
  const searchableDogs = useMemo(() => {
    if (!workflowConfig.features.advancedSearch) return accessibleDogs;
    if (serverDogs.length === 0) return accessibleDogs;
    const seen = new Set(accessibleDogs.map(d => d.id));
    const extras = serverDogs.filter(d => !seen.has(d.id));
    return [...accessibleDogs, ...extras];
  }, [accessibleDogs, serverDogs, workflowConfig.features.advancedSearch]);

  const unsortedDogs = workflowConfig.features.advancedSearch ? filteredDogs : accessibleDogs;

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
          aVal = (a.registrations?.[0]?.breed || a.breed || '').toLowerCase();
          bVal = (b.registrations?.[0]?.breed || b.breed || '').toLowerCase();
          break;
        case 'owner':
          aVal = (a.ownerName || a.owner?.name || '').toLowerCase();
          bVal = (b.ownerName || b.owner?.name || '').toLowerCase();
          break;
        case 'regNumber':
          aVal = (a.registrations?.[0]?.registrationNumber || '').toLowerCase();
          bVal = (b.registrations?.[0]?.registrationNumber || '').toLowerCase();
          break;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [unsortedDogs, sortColumn, sortDirection]);

  const getDogEligibilityStatus = useCallback((dog: Dog) => {
    const issues: string[] = [];
    if (dog.dateOfBirth) {
      const birthDate = new Date(dog.dateOfBirth);
      const ageInMonths = (new Date().getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (ageInMonths < 6) {
        issues.push('Too young (must be 6+ months)');
      }
    }
    if (!dog.registrations || dog.registrations.length === 0) {
      issues.push('No registration on file');
    }
    return { eligible: issues.length === 0, issues };
  }, []);

  const handleQuickCreateFlowCompleted = (exhibitor: User, newDogs: Dog[]) => {
    logger.debug('Quick create flow completed:', 'shows', { data: { exhibitor, dogs: newDogs } });
    const newDogIds = newDogs.map(dog => dog.id);
    onSelectionChange([...selectedDogs, ...newDogIds]);
  };

  const handleExhibitorCreated = (exhibitor: User) => {
    logger.debug('Exhibitor created:', 'shows', { data: exhibitor });
    setShowDogDialog(true);
  };

  const handleDogCreated = (dog: Dog) => {
    logger.debug('Dog created:', 'shows', { data: dog });
    onSelectionChange([...selectedDogs, dog.id]);
  };

  const handleDogToggle = (dogId: string) => {
    const maxDogs = getMaxDogsPerRegistration();
    if (selectedDogs.includes(dogId)) {
      onSelectionChange(selectedDogs.filter(id => id !== dogId));
    } else if (selectedDogs.length < maxDogs) {
      onSelectionChange([...selectedDogs, dogId]);
    }
  };

  const handleBulkSelect = (action: 'all' | 'none' | 'eligible') => {
    if (!canBulkOperations) return;
    switch (action) {
      case 'all': {
        const maxDogs = getMaxDogsPerRegistration();
        const eligibleIds = visibleDogs
          .filter(dog => getDogEligibilityStatus(dog).eligible)
          .slice(0, maxDogs)
          .map(dog => dog.id);
        onSelectionChange(eligibleIds);
        break;
      }
      case 'none':
        onSelectionChange([]);
        break;
      case 'eligible': {
        const eligibleOnly = visibleDogs
          .filter(dog => getDogEligibilityStatus(dog).eligible)
          .slice(0, getMaxDogsPerRegistration())
          .map(dog => dog.id);
        onSelectionChange(eligibleOnly);
        break;
      }
    }
  };

  const handleSelectAllToggle = () => {
    const eligible = visibleDogs.filter(d => getDogEligibilityStatus(d).eligible);
    const allSelected = eligible.length > 0 && eligible.every(d => selectedDogs.includes(d.id));
    if (allSelected) {
      onSelectionChange([]);
    } else {
      const maxDogs = getMaxDogsPerRegistration();
      onSelectionChange(eligible.slice(0, maxDogs).map(d => d.id));
    }
  };

  const eligibleVisible = visibleDogs.filter(d => getDogEligibilityStatus(d).eligible);
  const allEligibleSelected =
    eligibleVisible.length > 0 && eligibleVisible.every(d => selectedDogs.includes(d.id));

  if (dogsLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading dogs...</p>
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
            You don&apos;t have any dogs available for registration.
          </p>
        </div>
        <div className="text-center py-8 space-y-4">
          <p className="text-muted-foreground">No dogs found.</p>
          <p className="text-sm text-muted-foreground">
            Make sure you have dogs added and they have up-to-date information.
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
                onDogsFiltered={setFilteredDogs}
                onSearchQueryChange={setSearchQuery}
                onActiveFilterChange={setActiveQuickFilter}
                showQuickFilters={true}
                showAdvancedFilters={true}
                placeholder="Search all dogs by name, breed, or AKC number..."
              />
            </div>
          )}

          {/* Actions bar + count */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
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
                <span className="ml-2 text-xs text-yellow-600">
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
          {visibleDogs.length > 0 ? (
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
              }}
            >
              {DogRow}
            </List>
          ) : (
            <div className="text-center py-8">
              {isServerSearching ? (
                <p className="text-muted-foreground">Searching…</p>
              ) : (
                <p className="text-muted-foreground">
                  {getEmptyStateMessage(
                    searchQuery,
                    activeQuickFilter,
                    workflowConfig.features.advancedSearch
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

      {/* Creation Dialogs */}
      <QuickCreateFlow
        open={showQuickCreateFlow}
        onOpenChange={setShowQuickCreateFlow}
        onFlowCompleted={handleQuickCreateFlowCompleted}
        searchQuery={searchQuery}
        mode="batch"
      />
      <CreateExhibitorDialog
        open={showExhibitorDialog}
        onOpenChange={setShowExhibitorDialog}
        onExhibitorCreated={handleExhibitorCreated}
        searchQuery={searchQuery}
      />
      <AddDogPanel
        open={showDogDialog}
        onClose={() => setShowDogDialog(false)}
        onDogCreated={handleDogCreated}
        variant="dialog"
      />
    </div>
  );
};
