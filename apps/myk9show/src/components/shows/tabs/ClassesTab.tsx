import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { GuestExportButton, ListEmptyState, ListViewToggle } from '@/components/list-toolkit';
import { useViewPreference } from '@/hooks/useViewPreference';
import { defaultListView } from '@/utils/defaultListView';
import { getClassDetailHref } from '@/utils/classDetailHref';
import { usePageExportAction } from '@/features/actions/pageEditTarget';
import { dropExportColumns, exportRowsCsv } from '@/utils/downloadCsv';
import { CLASS_EXPORT_HEADERS, classExportRows } from '@/components/classes/classesExport';
import { compareLevels } from '@/utils/schedule-summary';
import { DataTable } from '@/components/ui/data-table';
import { ClassCard } from './ClassCard';
import { ClassesTabToolbar } from './ClassesTabToolbar';
import { buildClassesTabColumns, type ClassTableRow } from './classesTabColumns';
import { classTrialLabel, type ClassInfo } from './classInfo';
import { useClassesTabScope } from './useClassesTabScope';

export type { ClassInfo };

const CLASS_NOUN = ['class', 'classes'] as const;

interface ClassesTabProps {
  classes: ClassInfo[];
  showId: string;
  userHasEntries: boolean;
  hideRing?: boolean;
}

/**
 * The show's Classes tab for exhibitors and the public. It only reads: a manager of the show
 * lands on the show home, where managing classes is the schedule's Select classes mode
 * (MYK9-1324), so this list carries no selection, judge picker or row menu (MYK9-1337).
 */
export function ClassesTab({ classes, showId, userHasEntries, hideRing = false }: ClassesTabProps) {
  const navigate = useNavigate();
  // Always opens on the whole show (Oct 10 rehearsal: a viewer who holds entries in the show
  // must land on "All", never auto-scoped to "Mine" — that scoping is one pressable view among
  // five, not a silent default). See `classesTabViews.ts`.
  const [requestedViewId, setViewId] = useState('all');
  // "Mine" is hidden for a user with no entries, so it reads as All.
  const viewId = requestedViewId === 'mine' && !userHasEntries ? 'all' : requestedViewId;
  // A reader opens on cards, even one who holds entries in the show (decision 8). Her own choice
  // is remembered.
  const [viewMode, setViewMode] = useViewPreference('classes', defaultListView(false));

  const scope = useClassesTabScope({ classes, viewId, setViewId, hideRing });
  const { filteredClasses } = scope;

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

  const classColumns = useMemo(() => buildClassesTabColumns({ hideRing }), [hideRing]);

  // The whole-list export the table's own button used to be (owner decision 4: header Actions
  // menu), so exporting needs no ticked rows.
  const exportClasses = (omit: readonly string[] = []) => {
    const { headers, rows } = dropExportColumns(
      CLASS_EXPORT_HEADERS,
      classExportRows(filteredClasses.map(cls => ({ ...cls, trialLabel: classTrialLabel(cls) }))),
      omit
    );
    exportRowsCsv('classes', headers, rows);
  };
  usePageExportAction({
    id: 'classes',
    enabled: viewMode === 'table' && filteredClasses.length > 0,
    run: () => exportClasses(),
  });

  if (classes.length === 0) {
    return (
      <ListEmptyState
        icon={Search}
        noun={CLASS_NOUN}
        filtered={false}
        onShowAll={scope.clearFilters}
        description="Classes for this show haven't been set up yet."
        action={null}
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
          total: classes.length,
          narrowed: scope.isNarrowed,
          onClearFilters: scope.clearFilters,
          showAllInEmptyState: filteredClasses.length === 0,
        }}
        viewToggle={
          <>
            {/* Signed-out visitors have no header Actions menu (MYK9-933); their CSV leaves out
                Ring where the table does (scent trials). */}
            <GuestExportButton
              enabled={filteredClasses.length > 0}
              onExport={() => exportClasses(hideRing ? ['Ring'] : [])}
            />
            <ListViewToggle active={viewMode} onChange={setViewMode} />
          </>
        }
        search={{ value: scope.search, onChange: scope.setSearch }}
      />

      {filteredClasses.length === 0 ? (
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
          // The toolbar's search is the one search: a second filter inside the table would let the
          // export reach rows it hides.
          getRowClassName={cls => (cls.userHasEntry ? 'bg-primary/5' : '')}
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
                  onClick={() => navigate(getClassDetailHref(showId, cls.trialId, cls.id))}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
