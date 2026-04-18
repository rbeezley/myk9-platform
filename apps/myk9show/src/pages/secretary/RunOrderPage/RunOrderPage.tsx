import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { Calendar, Users, Clock, Settings } from 'lucide-react';

const RUN_ORDER_TABS: PrimaryTabDef[] = [
  { id: 'runorder', label: 'Run Order', icon: Calendar },
  { id: 'schedule', label: 'Schedule', icon: Clock },
  { id: 'personnel', label: 'Personnel', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

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
          <PrimaryTabs tabs={RUN_ORDER_TABS} value={activeTab} onValueChange={setActiveTab}>

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
          </PrimaryTabs>
        </CardContent>
      </Card>

      <RunOrderConflictsWarning
        errorConflicts={stats.errorConflicts}
        onAutoResolve={handleOptimize}
      />
    </div>
  );
};
