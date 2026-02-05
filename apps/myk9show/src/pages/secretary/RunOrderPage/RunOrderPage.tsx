import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Users, Clock, Settings } from 'lucide-react';

import { RunOrderBoard } from '@/components/templates/secretary/RunOrderBoard';
import { ClassScheduleView } from '@/components/templates/secretary/ClassScheduleView';
import { PersonnelManager } from '@/components/templates/secretary/PersonnelManager';

import { useRunOrderPageData } from './useRunOrderPageData';
import { RunOrderHeader } from './RunOrderHeader';
import { RunOrderQuickStats } from './RunOrderQuickStats';
import { RunOrderSettingsTab } from './RunOrderSettingsTab';
import { RunOrderConflictsWarning } from './RunOrderConflictsWarning';

export const RunOrderPage: React.FC = () => {
  const { trialId } = useParams<{ trialId: string }>();

  const {
    activeTab,
    setActiveTab,
    classes,
    personnel,
    assignments,
    scheduleConfig,
    stats,
    availableJudges,
    handleReorder,
    handleJudgeAssign,
    handleAssignmentChange,
    handlePersonnelAdd,
    handlePersonnelUpdate,
    handlePersonnelDelete,
    handleConfigChange,
    handleExport,
    handleOptimize,
  } = useRunOrderPageData(trialId);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <RunOrderHeader
        trialId={trialId}
        classCount={classes.length}
        totalConflicts={stats.totalConflicts}
        errorConflicts={stats.errorConflicts}
        onOptimize={handleOptimize}
        onExport={handleExport}
      />

      <RunOrderQuickStats
        classCount={classes.length}
        stats={stats}
      />

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

            <TabsContent value="runorder" className="mt-6">
              <RunOrderBoard
                classes={classes}
                onReorder={handleReorder}
                onJudgeAssign={handleJudgeAssign}
                availableJudges={availableJudges}
                trialStartTime={scheduleConfig.trialStartTime}
              />
            </TabsContent>

            <TabsContent value="schedule" className="mt-6">
              <ClassScheduleView
                classes={classes}
                config={scheduleConfig}
                onConfigChange={handleConfigChange}
                onExport={handleExport}
              />
            </TabsContent>

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

            <TabsContent value="settings" className="mt-6">
              <RunOrderSettingsTab
                config={scheduleConfig}
                onConfigChange={handleConfigChange}
                onExport={handleExport}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <RunOrderConflictsWarning
        errorConflicts={stats.errorConflicts}
        onAutoResolve={handleOptimize}
      />
    </div>
  );
};
