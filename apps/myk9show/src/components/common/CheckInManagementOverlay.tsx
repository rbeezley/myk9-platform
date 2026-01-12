import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import {
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  CheckInStatus, 
  CHECK_IN_STATUS_CONFIG 
} from '@/types/check-in-types';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Eye,
  ArrowRight,
  Users,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EntryForCheckIn {
  id: string;
  armband: string;
  dogName: string;
  handlerName: string;
  checkInStatus?: CheckInStatus;
  navigationStatus: 'pending' | 'in-progress' | 'completed';
}

interface CheckInManagementOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: EntryForCheckIn[];
  onUpdateStatus: (entryId: string, status: CheckInStatus) => Promise<void>;
}

const STATUS_ICONS = {
  'none': User,
  'checked-in': CheckCircle2,
  'conflict': AlertTriangle,
  'pulled': XCircle,
  'at-gate': Eye,
  'go-to-gate': ArrowRight
};

const STATUS_COLORS = {
  'none': 'text-muted-foreground',
  'checked-in': 'text-[#007AFF]',
  'conflict': 'text-[#FF9500]',
  'pulled': 'text-[#FF3B30]',
  'at-gate': 'text-[#34C759]',
  'go-to-gate': 'text-[#5856D6]'
};

const STATUS_BADGE_COLORS = {
  'none': 'bg-muted/50 text-muted-foreground border-muted',
  'checked-in': 'bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20',
  'conflict': 'bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20',
  'pulled': 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20',
  'at-gate': 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20',
  'go-to-gate': 'bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20'
};

export const CheckInManagementOverlay: React.FC<CheckInManagementOverlayProps> = ({
  open,
  onOpenChange,
  entries,
  onUpdateStatus
}) => {
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, CheckInStatus>>({});

  // Filter to only show pending entries (not yet scored)
  const pendingEntries = entries.filter(entry => entry.navigationStatus === 'pending');

  // Get available statuses based on user role
  const getAvailableStatuses = (): CheckInStatus[] => {
    return ['none', 'checked-in', 'conflict', 'pulled', 'at-gate', 'go-to-gate'];
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
    const config = CHECK_IN_STATUS_CONFIG[status];
    return config?.label || status;
  };

  const getCurrentStatus = (entry: EntryForCheckIn): CheckInStatus => {
    return localStatuses[entry.id] ?? entry.checkInStatus ?? 'none';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card/95 backdrop-blur-xl border-0 shadow-2xl rounded-2xl p-0 max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <DialogTitle className="text-2xl font-semibold flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-r from-[#007AFF]/10 to-[#5856D6]/10 rounded-xl">
              <Users className="h-6 w-6 text-[#007AFF]" />
            </div>
            Manage Check-In Status
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            Update check-in status for pending entries. Status will be replaced by qualification result after scoring.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(90vh-180px)] px-6">
          <div className="py-4">
            {pendingEntries.length === 0 ? (
              <div className="text-center py-20">
                <div className="bg-muted/30 rounded-full p-8 mb-6 inline-block">
                  <Users className="h-16 w-16 text-muted-foreground/50" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  No Pending Entries
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  All entries have been scored or there are no entries to manage.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingEntries.map((entry) => {
                  const currentStatus = getCurrentStatus(entry);
                  const StatusIcon = STATUS_ICONS[currentStatus];

                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-background/50 border border-border/50 rounded-xl hover:bg-muted/20 hover:border-border transition-all duration-200"
                    >
                      {/* Entry Info */}
                      <div className="flex-1 flex items-center gap-4">
                        {/* Armband */}
                        <div className="flex-shrink-0">
                          <div className="font-mono text-lg font-bold text-[#007AFF] bg-[#007AFF]/10 rounded-lg px-3 py-1.5">
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
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "font-medium border",
                              STATUS_BADGE_COLORS[currentStatus]
                            )}
                          >
                            <StatusIcon className="h-3.5 w-3.5 mr-1.5" />
                            {getStatusDisplayName(currentStatus)}
                          </Badge>
                        </div>
                      </div>

                      {/* Status Dropdown */}
                      <div className="sm:w-48">
                        <Select
                          value={currentStatus}
                          onValueChange={(value: CheckInStatus) => handleStatusUpdate(entry.id, value)}
                          disabled={isUpdating === entry.id}
                        >
                          <SelectTrigger 
                            className="w-full h-10 bg-background border-border/50 hover:border-border focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all duration-200"
                          >
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent className="bg-card/95 backdrop-blur-xl border-border shadow-xl">
                            {availableStatuses.map((status) => {
                              const Icon = STATUS_ICONS[status];
                              return (
                                <SelectItem 
                                  key={status} 
                                  value={status}
                                  className="cursor-pointer hover:bg-muted/50 focus:bg-muted/50"
                                >
                                  <div className="flex items-center gap-2">
                                    <Icon className={cn("h-4 w-4", STATUS_COLORS[status])} />
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
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-gradient-to-r from-[#007AFF] to-[#5856D6] text-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 min-w-[100px]"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};