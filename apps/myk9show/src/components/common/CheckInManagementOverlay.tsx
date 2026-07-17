import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckInStatus } from '@/types/check-in-types';
import { Users } from 'lucide-react';
import { StatusBadge, StatusIcon, getStatusDescriptor } from '@/components/status';

interface EntryForCheckIn {
  id: string;
  armband: string;
  dogName: string;
  handlerName: string;
  checkInStatus?: CheckInStatus | undefined;
  navigationStatus: 'pending' | 'in-progress' | 'completed';
}

interface CheckInManagementOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: EntryForCheckIn[];
  onUpdateStatus: (entryId: string, status: CheckInStatus) => Promise<void>;
}

export const CheckInManagementOverlay: React.FC<CheckInManagementOverlayProps> = ({
  open,
  onOpenChange,
  entries,
  onUpdateStatus,
}) => {
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, CheckInStatus>>({});

  // Filter to only show pending entries (not yet scored)
  const pendingEntries = entries.filter(entry => entry.navigationStatus === 'pending');

  // Get available statuses based on user role
  const getAvailableStatuses = (): CheckInStatus[] => {
    return ['no-status', 'checked-in', 'conflict', 'pulled', 'at-gate', 'come-to-gate'];
  };

  const availableStatuses = getAvailableStatuses();

  const handleStatusUpdate = async (entryId: string, status: CheckInStatus) => {
    setIsUpdating(entryId);
    setLocalStatuses(prev => ({ ...prev, [entryId]: status }));

    try {
      await onUpdateStatus(entryId, status);
    } catch (error) {
      logger.error('Failed to update check-in status:', 'components', {}, error as Error);
      // Revert on error
      setLocalStatuses(prev => {
        const newState = { ...prev };
        delete newState[entryId];
        return newState;
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const getStatusDisplayName = (status: CheckInStatus): string => {
    return getStatusDescriptor('entry', status).label;
  };

  const getCurrentStatus = (entry: EntryForCheckIn): CheckInStatus => {
    return localStatuses[entry.id] ?? entry.checkInStatus ?? 'no-status';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card/95 backdrop-blur-xl border-0 shadow-2xl rounded-2xl p-0 max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="text-2xl font-semibold flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Users className="h-6 w-6 text-primary" />
            </div>
            Manage Check-In Status
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            Update check-in status for pending entries. Status will be replaced by qualification
            result after scoring.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(90vh-180px)] px-6">
          <div className="py-4">
            {pendingEntries.length === 0 ? (
              <div className="text-center py-20">
                <div className="bg-muted/30 rounded-full p-8 mb-6 inline-block">
                  <Users className="h-16 w-16 text-muted-foreground/50" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Pending Entries</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  All entries have been scored or there are no entries to manage.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingEntries.map(entry => {
                  const currentStatus = getCurrentStatus(entry);
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-background/50 border border-border/50 rounded-xl hover:bg-muted/20 hover:border-border transition-all duration-200"
                    >
                      {/* Entry Info */}
                      <div className="flex-1 flex items-center gap-4">
                        {/* Armband */}
                        <div className="flex-shrink-0">
                          <div className="font-mono text-lg font-bold text-primary bg-primary/10 rounded-lg px-3 py-1.5">
                            #{entry.armband}
                          </div>
                        </div>

                        {/* Dog/Handler Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate">
                            {entry.dogName}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {entry.handlerName}
                          </div>
                        </div>

                        {/* Current Status Badge */}
                        <div className="flex-shrink-0">
                          <StatusBadge
                            family="entry"
                            status={currentStatus}
                            variant="outline"
                            className="font-medium"
                          />
                        </div>
                      </div>

                      {/* Status Dropdown */}
                      <div className="sm:w-48">
                        <Select
                          value={currentStatus}
                          onValueChange={(value: CheckInStatus) =>
                            handleStatusUpdate(entry.id, value)
                          }
                          disabled={isUpdating === entry.id}
                        >
                          <SelectTrigger className="w-full h-10 bg-background border-border/50 hover:border-border focus:border-primary focus:ring-2 focus:ring-ring transition-all duration-200">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent className="bg-card/95 backdrop-blur-xl border-border shadow-xl">
                            {availableStatuses.map(status => {
                              return (
                                <SelectItem
                                  key={status}
                                  value={status}
                                  className="cursor-pointer hover:bg-muted/50 focus:bg-muted/50"
                                >
                                  <div className="flex items-center gap-2">
                                    <StatusIcon
                                      family="entry"
                                      status={status}
                                      size="md"
                                      decorative
                                    />
                                    <span>{getStatusDisplayName(status)}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 bg-muted/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {pendingEntries.length} pending {pendingEntries.length === 1 ? 'entry' : 'entries'}
            </p>
            <Button onClick={() => onOpenChange(false)} className="min-w-[100px]">
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
