import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useClassesByTrialQuery,
  useDeleteClassMutation,
  classKeys,
} from '@/hooks/queries/useClassesDatabase';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { useClassManagementFilters } from '@/hooks/useClassManagementFilters';
import { DeleteClassDialog } from '@/pages/ClassDetailsPage/DeleteClassDialog';
import { ClassBulkActionsBar } from '@/components/classes/ClassBulkActionsBar';
import { useClassBulkActions } from '@/components/classes/useClassBulkActions';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { ClassManagementRow, type DbClassRow } from '@/components/classes/ClassManagementRow';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import { useJudgesWithQualifications } from '@/hooks/queries/useJudgesWithQualifications';
import { selectQualifiedJudges } from '@/features/judges/qualifiedJudges';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import {
  applyManualClassStatus,
  type ManualClassStatus,
} from '@/services/show-day/classStatusMutations';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrialStore } from '@/store/trialStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus, Settings, ListOrdered } from 'lucide-react';
import {
  filterManagedClasses,
  getClassManagementHref,
  type ClassManagementFilterState,
} from '@/components/classes/classManagementFilters';
import {
  activeClassManagementViewId,
  buildClassManagementViews,
  classManagementViewState,
} from '@/components/classes/classManagementViews';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  summarizeFilters,
} from '@/components/list-toolkit';
import { ClassManagementViewControls } from '@/components/classes/ClassManagementViewControls';
import { CopyViewLinkButton } from '@/features/operational-views/CopyViewLinkButton';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';

const CLASS_NOUN = ['class', 'classes'] as const;

