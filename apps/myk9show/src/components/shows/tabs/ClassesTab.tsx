import { useState, useMemo } from 'react';
import { MineToggle } from '@/components/common/MineToggle';
import { EmptyState } from '@/components/common/EmptyState';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CLASS_STATUS_CONFIG } from '@/constants/live-status-config';
import { parseLocalDateString } from '@/utils/dateLocal';

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
  trialDate?: string;
  trialNumber?: string;
  trialName?: string;
}

interface ClassesTabProps {
  classes: ClassInfo[];
  userHasEntries: boolean;
  hideRing?: boolean;
}

function formatTrialDate(dateStr: string): string {
  const date = parseLocalDateString(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ClassesTab({ classes, userHasEntries, hideRing = false }: ClassesTabProps) {
  const [isMine, setIsMine] = useState(userHasEntries);

  const filteredClasses = isMine ? classes.filter(c => c.userHasEntry) : classes;
  const mineCount = classes.filter(c => c.userHasEntry).length;

  // Group classes by trial (date + number)
  const groupedByTrial = useMemo(() => {
    const groups = new Map<string, { label: string; classes: ClassInfo[] }>();
    for (const cls of filteredClasses) {
      const key = `${cls.trialDate || ''}|${cls.trialNumber || ''}`;
      if (!groups.has(key)) {
        const datePart = cls.trialDate ? formatTrialDate(cls.trialDate) : '';
        const trialPart = cls.trialName || (cls.trialNumber ? `Trial ${cls.trialNumber}` : '');
        const label = [datePart, trialPart].filter(Boolean).join(' — ');
        groups.set(key, { label: label || 'Unassigned', classes: [] });
      }
      groups.get(key)!.classes.push(cls);
    }
    return Array.from(groups.values());
  }, [filteredClasses]);

  const hasMultipleTrials = groupedByTrial.length > 1;

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
              {!hideRing && (
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                  Ring
                </th>
              )}
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Entries</th>
            </tr>
          </thead>
          <tbody>
            {groupedByTrial.map(group => (
              <>
                {hasMultipleTrials && (
                  <tr key={`header-${group.label}`} className="bg-muted/20">
                    <td
                      colSpan={hideRing ? 5 : 6}
                      className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {group.label}
                    </td>
                  </tr>
                )}
                {group.classes.map(cls => (
                  <tr
                    key={cls.id}
                    className="border-b border-border/20 hover:bg-muted/10 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{cls.element}</td>
                    <td className="px-4 py-3">{cls.level}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">{cls.time}</td>
                    {!hideRing && <td className="px-4 py-3 hidden sm:table-cell">{cls.ring}</td>}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          (
                            CLASS_STATUS_CONFIG[cls.status as keyof typeof CLASS_STATUS_CONFIG] ??
                            CLASS_STATUS_CONFIG.not_started
                          ).style
                        )}
                      >
                        {
                          (
                            CLASS_STATUS_CONFIG[cls.status as keyof typeof CLASS_STATUS_CONFIG] ??
                            CLASS_STATUS_CONFIG.not_started
                          ).label
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{cls.entryCount}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
