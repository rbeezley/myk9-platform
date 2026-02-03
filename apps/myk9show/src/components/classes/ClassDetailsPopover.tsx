import { useState } from 'react';
import { Clock, Eye, Smartphone, User, Activity, Hash } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useIsTouchDevice } from '@myk9/scoring-ui';
import { getClassStatusDisplay } from '@myk9/core';

export interface ClassDetailsData {
  id: string;
  className: string;
  status: string;
  judgeName?: string | undefined;
  entryCount: number;
  completedEntries?: number | undefined;
  timeLimits?: string[] | undefined;
  resultsVisibility?: 'immediate' | 'after_class' | 'after_review' | undefined;
  checkInMode?: 'self' | 'table' | undefined;
}

interface ClassDetailsPopoverProps {
  data: ClassDetailsData;
  children: React.ReactNode;
}

function ClassDetailsContent({ data }: { data: ClassDetailsData }) {
  const statusDisplay = getClassStatusDisplay(data.status);
  const completedCount = data.completedEntries ?? 0;

  const visibilityLabels: Record<string, string> = {
    immediate: 'Immediately',
    after_class: 'After Class',
    after_review: 'After Review',
  };

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          <span>Status</span>
        </div>
        <Badge
          variant="secondary"
          className={`${statusDisplay.bgClass} ${statusDisplay.textClass}`}
        >
          {statusDisplay.label}
        </Badge>
      </div>

      {/* Entry Progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Hash className="h-3.5 w-3.5" />
          <span>Entries</span>
        </div>
        <span className="text-sm font-medium">
          {completedCount} / {data.entryCount} completed
        </span>
      </div>

      {/* Judge */}
      {data.judgeName && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>Judge</span>
          </div>
          <span className="text-sm font-medium">{data.judgeName}</span>
        </div>
      )}

      {/* Time Limits */}
      {data.timeLimits && data.timeLimits.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Max Time</span>
          </div>
          <span className="text-sm font-medium">
            {data.timeLimits.length === 1
              ? data.timeLimits[0]
              : data.timeLimits.map((t, i) => `(${i + 1}) ${t}`).join(' ')}
          </span>
        </div>
      )}

      {/* Results Visibility */}
      {data.resultsVisibility && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            <span>Results</span>
          </div>
          <span className="text-sm font-medium">
            {visibilityLabels[data.resultsVisibility] || data.resultsVisibility}
          </span>
        </div>
      )}

      {/* Check-in Mode */}
      {data.checkInMode && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" />
            <span>Check-in</span>
          </div>
          <span className="text-sm font-medium">
            {data.checkInMode === 'self' ? 'Self (App)' : 'At Table'}
          </span>
        </div>
      )}

      {/* Class ID (subtle) */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-xs text-muted-foreground">Class ID</span>
        <span className="text-xs text-muted-foreground font-mono">
          {data.id.slice(0, 8)}...
        </span>
      </div>
    </div>
  );
}

export function ClassDetailsPopover({ data, children }: ClassDetailsPopoverProps) {
  const isTouchDevice = useIsTouchDevice();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Mobile: Use Dialog (sheet-like)
  if (isTouchDevice) {
    return (
      <>
        <div onClick={() => setDialogOpen(true)}>{children}</div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{data.className}</DialogTitle>
            </DialogHeader>
            <ClassDetailsContent data={data} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Desktop: Use Popover
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="mb-3 font-semibold">{data.className}</div>
        <ClassDetailsContent data={data} />
      </PopoverContent>
    </Popover>
  );
}
