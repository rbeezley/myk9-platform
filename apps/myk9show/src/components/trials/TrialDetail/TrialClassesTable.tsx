import { useState, useMemo, startTransition } from 'react';
import ClassRowActionsMenu from '@/components/classes/ClassRowActionsMenu';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrialClass } from '../types/trial.types';
import { type ColumnDef, type SortingFn } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { FileText, LayoutGrid, List, Layers, Search } from 'lucide-react';
import { TrialClassesCards } from './TrialClassesCards';
import { getClassStatusBadgeClasses } from '@myk9/core';
import { shouldShowLevel, shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';

type ViewMode = 'table' | 'cards';

const LEVEL_PROGRESSION: Record<string, number> = {
  novice: 0,
  'novice a': 0,
  'novice b': 1,
  advanced: 2,
  excellent: 3,
  master: 4,
  masters: 4,
};

function levelOrder(level: string, section?: string): number {
  const key = level.toLowerCase();
  const withSection = section ? `${key} ${section.toLowerCase()}` : key;
  return LEVEL_PROGRESSION[withSection] ?? LEVEL_PROGRESSION[key] ?? 99;
}

const trialLevelSort: SortingFn<TrialClass> = (rowA, rowB) => {
  const a = levelOrder(rowA.original.level, rowA.original.section);
  const b = levelOrder(rowB.original.level, rowB.original.section);
  return a - b;
};

interface TrialClassesTableProps {
  classes: TrialClass[];
  trialId?: string;
  onAddClassesFromTemplate?: () => void;
  onEditClass: (classItem: TrialClass) => void;
  onDeleteClass: (classItem: TrialClass) => void;
}

export const TrialClassesTable = ({
  classes,
  trialId,
  onAddClassesFromTemplate,
  onEditClass,
  onDeleteClass,
}: TrialClassesTableProps) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchValue, setSearchValue] = useState('');

  const columns: ColumnDef<TrialClass, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'element',
        header: 'Element',
      },
      {
        id: 'level',
        header: 'Level',
        accessorFn: cls => {
          if (shouldShowLevel(cls)) {
            return cls.level + (shouldShowSection(cls) ? ` ${cls.section}` : '');
          }
          return '';
        },
        sortingFn: trialLevelSort,
        cell: ({ row }) => (
          <>
            {shouldShowLevel(row.original) ? row.original.level : '—'}
            {shouldShowSection(row.original) && ` ${row.original.section}`}
          </>
        ),
      },
      {
        accessorKey: 'judgeName',
        header: 'Judge',
        accessorFn: cls => cls.judgeName || 'TBD',
      },
      {
        accessorKey: 'startTime',
        header: 'Start Time',
        sortingFn: 'datetime',
        cell: ({ row }) =>
          row.original.startTime
            ? new Date(String(row.original.startTime)).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })
            : 'TBD',
      },
      {
        accessorKey: 'entries',
        header: 'Entries',
        sortingFn: 'basic',
        cell: ({ row }) => {
          const cls = row.original;
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span>{cls.completedEntries ?? 0}</span>
                <span className="text-muted-foreground">/</span>
                <span>{cls.entries}</span>
              </div>
              {cls.entries > 0 && (
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((cls.completedEntries ?? 0) / cls.entries) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${getClassStatusBadgeClasses(row.original.status)}`}
          >
            {row.original.status}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const cls = row.original;
          return (
            <div className="text-right" onClick={e => e.stopPropagation()}>
              <ClassRowActionsMenu
                onView={() => startTransition(() => navigate(`/classes/${cls.id}`))}
                onEdit={() => onEditClass(cls)}
                onDelete={() => onDeleteClass(cls)}
              />
            </div>
          );
        },
      },
    ],
    [onEditClass, onDeleteClass, navigate]
  );

  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        <div
          className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"
          data-testid="empty-state-icon"
        >
          <Layers className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="text-muted-foreground mb-6">
          <div className="mb-2 text-lg font-medium">No classes yet</div>
          <div className="text-sm">Add classes to start managing entries and scores</div>
        </div>
        <div className="flex items-center justify-center gap-3">
          {onAddClassesFromTemplate && (
            <Button
              onClick={onAddClassesFromTemplate}
              className="myk9-action-button myk9-action-button-primary"
            >
              <FileText className="h-4 w-4" />
              Add Classes
            </Button>
          )}
        </div>
      </div>
    );
  }

  const filteredCount = useMemo(() => {
    if (!searchValue) return classes.length;
    const q = searchValue.toLowerCase();
    return classes.filter(
      cls =>
        cls.element?.toLowerCase().includes(q) ||
        cls.level?.toLowerCase().includes(q) ||
        (cls.judgeName ?? '').toLowerCase().includes(q) ||
        cls.status?.toLowerCase().includes(q) ||
        cls.section?.toLowerCase().includes(q)
    ).length;
  }, [classes, searchValue]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            Classes ({searchValue ? `${filteredCount} of ${classes.length}` : classes.length})
          </h3>
          <p className="text-sm text-muted-foreground">Manage the classes for this trial</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-2 transition-colors ${
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2 transition-colors ${
                viewMode === 'cards'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          {onAddClassesFromTemplate && (
            <Button
              onClick={onAddClassesFromTemplate}
              className="myk9-action-button myk9-action-button-primary"
            >
              <FileText className="h-4 w-4" />
              Add Classes
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search classes..."
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          className="h-8 pl-8 text-sm"
        />
      </div>

      {viewMode === 'cards' && (
        <TrialClassesCards
          classes={classes}
          trialId={trialId || ''}
          onEditClass={onEditClass}
          onDeleteClass={onDeleteClass}
        />
      )}

      {viewMode === 'table' && (
        <DataTable<TrialClass>
          columns={columns}
          data={classes}
          getRowId={cls => cls.id}
          onRowClick={cls => startTransition(() => navigate(`/classes/${cls.id}`))}
          globalFilter={searchValue}
          onGlobalFilterChange={setSearchValue}
          noResultsMessage="No classes found"
        />
      )}
    </div>
  );
};
