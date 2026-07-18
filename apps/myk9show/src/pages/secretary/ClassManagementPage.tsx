import React, { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useClassesByTrialQuery,
  useUpdateClassMutation,
  useDeleteClassMutation,
  classKeys,
} from '@/hooks/queries/useClassesDatabase';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { ClassBulkActionsBar } from '@/components/classes/ClassBulkActionsBar';
import { useClassBulkActions } from '@/components/classes/useClassBulkActions';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { deriveClassLifecycleValue, type ClassLifecycleValue } from '@/lib/status/classLifecycle';
import { ClassManagementRow, type DbClassRow } from '@/components/classes/ClassManagementRow';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import { useJudgesWithQualifications } from '@/hooks/queries/useJudgesWithQualifications';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrialStore } from '@/store/trialStore';
import { CLASS_STATUS, matchesAny } from '@myk9/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusIcon } from '@/components/status';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus, Search, Filter, Settings, ListOrdered } from 'lucide-react';

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
  const { data: judges = [] } = useJudgesWithQualifications();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const updateClassMutation = useUpdateClassMutation();
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

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [elementFilter, setElementFilter] = useState<string>('all');

  const allClasses = useMemo(() => (rawClasses as DbClassRow[]) ?? [], [rawClasses]);

  const filteredClasses = useMemo(
    () =>
      allClasses.filter(cls => {
        const matchesSearch = matchesAny(
          [cls.name ?? '', cls.element ?? '', cls.level ?? ''],
          searchTerm
        );
        const matchesStatus = statusFilter === 'all' || cls.status === statusFilter;
        const matchesElement = elementFilter === 'all' || cls.element === elementFilter;
        return matchesSearch && matchesStatus && matchesElement;
      }),
    [allClasses, searchTerm, statusFilter, elementFilter]
  );

  const elements = useMemo(
    () =>
      Array.from(new Set(allClasses.map(c => c.element).filter((e): e is string => !!e))).sort(),
    [allClasses]
  );
  const statuses = Object.values(CLASS_STATUS);
  // Honest lifecycle counts: derive each class's canonical stage
  // ("Not started" / "In Progress" / "Completed") so the summary tiles agree
  // with the chip labels below (UX walk remediation 2.B) instead of matching
  // only the single raw enum value they used to filter on.
  const lifecycleCounts = useMemo(() => {
    const tally: Record<ClassLifecycleValue, number> = {
      not_started: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      unknown: 0,
    };
    for (const cls of allClasses) {
      tally[deriveClassLifecycleValue(cls.status)] += 1;
    }
    return tally;
  }, [allClasses]);
  const availableJudges = useMemo(
    () =>
      judges
        .filter(judge =>
          judge.judgeQualifications?.some(qualification => qualification.status === 'Active')
        )
        .map(judge => ({
          id: judge.id,
          name: `${judge.firstName} ${judge.lastName}`.trim() || 'Unknown Judge',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [judges]
  );

  const getClassId = useCallback((cls: DbClassRow) => cls.id, []);
  const selection = useBulkSelection<DbClassRow>({
    items: filteredClasses,
    getItemId: getClassId,
    pruneToItems: true,
  });

  const classesById = useMemo(
    () =>
      new Map(allClasses.map(cls => [cls.id, { id: cls.id, name: cls.name, status: cls.status }])),
    [allClasses]
  );

  const { bulkBusy, handleBulkDelete } = useClassBulkActions({
    classesById,
  });

  const handleStatusChange = (classId: string, newStatus: string) => {
    updateClassMutation.mutate({ id: classId, updates: { status: newStatus } });
  };

  const handleJudgeChange = (classId: string, judgeId: string) => {
    assignJudgeMutation.mutate({ classId, judgeId });
  };

  const handleDelete = (classId: string) => {
    if (confirm('Are you sure you want to delete this class?')) {
      deleteClassMutation.mutate({ id: classId });
    }
  };

  const trialDisplayName = trial?.name || (trialId ? 'Trial' : 'No trial selected');
  const setupHref = showId ? `/shows/${showId}/setup` : '/secretary/dashboard';
  const waitlistHref = showId
    ? `/shows/${showId}/entry-management?tab=waitlist${trialId ? `&trial=${trialId}` : ''}`
    : '/secretary/entries?tab=waitlist';
  const createHref =
    showId && trialId
      ? `/shows/${showId}/classes/${trialId}/create`
      : trialId
        ? `/trials/${trialId}/classes/create`
        : '/secretary/dashboard';

  return (
    <div className="manager-content-container mx-auto max-w-7xl px-4 py-6 sm:px-6">
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

      <div className="manager-class-stats-grid mb-6">
        <Card>
          <CardContent className="flex items-center p-4">
            <Settings className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <div className="text-2xl font-bold">{allClasses.length}</div>
              <div className="text-sm text-muted-foreground">Total Classes</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <StatusIcon family="class" status="not_started" size="lg" className="mr-3" decorative />
            <div>
              <div className="text-2xl font-bold">{lifecycleCounts.not_started}</div>
              <div className="text-sm text-muted-foreground">Not started</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <StatusIcon family="class" status="in_progress" size="lg" className="mr-3" decorative />
            <div>
              <div className="text-2xl font-bold">{lifecycleCounts.in_progress}</div>
              <div className="text-sm text-muted-foreground">In Progress</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <StatusIcon family="class" status="completed" size="lg" className="mr-3" decorative />
            <div>
              <div className="text-2xl font-bold">{lifecycleCounts.completed}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search classes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statuses.map(status => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={elementFilter} onValueChange={setElementFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Elements" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Elements</SelectItem>
                {elements.map(element => (
                  <SelectItem key={element} value={element}>
                    {element}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setElementFilter('');
              }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Clear
            </Button>

            <div className="text-sm text-muted-foreground">
              Showing {filteredClasses.length} of {allClasses.length} classes
            </div>
          </div>
        </CardContent>
      </Card>

      <ClassBulkActionsBar
        selectedClasses={selection.selectedItems}
        bulkBusy={bulkBusy}
        onBulkDelete={handleBulkDelete}
        onClear={selection.clearSelection}
      />

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
                  selected={selection.isSelected(cls)}
                  showId={showId}
                  showStatus={showStatus}
                  availableJudges={availableJudges}
                  onToggleSelect={() => selection.toggleItem(cls)}
                  onViewWaitlist={() => navigate(waitlistHref)}
                  onStatusChange={handleStatusChange}
                  onJudgeChange={handleJudgeChange}
                  onDelete={handleDelete}
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('');
                    setElementFilter('');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
