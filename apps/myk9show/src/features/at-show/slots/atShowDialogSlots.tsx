/**
 * atShowDialogSlots — myK9Show host shims satisfying ringside's
 * `EntryListDialogSlots` contract (Phase 1a spike).
 *
 * These are intentionally THIN: each shim wraps myK9Show's shadcn Dialog
 * and wires the contract callbacks so ringside's EntryList page can mount
 * and exercise its dialog flows on the `/at-show` route. The only shim
 * with real interactive behavior is `CheckinStatusDialog` (the spike's
 * "change an entry status" smoke test). The rest render a title + close +
 * the primary action; the underlying data handlers are spike stubs owned
 * by the host hooks and get polished in a later /at-show UI sprint.
 *
 * Ownership note: ringside owns the prop shapes (imported from
 * `@myk9/ringside`); these host components conform to them.
 */
import type React from 'react';
import type {
  AreaCountSelectionDialogProps,
  CheckinStatusDialogProps,
  ClassOptionsDialogProps,
  ClassRequirementsDialogProps,
  ClassSettingsDialogProps,
  ClassStatusDialogProps,
  EntryListDialogSlots,
  MaxTimeDialogProps,
  NoStatsDialogProps,
  RunOrderDialogProps,
  ScoresheetPrintDialogProps,
} from '@myk9/ringside';
import type { CheckInStatus } from '@myk9/core';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Bridge a controlled `isOpen`/`onClose` slot onto the Dialog's
 * `open`/`onOpenChange` API: only fire `onClose` on a close transition.
 */
function handleOpenChange(open: boolean, onClose: () => void): void {
  if (!open) {
    onClose();
  }
}

// ---------------------------------------------------------------------------
// CheckinStatusDialog — the interactive one exercised by the spike smoke test.
// ---------------------------------------------------------------------------

/** Statuses every user can set. */
const BASE_STATUSES: readonly { value: CheckInStatus; label: string }[] = [
  { value: 'no-status', label: 'No Status' },
  { value: 'checked-in', label: 'Checked In' },
  { value: 'conflict', label: 'Conflict' },
  { value: 'pulled', label: 'Pulled' },
  { value: 'at-gate', label: 'At Gate' },
  { value: 'come-to-gate', label: 'Come to Gate' },
];

/** Additional statuses only stewards/judges may set (ring management). */
const RING_MANAGEMENT_STATUSES: readonly {
  value: CheckInStatus;
  label: string;
}[] = [
  { value: 'in-ring', label: 'In Ring' },
  { value: 'completed', label: 'Completed' },
];

const CheckinStatusDialog: React.FC<CheckinStatusDialogProps> = ({
  isOpen,
  onClose,
  onStatusChange,
  dogInfo,
  showRingManagement,
}) => {
  if (!isOpen) return null;

  const statuses = showRingManagement
    ? [...BASE_STATUSES, ...RING_MANAGEMENT_STATUSES]
    : BASE_STATUSES;

  return (
    <Dialog open onOpenChange={(open) => handleOpenChange(open, onClose)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
        </DialogHeader>
        <div>
          <p>
            #{dogInfo.armband} {dogInfo.callName}
          </p>
          <p>{dogInfo.handler}</p>
        </div>
        <div className="flex flex-col gap-2">
          {statuses.map((status) => (
            <Button
              key={status.value}
              variant="outline"
              onClick={() => onStatusChange(status.value)}
            >
              {status.label}
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

// ---------------------------------------------------------------------------
// ClassOptionsDialog — umbrella menu gating per-class affordances.
// ---------------------------------------------------------------------------

const ClassOptionsDialog: React.FC<ClassOptionsDialogProps> = ({
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

const ClassStatusDialog: React.FC<ClassStatusDialogProps> = ({
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

const ClassRequirementsDialog: React.FC<ClassRequirementsDialogProps> = ({
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

const ClassSettingsDialog: React.FC<ClassSettingsDialogProps> = ({
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

const MaxTimeDialog: React.FC<MaxTimeDialogProps> = ({
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
// RunOrderDialog — run-order preset picker.
// ---------------------------------------------------------------------------

const RunOrderDialog: React.FC<RunOrderDialogProps> = ({
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

const ScoresheetPrintDialog: React.FC<ScoresheetPrintDialogProps> = ({
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

const NoStatsDialog: React.FC<NoStatsDialogProps> = ({
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

// ---------------------------------------------------------------------------
// AreaCountSelectionDialog — pick an area count for flexible-area classes.
// ---------------------------------------------------------------------------

const AreaCountSelectionDialog: React.FC<AreaCountSelectionDialogProps> = ({
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

// ---------------------------------------------------------------------------
// Assembled slot bag.
// ---------------------------------------------------------------------------

export const atShowDialogSlots: EntryListDialogSlots = {
  CheckinStatusDialog,
  ClassOptionsDialog,
  ClassStatusDialog,
  ClassRequirementsDialog,
  ClassSettingsDialog,
  MaxTimeDialog,
  RunOrderDialog,
  ScoresheetPrintDialog,
  NoStatsDialog,
  AreaCountSelectionDialog,
};
