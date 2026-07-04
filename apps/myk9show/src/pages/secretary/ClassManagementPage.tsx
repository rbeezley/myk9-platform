import React, { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useClassesByTrialQuery,
  useUpdateClassMutation,
  useDeleteClassMutation,
  classKeys,
} from '@/hooks/queries/useClassesDatabase';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import {
  deriveClassLifecyclePresentation,
  deriveClassLifecycleValue,
  type ClassLifecycleValue,
} from '@/lib/status/classLifecycle';
import { useJudgesWithQualifications } from '@/hooks/queries/useJudgesWithQualifications';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrialStore } from '@/store/trialStore';
import { CLASS_STATUS, getClassStatusBadgeClasses, matchesAny } from '@myk9/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Trash2,
  Play,
  Pause,
  CheckCircle,
  Clock,
  Settings,
  MoreVertical,
  ListOrdered,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type DbClassRow = {
  id: string;
  name: string | null;
  element: string | null;
  level: string | null;
  section: string | null;
  status: string | null;
  class_order: number | null;
  max_entries: number | null;
  entries: Array<{ id: string }> | undefined;
  judge_assignments?: Array<{ person_id: string | null }> | null;
};

const UNASSIGNED_JUDGE_VALUE = 'TBD';

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
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [elementFilter, setElementFilter] = useState<string>('all');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

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

  const toggleClassSelection = (classId: string) => {
    setSelectedClasses(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const selectAllFiltered = () => {
    const filteredIds = filteredClasses.map(c => c.id);
    setSelectedClasses(prev => {
      const newSelection = [...prev];
      filteredIds.forEach(id => {
        if (!newSelection.includes(id)) {
          newSelection.push(id);
        }
      });
      return newSelection;
    });
  };

  const clearSelection = () => {
    setSelectedClasses([]);
  };

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

  const handleBulkStatusChange = (newStatus: string) => {
    selectedClasses.forEach(classId => {
      updateClassMutation.mutate({ id: classId, updates: { status: newStatus } });
    });
    setSelectedClasses([]);
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedClasses.length} classes?`)) {
      selectedClasses.forEach(classId => {
        deleteClassMutation.mutate({ id: classId });
      });
      setSelectedClasses([]);
    }
  };

  const getStatusIcon = (value: ClassLifecycleValue) => {
    switch (value) {
      case 'in_progress':
        return <Play className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'cancelled':
        return <Pause className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string | null) => {
    return getClassStatusBadgeClasses(status ?? '');
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:shrink-0">
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
            <Clock className="h-8 w-8 text-blue-500 mr-3" />
            <div>
              <div className="text-2xl font-bold">{lifecycleCounts.not_started}</div>
              <div className="text-sm text-muted-foreground">Not started</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <Play className="h-8 w-8 text-amber-500 mr-3" />
            <div>
              <div className="text-2xl font-bold">{lifecycleCounts.in_progress}</div>
              <div className="text-sm text-muted-foreground">In Progress</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center p-4">
            <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
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

      {selectedClasses.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium">
                  {selectedClasses.length} class{selectedClasses.length !== 1 ? 'es' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Select onValueChange={handleBulkStatusChange}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Change Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map(status => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={handleBulkDelete} className="text-red-600">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
              <Button variant="outline" onClick={clearSelection}>
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Classes ({filteredClasses.length})</CardTitle>
            {filteredClasses.length > 0 && (
              <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                Select All Visible
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading classes…</div>
          ) : filteredClasses.length > 0 ? (
            <div className="space-y-2">
              {filteredClasses.map(cls => {
                const entryCount = cls.entries?.length ?? 0;
                const maxEntries = cls.max_entries ?? 0;
                return (
                  <div
                    key={cls.id}
                    data-class-id={cls.id}
                    className={`border rounded-lg p-4 transition-all ${
                      selectedClasses.includes(cls.id)
                        ? 'ring-2 ring-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={selectedClasses.includes(cls.id)}
                        onCheckedChange={() => toggleClassSelection(cls.id)}
                        aria-label={`Select ${cls.name || 'Untitled Class'}`}
                      />

                      <div className="flex-1 grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
                        <div className="md:col-span-2">
                          <div className="font-medium">{cls.name || 'Untitled Class'}</div>
                          {cls.class_order != null && (
                            <div className="text-sm text-muted-foreground">
                              Order: {cls.class_order}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {cls.element && <Badge variant="outline">{cls.element}</Badge>}
                          {cls.level && <Badge variant="secondary">{cls.level}</Badge>}
                          {cls.section && <Badge variant="outline">{cls.section}</Badge>}
                        </div>

                        {(() => {
                          // Derived lifecycle chip: one label per stage
                          // ("Not started" / "In Progress" / "Completed"),
                          // never the raw enum ("in_progress") or "No Status".
                          // Draft/unpublished shows render no chip at all
                          // (UX walk remediation 2.B).
                          const lifecycle = deriveClassLifecyclePresentation({
                            classStatus: cls.status,
                            showStatus,
                          });
                          if (!lifecycle) return null;
                          return (
                            <div
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(cls.status)}`}
                            >
                              {getStatusIcon(lifecycle.value)}
                              {lifecycle.label}
                            </div>
                          );
                        })()}

                        <div className="text-sm text-muted-foreground">
                          <div>
                            Entries: {entryCount}
                            {maxEntries > 0 ? `/${maxEntries}` : ''}
                          </div>
                        </div>

                        <div>
                          <Select
                            value={cls.judge_assignments?.[0]?.person_id ?? UNASSIGNED_JUDGE_VALUE}
                            onValueChange={judgeId => handleJudgeChange(cls.id, judgeId)}
                            disabled={!showId || availableJudges.length === 0}
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-label={`Judge for ${cls.name || 'Untitled Class'}`}
                            >
                              <SelectValue placeholder="Assign judge" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNASSIGNED_JUDGE_VALUE}>Unassigned</SelectItem>
                              {availableJudges.map(judge => (
                                <SelectItem key={judge.id} value={judge.id}>
                                  {judge.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`More actions for ${cls.name || 'Untitled Class'}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={waitlistHref}>
                                  <ListOrdered className="h-4 w-4 mr-2" />
                                  View Waitlist
                                </Link>
                              </DropdownMenuItem>
                              {statuses.map(status => (
                                <DropdownMenuItem
                                  key={status}
                                  onClick={() => handleStatusChange(cls.id, status)}
                                >
                                  Set to {status}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuItem
                                onClick={() => handleDelete(cls.id)}
                                className="text-red-600"
                              >
                                Delete Class
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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
