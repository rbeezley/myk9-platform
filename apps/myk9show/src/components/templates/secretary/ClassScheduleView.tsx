import React, { useState, useMemo } from 'react';
import { ScheduleItem, TimeCalculationEngine, ScheduleConfig } from '@/lib/timeCalculation';
import { CreatedClass } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  AlertTriangle,
  Download,
  Printer,
  Filter,
  BarChart3,
  User,
  MapPin,
} from 'lucide-react';

interface ClassScheduleViewProps {
  classes: CreatedClass[];
  config: ScheduleConfig;
  onConfigChange: (config: Partial<ScheduleConfig>) => void;
  onExport?: (format: 'pdf' | 'csv' | 'json') => void;
}

export const ClassScheduleView: React.FC<ClassScheduleViewProps> = ({
  classes,
  config,
  onExport,
}) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'grid' | 'judge' | 'element'>('timeline');
  const [filterJudge, setFilterJudge] = useState<string>('');
  const [filterElement, setFilterElement] = useState<string>('');

  // Calculate schedule using the time engine
  const timeEngine = useMemo(() => new TimeCalculationEngine(config), [config]);
  const schedule = useMemo(() => timeEngine.calculateSchedule(classes), [timeEngine, classes]);
  const stats = useMemo(() => timeEngine.getScheduleStats(schedule), [timeEngine, schedule]);

  // Build a map of judgeId to judge name from the classes data
  const judgeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach(cls => {
      if (cls.personnel?.judgeId && cls.personnel?.judgeName) {
        map.set(cls.personnel.judgeId, cls.personnel.judgeName);
      }
    });
    return map;
  }, [classes]);

  // Get unique judges and elements for filtering
  const judges = Array.from(new Set(schedule.map(s => s.personnel.judgeId).filter(Boolean)));
  const elements = Array.from(new Set(schedule.map(s => s.element)));

  // Helper to get judge display name
  const getJudgeDisplayName = (judgeId: string | undefined) => {
    if (!judgeId) return 'TBD';
    return judgeNameMap.get(judgeId) || judgeId;
  };

  // Filter schedule based on selected filters
  const filteredSchedule = schedule.filter(item => {
    const matchesJudge = !filterJudge || item.personnel.judgeId === filterJudge;
    const matchesElement = !filterElement || item.element === filterElement;
    return matchesJudge && matchesElement;
  });

  // Group schedule by different criteria
  const groupedByJudge = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    filteredSchedule.forEach(item => {
      const key = item.personnel.judgeId || 'Unassigned';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return groups;
  }, [filteredSchedule]);

  const groupedByElement = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    filteredSchedule.forEach(item => {
      if (!groups.has(item.element)) groups.set(item.element, []);
      groups.get(item.element)!.push(item);
    });
    return groups;
  }, [filteredSchedule]);

  const formatTime = (date: Date) => date.toTimeString().slice(0, 5);
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getConflictIcon = (conflicts: ScheduleItem['conflicts']) => {
    const errorCount = conflicts.filter(c => c.severity === 'error').length;
    if (errorCount > 0) {
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
    return conflicts.length > 0 ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : null;
  };

  const calculateTimelinePosition = (item: ScheduleItem) => {
    const dayStart = new Date(config.trialStartTime);
    dayStart.setHours(8, 0, 0, 0); // 8 AM start for timeline

    const dayEnd = new Date(config.trialStartTime);
    dayEnd.setHours(18, 0, 0, 0); // 6 PM end for timeline

    const totalMinutes = (dayEnd.getTime() - dayStart.getTime()) / 60000;
    const startOffset = (item.calculatedStartTime.getTime() - dayStart.getTime()) / 60000;
    const duration = (item.fieldValues?.estimatedJudgingTime as number) || 15;

    return {
      left: `${(startOffset / totalMinutes) * 100}%`,
      width: `${(duration / totalMinutes) * 100}%`,
      isVisible: startOffset >= 0 && startOffset < totalMinutes,
    };
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Schedule Preview
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={stats.errorConflicts > 0 ? 'destructive' : 'default'}>
                {stats.totalConflicts} conflicts
              </Badge>
              <Badge variant="outline">{stats.totalClasses} classes</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalClasses}</div>
              <div className="text-sm text-muted-foreground">Classes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-teal-600">
                {formatDuration(stats.totalDuration)}
              </div>
              <div className="text-sm text-muted-foreground">Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-violet-600">{stats.judgeCount}</div>
              <div className="text-sm text-muted-foreground">Judges</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.elementCount}</div>
              <div className="text-sm text-muted-foreground">Elements</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-mono">
                {stats.startTime ? formatTime(stats.startTime) : '--:--'}
              </div>
              <div className="text-sm text-muted-foreground">Start</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-mono">
                {stats.endTime ? formatTime(stats.endTime) : '--:--'}
              </div>
              <div className="text-sm text-muted-foreground">End</div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4">
            {/* View Mode */}
            <div className="flex gap-1">
              {[
                { value: 'timeline', label: 'Timeline', icon: BarChart3 },
                { value: 'grid', label: 'Grid', icon: Calendar },
                { value: 'judge', label: 'By Judge', icon: User },
                { value: 'element', label: 'By Element', icon: MapPin },
              ].map(mode => (
                <Button
                  key={mode.value}
                  variant={viewMode === mode.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() =>
                    setViewMode(mode.value as 'timeline' | 'grid' | 'judge' | 'element')
                  }
                >
                  <mode.icon className="h-4 w-4 mr-1" />
                  {mode.label}
                </Button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={''} onValueChange={setFilterJudge}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Judges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Judges</SelectItem>
                  {judges.map(judgeId => (
                    <SelectItem key={judgeId} value={judgeId || ''}>
                      {getJudgeDisplayName(judgeId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={''} onValueChange={setFilterElement}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Elements" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Elements</SelectItem>
                  {elements.map(element => (
                    <SelectItem key={element} value={''}>
                      {element}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Export Options */}
            {onExport && (
              <div className="flex gap-1 ml-auto">
                <Button variant="outline" size="sm" onClick={() => onExport('pdf')}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={() => onExport('csv')}>
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schedule Views */}
      <Card>
        <CardContent className="pt-6">
          {/* Timeline View */}
          {viewMode === 'timeline' && (
            <div className="space-y-4">
              <div className="h-2 bg-muted rounded relative">
                <div className="absolute left-0 top-0 text-xs text-muted-foreground -mt-5">
                  8:00
                </div>
                <div className="absolute left-1/4 top-0 text-xs text-muted-foreground -mt-5">
                  10:30
                </div>
                <div className="absolute left-1/2 top-0 text-xs text-muted-foreground -mt-5">
                  13:00
                </div>
                <div className="absolute left-3/4 top-0 text-xs text-muted-foreground -mt-5">
                  15:30
                </div>
                <div className="absolute right-0 top-0 text-xs text-muted-foreground -mt-5">
                  18:00
                </div>
              </div>

              <div className="space-y-2">
                {filteredSchedule.map(item => {
                  const position = calculateTimelinePosition(item);
                  if (!position.isVisible) return null;

                  return (
                    <div key={item.id} className="relative h-12 bg-muted rounded">
                      <div
                        className={`absolute h-full rounded flex items-center px-2 text-xs font-medium ${
                          item.conflicts.some(c => c.severity === 'error')
                            ? 'bg-red-500 text-white'
                            : item.conflicts.length > 0
                              ? 'bg-amber-500 text-black'
                              : 'bg-blue-500 text-white'
                        }`}
                        style={{ left: position.left, width: position.width }}
                      >
                        <div className="truncate">
                          {item.className}
                          {getConflictIcon(item.conflicts) && (
                            <span className="ml-1">{getConflictIcon(item.conflicts)}</span>
                          )}
                        </div>
                      </div>
                      <div className="absolute right-2 top-1 text-xs text-muted-foreground">
                        {formatTime(item.calculatedStartTime)} -{' '}
                        {formatTime(item.calculatedEndTime)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="space-y-2">
              {filteredSchedule.map(item => (
                <div key={item.id} className="flex items-center gap-4 p-3 border rounded">
                  <div className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    #{item.runOrder}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{item.className}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.element}
                      {item.level ? ` ${item.level}` : ''}
                      {item.section ? ` ${item.section}` : ''}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-sm">{formatTime(item.calculatedStartTime)}</div>
                    <div className="text-xs text-muted-foreground">Start</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm">
                      {(item.fieldValues?.estimatedJudgingTime as number) || 15}m
                    </div>
                    <div className="text-xs text-muted-foreground">Duration</div>
                  </div>
                  <div className="text-center">
                    <Badge variant="outline" className="text-xs">
                      {getJudgeDisplayName(item.personnel.judgeId)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {getConflictIcon(item.conflicts)}
                    {item.conflicts.length > 0 && (
                      <span className="text-xs">{item.conflicts.length}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Judge View */}
          {viewMode === 'judge' && (
            <div className="space-y-6">
              {Array.from(groupedByJudge.entries()).map(([judgeId, judgeClasses]) => (
                <div key={judgeId} className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {getJudgeDisplayName(judgeId === 'Unassigned' ? undefined : judgeId)}
                    <Badge variant="outline">{judgeClasses.length} classes</Badge>
                  </h3>
                  <div className="grid gap-2">
                    {judgeClasses.map(item => (
                      <div key={item.id} className="flex items-center gap-4 p-2 bg-muted rounded">
                        <div className="text-sm font-mono">#{item.runOrder}</div>
                        <div className="flex-1 text-sm">{item.className}</div>
                        <div className="text-sm font-mono">
                          {formatTime(item.calculatedStartTime)}
                        </div>
                        <div className="text-sm">
                          {(item.fieldValues?.estimatedJudgingTime as number) || 15}m
                        </div>
                        {getConflictIcon(item.conflicts)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Element View */}
          {viewMode === 'element' && (
            <div className="space-y-6">
              {Array.from(groupedByElement.entries()).map(([element, elementClasses]) => (
                <div key={element} className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {element}
                    <Badge variant="outline">{elementClasses.length} classes</Badge>
                  </h3>
                  <div className="grid gap-2">
                    {elementClasses.map(item => (
                      <div key={item.id} className="flex items-center gap-4 p-2 bg-muted rounded">
                        <div className="text-sm font-mono">#{item.runOrder}</div>
                        <div className="flex-1 text-sm">{item.className}</div>
                        <div className="text-sm font-mono">
                          {formatTime(item.calculatedStartTime)}
                        </div>
                        <div className="text-sm">{getJudgeDisplayName(item.personnel.judgeId)}</div>
                        {getConflictIcon(item.conflicts)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No Classes Message */}
          {filteredSchedule.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Classes Found</h3>
              <p className="text-muted-foreground">
                {schedule.length === 0
                  ? 'No classes scheduled for this trial.'
                  : 'No classes match the selected filters.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conflicts Summary */}
      {stats.totalConflicts > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Schedule Conflicts ({stats.totalConflicts})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{stats.errorConflicts}</div>
                  <div className="text-sm text-red-700">Errors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">{stats.warningConflicts}</div>
                  <div className="text-sm text-amber-700">Warnings</div>
                </div>
              </div>

              <div className="text-sm text-red-700">
                Review scheduling conflicts before finalizing. Use the timeline view to see
                overlapping classes.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
