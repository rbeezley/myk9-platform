import { useState, useMemo, startTransition } from 'react';
import ClassRowActionsMenu from '@/components/classes/ClassRowActionsMenu';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrialClass } from '../types/trial.types';
import {
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  LayoutGrid,
  List,
  Layers,
} from 'lucide-react';
import { TrialClassesCards } from './TrialClassesCards';
import { getClassStatusBadgeClasses } from '@myk9/core';
import { shouldShowLevel, shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';

type ViewMode = 'table' | 'cards';

const LEVEL_PROGRESSION: Record<string, number> = {
  'novice a': 0,
  'novice b': 1,
  advanced: 2,
  excellent: 3,
  master: 4,
  masters: 4,
};

function levelOrder(level: string): number {
  return LEVEL_PROGRESSION[level.toLowerCase()] ?? 99;
}

interface TrialClassesTableProps {
  classes: TrialClass[];
  trialId?: string;
  onAddClassesFromTemplate?: () => void;
  onEditClass: (classItem: TrialClass) => void;
  onDeleteClass: (classItem: TrialClass) => void;
}

type SortField = 'element' | 'level' | 'section' | 'judgeName' | 'startTime' | 'entries' | 'status';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export const TrialClassesTable = ({
  classes,
  trialId,
  onAddClassesFromTemplate,
  onEditClass,
  onDeleteClass,
}: TrialClassesTableProps) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Handle column sorting
  const handleSort = (field: SortField) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ field, direction });
  };

  // Filter and sort classes
  const filteredAndSortedClasses = useMemo(() => {
    let filtered = classes;

    // Apply search filter
    if (searchTerm) {
      filtered = classes.filter(classItem => {
        const searchLower = searchTerm.toLowerCase();
        return (
          classItem.element.toLowerCase().includes(searchLower) ||
          classItem.level.toLowerCase().includes(searchLower) ||
          classItem.section.toLowerCase().includes(searchLower) ||
          (classItem.judgeName || 'TBD').toLowerCase().includes(searchLower) ||
          classItem.status.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply sorting
    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const { field, direction } = sortConfig;
        let aValue: string | number | Date = a[field] ?? '';
        let bValue: string | number | Date = b[field] ?? '';

        // Handle special cases
        if (field === 'level') {
          aValue = levelOrder(String(aValue));
          bValue = levelOrder(String(bValue));
        }
        if (field === 'judgeName') {
          aValue = aValue || 'TBD';
          bValue = bValue || 'TBD';
        }
        if (field === 'startTime') {
          aValue = aValue ? new Date(String(aValue)).getTime() : 0;
          bValue = bValue ? new Date(String(bValue)).getTime() : 0;
        }

        if (aValue < bValue) {
          return direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [classes, searchTerm, sortConfig]);

  // Get sort icon for column header
  const getSortIcon = (field: SortField) => {
    if (!sortConfig || sortConfig.field !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  const getStatusBadge = (status: string) => {
    return getClassStatusBadgeClasses(status);
  };

  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        {/* Empty state icon */}
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

  return (
    <div className="space-y-4">
      {/* Header with Add Buttons and View Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            Classes ({filteredAndSortedClasses.length}
            {searchTerm && filteredAndSortedClasses.length !== classes.length && (
              <span className="text-muted-foreground"> of {classes.length}</span>
            )}
            )
          </h3>
          <p className="text-sm text-muted-foreground">Manage the classes for this trial</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
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

      {/* Search Box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search classes..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 bg-card"
        />
      </div>

      {/* Cards View */}
      {viewMode === 'cards' && (
        <TrialClassesCards
          classes={filteredAndSortedClasses}
          trialId={trialId || ''}
          onEditClass={onEditClass}
          onDeleteClass={onDeleteClass}
        />
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <Table className="bg-card text-foreground">
            <TableHeader>
              <TableRow className="bg-card hover:bg-card">
                <TableHead
                  className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                  onClick={() => handleSort('element')}
                >
                  <div className="flex items-center">
                    Element
                    {getSortIcon('element')}
                  </div>
                </TableHead>
                <TableHead
                  className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                  onClick={() => handleSort('level')}
                >
                  <div className="flex items-center">
                    Level
                    {getSortIcon('level')}
                  </div>
                </TableHead>
                <TableHead
                  className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                  onClick={() => handleSort('judgeName')}
                >
                  <div className="flex items-center">
                    Judge
                    {getSortIcon('judgeName')}
                  </div>
                </TableHead>
                <TableHead
                  className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                  onClick={() => handleSort('startTime')}
                >
                  <div className="flex items-center">
                    Start Time
                    {getSortIcon('startTime')}
                  </div>
                </TableHead>
                <TableHead
                  className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                  onClick={() => handleSort('entries')}
                >
                  <div className="flex items-center">
                    Entries
                    {getSortIcon('entries')}
                  </div>
                </TableHead>
                <TableHead
                  className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Status
                    {getSortIcon('status')}
                  </div>
                </TableHead>
                <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedClasses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-muted-foreground">
                      {searchTerm
                        ? `No classes found matching "${searchTerm}"`
                        : 'No classes to display'}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedClasses.map(classItem => (
                  <TableRow
                    key={classItem.id}
                    className="bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => startTransition(() => navigate(`/classes/${classItem.id}`))}
                  >
                    <TableCell>{classItem.element}</TableCell>
                    <TableCell>
                      {shouldShowLevel(classItem) ? classItem.level : ''}
                      {shouldShowSection(classItem) && ` ${classItem.section}`}
                    </TableCell>
                    <TableCell>{classItem.judgeName || 'TBD'}</TableCell>
                    <TableCell>
                      {classItem.startTime
                        ? new Date(String(classItem.startTime)).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : 'TBD'}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span>{classItem.completedEntries ?? 0}</span>
                          <span className="text-muted-foreground">/</span>
                          <span>{classItem.entries}</span>
                        </div>
                        {classItem.entries > 0 && (
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, ((classItem.completedEntries ?? 0) / classItem.entries) * 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-block px-3 py-1 text-xs font-semibold rounded-full
    ${getStatusBadge(classItem.status)}
  `}
                      >
                        {classItem.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <ClassRowActionsMenu
                        onView={() => startTransition(() => navigate(`/classes/${classItem.id}`))}
                        onEdit={() => onEditClass(classItem)}
                        onDelete={() => onDeleteClass(classItem)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
