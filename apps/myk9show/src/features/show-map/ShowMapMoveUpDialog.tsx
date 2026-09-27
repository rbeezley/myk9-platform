import { useState } from 'react';
import { ArrowUpCircle, Undo2 } from 'lucide-react';
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
import { MOVE_UP_REVERSAL_REFUSALS, type MoveUpReversalState } from './moveUpSupersession';

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
  /**
   * MYK9-640. Whether this entry can be put back where it came from, and why
   * not when it cannot. `undefined` while the answer is still being read.
   */
  reversal?: MoveUpReversalState | undefined;
  isReversing?: boolean | undefined;
  onMoveBack?: (() => void) | undefined;
}

export function ShowMapMoveUpDialog({
  open,
  node,
  currentClass,
  targets,
  isSubmitting,
  onOpenChange,
  onConfirm,
  reversal,
  isReversing = false,
  onMoveBack,
}: ShowMapMoveUpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
            Move up entry
          </DialogTitle>
          <DialogDescription>Move this entry into another class.</DialogDescription>
        </DialogHeader>

        {/*
         * MYK9-821: keyed on the entry, not just mounted once. The Reason and
         * target-class fields are local state below, and the dialog can go
         * from open-on-entry-A straight to open-on-entry-B without this
         * component ever unmounting (a successful move-up closes it by
         * flipping the `open` prop from the parent, which Base UI's
         * `onOpenChange` never sees). Keying on the node id forces a fresh
         * instance — and fresh state — on every entry the dialog opens for.
         */}
        <ShowMapMoveUpDialogFields
          key={node?.id ?? 'none'}
          node={node}
          currentClass={currentClass}
          targets={targets}
          isSubmitting={isSubmitting}
          onOpenChange={onOpenChange}
          onConfirm={onConfirm}
          reversal={reversal}
          isReversing={isReversing}
          onMoveBack={onMoveBack}
        />
      </DialogContent>
    </Dialog>
  );
}

type ShowMapMoveUpDialogFieldsProps = Omit<ShowMapMoveUpDialogProps, 'open'>;

function ShowMapMoveUpDialogFields({
  node,
  currentClass,
  targets,
  isSubmitting,
  onOpenChange,
  onConfirm,
  reversal,
  isReversing = false,
  onMoveBack,
}: ShowMapMoveUpDialogFieldsProps) {
  const [targetClassId, setTargetClassId] = useState('');
  const [reason, setReason] = useState('');
  const display = node?.entryDisplay;
  const entryName = display?.dogName ?? node?.label ?? 'this entry';
  const armband = display?.armband;

  const handleConfirm = () => {
    if (!targetClassId) return;
    onConfirm({ targetClassId, reason: reason.trim() || undefined });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md bg-muted p-4 text-sm">
          <div className="font-medium">{entryName}</div>
          {armband && <div className="text-muted-foreground">Armband {armband}</div>}
          {currentClass && (
            <div className="text-muted-foreground">Current class: {currentClass.label}</div>
          )}
        </div>

        {reversal?.kind === 'available' && onMoveBack && (
          <div className="space-y-2 rounded-md border border-dashed p-4">
            <div className="text-sm font-medium">
              {reversal.sourceClassName
                ? `This entry was moved up from ${reversal.sourceClassName}.`
                : 'This entry was moved up from another class.'}
            </div>
            <p className="text-sm text-muted-foreground">
              Moving it back restores the original entry, with its check-in, and removes this one.
            </p>
            <Button type="button" variant="outline" onClick={onMoveBack} disabled={isReversing}>
              <Undo2 className="mr-2 h-4 w-4" />
              {isReversing
                ? 'Moving back...'
                : reversal.sourceClassName
                  ? `Move back to ${reversal.sourceClassName}`
                  : 'Move back'}
            </Button>
          </div>
        )}

        {reversal?.kind === 'blocked' && reversal.reason !== 'not-a-move-up' && (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {MOVE_UP_REVERSAL_REFUSALS[reversal.reason]}
          </p>
        )}

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
            <p className="text-sm text-muted-foreground">
              {reversal?.kind === 'available'
                ? 'There is no higher class to move up to from here.'
                : 'No other classes are available.'}
            </p>
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
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
    </>
  );
}
