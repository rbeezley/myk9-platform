import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ClassCard } from './ClassCard';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ClassBulkActionsBar } from '@/components/classes/ClassBulkActionsBar';
import { ClassJudgeSelect } from '@/components/classes/ClassJudgeSelect';
import { useSetupClassManagement } from './useSetupClassManagement';
import { Search, Plus } from 'lucide-react';
import { compareLevels } from '@/utils/schedule-summary';
import { DataTable } from '@/components/ui/data-table';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { SetupClassDialogs } from './SetupClassDialogs';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import { ClassesTabToolbar } from './ClassesTabToolbar';
import { buildClassesTabColumns, type ClassTableRow } from './classesTabColumns';
import { classTrialLabel, type ClassInfo } from './classInfo';
import { useClassesTabScope } from './useClassesTabScope';
import { useClassRowActions } from './useClassRowActions';

export type { ClassInfo };

interface ClassesTabProps {
  classes: ClassInfo[];
  showId: string;
  userHasEntries: boolean;
  hideRing?: boolean;
  /**
   * The open view. With `onViewChange` the caller owns it (Setup keeps it in `?view=`); without,
   * the tab keeps it itself. Unknown ids read as All.
   */
  viewId?: string;
  onViewChange?: (viewId: string) => void;
  /** The trial a manager is working (Setup: `?trialId=`); the show's first trial when absent. */
  trialId?: string | null;
  onTrialChange?: (trialId: string) => void;
  /** A class to scroll to and focus once it renders (Setup: `?focus=`). */
  focusClassId?: string | null;
}

