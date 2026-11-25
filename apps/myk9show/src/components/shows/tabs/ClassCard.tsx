import { judgeNameOrUnsetLabel } from '@/utils/classJudgeDisplay';
import { cn } from '@/lib/utils';
import { Users, Clock, Hash } from 'lucide-react';
import { type ClassStatusValue } from '@myk9/core';
import { shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';
import { StatusBadge } from '@/components/status';

interface ClassInfo {
  id: string;
  element: string;
  level: string;
  section: string;
  judgeName: string;
  time: string;
  ring: number;
  status: ClassStatusValue;
  entryCount: number | null;
  userHasEntry?: boolean;
}

interface ClassCardProps {
  classInfo: ClassInfo;
  hideRing?: boolean;
  onClick?: () => void;
}

export function ClassCard({ classInfo, hideRing, onClick }: ClassCardProps) {
  return (
    <div
      data-class-id={classInfo.id}
      tabIndex={onClick ? 0 : -1}
      className={cn(
        'rounded-xl border border-border/50 bg-card p-4 space-y-3 transition-all',
        classInfo.userHasEntry && 'border-primary/30 bg-primary/5',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary/30'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      onKeyDown={onClick ? e => e.key === 'Enter' && onClick() : undefined}
    >
      {/* Header: element/level + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {classInfo.userHasEntry && (
            <span className="mb-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              My entry
            </span>
          )}
          <h3 className="font-semibold text-base text-card-foreground">{classInfo.element}</h3>
          <p className="text-sm text-muted-foreground">
            {classInfo.level}
            {shouldShowSection(classInfo) && <span className="ml-1">{classInfo.section}</span>}
          </p>
        </div>
        <StatusBadge
          family="class"
          status={classInfo.status}
          className="px-2 py-0.5 rounded text-xs font-medium shrink-0"
          variant="outline"
        />
      </div>

      {/* Judge */}
      {/* MYK9-1853: always shown; a class with no judge yet reads "To be announced". */}
      <p className="text-xs text-muted-foreground">
        Judge: {judgeNameOrUnsetLabel(classInfo.judgeName, { bare: true })}
      </p>

      {/* Time + Ring */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {classInfo.time && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {classInfo.time}
          </span>
        )}
        {!hideRing && classInfo.ring > 0 && (
          <span className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            Ring {classInfo.ring}
          </span>
        )}
      </div>

      {/* Entry count footer */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t border-border/30">
        <Users className="h-3 w-3" />
        <strong className="text-card-foreground">{classInfo.entryCount ?? '—'}</strong>{' '}
        {classInfo.entryCount == null ? 'entries unavailable' : 'entries'}
      </div>
    </div>
  );
}
