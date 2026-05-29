/**
 * Class-scoped at-show dialog slot shims — every dialog keyed to a single
 * class's options, status, requirements, settings, max-time, or area count.
 * Thin Phase 1a host shims conforming to ringside's dialog prop contracts;
 * the data handlers behind them are spike stubs owned by the host hooks.
 */
import type React from 'react';
import type {
  AreaCountSelectionDialogProps,
  ClassOptionsDialogProps,
  ClassRequirementsDialogProps,
  ClassSettingsDialogProps,
  ClassStatusDialogProps,
  MaxTimeDialogProps,
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
// ClassOptionsDialog — umbrella menu gating per-class affordances.
// ---------------------------------------------------------------------------

export const ClassOptionsDialog: React.FC<ClassOptionsDialogProps> = ({
  isOpen,
  onClose,
  classData,
  onRequirements,
  onSetMaxTime,
  onSettings,
  onStatistics,
  onStatus,
  onPrintCheckIn,
  onPrintResults,
  onPrintScoresheet,
  hideRequirements,
  hideMaxTime,
  hideSettings,
  hideStatistics,
  hideStatus,
  hidePrintOptions,
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {classData ? classData.class_name : 'Class Options'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {!hideRequirements && onRequirements && (
            <Button variant="outline" onClick={onRequirements}>
              Requirements
            </Button>
          )}
          {!hideMaxTime && onSetMaxTime && (
            <Button variant="outline" onClick={onSetMaxTime}>
              Set Max Time
            </Button>
          )}
          {!hideSettings && onSettings && (
            <Button variant="outline" onClick={onSettings}>
              Settings
            </Button>
          )}
          {!hideStatistics && onStatistics && (
            <Button variant="outline" onClick={() => onStatistics()}>
              Statistics
            </Button>
          )}
          {!hideStatus && onStatus && (
            <Button variant="outline" onClick={onStatus}>
              Status
            </Button>
          )}
          {!hidePrintOptions && onPrintCheckIn && (
            <Button variant="outline" onClick={onPrintCheckIn}>
              Print Check-In
            </Button>
          )}
          {!hidePrintOptions && onPrintResults && (
            <Button variant="outline" onClick={onPrintResults}>
              Print Results
            </Button>
          )}
          {!hidePrintOptions && onPrintScoresheet && (
            <Button variant="outline" onClick={onPrintScoresheet}>
              Print Scoresheet
            </Button>
          )}
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
// ClassStatusDialog — set a class's overall status.
// ---------------------------------------------------------------------------

const CLASS_STATUSES: readonly string[] = [
  'none',
  'briefing',
  'scoring',
  'break',
  'completed',
];

export const ClassStatusDialog: React.FC<ClassStatusDialogProps> = ({
  isOpen,
  onClose,
  onStatusChange,
  classData,
  currentStatus,
  onMarkAbsent,
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{classData.class_name} — Status</DialogTitle>
        </DialogHeader>
        <p>Current: {currentStatus}</p>
        <div className="flex flex-col gap-2">
          {CLASS_STATUSES.map((status) => (
            <Button
              key={status}
              variant="outline"
              onClick={() => onStatusChange(status)}
            >
              {status}
            </Button>
          ))}
          {onMarkAbsent && (
            <Button variant="outline" onClick={() => void onMarkAbsent()}>
              Mark Unscored Absent
            </Button>
          )}
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
// ClassRequirementsDialog — read-only rules/requirements.
// ---------------------------------------------------------------------------

export const ClassRequirementsDialog: React.FC<ClassRequirementsDialogProps> = ({
  isOpen,
  onClose,
  onSetMaxTime,
  classData,
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{classData.class_name} — Requirements</DialogTitle>
        </DialogHeader>
        <p>
          {classData.element} {classData.level} · {classData.entry_count}{' '}
          entries
        </p>
        <DialogFooter>
          {onSetMaxTime && (
            <Button variant="outline" onClick={onSetMaxTime}>
              Set Max Time
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
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
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

// ---------------------------------------------------------------------------
// MaxTimeDialog — per-area max-time configuration.
// ---------------------------------------------------------------------------

export const MaxTimeDialog: React.FC<MaxTimeDialogProps> = ({
  isOpen,
  onClose,
  showWarning,
  classData,
  onTimeUpdate,
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{classData.class_name} — Max Time</DialogTitle>
        </DialogHeader>
        {showWarning && <p>Scoring started without a max time set.</p>}
        <DialogFooter>
          {onTimeUpdate && (
            <Button variant="outline" onClick={onTimeUpdate}>
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

// ---------------------------------------------------------------------------
// AreaCountSelectionDialog — pick an area count for flexible-area classes.
// ---------------------------------------------------------------------------

export const AreaCountSelectionDialog: React.FC<AreaCountSelectionDialogProps> = ({
  isOpen,
  onClose,
  classData,
  areaCountRequirements,
  onSave,
}) => {
  if (!isOpen) return null;

  const counts: number[] = [];
  for (let n = areaCountRequirements.min; n <= areaCountRequirements.max; n++) {
    counts.push(n);
  }

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{classData.class_name} — Select Areas</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {counts.map((count) => (
            <Button key={count} variant="outline" onClick={onSave}>
              {count} {count === 1 ? 'Area' : 'Areas'}
            </Button>
          ))}
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
