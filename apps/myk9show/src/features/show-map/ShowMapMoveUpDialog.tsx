import { useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ShowMapNode } from './showMapTypes';

export interface ShowMapMoveUpTarget {
  id: string;
  label: string;
  detail?: string | undefined;
}

export interface ShowMapMoveUpConfirmInput {
  targetClassId: string;
  reason?: string | undefined;
}

interface ShowMapMoveUpDialogProps {
  open: boolean;
  node?: ShowMapNode | undefined;
  currentClass?: ShowMapNode | undefined;
  targets: ShowMapMoveUpTarget[];
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: ShowMapMoveUpConfirmInput) => void;
}

export function ShowMapMoveUpDialog({
  open,
  node,
  currentClass,
  targets,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: ShowMapMoveUpDialogProps) {
  const [targetClassId, setTargetClassId] = useState('');
  const [reason, setReason] = useState('');
  const display = node?.entryDisplay;
  const entryName = display?.dogName ?? node?.label ?? 'this entry';
  const armband = display?.armband;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTargetClassId('');
      setReason('');
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    if (!targetClassId) return;
    onConfirm({ targetClassId, reason: reason.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
            Move up entry
          </DialogTitle>
          <DialogDescription>Move this entry into another class.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-4 text-sm">
            <div className="font-medium">{entryName}</div>
            {armband && <div className="text-muted-foreground">Armband {armband}</div>}
            {currentClass && (
              <div className="text-muted-foreground">Current class: {currentClass.label}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Target class</Label>
            <Select value={targetClassId} onValueChange={setTargetClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {targets.map(target => (
                  <SelectItem key={target.id} value={target.id}>
                    <span className="flex flex-col">
                      <span>{target.label}</span>
                      {target.detail && (
                        <span className="text-xs text-muted-foreground">{target.detail}</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {targets.length === 0 && (
              <p className="text-sm text-muted-foreground">No other classes are available.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="move-up-reason">Reason</Label>
            <Textarea
              id="move-up-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Qualified in this class, secretary correction..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !targetClassId || targets.length === 0}
          >
            {isSubmitting ? 'Moving...' : 'Move entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
