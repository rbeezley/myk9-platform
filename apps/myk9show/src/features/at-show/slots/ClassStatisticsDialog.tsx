/**
 * ClassStatisticsDialog — the class's numbers at a glance (MYK9-1502): entries,
 * scored, qualified rate, fastest and average time. Computed from the replicated
 * entries by the one `computeClassStatistics`, so it works offline.
 */
import { useMemo } from 'react';
import type React from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClassDialogShell } from './ClassDialogShell';
import { useLiveClassEntries } from '../useLiveClassEntries';
import { computeClassStatistics, formatStatTime } from '../classStatistics';

interface ClassStatisticsDialogProps {
  classId: string;
  className: string;
  onClose: () => void;
}

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="rounded-lg border border-border bg-muted/40 p-3">
    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="text-2xl font-semibold tabular-nums text-foreground">{value}</dd>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export const ClassStatisticsDialog: React.FC<ClassStatisticsDialogProps> = ({
  classId,
  className,
  onClose,
}) => {
  const { rows, failed, retry } = useLiveClassEntries(classId);
  const stats = useMemo(() => (rows ? computeClassStatistics(rows) : null), [rows]);

  return (
    <ClassDialogShell icon={BarChart3} eyebrow="Statistics" className={className} onClose={onClose}>
      {!classId ? (
        <p className="text-sm text-muted-foreground">
          Statistics are per class. Open a single class to see them.
        </p>
      ) : failed ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">
            Couldn&apos;t read this class&apos;s entries on this device.
          </p>
          <Button variant="outline" className="min-h-11" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : !stats ? (
        <p className="text-sm text-muted-foreground">Loading statistics…</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Entries" value={String(stats.entries)} />
          <Stat label="Scored" value={`${stats.scored} of ${stats.entries}`} />
          <Stat
            label="Qualified"
            value={stats.qualifiedRate === null ? '—' : `${stats.qualifiedRate}%`}
            hint={
              stats.qualifiedRate === null ? 'Nothing scored yet' : `${stats.qualified} qualified`
            }
          />
          <Stat
            label="Fastest time"
            value={stats.fastestSeconds === null ? '—' : formatStatTime(stats.fastestSeconds)}
          />
          <Stat
            label="Average time"
            value={stats.averageSeconds === null ? '—' : formatStatTime(stats.averageSeconds)}
            hint="Qualified runs"
          />
        </dl>
      )}
    </ClassDialogShell>
  );
};
