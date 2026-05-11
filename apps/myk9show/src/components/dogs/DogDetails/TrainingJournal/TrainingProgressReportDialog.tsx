import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { buildTrainingProgressReport, getProgressReportRows } from './trainingInsights';
import type { TrainingEntry } from './EnhancedTrainingJournal';

interface TrainingProgressReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: TrainingEntry[];
}

const progressLabels = {
  excellent: 'Breakthrough',
  good: 'Solid',
  fair: 'Needs Work',
  needs_work: 'Regression',
};

export function TrainingProgressReportDialog({
  open,
  onOpenChange,
  entries,
}: TrainingProgressReportDialogProps) {
  const report = buildTrainingProgressReport(entries);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Progress Report</DialogTitle>
        </DialogHeader>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a training session to see progress by skill, assessment, and time.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{report.totalSessions}</p>
                <p className="text-sm text-muted-foreground">Sessions</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{(report.totalMinutes / 60).toFixed(1)}h</p>
                <p className="text-sm text-muted-foreground">Training Time</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{report.bySkill.length}</p>
                <p className="text-sm text-muted-foreground">Skills</p>
              </div>
            </div>

            <section>
              <h3 className="mb-2 font-semibold">Sessions by Skill</h3>
              <div className="space-y-2">
                {report.bySkill.map(row => (
                  <div key={row.skill} className="flex items-center justify-between rounded-md border p-2">
                    <span>{row.skill}</span>
                    <Badge variant="outline">
                      {row.sessions} sessions · {row.minutes} min
                    </Badge>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-semibold">Assessment Distribution</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {getProgressReportRows(report).map(row => (
                  <div key={row.progress} className="rounded-md border p-2">
                    <p className="font-medium">{progressLabels[row.progress]}</p>
                    <p className="text-2xl font-bold">{row.count}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-semibold">Training Time Trends</h3>
              <div className="space-y-2">
                {report.monthlyMinutes.map(row => (
                  <div key={row.month} className="flex items-center justify-between rounded-md border p-2">
                    <span>{row.month}</span>
                    <Badge variant="secondary">
                      {row.sessions} sessions · {row.minutes} min
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
