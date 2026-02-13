import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw } from 'lucide-react';
import type { CheckInEntry } from '@/types/offline-checkin-types';
import type { CheckInStatus } from '@/types/check-in-types';

interface CheckInFormState {
  checkInStatus: CheckInStatus;
  handlerChange: string;
  specialRequests: string;
  scratchReason: string;
  notes: string;
}

interface CheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: CheckInEntry;
  formState: CheckInFormState;
  onFormStateChange: (updates: Partial<CheckInFormState>) => void;
  onCheckIn: () => void;
  loading: boolean;
}

export type { CheckInFormState };

export const CheckInDialog: React.FC<CheckInDialogProps> = ({
  open,
  onOpenChange,
  entry,
  formState,
  onFormStateChange,
  onCheckIn,
  loading,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check In Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entry Details */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="font-medium">{entry.dogName}</div>
            <div className="text-sm text-muted-foreground">
              Handler: {entry.handlerName}
            </div>
            <div className="text-sm text-muted-foreground">
              Armband: #{entry.armband} • Class: {entry.className}
            </div>
          </div>

          {/* Status Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={formState.checkInStatus} onValueChange={(value) => onFormStateChange({ checkInStatus: value as CheckInStatus })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checked-in">Checked In</SelectItem>
                <SelectItem value="at-gate">At Gate</SelectItem>
                <SelectItem value="go-to-gate">Go to Gate</SelectItem>
                <SelectItem value="pulled">Scratch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Additional Fields */}
          {formState.checkInStatus === 'pulled' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Scratch Reason</label>
              <Textarea
                value={formState.scratchReason}
                onChange={(e) => onFormStateChange({ scratchReason: e.target.value })}
                placeholder="Reason for scratching..."
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Handler Change (Optional)</label>
            <Input
              value={formState.handlerChange}
              onChange={(e) => onFormStateChange({ handlerChange: e.target.value })}
              placeholder="New handler name..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Special Requests (Optional)</label>
            <Textarea
              value={formState.specialRequests}
              onChange={(e) => onFormStateChange({ specialRequests: e.target.value })}
              placeholder="Any special requests..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (Optional)</label>
            <Textarea
              value={formState.notes}
              onChange={(e) => onFormStateChange({ notes: e.target.value })}
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onCheckIn} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
            Check In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