export function ClassesTab({
  classes,
  showId,
  userHasEntries,
  hideRing = false,
  viewId: controlledViewId,
  onViewChange,
  trialId: controlledTrialId,
  onTrialChange,
  focusClassId = null,
}: ClassesTabProps) {
  const navigate = useNavigate();
  const [storedViewMode, setViewModePreference, hasStoredViewPreference] = useViewPreference(
    'classes',
    userHasEntries ? 'cards' : 'table'
  );
  const [viewModeTouched, setViewModeTouched] = useState(false);
  // Always opens on the whole show (Oct 10 rehearsal: a secretary who also holds entries in
  // the show must land on "All", never auto-scoped to "Mine" — that scoping is one pressable
  // view among five, not a silent default). See `classesTabViews.ts`. Setup keeps the view in
  // the URL, so back / forward and shared links follow it.
  const [localViewId, setLocalViewId] = useState('all');
  const viewId = onViewChange ? (controlledViewId ?? 'all') : localViewId;
  const setViewId = onViewChange ?? setLocalViewId;
  const [localTrialId, setLocalTrialId] = useState<string | null>(null);
  const requestedTrialId = onTrialChange ? controlledTrialId : localTrialId;
  // ONE predicate for every manage affordance here (Add, row Edit / Delete): THIS show's owning
  // club, the scope the show shell's Edit show button uses. The global permission is not
  // club-scoped, and this tab also renders on the public show page. Resolving / unavailable
  // read as no.
  const canManageThisShow = useShowManageScope(showId).canManage;
  const viewMode =
    userHasEntries && !hasStoredViewPreference && !viewModeTouched ? 'cards' : storedViewMode;

  const setViewMode = (mode: string) => {
    setViewModeTouched(true);
    setViewModePreference(mode);
  };

  // Managers work one trial at a time, so select-all, bulk status and bulk delete never span
  // trials; everyone else reads the whole show.
  const scope = useClassesTabScope({
    classes,
    scopeToTrial: canManageThisShow,
    requestedTrialId,
    viewId,
    setViewId,
  });
  const { filteredClasses, viewFilters } = scope;
  const selectTrial = (nextTrialId: string) => {
    scope.setElement('all');
    (onTrialChange ?? setLocalTrialId)(nextTrialId);
  };

  // Judge assignment, status and bulk actions (moved here from the retired Class Management page).
  // Changing the view, trial, search or element clears the selection, so a bulk action never
  // reaches rows the secretary can no longer see.
  const manage = useSetupClassManagement(
    showId,
    canManageThisShow,
    filteredClasses,
    `${viewId}|${scope.scopeTrialId}|${scope.search}|${scope.element}`
  );
  const { selection } = manage;
  const { pendingAction, setPendingAction, hydratingClassId, classRowMenu } = useClassRowActions(
    showId,
    manage.handleStatusChange
  );

  // Group classes by trial (date + number)
  const groupedByTrial = useMemo(() => {
    const groups = new Map<string, { label: string; classes: ClassInfo[] }>();
    for (const cls of filteredClasses) {
      const key = `${cls.trialDate || ''}|${cls.trialNumber || ''}`;
      if (!groups.has(key)) {
        groups.set(key, { label: classTrialLabel(cls) || 'Unassigned', classes: [] });
      }
      groups.get(key)!.classes.push(cls);
    }
    // Sort classes within each group by element, then level progression
    for (const group of groups.values()) {
      group.classes.sort((a, b) => {
        const elemCmp = a.element.localeCompare(b.element);
        if (elemCmp !== 0) return elemCmp;
        return compareLevels(a.level, b.level);
      });
    }
    return Array.from(groups.values());
  }, [filteredClasses]);

  const hasMultipleTrials = groupedByTrial.length > 1;

  // Flat table data with trial label for the DataTable view
  const tableData = useMemo<ClassTableRow[]>(
    () => filteredClasses.map(cls => ({ ...cls, trialLabel: classTrialLabel(cls) })),
    [filteredClasses]
  );

  // A deep link (`?focus=<classId>`, from the Show Desk) scrolls to its class and focuses it
  // once, after the row exists in whichever layout is showing.
  const focusedOnce = useRef<string | null>(null);
  useEffect(() => {
    if (!focusClassId || focusedOnce.current === focusClassId) return;
    const row = Array.from(
      document.querySelectorAll<HTMLElement>('[data-class-id], [data-row-id]')
    ).find(el => (el.dataset.classId ?? el.dataset.rowId) === focusClassId);
    if (!row) return;
    focusedOnce.current = focusClassId;
    row.scrollIntoView?.({ block: 'center' });
    // A table row with interactive cells is not tabbable; make it focusable for this jump only.
    if (!row.hasAttribute('tabindex')) row.tabIndex = -1;
    row.focus({ preventScroll: true });
  }, [focusClassId, filteredClasses, viewMode]);

  const classSelectCheckbox = (cls: ClassInfo) => (
    <Checkbox
      checked={selection.isSelected(cls)}
      onCheckedChange={() => selection.toggleItem(cls)}
      aria-label={`Select ${cls.name || 'Untitled Class'}`}
    />
  );

  const classJudgeSelect = (cls: ClassInfo) => (
    <ClassJudgeSelect
      classId={cls.id}
      classLabel={cls.name || 'Untitled Class'}
      assignedJudgeId={manage.judgeIdFor(cls)}
      availableJudges={manage.availableJudges}
      canAssign
      onJudgeChange={(_classId, judgeId) => manage.assignJudge(cls, judgeId)}
    />
  );

  const classColumns = useMemo(
    () =>
      buildClassesTabColumns({
        canManage: canManageThisShow,
        hideRing,
        selectAll: () => (
          <Checkbox
            checked={selection.isAllSelected}
            indeterminate={selection.isPartiallySelected}
            onCheckedChange={() => selection.toggleAll()}
            aria-label="Select all visible classes"
          />
        ),
        select: classSelectCheckbox,
        judge: classJudgeSelect,
        rowMenu: classRowMenu,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the renderers only close over the values listed (rebuilding every render would close an open row menu)
    [
      hideRing,
      canManageThisShow,
      hydratingClassId,
      pendingAction,
      selection.selectedItems,
      manage.availableJudges,
      manage.judgeIdFor,
    ]
  );

  if (classes.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No classes scheduled"
        description="Classes for this show haven't been set up yet."
        action={
          canManageThisShow
            ? {
                label: 'Add Classes',
                onClick: () => navigate(getAddClassesHref(showId)),
                icon: Plus,
              }
            : null
        }
      />
    );
  }

  // "Mine" is hidden when the signed-in user holds no entries in the show —
  // it would only ever read "Mine (0)" (MineToggle's `hidden` prop, before it).
  const visibleViews = userHasEntries
    ? scope.views
    : scope.views.filter(view => view.id !== 'mine');

  return (
    <div className="space-y-4">
      <ClassesTabToolbar
        views={visibleViews}
        activeViewId={scope.activeViewId}
        onSelectView={setViewId}
        actions={
          <>
            <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
            {canManageThisShow && (
              <Button
                size="sm"
                onClick={() => navigate(getAddClassesHref(showId, scope.scopeTrialId ?? undefined))}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add Classes
              </Button>
            )}
          </>
        }
        {...(canManageThisShow
          ? {
              manage: {
                trials: scope.trialOptions,
                trialId: scope.scopeTrialId,
                onTrialChange: selectTrial,
                search: scope.search,
                onSearchChange: scope.setSearch,
                elementField: scope.elementField,
                shown: filteredClasses.length,
                total: scope.scopedClasses.length,
                narrowed: scope.isNarrowed,
                onClearFilters: scope.clearFilters,
              },
            }
          : {})}
      />

      {filteredClasses.length === 0 ? (
        <EmptyState
          icon={Search}
          variant="filter"
          size="sm"
          title={
            scope.search !== '' || scope.element !== 'all'
              ? 'No classes match the current filter.'
              : viewFilters.mine
                ? 'None of your entered classes match.'
                : viewFilters.status === 'pending'
                  ? 'All classes completed!'
                  : viewFilters.status === 'in_progress'
                    ? 'No classes in progress.'
                    : viewFilters.status === 'completed'
                      ? 'No classes completed yet.'
                      : 'No classes match the current filter.'
          }
          action={{ label: 'Show all classes', onClick: scope.clearFilters }}
        />
      ) : viewMode === 'table' ? (
        <DataTable
          tableId="classesTab"
          columns={classColumns}
          data={tableData}
          getRowClassName={cls =>
            cls.id === focusClassId ? 'bg-accent/20' : cls.userHasEntry ? 'bg-primary/5' : ''
          }
          initialSorting={[
            { id: 'trialLabel', desc: false },
            { id: 'element', desc: false },
            { id: 'level', desc: false },
          ]}
          onRowClick={cls => navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)}
        />
      ) : (
        groupedByTrial.map(group => (
          <div key={group.label} className="space-y-3">
            {hasMultipleTrials && (
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                {group.label}
              </h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {group.classes.map(cls => (
                <ClassCard
                  key={cls.id}
                  classInfo={cls}
                  hideRing={hideRing}
                  focused={cls.id === focusClassId}
                  {...(canManageThisShow
                    ? {
                        actions: classRowMenu(cls),
                        selection: classSelectCheckbox(cls),
                        judgeControl: classJudgeSelect(cls),
                        order: cls.classOrder,
                      }
                    : {})}
                  onClick={() =>
                    navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)
                  }
                />
              ))}
            </div>
          </div>
        ))
      )}
      {canManageThisShow && (
        <ClassBulkActionsBar
          selectedClasses={selection.selectedItems}
          bulkBusy={manage.bulkBusy}
          onBulkDelete={manage.handleBulkDelete}
          onBulkStatusChange={manage.handleBulkStatusChange}
          onClear={selection.clearSelection}
        />
      )}
      {canManageThisShow && pendingAction && (
        <SetupClassDialogs
          key={pendingAction.requestId}
          showId={showId}
          pending={pendingAction}
          // Tied to THIS action: a late close from an earlier one must not clear a newer one.
          onClose={() =>
            setPendingAction(current =>
              current?.requestId === pendingAction.requestId ? null : current
            )
          }
        />
      )}
    </div>
  );
}
