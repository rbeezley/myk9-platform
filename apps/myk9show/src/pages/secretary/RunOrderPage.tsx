import React, { useState, useEffect, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClassCreationStore } from '@/store/classCreationStore';
import { CreatedClass } from '@/types/template.types';
import { ScheduleConfig, TimeCalculationEngine } from '@/lib/timeCalculation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
import { logger } from '@/services/LoggingService';
  ArrowLeft,
  Calendar,
  Users,
  Clock,
  Settings,
  Download,
  Shuffle,
  AlertTriangle
} from 'lucide-react';

// Import our advanced components
import { RunOrderBoard } from '@/components/templates/secretary/RunOrderBoard';
import { ClassScheduleView } from '@/components/templates/secretary/ClassScheduleView';
import { PersonnelManager, Personnel, PersonnelAssignment } from '@/components/templates/secretary/PersonnelManager';

export const RunOrderPage: React.FC = () => {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const { 
    getClassesByTrial, 
    updateClassRunOrder, 
    updateClassJudge 
  } = useClassCreationStore();

  const [activeTab, setActiveTab] = useState('runorder');
  const [classes, setClasses] = useState<CreatedClass[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [assignments, setAssignments] = useState<PersonnelAssignment[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    trialStartTime: new Date(),
    defaultBreakDuration: 15,
    lunchBreak: {
      startTime: '12:00',
      duration: 60
    },
    judgeBreakRequirement: 10
  });

  // Load classes for this trial
  useEffect(() => {
    if (trialId) {
      const trialClasses = getClassesByTrial(trialId);
      setClasses(trialClasses);
      
      // Set trial start time to 9 AM today
      const startTime = new Date();
      startTime.setHours(9, 0, 0, 0);
      setScheduleConfig(prev => ({ ...prev, trialStartTime: startTime }));
    }
  }, [trialId, getClassesByTrial]);

  // Mock personnel data - in real app this would come from a personnel store
  useEffect(() => {
    const mockPersonnel: Personnel[] = [
      {
        id: 'judge1',
        name: 'Sarah Johnson',
        email: 'sarah.j@email.com',
        phone: '(555) 123-4567',
        roles: [
          { type: 'judge', level: 'expert', elements: ['Container', 'Buried', 'Exterior', 'Interior'] }
        ],
        certifications: ['AKC Scent Work Judge', 'NACSW Judge'],
        availability: [{ start: '08:00', end: '17:00' }],
        preferences: {
          maxConsecutiveHours: 6,
          minBreakBetween: 15,
          preferredElements: ['Container', 'Interior'],
          avoidElements: [],
          canWorkWithJudges: []
        }
      },
      {
        id: 'judge2',
        name: 'Mike Davis',
        email: 'mike.d@email.com',
        phone: '(555) 234-5678',
        roles: [
          { type: 'judge', level: 'experienced', elements: ['Container', 'Buried', 'Exterior'] }
        ],
        certifications: ['AKC Scent Work Judge'],
        availability: [{ start: '09:00', end: '16:00' }],
        preferences: {
          maxConsecutiveHours: 4,
          minBreakBetween: 20,
          preferredElements: ['Exterior'],
          avoidElements: ['Interior'],
          canWorkWithJudges: []
        }
      },
      {
        id: 'steward1',
        name: 'Lisa Brown',
        email: 'lisa.b@email.com',
        phone: '(555) 345-6789',
        roles: [
          { type: 'gate-steward', level: 'experienced', elements: ['Container', 'Buried', 'Exterior', 'Interior'] },
          { type: 'table-steward', level: 'expert', elements: ['Container', 'Buried', 'Exterior', 'Interior'] }
        ],
        certifications: ['Trial Secretary', 'Steward Training'],
        availability: [{ start: '07:30', end: '18:00' }],
        preferences: {
          maxConsecutiveHours: 8,
          minBreakBetween: 10,
          preferredElements: [],
          avoidElements: [],
          canWorkWithJudges: ['judge1', 'judge2']
        }
      },
      {
        id: 'steward2',
        name: 'Tom Wilson',
        email: 'tom.w@email.com',
        phone: '(555) 456-7890',
        roles: [
          { type: 'timer', level: 'experienced', elements: ['Container', 'Buried', 'Exterior', 'Interior'] },
          { type: 'ring-steward', level: 'novice', elements: ['Container', 'Exterior'] }
        ],
        certifications: ['Timer Certification'],
        availability: [{ start: '08:00', end: '17:00' }],
        preferences: {
          maxConsecutiveHours: 6,
          minBreakBetween: 15,
          preferredElements: ['Container'],
          avoidElements: [],
          canWorkWithJudges: ['judge1', 'judge2']
        }
      }
    ];
    
    setPersonnel(mockPersonnel);
  }, []);

  // Generate initial assignments based on current class data
  useEffect(() => {
    const initialAssignments: PersonnelAssignment[] = [];
    
    classes.forEach(cls => {
      if (cls.personnel.judgeId) {
        initialAssignments.push({
          classId: cls.id,
          className: cls.className,
          role: 'judgeId',
          personnelId: cls.personnel.judgeId,
          startTime: cls.plannedStartTime || new Date(),
          endTime: new Date((cls.plannedStartTime || new Date()).getTime() + (Number(cls.fieldValues.estimatedJudgingTime || 30) * 60000)),
          conflicts: []
        });
      }
      
      // Add steward assignments if they exist
      Object.entries(cls.personnel.stewards).forEach(([role, stewId]) => {
        if (stewId) {
          initialAssignments.push({
            classId: cls.id,
            className: cls.className,
            role,
            personnelId: Array.isArray(stewId) ? stewId[0] : stewId,
            startTime: cls.plannedStartTime || new Date(),
            endTime: new Date((cls.plannedStartTime || new Date()).getTime() + (Number(cls.fieldValues.estimatedJudgingTime || 30) * 60000)),
            conflicts: []
          });
        }
      });
    });
    
    setAssignments(initialAssignments);
  }, [classes]);

  // Calculate schedule statistics
  const timeEngine = new TimeCalculationEngine(scheduleConfig);
  const schedule = timeEngine.calculateSchedule(classes);
  const stats = timeEngine.getScheduleStats(schedule);

  // Handle reordering classes
  const handleReorder = (reorderedClasses: CreatedClass[]) => {
    setClasses(reorderedClasses);
    // In real app, this would update the store
    reorderedClasses.forEach(cls => {
      updateClassRunOrder(cls.id, cls.runOrder);
    });
  };

  // Handle time updates (currently unused but available for future time adjustment features)
  // const handleTimeUpdate = (classId: string, startTime: Date) => {
  //   updateClassTime(classId, startTime);
  //   // Update local state
  //   setClasses(prev => prev.map(cls => 
  //     cls.id === classId 
  //       ? { ...cls, plannedStartTime: startTime }
  //       : cls
  //   ));
  // };

  // Handle judge assignment
  const handleJudgeAssign = (classId: string, judgeId: string) => {
    updateClassJudge(classId, judgeId);
    // Update local state
    setClasses(prev => prev.map(cls => 
      cls.id === classId 
        ? { ...cls, judgeId }
        : cls
    ));
  };

  // Handle personnel assignment changes
  const handleAssignmentChange = (classId: string, role: string, personnelId: string | null) => {
    // Update assignments
    setAssignments(prev => {
      const filtered = prev.filter(a => !(a.classId === classId && a.role === role));
      
      if (personnelId) {
        const cls = classes.find(c => c.id === classId);
        if (cls) {
          filtered.push({
            classId,
            className: cls.className,
            role,
            personnelId,
            startTime: cls.plannedStartTime || new Date(),
            endTime: new Date((cls.plannedStartTime || new Date()).getTime() + (Number(cls.fieldValues.estimatedJudgingTime || 30) * 60000)),
            conflicts: []
          });
        }
      }
      
      return filtered;
    });

    // Update class data for judges and stewards
    if (role === 'judgeId') {
      handleJudgeAssign(classId, personnelId || '');
    } else {
      // Update steward assignments in class data
      setClasses(prev => prev.map(cls => {
        if (cls.id === classId) {
          const updatedStewards = { ...cls.personnel.stewards };
          if (personnelId) {
            if (role === 'ring') {
              updatedStewards[role] = [personnelId];
            } else {
              (updatedStewards as Record<string, string>)[role] = personnelId;
            }
          } else {
            delete updatedStewards[role as keyof typeof updatedStewards];
          }
          return { ...cls, personnel: { ...cls.personnel, stewards: updatedStewards } };
        }
        return cls;
      }));
    }
  };

  // Handle personnel management
  const handlePersonnelAdd = (person: Personnel) => {
    setPersonnel(prev => [...prev, person]);
  };

  const handlePersonnelUpdate = (id: string, updates: Partial<Personnel>) => {
    setPersonnel(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handlePersonnelDelete = (id: string) => {
    setPersonnel(prev => prev.filter(p => p.id !== id));
    // Remove assignments for this person
    setAssignments(prev => prev.filter(a => a.personnelId !== id));
  };

  // Handle config changes
  const handleConfigChange = (updates: Partial<ScheduleConfig>) => {
    setScheduleConfig(prev => ({ ...prev, ...updates }));
  };

  // Handle export
  const handleExport = (format: 'pdf' | 'csv' | 'json') => {
    logger.debug(`Exporting schedule in ${format} format`, 'pages', {});
    // Implementation would depend on export requirements
  };

  // Auto-optimize run order
  const handleOptimize = () => {
    const optimized = timeEngine.optimizeSchedule(classes);
    setClasses(optimized);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => startTransition(() => navigate(-1))}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trial
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Run Order Management</h1>
            <p className="text-muted-foreground">
              {trialId ? `Trial: ${trialId}` : 'No trial selected'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={stats.errorConflicts > 0 ? "destructive" : "default"}>
            {stats.totalConflicts} conflicts
          </Badge>
          <Badge variant="outline">
            {classes.length} classes
          </Badge>
          <Button onClick={handleOptimize} variant="outline">
            <Shuffle className="h-4 w-4 mr-2" />
            Optimize
          </Button>
          <Button onClick={() => handleExport('pdf')}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{classes.length}</div>
              <div className="text-sm text-muted-foreground">Classes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.totalDuration ? `${Math.floor(stats.totalDuration / 60)}h ${stats.totalDuration % 60}m` : '--'}
              </div>
              <div className="text-sm text-muted-foreground">Duration</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.judgeCount}</div>
              <div className="text-sm text-muted-foreground">Judges</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${stats.totalConflicts > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.totalConflicts}
              </div>
              <div className="text-sm text-muted-foreground">Conflicts</div>
            </div>
            <div className="text-center">
              <div className="text-sm">
                {stats.startTime ? stats.startTime.toTimeString().slice(0, 5) : '--:--'} - 
                {stats.endTime ? stats.endTime.toTimeString().slice(0, 5) : '--:--'}
              </div>
              <div className="text-sm text-muted-foreground">Schedule</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="runorder" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Run Order</span>
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Schedule</span>
              </TabsTrigger>
              <TabsTrigger value="personnel" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Personnel</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            </TabsList>

            {/* Run Order Tab - Drag and Drop Interface */}
            <TabsContent value="runorder" className="mt-6">
              <RunOrderBoard
                classes={classes}
                onReorder={handleReorder}
                onJudgeAssign={handleJudgeAssign}
                availableJudges={personnel.filter(p => p.roles.some(r => r.type === 'judge'))}
                trialStartTime={scheduleConfig.trialStartTime}
              />
            </TabsContent>

            {/* Schedule Tab - Visual Timeline */}
            <TabsContent value="schedule" className="mt-6">
              <ClassScheduleView
                classes={classes}
                config={scheduleConfig}
                onConfigChange={handleConfigChange}
                onExport={handleExport}
              />
            </TabsContent>

            {/* Personnel Tab - Judge and Steward Management */}
            <TabsContent value="personnel" className="mt-6">
              <PersonnelManager
                classes={classes}
                personnel={personnel}
                assignments={assignments}
                onPersonnelAdd={handlePersonnelAdd}
                onPersonnelUpdate={handlePersonnelUpdate}
                onPersonnelDelete={handlePersonnelDelete}
                onAssignmentChange={handleAssignmentChange}
              />
            </TabsContent>

            {/* Settings Tab - Trial Configuration */}
            <TabsContent value="settings" className="mt-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Trial Schedule Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Trial Start Time</label>
                        <input
                          type="time"
                          value={scheduleConfig.trialStartTime.toTimeString().slice(0, 5)}
                          onChange={(e) => {
                            const [hours, minutes] = e.target.value.split(':').map(Number);
                            const newStartTime = new Date(scheduleConfig.trialStartTime);
                            newStartTime.setHours(hours, minutes);
                            handleConfigChange({ trialStartTime: newStartTime });
                          }}
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Break Between Classes (minutes)</label>
                        <input
                          type="number"
                          value={scheduleConfig.defaultBreakDuration}
                          onChange={(e) => handleConfigChange({ defaultBreakDuration: Number(e.target.value) })}
                          className="w-full px-3 py-2 border rounded"
                          min={0}
                          max={60}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Judge Break Requirement (minutes)</label>
                        <input
                          type="number"
                          value={scheduleConfig.judgeBreakRequirement}
                          onChange={(e) => handleConfigChange({ judgeBreakRequirement: Number(e.target.value) })}
                          className="w-full px-3 py-2 border rounded"
                          min={0}
                          max={30}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Lunch Break Start Time</label>
                        <input
                          type="time"
                          value={scheduleConfig.lunchBreak?.startTime || '12:00'}
                          onChange={(e) => handleConfigChange({ 
                            lunchBreak: { 
                              ...scheduleConfig.lunchBreak!,
                              startTime: e.target.value 
                            }
                          })}
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Lunch Break Duration (minutes)</label>
                        <input
                          type="number"
                          value={scheduleConfig.lunchBreak?.duration || 60}
                          onChange={(e) => handleConfigChange({ 
                            lunchBreak: { 
                              ...scheduleConfig.lunchBreak!,
                              duration: Number(e.target.value) 
                            }
                          })}
                          className="w-full px-3 py-2 border rounded"
                          min={30}
                          max={120}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Export & Backup</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4">
                      <Button onClick={() => handleExport('pdf')} variant="outline">
                        Export PDF Schedule
                      </Button>
                      <Button onClick={() => handleExport('csv')} variant="outline">
                        Export CSV Data
                      </Button>
                      <Button onClick={() => handleExport('json')} variant="outline">
                        Backup JSON
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Critical Conflicts Warning */}
      {stats.errorConflicts > 0 && (
        <Card className="mt-6 border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <h4 className="font-medium text-red-900">Critical Scheduling Conflicts</h4>
                <p className="text-sm text-red-700 mt-1">
                  {stats.errorConflicts} critical conflict{stats.errorConflicts !== 1 ? 's' : ''} detected. 
                  These must be resolved before the trial can proceed.
                </p>
              </div>
              <Button variant="outline" className="ml-auto" onClick={handleOptimize}>
                Auto-Resolve
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};