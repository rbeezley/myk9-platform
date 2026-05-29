/**
 * Action / info at-show dialog slot shims — run-order presets, scoresheet
 * print options, and the no-statistics info dialog. Thin Phase 1a host shims
 * conforming to ringside's dialog prop contracts; the data handlers behind
 * them are spike stubs owned by the host hooks.
 */
import type React from 'react';
import type {
  NoStatsDialogProps,
  RunOrderDialogProps,
  ScoresheetPrintDialogProps,
} from '@myk9/ringside';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { handleOpenChange } from './dialogHelpers';

// ---------------------------------------------------------------------------
// RunOrderDialog — run-order preset picker.
// ---------------------------------------------------------------------------

export const RunOrderDialog: React.FC<RunOrderDialogProps> = ({
  isOpen,
  onClose,
  onApplyOrder,
  onOpenDragMode,
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Order</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => void onApplyOrder('armband-asc')}
          >
            Armband Ascending
          </Button>
          <Button
            variant="outline"
            onClick={() => void onApplyOrder('random-all')}
          >
            Randomize All
          </Button>
          <Button variant="outline" onClick={onOpenDragMode}>
            Manual Drag Mode
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// ScoresheetPrintDialog — pick a sort order, fire onPrint.
// ---------------------------------------------------------------------------

export const ScoresheetPrintDialog: React.FC<ScoresheetPrintDialogProps> = ({
  isOpen,
  onClose,
  onPrint,
  title,
  options,
}) => {
  if (!isOpen) return null;

  const primary = options?.primary ?? {
    label: 'Run Order',
    sortOrder: 'run-order' as const,
  };
  const secondary = options?.secondary ?? {
    label: 'Armband Number',
    sortOrder: 'armband' as const,
  };

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? 'Print'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => onPrint(primary.sortOrder)}
          >
            {primary.label}
          </Button>
          <Button
            variant="outline"
            onClick={() => onPrint(secondary.sortOrder)}
          >
            {secondary.label}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// NoStatsDialog — info dialog when a class has no scored entries.
// ---------------------------------------------------------------------------

export const NoStatsDialog: React.FC<NoStatsDialogProps> = ({
  isOpen,
  onClose,
  className,
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>No Statistics Available</DialogTitle>
        </DialogHeader>
        <p>
          {className ? `${className} has` : 'This class has'} no scored
          entries yet.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
