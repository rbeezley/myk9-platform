import { useState } from 'react';
import { MineToggle } from '@/components/common/MineToggle';
import { EmptyState } from '@/components/common/EmptyState';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClassInfo {
  id: string;
  name: string;
  element: string;
  level: string;
  time: string;
  ring: number;
  status: string;
  entryCount: number;
  userHasEntry: boolean;
}

interface ClassesTabProps {
  classes: ClassInfo[];
  userHasEntries: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  in_progress: 'bg-green-500/10 text-green-600',
  pending: 'bg-muted text-muted-foreground',
  completed: 'bg-primary/10 text-primary',
  not_started: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  pending: 'Pending',
  completed: 'Completed',
  not_started: 'Not Started',
};

export function ClassesTab({ classes, userHasEntries }: ClassesTabProps) {
  const [isMine, setIsMine] = useState(userHasEntries);

  const filteredClasses = isMine ? classes.filter(c => c.userHasEntry) : classes;
  const mineCount = classes.filter(c => c.userHasEntry).length;

  if (classes.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No classes scheduled"
        description="Classes for this show haven't been set up yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      <MineToggle
        isMine={isMine}
        onToggle={() => setIsMine(!isMine)}
        allLabel="All Classes"
        mineLabel="My Classes"
        allCount={classes.length}
        mineCount={mineCount}
        hidden={!userHasEntries}
      />

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Element</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Level</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                Time
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                Ring
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Entries</th>
            </tr>
          </thead>
          <tbody>
            {filteredClasses.map(cls => (
              <tr
                key={cls.id}
                className="border-b border-border/20 hover:bg-muted/10 transition-colors"
              >
                <td className="px-4 py-3 font-medium">{cls.element}</td>
                <td className="px-4 py-3">{cls.level}</td>
                <td className="px-4 py-3 hidden sm:table-cell">{cls.time}</td>
                <td className="px-4 py-3 hidden sm:table-cell">{cls.ring}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      STATUS_STYLES[cls.status] || STATUS_STYLES.pending
                    )}
                  >
                    {STATUS_LABELS[cls.status] || cls.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{cls.entryCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
