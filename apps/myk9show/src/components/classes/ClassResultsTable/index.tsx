import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip/tooltip';
import { DataTable } from '@/components/ui/data-table';
import {
  GuestExportButton,
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  type ListView,
} from '@/components/list-toolkit';
import '@/styles/myk9-show-details.css';
import type { ClassResultsTableProps, ScoringRow } from './types';
import { matchesAny } from '@myk9/core';
import { buildResultRows } from './resultRows';
import { useResultColumns } from './columns';
import { usePageExportAction } from '@/features/actions/pageEditTarget';
import { exportClassResults, guestResultsOmit } from './classResultsExport';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useVisibleResultFields, deriveClassState } from '@/hooks/useVisibleResultFields';

export type ScoringStatusTab = 'all' | 'pending' | 'completed';

/**
 * The class page's one list: the class's entries and, once released, their results. Read-only for
 * everyone. A class is checked in, scored, run and edited on Show Desk (MYK9-2136), so this table
 * has no check-in, edit, add, delete, run-order or score control.
 */
export const ClassResultsTable: React.FC<ClassResultsTableProps> = ({
  entries,
  rawEntries,
  className,
  classId,
  showId,
  trialId,
  classStatus,
  resultsReleasedAt,
}) => {
  const rows = useMemo(() => buildResultRows(entries, rawEntries ?? []), [entries, rawEntries]);

  const { isExhibitor, isSecretary, isJudge } = useAuthContext();
  const isStaff = isSecretary || isJudge || !isExhibitor;

  const classState = useMemo(
    () => deriveClassState(classStatus, resultsReleasedAt ?? null),
    [classStatus, resultsReleasedAt]
  );
  const visibility = useVisibleResultFields(showId, trialId, classId, classState);

  const entryMap = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);

  // Nothing is left to score here, so a released class opens on "All"; otherwise the default
  // "Pending" tab renders empty and the released results look missing.
  const released = !!resultsReleasedAt;
  const [scoringTab, setScoringTab] = useState<ScoringStatusTab>(released ? 'all' : 'pending');
  // If results are released while the page is already open, flip off the (now-empty) "Pending"
  // tab. Adjust-state-during-render pattern (the repo lints against setState-in-effect).
  const [wasReleased, setWasReleased] = useState(released);
  if (released !== wasReleased) {
    setWasReleased(released);
    if (released) setScoringTab('all');
  }
  const [searchQuery, setSearchQuery] = useState('');

  const tabCounts = useMemo(() => {
    const completed = rows.filter(r => r.isScored).length;
    return { pending: rows.length - completed, completed };
  }, [rows]);

  // "All" intentionally carries no count (list-toolkit rollout, MYK9-811).
  const scoringViews: ListView[] = useMemo(
    () => [
      { id: 'pending', label: 'Pending', count: tabCounts.pending },
      { id: 'completed', label: 'Completed', count: tabCounts.completed },
      { id: 'all', label: 'All' },
    ],
    [tabCounts.pending, tabCounts.completed]
  );

  const filteredRows = useMemo(() => {
    let result = rows;
    if (scoringTab === 'completed') result = result.filter(r => r.isScored);
    else if (scoringTab === 'pending') result = result.filter(r => !r.isScored);
    if (searchQuery) {
      result = result.filter(r => matchesAny([r.dogName, r.handlerName, r.armband], searchQuery));
    }
    return result;
  }, [rows, scoringTab, searchQuery]);

  const columns = useResultColumns({ isStaff, visibility, entryMap });

  // The whole-list export the table's own button used to be (owner decision 4: header Actions menu).
  usePageExportAction({
    id: 'class-results',
    enabled: filteredRows.length > 0,
    run: () => exportClassResults(filteredRows),
  });

  return (
    <TooltipProvider>
      <div className={cn('space-y-6', className)}>
        <div className="myk9-show-info-card">
          <div className="myk9-show-info-header">
            <div className="flex items-center gap-2">
              <div className="myk9-show-info-title">Entries & Results</div>
              <Badge variant="secondary" className="text-xs">
                {entries.length}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-4 pt-3">
            <ListViewTabs
              label="Result views"
              views={scoringViews}
              activeId={scoringTab}
              onSelect={id => setScoringTab(id as ScoringStatusTab)}
            />
            <ListFilterBar
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="Search by dog, handler, or armband..."
              fields={[]}
            />
            <ListResultLine
              shown={filteredRows.length}
              total={rows.length}
              noun={['entry', 'entries']}
              filtered={scoringTab !== 'all' || searchQuery !== ''}
              onShowAll={() => {
                setScoringTab('all');
                setSearchQuery('');
              }}
            >
              {/* Signed-out visitors have no header Actions menu (MYK9-993). Only released
                  results, and only the columns the table shows them. */}
              <GuestExportButton
                enabled={!!resultsReleasedAt && !visibility.isLoading && filteredRows.length > 0}
                onExport={() => exportClassResults(filteredRows, guestResultsOmit(visibility))}
              />
            </ListResultLine>
          </div>

          <DataTable<ScoringRow>
            tableId="classResults"
            columns={columns}
            data={filteredRows}
            getRowId={row => row.entryId}
            pageSize={9999}
          />
        </div>
      </div>
    </TooltipProvider>
  );
};

// React.memo optimization for ClassResultsTable performance
export const MemoizedClassResultsTable = React.memo(ClassResultsTable, (prevProps, nextProps) => {
  if (prevProps.rawEntries !== nextProps.rawEntries) return false;
  if (prevProps.entries !== nextProps.entries) return false;
  if (prevProps.classId !== nextProps.classId) return false;
  if (prevProps.classStatus !== nextProps.classStatus) return false;
  if (prevProps.resultsReleasedAt !== nextProps.resultsReleasedAt) return false;
  return true;
});
