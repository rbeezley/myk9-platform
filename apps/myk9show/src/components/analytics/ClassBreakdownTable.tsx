import { ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { msToDisplay } from '@/lib/timeUtils';
import type { ClassBreakdownEntry } from './analytics-utils';

interface ClassBreakdownTableProps {
  classes: ClassBreakdownEntry[];
}

function formatDate(isoDate: string): string {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(seconds: number | null): string {
  if (seconds == null) return '\u2014';
  return msToDisplay(seconds * 1000, 'hundredths');
}

export function ClassBreakdownTable({ classes }: ClassBreakdownTableProps) {
  if (classes.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Class Performance</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Trial</th>
              <th className="px-4 py-2 font-medium">Class</th>
              <th className="px-4 py-2 font-medium text-center">Entries</th>
              <th className="px-4 py-2 font-medium text-center">Q Rate</th>
              <th className="px-4 py-2 font-medium text-right">Best</th>
              <th className="px-4 py-2 font-medium text-right">Avg</th>
            </tr>
          </thead>
          <tbody>
            {classes.map(cls => (
              <tr key={cls.classId} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 whitespace-nowrap">
                  <span className="text-muted-foreground">{formatDate(cls.trialDate)}</span>
                  {cls.trialNumber && (
                    <span className="ml-1.5 text-xs text-muted-foreground/70">
                      #{cls.trialNumber}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 font-medium">{cls.className}</td>
                <td className="px-4 py-2 text-center">{cls.entryCount}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-medium">{Math.round(cls.qualificationRate * 100)}%</span>
                    <div className="h-1.5 w-16 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.round(cls.qualificationRate * 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {formatTime(cls.bestTime)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs">
                  {formatTime(cls.avgTime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
