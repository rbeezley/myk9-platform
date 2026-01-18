import React, { useState, useEffect } from 'react';
import { CreatedClass } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  GripVertical,
  AlertTriangle,
  RotateCcw,
  Save,
  Eye,
  Calendar,
  Timer
} from 'lucide-react';

interface RunOrderBoardProps {
  classes: CreatedClass[];
  onReorder: (reorderedClasses: CreatedClass[]) => void;
  onJudgeAssign: (classId: string, judgeId: string) => void;
  availableJudges?: { id: string; name: string; }[];
  trialStartTime?: Date;
}

export const RunOrderBoard: React.FC<RunOrderBoardProps> = ({
  classes,
  onReorder,
  onJudgeAssign,
  availableJudges = [],
  trialStartTime = new Date()
}) => {
  const [draggedItem, setDraggedItem] = useState<CreatedClass | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [localClasses, setLocalClasses] = useState<CreatedClass[]>(classes);
  const [startTime, setStartTime] = useState<string>(
    trialStartTime.toTimeString().slice(0, 5)
  );
  const [breakDuration, setBreakDuration] = useState<number>(15); // minutes between classes

  // Update local state when props change
  useEffect(() => {
    setLocalClasses([...classes].sort((a, b) => a.runOrder - b.runOrder));
  }, [classes]);

  // Calculate schedule with timing
  const calculateSchedule = () => {
    const schedule: Array<CreatedClass & { 
      calculatedStartTime: Date; 
      calculatedEndTime: Date;
      conflicts: string[];
    }> = [];

    let currentTime = new Date();
    const [hours, minutes] = startTime.split(':').map(Number);
    currentTime.setHours(hours, minutes, 0, 0);

    localClasses.forEach((cls) => {
      const startTime = new Date(currentTime);
      const endTime = new Date(currentTime.getTime() + ((cls.fieldValues?.estimatedJudgingTime as number) || 15) * 60000);
      
      // Detect conflicts
      const conflicts: string[] = [];
      
      // Check for judge conflicts
      const sameJudgeClasses = schedule.filter(s => 
        s.personnel?.judgeId === cls.personnel?.judgeId && 
        cls.personnel?.judgeId && 
        s.calculatedEndTime > startTime && 
        s.calculatedStartTime < endTime
      );
      if (sameJudgeClasses.length > 0) {
        conflicts.push(`Judge conflict with ${sameJudgeClasses[0].className}`);
      }

      // Check for venue conflicts (same element running simultaneously)
      const sameElementClasses = schedule.filter(s => 
        s.element === cls.element && 
        s.calculatedEndTime > startTime && 
        s.calculatedStartTime < endTime
      );
      if (sameElementClasses.length > 0) {
        conflicts.push(`Venue conflict with ${sameElementClasses[0].className}`);
      }

      schedule.push({
        ...cls,
        calculatedStartTime: startTime,
        calculatedEndTime: endTime,
        conflicts
      });

      // Add break time for next class
      currentTime = new Date(endTime.getTime() + (breakDuration * 60000));
    });

    return schedule;
  };

  const schedule = calculateSchedule();

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, item: CreatedClass) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (!draggedItem) return;

    const draggedIndex = localClasses.findIndex(c => c.id === draggedItem.id);
    if (draggedIndex === -1) return;

    const newClasses = [...localClasses];
    const [removed] = newClasses.splice(draggedIndex, 1);
    newClasses.splice(dropIndex, 0, removed);

    // Update run orders
    const reorderedClasses = newClasses.map((cls, index) => ({
      ...cls,
      runOrder: index + 1
    }));

    setLocalClasses(reorderedClasses);
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const handleSaveOrder = () => {
    onReorder(localClasses);
  };

  const handleAutoOptimize = () => {
    // Simple optimization: group by element, then by level
    const optimized = [...localClasses].sort((a, b) => {
      if (a.element !== b.element) {
        return a.element.localeCompare(b.element);
      }
      if (a.level && b.level && a.level !== b.level) {
        const levelOrder = ['Novice', 'Advanced', 'Excellent', 'Master'];
        return levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
      }
      return a.className.localeCompare(b.className);
    });

    const reorderedClasses = optimized.map((cls, index) => ({
      ...cls,
      runOrder: index + 1
    }));

    setLocalClasses(reorderedClasses);
  };

  const formatTime = (date: Date) => {
    return date.toTimeString().slice(0, 5);
  };

  const getTotalDuration = () => {
    if (schedule.length === 0) return 0;
    const start = schedule[0].calculatedStartTime;
    const end = schedule[schedule.length - 1].calculatedEndTime;
    return Math.round((end.getTime() - start.getTime()) / 60000); // minutes
  };

  const getConflictCount = () => {
    return schedule.reduce((count, cls) => count + cls.conflicts.length, 0);
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Run Order Management
            </div>
            <Badge variant="outline">
              {localClasses.length} classes
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Timing Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Trial Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Break Between Classes (minutes)</Label>
              <Input
                type="number"
                value={breakDuration}
                onChange={(e) => setBreakDuration(Number(e.target.value))}
                min={0}
                max={60}
              />
            </div>
            <div className="space-y-2">
              <Label>Actions</Label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleAutoOptimize} size="sm">
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Optimize
                </Button>
                <Button onClick={handleSaveOrder} size="sm">
                  <Save className="h-4 w-4 mr-1" />
                  Save Order
                </Button>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{localClasses.length}</div>
              <div className="text-sm text-muted-foreground">Classes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{getTotalDuration()}</div>
              <div className="text-sm text-muted-foreground">Total Minutes</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getConflictCount() > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {getConflictCount()}
              </div>
              <div className="text-sm text-muted-foreground">Conflicts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {schedule.length > 0 ? formatTime(schedule[schedule.length - 1].calculatedEndTime) : '--:--'}
              </div>
              <div className="text-sm text-muted-foreground">End Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run Order Board */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Schedule Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedule.length > 0 ? (
            <div className="space-y-2">
              {schedule.map((cls, index) => (
                <div
                  key={cls.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, cls)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`border rounded-lg p-4 transition-all cursor-move ${
                    draggedItem?.id === cls.id ? 'opacity-50' : ''
                  } ${
                    dragOverIndex === index ? 'border-primary bg-primary/5' : ''
                  } ${
                    cls.conflicts.length > 0 ? 'border-red-200 bg-red-50' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Drag Handle */}
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                      <div className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        #{cls.runOrder}
                      </div>
                    </div>

                    {/* Class Info */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                      <div className="md:col-span-2">
                        <div className="font-medium">{cls.className}</div>
                        <div className="text-sm text-muted-foreground">
                          {cls.element}{cls.level ? ` ${cls.level}` : ''}{cls.section ? ` ${cls.section}` : ''}
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="font-mono text-sm">
                          {formatTime(cls.calculatedStartTime)}
                        </div>
                        <div className="text-xs text-muted-foreground">Start</div>
                      </div>

                      <div className="text-center">
                        <div className="font-mono text-sm">
                          {formatTime(cls.calculatedEndTime)}
                        </div>
                        <div className="text-xs text-muted-foreground">End</div>
                      </div>

                      <div className="text-center">
                        <div className="text-sm">{(cls.fieldValues?.estimatedJudgingTime as number) || 15}min</div>
                        <div className="text-xs text-muted-foreground">Duration</div>
                      </div>

                      <div>
                        {cls.personnel?.judgeId ? (
                          <Badge variant="secondary" className="text-xs">
                            {availableJudges.find(j => j.id === cls.personnel.judgeId)?.name || 'Judge Assigned'}
                          </Badge>
                        ) : (
                          <Select onValueChange={(value) => onJudgeAssign(cls.id, value)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Assign Judge" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableJudges.map(judge => (
                                <SelectItem key={judge.id} value={judge.id}>
                                  {judge.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    {/* Status & Conflicts */}
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={
                        cls.status === 'Completed' ? 'default' :
                        cls.status === 'In Progress' ? 'secondary' :
                        cls.status === 'Cancelled' ? 'destructive' : 'outline'
                      } className="text-xs">
                        {cls.status}
                      </Badge>
                      
                      {cls.conflicts.length > 0 && (
                        <div className="flex items-center gap-1 text-red-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs">{cls.conflicts.length} conflict{cls.conflicts.length !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Conflict Details */}
                  {cls.conflicts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-red-200">
                      <div className="text-sm font-medium text-red-800 mb-1">Conflicts:</div>
                      <ul className="text-sm text-red-700 space-y-1">
                        {cls.conflicts.map((conflict, idx) => (
                          <li key={idx} className="flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3" />
                            {conflict}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Classes to Schedule</h3>
              <p className="text-muted-foreground">
                Add classes to this trial to create a run order schedule.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conflict Summary */}
      {getConflictCount() > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Scheduling Conflicts Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-red-700 text-sm">
                {getConflictCount()} conflict{getConflictCount() !== 1 ? 's' : ''} found in the current schedule. 
                Review and resolve conflicts before finalizing the run order.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleAutoOptimize}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Auto-Resolve Conflicts
                </Button>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-1" />
                  View Conflict Details
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};