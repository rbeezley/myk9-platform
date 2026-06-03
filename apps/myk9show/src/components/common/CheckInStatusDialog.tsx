import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/common/FormField';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckInStatus, CHECK_IN_STATUS_CONFIG } from '@/types/check-in-types';
import { CheckInStatusIndicator } from './CheckInStatusIndicator';
import { CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckInStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStatus: CheckInStatus;
  entryInfo: {
    armband: string;
    dogName: string;
    handlerName: string;
    className: string;
    classNumber: string;
  };
  onUpdateStatus: (status: CheckInStatus, notes?: string) => Promise<void>;
  readOnly?: boolean;
  userRole?: 'exhibitor' | 'judge' | 'secretary' | 'gate_steward';
}

export const CheckInStatusDialog: React.FC<CheckInStatusDialogProps> = ({
  open,
  onOpenChange,
  currentStatus,
  entryInfo,
  onUpdateStatus,
  readOnly = false,
  userRole = 'exhibitor',
}) => {
  const [selectedStatus, setSelectedStatus] = useState<CheckInStatus>(currentStatus);
  const [notes, setNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get status configurations for display

  // Filter available statuses based on user role
  const getAvailableStatuses = () => {
    const allStatuses = Object.values(CHECK_IN_STATUS_CONFIG).sort(
      (a, b) => a.priority - b.priority
    );

    switch (userRole) {
      case 'exhibitor':
        // Exhibitors can set their practical statuses
        return allStatuses.filter(config =>
          ['no-status', 'checked-in', 'conflict', 'pulled', 'at-gate'].includes(config.status)
        );
      case 'judge':
      case 'gate_steward':
      case 'secretary':
        // Officials can set all statuses
        return allStatuses;
      default:
        return allStatuses;
    }
  };

  const handleUpdateStatus = async () => {
    if (selectedStatus === currentStatus && !notes) {
      return; // No changes to save
    }

    setIsUpdating(true);
    setError(null);

    try {
      await onUpdateStatus(selectedStatus, notes.trim() || undefined);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update check-in status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    // Reset state when closing
    setSelectedStatus(currentStatus);
    setNotes('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card/95 backdrop-blur-xl border-0 shadow-2xl rounded-2xl p-4 sm:p-6 max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {readOnly ? 'Check-In Status' : 'Update Check-In Status'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            <span className="flex items-center gap-2 mt-2">
              <span className="font-medium">Armband #{entryInfo.armband}</span>
              <span>•</span>
              <span>{entryInfo.handlerName}</span>
            </span>
            <span className="block text-sm mt-2">
              {entryInfo.dogName} • {entryInfo.className} #{entryInfo.classNumber}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current Status Display - Compact */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Current Status</div>
            <div className="flex items-center gap-2">
              <CheckInStatusIndicator
                status={currentStatus}
                size="sm"
                showLabel={true}
                showTooltip={false}
              />
            </div>
          </div>

          {!readOnly && (
            <>
              {/* Status Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Select Status</Label>
                <RadioGroup
                  value={selectedStatus}
                  onValueChange={value => setSelectedStatus(value as CheckInStatus)}
                >
                  {getAvailableStatuses().map(config => (
                    <div
                      key={config.status}
                      className={cn(
                        'flex items-center space-x-3 p-2 rounded-lg border transition-all',
                        selectedStatus === config.status
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <RadioGroupItem value={config.status} id={config.status} />
                      <Label
                        htmlFor={config.status}
                        className="flex-1 cursor-pointer flex items-center gap-2"
                      >
                        <CheckInStatusIndicator
                          status={config.status}
                          size="sm"
                          showTooltip={false}
                        />
                        <div>
                          <div className="font-medium text-sm">{config.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {config.status === 'conflict'
                              ? 'Scheduled for 2 rings at same time'
                              : config.description}
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Notes Field - Compact for officials only */}
              {userRole !== 'exhibitor' && (
                <FormField label="Notes (Optional)" fieldId="notes">
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add notes..."
                    className="min-h-[60px] resize-none text-sm"
                  />
                </FormField>
              )}
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="pt-4 gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={handleClose} disabled={isUpdating}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button
              onClick={handleUpdateStatus}
              disabled={isUpdating || (selectedStatus === currentStatus && !notes)}
              className="bg-primary text-primary-foreground"
            >
              {isUpdating ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Update Status
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Quick action component for common status updates
export const CheckInQuickActions: React.FC<{
  currentStatus: CheckInStatus;
  onUpdateStatus: (status: CheckInStatus) => void;
  className?: string;
}> = ({ currentStatus, onUpdateStatus, className }) => {
  const quickActions = [
    { from: 'no-status' as CheckInStatus, to: 'checked-in' as CheckInStatus, label: 'Check In' },
    {
      from: 'checked-in' as CheckInStatus,
      to: 'come-to-gate' as CheckInStatus,
      label: 'Call to Gate',
    },
    { from: 'come-to-gate' as CheckInStatus, to: 'at-gate' as CheckInStatus, label: 'At Gate' },
  ];

  const availableAction = quickActions.find(action => action.from === currentStatus);

  if (!availableAction) return null;

  return (
    <Button
      size="sm"
      onClick={() => onUpdateStatus(availableAction.to)}
      className={cn('bg-primary text-primary-foreground', className)}
    >
      <ArrowRight className="h-4 w-4 mr-1" />
      {availableAction.label}
    </Button>
  );
};
