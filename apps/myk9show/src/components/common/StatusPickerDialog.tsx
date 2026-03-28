import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import { CHECKIN_STATUS, EXHIBITOR_ALLOWED_STATUSES, CHECKIN_STATUSES } from '@myk9/core';
import { CHECKIN_ICON_MAP } from './checkin-icon-map';

interface StatusPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: {
    entryId: string;
    armband: string;
    dogName: string;
    handlerName: string;
  };
  currentStatus: CheckInStatus;
  onStatusChange: (entryId: string, newStatus: CheckInStatus) => void;
  isStaff: boolean;
  disabled?: boolean;
}

export function StatusPickerDialog({
  open,
  onOpenChange,
  entry,
  currentStatus,
  onStatusChange,
  isStaff,
  disabled,
}: StatusPickerDialogProps) {
  const visibleStatuses = isStaff ? CHECKIN_STATUSES : EXHIBITOR_ALLOWED_STATUSES;

  const statusConfigs = useMemo(
    () => Object.values(CHECKIN_STATUS).filter(config => visibleStatuses.includes(config.value)),
    [visibleStatuses]
  );

  function handlePick(status: CheckInStatus) {
    onStatusChange(entry.entryId, status);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ArmbandBadge armband={entry.armband} className="size-11 rounded-lg text-base" />
            <div className="min-w-0">
              <DialogTitle className="text-base truncate">{entry.dogName}</DialogTitle>
              <DialogDescription className="text-sm truncate">
                {entry.handlerName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {disabled ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Self check-in is disabled for this class. Please check in at the secretary table.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {statusConfigs.map(config => {
              const Icon = CHECKIN_ICON_MAP[config.icon];
              const isActive = config.value === currentStatus;

              return (
                <button
                  key={config.value}
                  type="button"
                  onClick={() => handlePick(config.value)}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                    'hover:bg-accent/50',
                    isActive ? 'ring-2 ring-primary border-primary bg-accent/30' : 'border-border'
                  )}
                >
                  <div
                    className="shrink-0 size-9 rounded-full flex items-center justify-center mt-0.5"
                    style={{
                      backgroundColor: `var(${config.colorVar})`,
                      color: `var(${config.textColorVar})`,
                    }}
                  >
                    {Icon && <Icon size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{config.label}</div>
                    <div className="text-xs text-muted-foreground leading-tight">
                      {config.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
