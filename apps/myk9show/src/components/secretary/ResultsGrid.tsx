/**
 * Results Grid Component
 *
 * Interactive grid for viewing and editing Scent Work results with:
 * - Inline editing capabilities
 * - Sort and filter options
 * - Placement display
 * - Quick actions (edit, delete, view details)
 */

import { useState, useCallback, useMemo } from 'react';
import { logger } from '@/services/LoggingService';
import { Edit2, Trash2, Eye, Search, SortAsc, SortDesc, Filter, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Types
import type {
  ScentWorkEntry,
  ScentWorkResult,
  MultiAreaScentWorkResult,
  ScentWorkClassConfig,
  QualificationStatus,
} from '@/types/scent-work-types';
import { msToDisplay } from '@/lib/timeUtils';

export interface ResultsGridProps {
  entries: ScentWorkEntry[];
  results: Map<string, ScentWorkResult | MultiAreaScentWorkResult>;
  classConfig: ScentWorkClassConfig;
  onResultUpdate: (
    entryId: string,
    result: ScentWorkResult | MultiAreaScentWorkResult
  ) => Promise<void>;
  onResultDelete: (entryId: string) => Promise<void>;
  className?: string;
}

type SortField = 'armband' | 'dogName' | 'searchTime' | 'placement' | 'qualification';
type SortDirection = 'asc' | 'desc';

interface FilterState {
  search: string;
  qualification: QualificationStatus | 'all';
}

/**
 * Results grid with inline editing and management features
 */
export function ResultsGrid({
  entries,
  results,
  classConfig,
  onResultUpdate,
  onResultDelete,
  className,
}: ResultsGridProps) {
  const [sortField, setSortField] = useState<SortField>('armband');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    qualification: 'all',
  });
  const [selectedResult, setSelectedResult] = useState<
    ScentWorkResult | MultiAreaScentWorkResult | null
  >(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    qualification: QualificationStatus;
    faults: number;
    judgeNotes: string;
  }>({
    qualification: 'Qualified',
    faults: 0,
    judgeNotes: '',
  });

  const isMultiArea = classConfig.multiArea === true;

  // Combine entries with results for display
  const gridData = useMemo(() => {
    return entries.map(entry => {
      const result = results.get(entry.id);
      return {
        entry,
        result,
        hasResult: !!result,
      };
    });
  }, [entries, results]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = gridData;

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        item =>
          item.entry.displayInfo.dogName.toLowerCase().includes(searchLower) ||
          item.entry.displayInfo.handlerName.toLowerCase().includes(searchLower) ||
          item.entry.displayInfo.armband.includes(filters.search)
      );
    }

    // Apply qualification filter
    if (filters.qualification !== 'all') {
      filtered = filtered.filter(item => item.result?.qualification === filters.qualification);
    }

    // Sort data
    filtered.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'armband':
          aValue = parseInt(a.entry.displayInfo.armband) || 0;
          bValue = parseInt(b.entry.displayInfo.armband) || 0;
          break;
        case 'dogName':
          aValue = a.entry.displayInfo.dogName.toLowerCase();
          bValue = b.entry.displayInfo.dogName.toLowerCase();
          break;
        case 'searchTime':
          aValue =
            a.result && 'totalSearchTime' in a.result
              ? a.result.totalSearchTime
              : a.result && 'searchTime' in a.result
                ? a.result.searchTime
                : 999999;
          bValue =
            b.result && 'totalSearchTime' in b.result
              ? b.result.totalSearchTime
              : b.result && 'searchTime' in b.result
                ? b.result.searchTime
                : 999999;
          break;
        case 'placement':
          aValue = a.result?.placementCalculated || 999;
          bValue = b.result?.placementCalculated || 999;
          break;
        case 'qualification':
          aValue = a.result?.qualification || 'zzz';
          bValue = b.result?.qualification || 'zzz';
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [gridData, filters, sortField, sortDirection]);

  // Handle sorting
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  // Handle result deletion
  const handleDelete = useCallback(
    async (entryId: string) => {
      if (window.confirm('Are you sure you want to delete this result?')) {
        try {
          await onResultDelete(entryId);
        } catch (error) {
          logger.error('Failed to delete result:', 'secretary', {}, error as Error);
        }
      }
    },
    [onResultDelete]
  );

  // Handle viewing result details
  const handleViewDetails = useCallback((result: ScentWorkResult | MultiAreaScentWorkResult) => {
    setSelectedResult(result);
    setShowDetailsDialog(true);
  }, []);

  // Start inline editing for a result
  const handleStartEdit = useCallback(
    (entryId: string, result: ScentWorkResult | MultiAreaScentWorkResult | undefined) => {
      setEditingEntryId(entryId);
      if (result) {
        setEditValues({
          qualification: result.qualification,
          faults: 'totalFaults' in result ? result.totalFaults : result.faults,
          judgeNotes: result.judgeNotes || '',
        });
      } else {
        setEditValues({ qualification: 'Qualified', faults: 0, judgeNotes: '' });
      }
    },
    []
  );

  // Save inline edit
  const handleSaveEdit = useCallback(
    async (
      entryId: string,
      existingResult: ScentWorkResult | MultiAreaScentWorkResult | undefined
    ) => {
      if (!existingResult) return;

      const updated = {
        ...existingResult,
        qualification: editValues.qualification,
        judgeNotes: editValues.judgeNotes || undefined,
        ...('totalFaults' in existingResult
          ? { totalFaults: editValues.faults }
          : { faults: editValues.faults }),
      };

      try {
        await onResultUpdate(entryId, updated);
        setEditingEntryId(null);
      } catch (error) {
        logger.error('Failed to update result:', 'secretary', {}, error as Error);
      }
    },
    [editValues, onResultUpdate]
  );

  // Cancel inline edit
  const handleCancelEdit = useCallback(() => {
    setEditingEntryId(null);
  }, []);

  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <SortAsc className="h-4 w-4" />
    ) : (
      <SortDesc className="h-4 w-4" />
    );
  };

  // Render qualification badge
  const renderQualificationBadge = (qualification?: QualificationStatus) => {
    if (!qualification) return <Badge variant="outline">No Result</Badge>;

    const variants = {
      Qualified: 'default',
      'Not Qualified': 'destructive',
      Absent: 'secondary',
      Excused: 'outline',
      Withdrawn: 'outline',
      Eliminated: 'destructive',
    } as const;

    return <Badge variant={variants[qualification]}>{qualification}</Badge>;
  };

  // Render placement badge
  const renderPlacementBadge = (placement?: number) => {
    if (!placement) return null;

    const colors = {
      1: 'bg-yellow-500 text-white',
      2: 'bg-gray-400 text-white',
      3: 'bg-amber-600 text-white',
      4: 'bg-blue-500 text-white',
    };

    const bgClass = colors[placement as keyof typeof colors] || 'bg-gray-300 text-gray-700';

    return (
      <Badge className={cn('text-xs', bgClass)}>
        {placement === 1
          ? '1st'
          : placement === 2
            ? '2nd'
            : placement === 3
              ? '3rd'
              : `${placement}th`}
      </Badge>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filters and Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by dog, handler, or armband..."
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-10 w-64"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center space-x-2">
                <Filter className="h-4 w-4" />
                <span>Filter by Qualification</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => setFilters(prev => ({ ...prev, qualification: 'all' }))}
              >
                All Results
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilters(prev => ({ ...prev, qualification: 'Qualified' }))}
              >
                Qualified
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilters(prev => ({ ...prev, qualification: 'Not Qualified' }))}
              >
                Not Qualified
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilters(prev => ({ ...prev, qualification: 'Absent' }))}
              >
                Absent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredAndSortedData.length} of {entries.length} entries
        </div>
      </div>

      {/* Results Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleSort('armband')}
              >
                <div className="flex items-center space-x-1">
                  <span>Armband</span>
                  {renderSortIcon('armband')}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleSort('dogName')}
              >
                <div className="flex items-center space-x-1">
                  <span>Dog & Handler</span>
                  {renderSortIcon('dogName')}
                </div>
              </TableHead>
              {isMultiArea &&
                classConfig.areaLimits &&
                classConfig.areaLimits.map((_, idx) => (
                  <TableHead key={`area-${idx}`}>Area {idx + 1}</TableHead>
                ))}
              <TableHead
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleSort('searchTime')}
              >
                <div className="flex items-center space-x-1">
                  <span>{isMultiArea ? 'Total Time' : 'Time'}</span>
                  {renderSortIcon('searchTime')}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleSort('qualification')}
              >
                <div className="flex items-center space-x-1">
                  <span>Result</span>
                  {renderSortIcon('qualification')}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleSort('placement')}
              >
                <div className="flex items-center space-x-1">
                  <span>Placement</span>
                  {renderSortIcon('placement')}
                </div>
              </TableHead>
              <TableHead>Faults</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedData.map(({ entry, result, hasResult }) => {
              const isEditing = editingEntryId === entry.id;

              return (
                <TableRow
                  key={entry.id}
                  className={cn(
                    'hover:bg-gray-50 dark:hover:bg-gray-800',
                    !hasResult && 'opacity-60',
                    isEditing && 'bg-info/10 '
                  )}
                >
                  <TableCell className="font-medium">#{entry.displayInfo.armband}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{entry.displayInfo.dogName}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {entry.displayInfo.dogBreed}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {entry.displayInfo.handlerName}
                      </div>
                    </div>
                  </TableCell>
                  {isMultiArea &&
                    classConfig.areaLimits &&
                    classConfig.areaLimits.map((_, idx) => {
                      const areaResult =
                        result && 'areaResults' in result
                          ? result.areaResults.find(a => a.areaNumber === idx + 1)
                          : undefined;
                      return (
                        <TableCell key={`area-${idx}`}>
                          {areaResult ? (
                            <div>
                              <span className="font-mono text-sm">
                                {msToDisplay(areaResult.searchTime, 'hundredths')}
                              </span>
                              <div className="text-xs text-gray-500">F: {areaResult.faults}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </TableCell>
                      );
                    })}
                  <TableCell>
                    {result ? (
                      <span className="font-mono">
                        {msToDisplay(
                          'totalSearchTime' in result ? result.totalSearchTime : result.searchTime,
                          'hundredths'
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">--:--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Select
                        value={editValues.qualification}
                        onValueChange={val =>
                          setEditValues(prev => ({
                            ...prev,
                            qualification: val as QualificationStatus,
                          }))
                        }
                      >
                        <SelectTrigger className="w-36 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Qualified">Qualified</SelectItem>
                          <SelectItem value="Not Qualified">Not Qualified</SelectItem>
                          <SelectItem value="Absent">Absent</SelectItem>
                          <SelectItem value="Excused">Excused</SelectItem>
                          <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                          <SelectItem value="Eliminated">Eliminated</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      renderQualificationBadge(result?.qualification)
                    )}
                  </TableCell>
                  <TableCell>{renderPlacementBadge(result?.placementCalculated)}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="number"
                        min={0}
                        value={editValues.faults}
                        onChange={e =>
                          setEditValues(prev => ({
                            ...prev,
                            faults: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="w-16 h-8"
                      />
                    ) : result ? (
                      'totalFaults' in result ? (
                        result.totalFaults
                      ) : (
                        result.faults
                      )
                    ) : (
                      '--'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-1">
                      {isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSaveEdit(entry.id, result)}
                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            className="h-8 w-8 p-0 text-gray-600 hover:text-gray-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {result && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(result)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {result && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStartEdit(entry.id, result)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          {result && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(entry.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {filteredAndSortedData.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={isMultiArea ? 7 + (classConfig.areaLimits?.length || 0) : 7}
                  className="text-center py-8 text-gray-500"
                >
                  No results found matching your filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Result Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Result Details</DialogTitle>
            <DialogDescription>Complete result information for this entry</DialogDescription>
          </DialogHeader>

          {selectedResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Entry ID:</label>
                  <p className="text-sm text-gray-600">{selectedResult.entryId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Recorded By:</label>
                  <p className="text-sm text-gray-600">{selectedResult.recordedBy}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Recorded At:</label>
                  <p className="text-sm text-gray-600">
                    {selectedResult.recordedAt.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Qualification:</label>
                  <div className="mt-1">
                    {renderQualificationBadge(selectedResult.qualification)}
                  </div>
                </div>
              </div>

              {/* Multi-area specific details */}
              {'areaResults' in selectedResult && (
                <div>
                  <label className="text-sm font-medium">Area Results:</label>
                  <div className="mt-2 space-y-2">
                    {selectedResult.areaResults.map((area, index) => (
                      <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Area {area.areaNumber}</span>
                          {renderQualificationBadge(area.qualification)}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Time: {msToDisplay(area.searchTime, 'hundredths')} • Faults: {area.faults}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedResult.judgeNotes && (
                <div>
                  <label className="text-sm font-medium">Judge Notes:</label>
                  <p className="text-sm text-gray-600 mt-1">{selectedResult.judgeNotes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
