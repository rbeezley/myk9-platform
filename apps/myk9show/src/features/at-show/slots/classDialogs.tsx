/**
 * Class-scoped at-show dialog slot shims — every dialog keyed to a single
 * class's options, status, requirements, settings, max-time, or area count.
 * Thin Phase 1a host shims conforming to ringside's dialog prop contracts;
 * the data handlers behind them are spike stubs owned by the host hooks.
 */
import type React from 'react';
import type { AreaCountSelectionDialogProps } from '@myk9/ringside';
import { Button } from '@/components/ui/button';
import { Layers } from 'lucide-react';
import { ClassDialogShell } from './ClassDialogShell';

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

export { ClassSettingsDialog } from './ClassSettingsDialog';

// MaxTimeDialog lives in ./MaxTimeDialog (it saves through the class replica).
export { MaxTimeDialog } from './MaxTimeDialog';

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
    <ClassDialogShell
      icon={Layers}
      eyebrow="Select areas"
      className={classData.class_name}
      onClose={onClose}
    >
      {counts.map(count => (
        <Button key={count} variant="outline" className="min-h-11" onClick={onSave}>
          {count} {count === 1 ? 'Area' : 'Areas'}
        </Button>
      ))}
    </ClassDialogShell>
  );
};
