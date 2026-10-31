/**
 * Class-scoped at-show dialog slot shims — every dialog keyed to a single
 * class's options, status, requirements, settings, max-time, or area count.
 * Thin Phase 1a host shims conforming to ringside's dialog prop contracts;
 * the data handlers behind them are spike stubs owned by the host hooks.
 */
import type React from 'react';
import type { ClassSettingsDialogProps } from '@myk9/ringside';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { handleOpenChange } from './dialogHelpers';

// ClassOptionsDialog lives in ./ClassOptionsDialog (MYK9-1502).
export { ClassOptionsDialog } from './ClassOptionsDialog';

// ClassStatusDialog lives in ./ClassStatusDialog (v3 statuses, descriptions and times).
export { ClassStatusDialog } from './ClassStatusDialog';

// ---------------------------------------------------------------------------
// ClassRequirementsDialog — the class's rules; see RequirementsDialog (MYK9-1100).
// ---------------------------------------------------------------------------

export { ClassRequirementsDialog } from './RequirementsDialog';

// ---------------------------------------------------------------------------
// ClassSettingsDialog — per-class settings.
// ---------------------------------------------------------------------------

export const ClassSettingsDialog: React.FC<ClassSettingsDialogProps> = ({
  isOpen,
  onClose,
  classData,
  onSettingsUpdate,
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={open => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{classData.class_name} — Settings</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          {onSettingsUpdate && (
            <Button variant="outline" onClick={onSettingsUpdate}>
              Save
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// MaxTimeDialog lives in ./MaxTimeDialog (it saves through the class replica).
export { MaxTimeDialog } from './MaxTimeDialog';

// AreaCountSelectionDialog lives in ./AreaCountSelectionDialog (it saves through the class replica).
export { AreaCountSelectionDialog } from './AreaCountSelectionDialog';