export const ClassManagementPage: React.FC = () => {
  const {
    id,
    showId: routeShowId,
    trialId,
  } = useParams<{
    id?: string;
    showId?: string;
    trialId: string;
  }>();
  const trial = useTrialStore(s => (trialId ? s.getTrialById(trialId) : null));
  const showId = routeShowId ?? id ?? trial?.showId;
  const { data: show } = useShowQuery(showId ?? '');
  const showStatus = show?.status;
  const { data: rawClasses = [], isLoading } = useClassesByTrialQuery(trialId || '');
  const {
    data: showEntries = [],
    isLoading: showEntriesLoading,
    isError: showEntriesIsError,
  } = useSecretaryShowEntriesQuery(showId ?? '', Boolean(showId));
  const { data: judges = [] } = useJudgesWithQualifications();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deleteClassMutation = useDeleteClassMutation();
  const assignJudgeMutation = useMutation({
    mutationFn: ({ classId, judgeId }: { classId: string; judgeId: string }) => {
      if (!showId) throw new Error('Show is required before assigning judges.');
      return upsertClassJudgeAssignment(showId, classId, judgeId);
    },
    onSuccess: () => {
      if (trialId) {
        queryClient.invalidateQueries({ queryKey: classKeys.byTrial(trialId) });
      }
      if (showId) {
        queryClient.invalidateQueries({ queryKey: ['shows', showId, 'publish-info'] });
      }
    },
    onError: () => {
      toast.error('Failed to assign judge. Please try again.');
    },
  });

  const {
    search: searchTerm,
    setSearch: setSearchTerm,
    status: statusFilter,
    element: elementFilter,
    setElement: setElementFilter,
    density,
    focusClassId,
    setDensity,
    applyViewState,
    clearFilters,
  } = useClassManagementFilters();

  useEffect(() => {
    if (isLoading || !focusClassId) return;
    const row = document.getElementById(`class-management-row-${focusClassId}`);
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    row.focus({ preventScroll: true });
  }, [focusClassId, isLoading]);

  const allClasses = useMemo(() => (rawClasses as DbClassRow[]) ?? [], [rawClasses]);
  const entryCountsByClassId = useMemo(() => {
    if (!showId || ((showEntriesLoading || showEntriesIsError) && showEntries.length === 0)) {
      return null;
    }
    const counts = new Map<string, number>();
    for (const entry of showEntries) {
      if (!entry.class_id) continue;
      counts.set(entry.class_id, (counts.get(entry.class_id) ?? 0) + 1);
    }
    return counts;
  }, [showEntries, showEntriesIsError, showEntriesLoading, showId]);

  // Status filtering reuses the same lifecycle derivation the views' counts
  // use (`deriveClassLifecycleValue`, via `filterManagedClasses`) — the URL
  // `status` param is the lifecycle bucket (not_started/in_progress/completed/
  // all), not the raw per-org class status string. No second status mapping is
  // defined here.
  const filteredClasses = useMemo(
    () =>
      filterManagedClasses(allClasses, searchTerm, {
        status: statusFilter,
        element: elementFilter,
      }),
    [allClasses, searchTerm, statusFilter, elementFilter]
  );

  const elements = useMemo(
    () =>
      Array.from(new Set(allClasses.map(c => c.element).filter((e): e is string => !!e))).sort(),
    [allClasses]
  );

  // "How many would picking this element show" — holds status current (search
  // is always '', matching the view counts' convention) and varies element,
  // mirroring `UserListToolbar`'s `optionBase` pattern.
  const elementField = useMemo(() => {
    const optionBase = { status: statusFilter, element: 'all' as const };
    return {
      kind: 'options' as const,
      key: 'element',
      label: 'Element',
      value: elementFilter === 'all' ? null : elementFilter,
      onChange: (value: string | null) => setElementFilter(value ?? 'all'),
      options: elements.map(element => ({
        value: element,
        label: element,
        count: filterManagedClasses(allClasses, '', { ...optionBase, element }).length,
      })),
    };
  }, [allClasses, elements, statusFilter, elementFilter, setElementFilter]);

  const classViewFilterState: ClassManagementFilterState = {
    status: statusFilter,
    element: elementFilter,
    search: searchTerm,
  };

  const classViews = buildClassManagementViews(allClasses);
  const activeViewId = activeClassManagementViewId(classViewFilterState);

  const handleSelectView = (id: string) => {
    selection.clearSelection();
    applyViewState(classManagementViewState(id));
  };
  // Scoped to the show's organization. This list used to test only that a
  // qualification was Active, so an AKC show offered UKC- and ASCA-only judges --
  // and because `show.assignedJudges` is derived from judge_assignments, assigning
  // one here is what puts them on the show and its registry paperwork.
  const availableJudges = useMemo(
    () => selectQualifiedJudges(judges, show?.organization),
    [judges, show?.organization]
  );

  const getClassId = useCallback((cls: DbClassRow) => cls.id, []);
  const selection = useBulkSelection<DbClassRow>({
    items: filteredClasses,
    getItemId: getClassId,
    pruneToItems: true,
    // Clear bulk selection whenever the view identity (status/search/element)
    // changes, so a secretary who narrows or widens the filter never applies a
    // bulk action to rows they can no longer see (Design Decision 4). `density`
    // is deliberately excluded — it never changes which rows are visible, only
    // how tightly they're laid out, so it must not clear an in-progress
    // selection (the Entry Management cockpit follows the same rule).
    resetKey: `${statusFilter}|${searchTerm}|${elementFilter}`,
  });

  const classesById = useMemo(
    () =>
      new Map(allClasses.map(cls => [cls.id, { id: cls.id, name: cls.name, status: cls.status }])),
    [allClasses]
  );

  const { bulkBusy, handleBulkDelete, handleBulkStatusChange } = useClassBulkActions({
    classesById,
  });

  // Routed through `applyManualClassStatus` (MYK9-59) instead of the direct
  // PostgREST write — the same replicated mutation the
  // bulk path and Show Map use, so `status_source: 'manual'` and the
  // per-status timing fields are always set and the write queues offline.
  // The old row mutation's onSuccess invalidation doesn't run for this path,
  // so invalidate the whole classKeys family here — the old mutation also
  // refreshed lists and the detail cache, and consumers like
  // The class-scoring workflow reads those values.
  const handleStatusChange = async (classId: string, newStatus: string) => {
    try {
      await applyManualClassStatus(classId, newStatus as ManualClassStatus);
      queryClient.invalidateQueries({ queryKey: classKeys.all });
    } catch {
      toast.error('Failed to update class status. Please try again.');
    }
  };

  const handleJudgeChange = (classId: string, judgeId: string) => {
    assignJudgeMutation.mutate({ classId, judgeId });
  };

  // Delete asks through the same dialog Class Details and Setup use, never `window.confirm`.
  const [classPendingDelete, setClassPendingDelete] = useState<DbClassRow | null>(null);
  const handleDelete = (classId: string) => {
    setClassPendingDelete(allClasses.find(cls => cls.id === classId) ?? null);
  };

  const trialDisplayName = trial?.name || (trialId ? 'Trial' : 'No trial selected');
  const setupHref = showId ? `/shows/${showId}/setup` : '/secretary/dashboard';
  const waitlistHref = showId
    ? `/shows/${showId}/entries?tab=waitlist${trialId ? `&trial=${trialId}` : ''}`
    : '/secretary/entries?tab=waitlist';
  // The one class-create flow is the show wizard's add-classes mode, opened on this trial.
  // Cold store on `/trials/:trialId/classes`: the show id is not known yet. The legacy create
  // URL resolves the trial through the by-id query and then lands on the same flow, so the
  // trial is never dropped.
  const createHref = showId
    ? getAddClassesHref(showId, trialId)
    : trialId
      ? `/trials/${trialId}/classes/create`
      : '/secretary/dashboard';
  // Copy-link href: built from the canonical href builder (never a
  // hand-assembled query string) so a copied URL only ever carries
  // normalized, supported Class Management params.
  const copyLinkHref =
    showId && trialId
      ? getClassManagementHref({
          showId,
          trialId,
          status: statusFilter,
          search: searchTerm,
          element: elementFilter,
        })
      : null;

  return (
    <div className="manager-content-container mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <ShowDeskReturnLink showId={showId} className="mb-2" />
      <div className="manager-page-header mb-6">
        <div className="min-w-0 flex-1">
          <nav
            aria-label="Class management breadcrumb"
            className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link to={setupHref} className="font-medium text-foreground hover:underline">
              Show setup
            </Link>
            <span aria-hidden="true">/</span>
            <span>Manage classes</span>
          </nav>
          <h1 className="break-words text-2xl font-bold">Manage Classes</h1>
          <p className="truncate text-muted-foreground" title={trialDisplayName}>
            {trialDisplayName}
          </p>
        </div>

        <div className="manager-page-actions">
          {copyLinkHref && <CopyViewLinkButton href={copyLinkHref} label="Copy view link" />}
          <Button variant="ghost" asChild className="min-h-[44px] w-full justify-center sm:w-auto">
            <Link to={setupHref}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Setup
            </Link>
          </Button>
          <Button
            variant="outline"
            asChild
            className="min-h-[44px] w-full justify-center sm:w-auto"
          >
            <Link to={waitlistHref}>
              <ListOrdered className="h-4 w-4 mr-2" />
              Manage Waitlist
            </Link>
          </Button>
          <Button asChild className="min-h-[44px] w-full justify-center sm:w-auto">
            <Link to={createHref}>
              <Plus className="h-4 w-4 mr-2" />
              Add Classes
            </Link>
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 pt-6">
          <ListViewTabs
            label="Class views"
            views={classViews}
            activeId={activeViewId}
            onSelect={handleSelectView}
          />
          <ListFilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Search classes..."
            fields={[elementField]}
          />
          <ListResultLine
            shown={filteredClasses.length}
            total={allClasses.length}
            noun={CLASS_NOUN}
            filtered={statusFilter !== 'all' || elementFilter !== 'all' || searchTerm !== ''}
            filterSummary={summarizeFilters({
              search: searchTerm,
              views: classViews,
              activeViewId,
              // Status is the view state; element is the field and search the box.
              viewCriteria:
                statusFilter === 'all'
                  ? []
                  : [
                      `Status: ${classViews.find(v => v.id === statusFilter)?.label ?? statusFilter}`,
                    ],
              fields: [elementField],
            })}
            onShowAll={clearFilters}
          />

          {/* Display density (tasks.md 3.2) */}
          <ClassManagementViewControls density={density} onDensityChange={setDensity} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {filteredClasses.length > 0 && (
                <Checkbox
                  checked={selection.isAllSelected}
                  indeterminate={selection.isPartiallySelected}
                  onCheckedChange={() => selection.toggleAll()}
                  aria-label="Select all visible classes"
                />
              )}
              Classes ({filteredClasses.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div role="status" aria-label="Loading classes">
              <TableSkeleton rows={6} columns={5} />
            </div>
          ) : filteredClasses.length > 0 ? (
            <div className="space-y-2">
              {filteredClasses.map(cls => (
                <ClassManagementRow
                  key={cls.id}
                  cls={cls}
                  focused={focusClassId === cls.id}
                  entryCount={
                    entryCountsByClassId?.get(cls.id) ?? (entryCountsByClassId ? 0 : null)
                  }
                  selected={selection.isSelected(cls)}
                  showId={showId}
                  showStatus={showStatus}
                  availableJudges={availableJudges}
                  onToggleSelect={() => selection.toggleItem(cls)}
                  onViewWaitlist={() => navigate(waitlistHref)}
                  onStatusChange={handleStatusChange}
                  onJudgeChange={handleJudgeChange}
                  onDelete={handleDelete}
                  density={density}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Classes Found</h3>
              <p className="text-muted-foreground mb-4">
                {allClasses.length === 0
                  ? 'No classes have been created for this trial yet.'
                  : 'No classes match your current filters.'}
              </p>
              {allClasses.length === 0 ? (
                <Button asChild>
                  <Link to={createHref}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Classes
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rendered last so its in-flow height spacer lands BELOW the class list
          rather than in the middle of the page — the bar itself is `fixed`, so
          its on-screen position is unchanged by where it sits in the tree. */}
      <DeleteClassDialog
        open={classPendingDelete !== null}
        onOpenChange={open => {
          if (!open) setClassPendingDelete(null);
        }}
        currentClass={classPendingDelete && { ...classPendingDelete, trial: trialDisplayName }}
        onConfirm={async () => {
          if (classPendingDelete) {
            await deleteClassMutation.mutateAsync({ id: classPendingDelete.id });
          }
        }}
      />

      <ClassBulkActionsBar
        selectedClasses={selection.selectedItems}
        bulkBusy={bulkBusy}
        onBulkDelete={handleBulkDelete}
        onBulkStatusChange={handleBulkStatusChange}
        onClear={selection.clearSelection}
      />
    </div>
  );
};
