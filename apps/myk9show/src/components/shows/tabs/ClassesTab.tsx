import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ListEmptyState, ListViewToggle } from '@/components/list-toolkit';
import { useViewPreference } from '@/hooks/useViewPreference';
import { defaultListView } from '@/utils/defaultListView';
import { getClassDetailHref } from '@/utils/classDetailHref';
import { usePageExportAction } from '@/features/actions/pageEditTarget';
import { exportRowsCsv } from '@/utils/downloadCsv';
import { CLASS_EXPORT_HEADERS, classExportRows } from '@/components/classes/classesExport';
import { ClassCard } from './ClassCard';
import { Checkbox } from '@/components/ui/checkbox';
import { ClassBulkActionsBar } from '@/components/classes/ClassBulkActionsBar';
import { ClassJudgeSelect } from '@/components/classes/ClassJudgeSelect';
import { useSetupClassManagement } from './useSetupClassManagement';
import { Search, Plus } from 'lucide-react';
import { useSetupAddClassesTrial } from '@/features/actions/pageEditTarget';
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
import type { ShowTrial } from './classesTabScope';

export type { ClassInfo };

const CLASS_NOUN = ['class', 'classes'] as const;

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
  /** The show's trials, so a trial with no classes yet can still be picked and added to. */
  trials?: readonly ShowTrial[];
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
  trials,
  focusClassId = null,
}: ClassesTabProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Always opens on the whole show (Oct 10 rehearsal: a secretary who also holds entries in
  // the show must land on "All", never auto-scoped to "Mine" — that scoping is one pressable
  // view among five, not a silent default). See `classesTabViews.ts`. Setup keeps the view in
  // the URL, so back / forward and shared links follow it.
  const [localViewId, setLocalViewId] = useState('all');
  const requestedViewId = onViewChange ? (controlledViewId ?? 'all') : localViewId;
  // "Mine" is hidden for a user with no entries, so a `?view=mine` link reads as All.
  const viewId = requestedViewId === 'mine' && !userHasEntries ? 'all' : requestedViewId;
  const setViewId = onViewChange ?? setLocalViewId;
  const [localTrialId, setLocalTrialId] = useState<string | null>(null);
  // A deep link names the class it wants, so its trial wins over a `?trialId=` that does not
  // hold it. Choosing another trial drops the focus (Setup clears `?focus=`), ending the override.
  const focusTrialId = focusClassId ? classes.find(cls => cls.id === focusClassId)?.trialId : null;
  const requestedTrialId = focusTrialId ?? (onTrialChange ? controlledTrialId : localTrialId);
  // ONE predicate for every manage affordance here (Add, row Edit / Delete): THIS show's owning
  // club, the scope the show shell's Edit show button uses. The global permission is not
  // club-scoped, and this tab also renders on the public show page. Resolving / unavailable
  // read as no.
  const manageScope = useShowManageScope(showId);
  const canManageThisShow = manageScope.canManage;
  // Staff open on the table, an exhibitor or visitor on cards, even one who holds entries in the
  // show (decision 8). Her own choice is remembered.
  // The default is held until the role is known (no flash of the wrong view); a view she already
  // chose shows at once.
  const [viewMode, setViewMode, hasStoredView] = useViewPreference(
    'classes',
    defaultListView(canManageThisShow)
  );
  const viewReady = manageScope.status !== 'resolving' || hasStoredView;

  // Managers work one trial at a time, so select-all, bulk status and bulk delete never span
  // trials; everyone else reads the whole show.
  const scope = useClassesTabScope({
    classes,
    trials,
    scopeToTrial: canManageThisShow,
    requestedTrialId,
    viewId,
    setViewId,
  });
  const { filteredClasses } = scope;
  const selectTrial = (nextTrialId: string) => {
    scope.setElement('all');
    (onTrialChange ?? setLocalTrialId)(nextTrialId);
  };

  // Judge assignment, status and bulk actions (moved here from the retired Class Management page).
  // Changing the view, trial, search or element clears the selection, so a bulk action never
  // reaches rows the secretary can no longer see.
  // The header Actions menu's Add classes opens the wizard on the trial picked here (MYK9-928).
  useSetupAddClassesTrial(canManageThisShow ? scope.scopeTrialId : null);
  const manage = useSetupClassManagement(
    showId,
    canManageThisShow,
    filteredClasses,
    classes,
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
  // once per visit (the location key changes on each followed link, so the same link followed
  // again focuses again), after the row exists in whichever layout is showing. The table turns
  // to the page holding the row first (`revealRow`); cards have no pages.
  const focusVisitKey = `${location.key}|${focusClassId ?? ''}`;
  const focusedOnce = useRef<string | null>(null);
  const focusClassRow = (classId: string) => {
    const row = Array.from(
      document.querySelectorAll<HTMLElement>('[data-class-id], [data-row-id]')
    ).find(el => (el.dataset.classId ?? el.dataset.rowId) === classId);
    if (!row) return;
    focusedOnce.current = focusVisitKey;
    row.scrollIntoView?.({ block: 'center' });
    // A table row with interactive cells is not tabbable; make it focusable for this jump only.
    if (!row.hasAttribute('tabindex')) row.tabIndex = -1;
    row.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!focusClassId || viewMode === 'table' || focusedOnce.current === focusVisitKey) return;
    focusClassRow(focusClassId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusClassRow only closes over the visit key listed
  }, [focusClassId, focusVisitKey, filteredClasses, viewMode]);

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

  // The whole-list export the table's own button used to be (owner decision 4: header Actions
  // menu), so exporting needs no ticked rows.
  usePageExportAction({
    id: 'classes',
    enabled: viewReady && viewMode === 'table' && filteredClasses.length > 0,
    run: () =>
      exportRowsCsv(
        'classes',
        CLASS_EXPORT_HEADERS,
        classExportRows(filteredClasses.map(cls => ({ ...cls, trialLabel: classTrialLabel(cls) })))
      ),
  });

  if (classes.length === 0) {
    return (
      <ListEmptyState
        icon={Search}
        noun={CLASS_NOUN}
        filtered={false}
        onShowAll={scope.clearFilters}
        description="Classes for this show haven't been set up yet."
        action={
          canManageThisShow
            ? {
                label: 'Add Classes',
                onClick: () =>
                  navigate(getAddClassesHref(showId, scope.scopeTrialId ?? requestedTrialId)),
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
        result={{
          shown: filteredClasses.length,
          total: scope.scopedClasses.length,
          narrowed: scope.isNarrowed,
          onClearFilters: scope.clearFilters,
          showAllInEmptyState: filteredClasses.length === 0,
        }}
        viewToggle={<ListViewToggle active={viewMode} onChange={setViewMode} />}
        {...(canManageThisShow
          ? {
              manage: {
                trials: scope.trialOptions,
                trialId: scope.scopeTrialId,
                onTrialChange: selectTrial,
                search: scope.search,
                onSearchChange: scope.setSearch,
                elementField: scope.elementField,
              },
            }
          : {})}
      />

      {!viewReady ? null : filteredClasses.length === 0 ? (
        <ListEmptyState
          icon={Search}
          noun={CLASS_NOUN}
          filtered
          onShowAll={scope.clearFilters}
          action={null}
        />
      ) : viewMode === 'table' ? (
        <DataTable
          tableId="classesTab"
          columns={classColumns}
          data={tableData}
          // A manager has the toolbar's search, the one search: a second filter inside the table
          // would let select-all or a bulk action reach rows it hides. A reader has no toolbar
          // search and no selection, so the table's own search stays for them.
          showSearch={!canManageThisShow}
          revealRow={focusClassId ? { id: focusClassId, key: focusVisitKey } : null}
          onRowRevealed={focusClassRow}
          getRowClassName={cls =>
            cls.id === focusClassId ? 'bg-accent/20' : cls.userHasEntry ? 'bg-primary/5' : ''
          }
          initialSorting={[
            { id: 'trialLabel', desc: false },
            { id: 'element', desc: false },
            { id: 'level', desc: false },
          ]}
          onRowClick={cls => navigate(getClassDetailHref(showId, cls.trialId, cls.id))}
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
                  onClick={() => navigate(getClassDetailHref(showId, cls.trialId, cls.id))}
                />
              ))}
            </div>
          </div>
        ))
      )}
      {canManageThisShow && (
        <ClassBulkActionsBar
          selectedClasses={selection.selectedItems.map(cls => ({
            ...cls,
            trialLabel: classTrialLabel(cls),
          }))}
          bulkBusy={manage.bulkBusy}
          context={{ showId }}
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
