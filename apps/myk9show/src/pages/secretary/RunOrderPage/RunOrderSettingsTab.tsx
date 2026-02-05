import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ScheduleConfig } from '@/lib/timeCalculation';

interface RunOrderSettingsTabProps {
  config: ScheduleConfig;
  onConfigChange: (updates: Partial<ScheduleConfig>) => void;
  onExport: (format: 'pdf' | 'csv' | 'json') => void;
}

export const RunOrderSettingsTab: React.FC<RunOrderSettingsTabProps> = ({
  config,
  onConfigChange,
  onExport,
}) => {
  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(':').map(Number);
    const newStartTime = new Date(config.trialStartTime);
    newStartTime.setHours(hours, minutes);
    onConfigChange({ trialStartTime: newStartTime });
  };

  const handleLunchStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({
      lunchBreak: {
        ...config.lunchBreak!,
        startTime: e.target.value
      }
    });
  };

  const handleLunchDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({
      lunchBreak: {
        ...config.lunchBreak!,
        duration: Number(e.target.value)
      }
    });
  };

  return (
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
                value={config.trialStartTime.toTimeString().slice(0, 5)}
                onChange={handleStartTimeChange}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Break Between Classes (minutes)</label>
              <input
                type="number"
                value={config.defaultBreakDuration}
                onChange={(e) => onConfigChange({ defaultBreakDuration: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
                min={0}
                max={60}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Judge Break Requirement (minutes)</label>
              <input
                type="number"
                value={config.judgeBreakRequirement}
                onChange={(e) => onConfigChange({ judgeBreakRequirement: Number(e.target.value) })}
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
                value={config.lunchBreak?.startTime || '12:00'}
                onChange={handleLunchStartChange}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Lunch Break Duration (minutes)</label>
              <input
                type="number"
                value={config.lunchBreak?.duration || 60}
                onChange={handleLunchDurationChange}
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
            <Button onClick={() => onExport('pdf')} variant="outline">
              Export PDF Schedule
            </Button>
            <Button onClick={() => onExport('csv')} variant="outline">
              Export CSV Data
            </Button>
            <Button onClick={() => onExport('json')} variant="outline">
              Backup JSON
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
